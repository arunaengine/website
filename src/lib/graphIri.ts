// Aruna mints a document's graph IRI deterministically as
// `https://w3id.org/aruna/{document_id}` (backend MetadataRegistryRecord::
// graph_iri_for), so IRI <-> document id is a pure string operation and never
// needs a catalog lookup.
const GRAPH_IRI_PREFIX = 'https://w3id.org/aruna/'

// Document ids are ULIDs: 26 Crockford base32 characters (no I, L, O or U).
const DOCUMENT_ID_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/i

export function isDocumentId(value: string): boolean {
  return DOCUMENT_ID_PATTERN.test(value)
}

/** The document id an Aruna graph IRI addresses, or null for any other IRI. */
export function documentIdFromIri(iri: string): string | null {
  if (!iri.startsWith(GRAPH_IRI_PREFIX)) return null
  const documentId = iri.slice(GRAPH_IRI_PREFIX.length)
  return isDocumentId(documentId) ? documentId : null
}

/** The graph IRI a document id resolves to; the inverse of documentIdFromIri. */
export function graphIriFor(documentId: string): string {
  return `${GRAPH_IRI_PREFIX}${documentId}`
}
