import { onScopeDispose, ref, shallowRef } from 'vue'
import {
  ApiError,
  previewProfileValidation,
  type ApiClientOptions,
  type ProfileValidationPreviewResponse,
} from '@/lib/api'

// Server-side preview of the crate a dialog is about to save. Advisory only:
// the write path validates authoritatively, so a failed or missing preview
// never blocks the form. A node that does not serve the endpoint answers
// 404/405 and flips `unavailable`, and the caller hides the panel.

const PREVIEW_DEBOUNCE_MS = 500

export interface UseProfilePreviewOptions {
  client: () => ApiClientOptions
  debounceMs?: number
}

export function useProfilePreview(options: UseProfilePreviewOptions) {
  const debounceMs = options.debounceMs ?? PREVIEW_DEBOUNCE_MS

  const result = shallowRef<ProfileValidationPreviewResponse | null>(null)
  const running = ref(false)
  const unavailable = ref(false)
  // Message of the last failed request (503, 429, network). A failure does not
  // disable the preview; the explicit action retries it.
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
    previewProfileValidation(rocrate, options.client(), controller.signal)
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
        error.value = cause instanceof Error ? cause.message : String(cause)
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

  // Immediate preview for the explicit "Run preview" action.
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
