import { validateCrate } from './validate'

// The SHACL validation web worker: the ONLY entry point that imports the RDF
// stack (via validate.ts), created lazily by useShaclValidation with
// `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`
// so Vite splits it — and everything it imports — into worker-only chunks.

export interface ShaclWorkerRequest {
  id: number
  // Plain JSON crate (the exact object the dataset dialog would save).
  crate: unknown
  // Generated shapes.ttl plus any attached shapes.custom.ttl, as Turtle text.
  shapes: string[]
  // Crate-local root id, usually './'.
  rootId: string
}

export type ShaclWorkerResponse =
  | { id: number; ok: true; findings: import('./findings').ShaclFinding[] }
  | { id: number; ok: false; error: string }

self.addEventListener('message', (event) => {
  const request = (event as MessageEvent<ShaclWorkerRequest>).data
  void (async () => {
    try {
      const findings = await validateCrate(request.crate, request.shapes, request.rootId)
      self.postMessage({ id: request.id, ok: true, findings } satisfies ShaclWorkerResponse)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      self.postMessage({ id: request.id, ok: false, error } satisfies ShaclWorkerResponse)
    }
  })()
})
