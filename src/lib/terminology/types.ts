// Pluggable terminology abstraction for ontology-backed term suggestions.
//
// Providers are interchangeable sources of term hits: the bundled vocabulary
// (schema.org + Dublin Core, always available, offline) and optional remote
// services such as the TS4NFDI federated gateway. Nothing outside this module
// tree couples to a concrete service — consumers see only TermHit — and
// published profiles never depend on a live provider: a picked term is baked
// (URI + label + description) into the profile crate at emission time, so forms
// render offline regardless of provider availability.

// What a hit denotes: an RDF/OWL property, a class, or an unclassified term
// (individuals, SKOS concepts, hits whose backend does not say).
export type TermKind = 'property' | 'class' | 'term'

export interface TermHit {
  iri: string
  label: string
  definition?: string
  // Ontology id the term comes from (e.g. "cito", "AWS") when the provider
  // reports one.
  ontology?: string
  // Short source tag for display; the bundled provider reuses the vocab source
  // ("schema.org" / "dcterms"), remote providers use the ontology id or their
  // own id as fallback.
  source: string
  providerId: string
  kind?: TermKind
  // Compact local name reported by the provider (e.g. OLS `short_form`); a
  // better valueName seed than re-deriving from the IRI.
  shortForm?: string
  // Federated-gateway backend that produced the hit (e.g. "ols"), when reported.
  backendType?: string
}

export interface TerminologySearchOptions {
  limit: number
  signal?: AbortSignal
}

export interface TerminologyProvider {
  id: string
  label: string
  // Which kinds this provider can answer for; used to skip providers that
  // cannot contribute to a given picker.
  kinds: TermKind[]
  search(query: string, opts: TerminologySearchOptions): Promise<TermHit[]>
}

// Per-provider outcome of the latest search: 'timeout'/'error' mean degraded
// (bundled results still flow — a provider failure is NEVER a hard failure).
export type ProviderStatus = 'ok' | 'timeout' | 'error'
