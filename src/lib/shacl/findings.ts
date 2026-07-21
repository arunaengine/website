// Shared finding shape for the SHACL validation runtime. Lives in its own
// dependency-free module so UI code (the composable, the dataset dialog) can
// import the types without pulling the RDF stack into the main bundle.

export type ShaclSeverity = 'error' | 'warning' | 'info'

export interface ShaclFinding {
  // Crate-local focus node id ('./' for the root, '#person-1', 'index.html',
  // or an absolute URI for external references).
  focusId: string
  // Property path IRI (e.g. http://schema.org/name) when the result names one.
  path?: string
  message: string
  severity: ShaclSeverity
  // IRI (or blank-node label) of the shape that produced the result; generated
  // shapes use https://w3id.org/aruna/profiles/<slug>#shape-... names.
  sourceShape: string
}
