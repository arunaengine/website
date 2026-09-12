import { onScopeDispose, ref, shallowRef } from 'vue'
import {
  ApiError,
  previewProfileValidation,
  type ApiClientOptions,
  type ProfileValidationPreviewResponse,
} from '@/lib/api'
import { errorMessage } from '@/lib/utils'
import { CRATE_POLL_DELAYS_MS } from '@/composables/aruna/crates'

// The node's check of the crate a form is about to save, run exactly as the write would.
// A 503 or transport failure is retried on a bounded schedule (at least Retry-After) and
// only then fails; a failed or missing check blocks the save only for a profiled draft.

const PREVIEW_DEBOUNCE_MS = 500

export interface UseProfilePreviewOptions {
  client: () => ApiClientOptions
  debounceMs?: number
  request?: (rocrate: unknown, signal: AbortSignal) => Promise<ProfileValidationPreviewResponse>
  /** Owning group of the draft, so a group-scoped profile can be resolved. */
  groupId?: () => string | undefined
  /** A public draft also asks which of its files are not readable by everyone. */
  isPublic?: () => boolean
  /** Whether the draft carries a profile, so a check that could not run refuses the save. */
  profiled?: () => boolean
}

export function useProfilePreview(options: UseProfilePreviewOptions) {
  const debounceMs = options.debounceMs ?? PREVIEW_DEBOUNCE_MS

  const result = shallowRef<ProfileValidationPreviewResponse | null>(null)
  const running = ref(false)
  // The node answered 503 or did not answer; the check is being retried.
  const waiting = ref(false)
  const unavailable = ref(false)
  // A 400: the node refused the draft itself, which a write would refuse too.
  const rejection = shallowRef<ApiError | null>(null)
  // Message of the last failed request once retries are spent (or 429, no
  // device client). A failure does not disable the check; the action retries it.
  const error = ref<string | null>(null)

  // Fences stale responses: only the newest request may write the refs.
  let generation = 0
  let inFlight: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let retry: { timer: ReturnType<typeof setTimeout>; cancel: () => void } | null = null
  let disposed = false

  function clearTimer() {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  // A cancelled retry answers false: the run it belonged to never settled.
  function clearRetry() {
    if (!retry) return
    clearTimeout(retry.timer)
    retry.cancel()
    retry = null
  }

  function transient(cause: unknown): boolean {
    if (cause instanceof ApiError) return cause.status === 503
    return cause instanceof TypeError || (cause instanceof DOMException && cause.name === 'TimeoutError')
  }

  function settle() {
    running.value = false
    waiting.value = false
  }

  // Answers whether this run's verdict is the one now on record: a run a
  // newer one overtook wrote nothing and must not be read as a verdict.
  function run(rocrate: unknown): Promise<boolean> {
    generation += 1
    const current = generation
    inFlight?.abort()
    clearRetry()
    running.value = true
    waiting.value = false
    error.value = null
    rejection.value = null
    // The previous verdict spoke about another draft; nothing stands in for
    // the check that is still running.
    result.value = null
    return attempt(rocrate, current, 0)
  }

  function attempt(rocrate: unknown, current: number, index: number): Promise<boolean> {
    const controller = new AbortController()
    inFlight = controller
    // Capture request context now; setup failures still use the request error path.
    let request: Promise<ProfileValidationPreviewResponse>
    try {
      request = options.request
        ? options.request(rocrate, controller.signal)
        : previewProfileValidation(
          rocrate,
          options.client(),
          controller.signal,
          options.groupId?.(),
          options.isPublic?.() ?? false,
          )
    } catch (cause) {
      request = Promise.reject(cause)
    }
    return request
      .then((response) => {
        if (current !== generation || disposed) return false
        result.value = response
        settle()
        return true
      })
      .catch((cause) => {
        if (current !== generation || disposed) return false
        if (transient(cause) && index < CRATE_POLL_DELAYS_MS.length) {
          waiting.value = true
          const asked = cause instanceof ApiError ? cause.retryAfter ?? 0 : 0
          return new Promise<boolean>((resolve) => {
            retry = {
              cancel: () => resolve(false),
              timer: setTimeout(() => {
                retry = null
                resolve(attempt(rocrate, current, index + 1))
              }, Math.max(asked, CRATE_POLL_DELAYS_MS[index]!)),
            }
          })
        }
        settle()
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 405)) {
          unavailable.value = true
          return true
        }
        if (cause instanceof ApiError && cause.status === 400) {
          rejection.value = cause
          return true
        }
        error.value = errorMessage(cause)
        return true
      })
  }

  // Debounced preview for form-change triggers.
  function preview(rocrate: unknown) {
    if (unavailable.value || disposed) return
    clearTimer()
    timer = setTimeout(() => {
      timer = undefined
      run(rocrate)
    }, debounceMs)
  }

  // Immediate check for the explicit "Check again" action.
  function previewNow(rocrate: unknown) {
    if (unavailable.value || disposed) return
    clearTimer()
    void run(rocrate)
  }

  // The check a save runs first: it answers the verdict. A check that could
  // not run refuses a profiled draft and lets an unprofiled one through.
  async function verify(rocrate: unknown): Promise<boolean> {
    if (disposed) return true
    const unchecked = () => !(options.profiled?.() ?? false)
    if (unavailable.value) return unchecked()
    clearTimer()
    if (!await run(rocrate)) return false
    if (rejection.value) return false
    if (error.value || unavailable.value) return unchecked()
    return result.value?.accepted !== false
  }

  // Drops pending work and the last result (e.g. when the profile changes).
  function reset() {
    clearTimer()
    generation += 1
    inFlight?.abort()
    inFlight = null
    clearRetry()
    result.value = null
    settle()
    error.value = null
    rejection.value = null
  }

  onScopeDispose(() => {
    disposed = true
    clearTimer()
    clearRetry()
    inFlight?.abort()
  })

  return { result, running, waiting, unavailable, error, rejection, preview, previewNow, verify, reset }
}
