// Crate base IRI plus the reverse of its anchoring. Dependency-free, so UI code
// can map focus nodes back to crate-local ids without the RDF stack.

// The base IRI a crate is anchored under when its shapes are emitted. Shapes
// referencing crate-local ids (requiredInstances by @id) emit an explicit
// `@base` header so the file stays self-contained.
export const CRATE_BASE_IRI = 'arcp://name,aruna-portal/crate/'

// Reports a focus node by its crate-local id ('./' for the root, '#person-1',
// 'index.html'). IRIs outside the crate base are returned unchanged.
export function crateLocalId(iri: string): string {
  if (iri === CRATE_BASE_IRI) return './'
  if (iri.startsWith(CRATE_BASE_IRI)) return iri.slice(CRATE_BASE_IRI.length)
  return iri
}
