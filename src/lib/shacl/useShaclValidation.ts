import { onScopeDispose, ref, shallowRef } from 'vue'
import type { ShaclFinding } from './findings'

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
  // Message of the last failed run (bad shapes, malformed crate). A run error
  // does not mark the worker unavailable — the next edit may validate fine.
  const error = ref<string | null>(null)

  let worker: Worker | null = null
  let requestId = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function ensureWorker(): Worker | null {
    if (worker || unavailable.value || disposed) return worker
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    } catch {
      unavailable.value = true
      worker = null
      return null
    }
    worker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { id: number; ok: boolean; findings?: ShaclFinding[]; error?: string }
      if (!data || data.id !== requestId) return
      running.value = false
      if (data.ok) {
        findings.value = data.findings ?? []
        error.value = null
      } else {
        findings.value = []
        error.value = data.error ?? 'Validation failed.'
      }
    })
    // A load/runtime error at the worker level (e.g. the module chunk failed)
    // disables deep validation for this session; the form works as today.
    worker.addEventListener('error', () => {
      unavailable.value = true
      running.value = false
      worker?.terminate()
      worker = null
    })
    return worker
  }

  function post(input: ShaclValidationInput) {
    const target = ensureWorker()
    if (!target) return
    requestId += 1
    running.value = true
    target.postMessage({ id: requestId, crate: input.crate, shapes: input.shapes, rootId: input.rootId })
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
    requestId += 1
    findings.value = []
    running.value = false
    error.value = null
  }

  onScopeDispose(() => {
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    worker?.terminate()
    worker = null
  })

  return { findings, running, unavailable, error, validate, validateNow, reset }
}
