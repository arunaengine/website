import { ref } from 'vue'

/** A refresh that answers instantly still has to read as a click. */
export const MIN_REFRESH_SPIN_MS = 300

/**
 * Wraps a reload in the feedback every refresh button owes its user: the icon
 * spins for at least {@link MIN_REFRESH_SPIN_MS}, the button stays disabled and
 * `aria-busy` while the work runs, and a second click is ignored until it ends.
 * Failures reach `onError`; callers whose loader already records its own error
 * leave it out.
 */
export function useRefresh(run: () => unknown, onError?: (error: unknown) => void) {
  const busy = ref(false)

  async function refresh(): Promise<void> {
    if (busy.value) return
    busy.value = true
    const started = Date.now()
    try {
      await run()
    } catch (error) {
      onError?.(error)
    } finally {
      const remaining = MIN_REFRESH_SPIN_MS - (Date.now() - started)
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
      busy.value = false
    }
  }

  return { busy, refresh }
}
