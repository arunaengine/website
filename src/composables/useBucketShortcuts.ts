// Pinned buckets for the Data manager sidebar. Stored in localStorage, scoped
// per connection AND account (the StoredS3Key pattern): entries recorded
// against one API base or user are never shown to another.
import { computed, ref } from 'vue'
import { useAruna } from './useAruna'

export interface BucketShortcut {
  bucket: string
  /** Owning node id; null = the connected node. */
  nodeId: string | null
}

interface ShortcutScope {
  pinned: BucketShortcut[]
}

const STORAGE_KEY = 'aruna.bucketShortcuts'

type ShortcutStore = Record<string, ShortcutScope>

function sanitizeList(value: unknown): BucketShortcut[] {
  if (!Array.isArray(value)) return []
  const list: BucketShortcut[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const bucket = (entry as { bucket?: unknown }).bucket
    if (typeof bucket !== 'string' || !bucket) continue
    const nodeId = (entry as { nodeId?: unknown }).nodeId
    list.push({ bucket, nodeId: typeof nodeId === 'string' && nodeId ? nodeId : null })
  }
  return list
}

function loadStore(): ShortcutStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const store: ShortcutStore = {}
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      // Older stores also carried a `recent` list; only pins survive.
      store[scope] = { pinned: sanitizeList((value as { pinned?: unknown }).pinned) }
    }
    return store
  } catch {
    return {}
  }
}

const store = ref<ShortcutStore>(typeof window === 'undefined' ? {} : loadStore())

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.value))
  } catch {
    // The in-memory session keeps working when storage is unavailable.
  }
}

function sameShortcut(a: BucketShortcut, b: BucketShortcut): boolean {
  return a.bucket === b.bucket && (a.nodeId ?? null) === (b.nodeId ?? null)
}

export function useBucketShortcuts() {
  const { apiBaseUrl, currentUser } = useAruna()

  const scopeKey = computed(() => `${apiBaseUrl.value}|${currentUser.value?.id ?? 'anon'}`)

  const scope = computed<ShortcutScope>(() => store.value[scopeKey.value] ?? { pinned: [] })

  function update(mutate: (scope: ShortcutScope) => ShortcutScope) {
    store.value = { ...store.value, [scopeKey.value]: mutate(scope.value) }
    persist()
  }

  const pinned = computed(() => scope.value.pinned)

  function isPinned(bucket: string, nodeId: string | null = null): boolean {
    return scope.value.pinned.some((pin) => sameShortcut(pin, { bucket, nodeId }))
  }

  function togglePin(bucket: string, nodeId: string | null = null) {
    const entry: BucketShortcut = { bucket, nodeId }
    update((current) => ({
      ...current,
      pinned: isPinned(bucket, nodeId)
        ? current.pinned.filter((pin) => !sameShortcut(pin, entry))
        : [...current.pinned, entry],
    }))
  }

  return { pinned, isPinned, togglePin }
}
