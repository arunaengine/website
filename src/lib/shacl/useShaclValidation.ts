import { onScopeDispose, ref, shallowRef } from 'vue'
import type { ShaclFinding } from './findings'

const SHACL_VALIDATION_TIMEOUT_MS = 20_000

// Composable front for the lazy SHACL worker. The worker (and with it jsonld,
// n3 and the engine) is only instantiated on the first validate call; when
// worker creation or the worker module itself fails, `unavailable` flips to
// true and the caller renders exactly as without deep validation.

export interface ShaclValidationInput {
  // Plain JSON crate — must be structured-cloneable (no reactive proxies).
  crate: unknown
  shapes: string[]
  rootId: string
}

export interface UseShaclValidationOptions {
  // Debounce for validate(); the plan's evaluator UX uses ~500 ms.
  debounceMs?: number
}

export function useShaclValidation(options: UseShaclValidationOptions = {}) {
  const debounceMs = options.debounceMs ?? 500

  const findings = shallowRef<ShaclFinding[]>([])
  const running = ref(false)
  const unavailable = ref(false)
  // Message of the last failed run or request. A request error does not mark
  // the worker unavailable; the next edit may validate fine.
  const error = ref<string | null>(null)

  let worker: Worker | null = null
  let requestId = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function clearWatchdog() {
    if (watchdog === undefined) return
    clearTimeout(watchdog)
    watchdog = undefined
  }

  function failRequest(id: number, message: string, target: Worker, restartWorker = false) {
    if (id !== requestId || worker !== target) return
    clearWatchdog()
    requestId += 1
    running.value = false
    error.value = message
    if (restartWorker) {
      target.terminate()
      worker = null
      ensureWorker()
    }
  }

  function ensureWorker(): Worker | null {
    if (worker || unavailable.value || disposed) return worker
    let target: Worker
    try {
      target = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    } catch {
      unavailable.value = true
      worker = null
      return null
    }
    worker = target
    target.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { id: number; ok: boolean; findings?: ShaclFinding[]; error?: string }
      if (!data || data.id !== requestId || worker !== target) return
      clearWatchdog()
      running.value = false
      if (data.ok) {
        findings.value = data.findings ?? []
        error.value = null
      } else {
        failRequest(data.id, data.error ?? 'Validation failed.', target)
      }
    })
    target.addEventListener('messageerror', () => {
      if (!running.value) return
      failRequest(requestId, 'The validation worker response could not be read. Retry validation.', target, true)
    })
    // A load/runtime error at the worker level (e.g. the module chunk failed)
    // disables deep validation for this session; the form works as today.
    target.addEventListener('error', () => {
      if (worker !== target) return
      clearWatchdog()
      requestId += 1
      unavailable.value = true
      running.value = false
      error.value = 'The validation worker failed.'
      target.terminate()
      worker = null
    })
    return target
  }

  function post(input: ShaclValidationInput) {
    const target = ensureWorker()
    if (!target) return
    requestId += 1
    const id = requestId
    clearWatchdog()
    running.value = false
    try {
      target.postMessage({ id, crate: input.crate, shapes: input.shapes, rootId: input.rootId })
    } catch (cause) {
      const detail = cause instanceof Error && cause.message ? ` ${cause.message}` : ''
      failRequest(id, `The validation request could not be sent.${detail}`, target)
      return
    }
    running.value = true
    error.value = null
    watchdog = setTimeout(() => {
      failRequest(id, 'Validation timed out. Retry validation.', target, true)
    }, SHACL_VALIDATION_TIMEOUT_MS)
  }

  // Debounced validation for form-change triggers.
  function validate(input: ShaclValidationInput) {
    if (unavailable.value || disposed) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      post(input)
    }, debounceMs)
  }

  // Immediate validation for the explicit "Validate against profile" action.
  function validateNow(input: ShaclValidationInput) {
    if (unavailable.value || disposed) return
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    post(input)
  }

  // Drops pending work and clears findings (e.g. when the profile changes).
  function reset() {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    clearWatchdog()
    requestId += 1
    findings.value = []
    running.value = false
    error.value = null
  }

  onScopeDispose(() => {
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    clearWatchdog()
    worker?.terminate()
    worker = null
  })

  return { findings, running, unavailable, error, validate, validateNow, reset }
}
