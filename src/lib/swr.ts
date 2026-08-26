// Stale-while-revalidate state for a list a view re-renders on every visit.
// Held outside the component (in the module scope of the composable that owns
// it) so unmounting a view keeps the last good value: the next visit paints it
// immediately and revalidates behind it. Same read model as the persisted tier
// of lib/terminology/cache.ts, without the localStorage layer; these lists are
// per-session and must not outlive the tab.
import { computed, ref, type ComputedRef, type Ref } from 'vue'

/** How a failed revalidation is reported, and whether the cached value survives it. */
export interface SwrFailure {
  message: string
  /** True when the cached value is no longer trustworthy and must leave the screen. */
  discard?: boolean
}

export interface SwrCache<T> {
  data: Ref<T>
  /** Identity the cached value belongs to; read-only for consumers. */
  scope: Ref<string | null>
  /** True once a load succeeded for the current scope. */
  loaded: Ref<boolean>
  /** Outstanding failure, kept alongside the data it could not replace. */
  error: Ref<SwrFailure | null>
  /** Nothing cached and a load in flight: the only state that may show a blocking spinner. */
  loading: ComputedRef<boolean>
  /** Cached data on screen while a revalidation runs behind it. */
  refreshing: ComputedRef<boolean>
  reset(): void
  /** Resolves once the load for `scope` settled, including one it collapsed onto. */
  revalidate(
    scope: string,
    load: () => Promise<T>,
    onFailure: (err: unknown) => SwrFailure,
    force?: boolean,
  ): Promise<void>
}

/**
 * `empty` is the placeholder rendered before the first load and after a
 * discard; it is shared across resets, so consumers must not mutate it.
 * Values younger than `freshMs` are served without touching the network.
 */
export function createSwrCache<T>(empty: T, freshMs: number): SwrCache<T> {
  const data = ref(empty) as Ref<T>
  const loaded = ref(false)
  const error = ref<SwrFailure | null>(null)
  const pending = ref(false)
  const scope = ref<string | null>(null)
  let fetchedAt = 0
  let requestId = 0
  // The load a collapsed caller awaits, so it sees the same completion.
  let inflight: Promise<void> | null = null

  function reset() {
    // Invalidates any in-flight load so its result cannot land on the new scope.
    requestId++
    inflight = null
    scope.value = null
    fetchedAt = 0
    data.value = empty
    loaded.value = false
    error.value = null
    pending.value = false
  }

  async function run(
    load: () => Promise<T>,
    onFailure: (err: unknown) => SwrFailure,
  ): Promise<void> {
    const id = ++requestId
    pending.value = true
    try {
      const value = await load()
      if (id !== requestId) return
      data.value = value
      loaded.value = true
      error.value = null
      fetchedAt = Date.now()
    } catch (err) {
      if (id !== requestId) return
      const failure = onFailure(err)
      error.value = failure
      if (failure.discard) {
        data.value = empty
        loaded.value = false
        fetchedAt = 0
      }
    } finally {
      if (id === requestId) {
        pending.value = false
        inflight = null
      }
    }
  }

  function revalidate(
    nextScope: string,
    load: () => Promise<T>,
    onFailure: (err: unknown) => SwrFailure,
    force = false,
  ): Promise<void> {
    if (nextScope !== scope.value) {
      reset()
      scope.value = nextScope
    }
    if (!force && loaded.value && Date.now() - fetchedAt < freshMs) return Promise.resolve()
    // Collapse the mount-time fan-out onto the load already running, so the
    // collapsed caller awaits its completion instead of returning to an empty
    // cache. A forced reload still supersedes it.
    if (!force && inflight) return inflight
    const started = run(load, onFailure)
    inflight = started
    return started
  }

  return {
    data,
    scope,
    loaded,
    error,
    loading: computed(() => pending.value && !loaded.value),
    refreshing: computed(() => pending.value && loaded.value),
    reset,
    revalidate,
  }
}
