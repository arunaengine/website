import { onScopeDispose, ref, shallowRef } from 'vue'
import {
  ApiError,
  previewProfileValidation,
  type ApiClientOptions,
  type ProfileValidationPreviewResponse,
} from '@/lib/api'
import { errorMessage } from '@/lib/utils'

// The node's check of the crate a form is about to save, run exactly as the
// write would. A rejected verdict blocks the save; a failed or missing check
// never does. A node that does not serve the endpoint answers 404/405 and
// flips `unavailable`.

const PREVIEW_DEBOUNCE_MS = 500

export interface UseProfilePreviewOptions {
  client: () => ApiClientOptions
  debounceMs?: number
  request?: (rocrate: unknown, signal: AbortSignal) => Promise<ProfileValidationPreviewResponse>
  /** Owning group of the draft, so a group-scoped profile can be resolved. */
  groupId?: () => string | undefined
  /** A public draft also asks which of its files are not readable by everyone. */
  isPublic?: () => boolean
}

export function useProfilePreview(options: UseProfilePreviewOptions) {
  const debounceMs = options.debounceMs ?? PREVIEW_DEBOUNCE_MS

  const result = shallowRef<ProfileValidationPreviewResponse | null>(null)
  const running = ref(false)
  const unavailable = ref(false)
  // A 400: the node refused the draft itself, which a write would refuse too.
  const rejection = shallowRef<ApiError | null>(null)
  // Message of the last failed request (503, 429, network, no device client).
  // A failure does not disable the check; the explicit action retries it.
  const error = ref<string | null>(null)

  // Fences stale responses: only the newest request may write the refs.
  let generation = 0
  let inFlight: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function clearTimer() {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  // Answers whether this run's verdict is the one now on record: a run a
  // newer one overtook wrote nothing and must not be read as a verdict.
  function run(rocrate: unknown): Promise<boolean> {
    generation += 1
    const current = generation
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller
    running.value = true
    error.value = null
    rejection.value = null
    // The previous verdict spoke about another draft; nothing stands in for
    // the check that is still running.
    result.value = null
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
        running.value = false
        return true
      })
      .catch((cause) => {
        if (current !== generation || disposed) return false
        running.value = false
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

  // The check a save runs first: it answers the verdict, and a check that
  // could not run answers acceptance so it never blocks the write.
  async function verify(rocrate: unknown): Promise<boolean> {
    if (unavailable.value || disposed) return true
    clearTimer()
    if (!await run(rocrate)) return false
    if (rejection.value) return false
    if (error.value || unavailable.value) return true
    return result.value?.accepted !== false
  }

  // Drops pending work and the last result (e.g. when the profile changes).
  function reset() {
    clearTimer()
    generation += 1
    inFlight?.abort()
    inFlight = null
    result.value = null
    running.value = false
    error.value = null
    rejection.value = null
  }

  onScopeDispose(() => {
    disposed = true
    clearTimer()
    inFlight?.abort()
  })

  return { result, running, unavailable, error, rejection, preview, previewNow, verify, reset }
}
