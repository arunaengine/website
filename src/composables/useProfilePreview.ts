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
}

export function useProfilePreview(options: UseProfilePreviewOptions) {
  const debounceMs = options.debounceMs ?? PREVIEW_DEBOUNCE_MS

  const result = shallowRef<ProfileValidationPreviewResponse | null>(null)
  const running = ref(false)
  const unavailable = ref(false)
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

  function run(rocrate: unknown) {
    generation += 1
    const current = generation
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller
    running.value = true
    error.value = null
    // The injected request is deferred so a synchronous throw (no device
    // client) lands in `catch` and is rendered as a failed check instead of
    // leaving `running` stuck.
    const request = options.request
      ? Promise.resolve().then(() => options.request!(rocrate, controller.signal))
      : previewProfileValidation(rocrate, options.client(), controller.signal)
    request
      .then((response) => {
        if (current !== generation || disposed) return
        result.value = response
        running.value = false
      })
      .catch((cause) => {
        if (current !== generation || disposed) return
        running.value = false
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 405)) {
          unavailable.value = true
          result.value = null
          return
        }
        error.value = errorMessage(cause)
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
    run(rocrate)
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
  }

  onScopeDispose(() => {
    disposed = true
    clearTimer()
    inFlight?.abort()
  })

  return { result, running, unavailable, error, preview, previewNow, reset }
}
