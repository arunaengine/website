// Bundled-vocabulary terminology provider: a thin TermHit adapter over the
// existing schema.org + Dublin Core vocabulary (profiles/vocabulary.ts). Always
// available and effectively instant — the data ships with the portal, so this
// provider is the graceful-degradation floor when remote services are down.
import { loadVocabulary, searchVocabTerms, type VocabTerm } from '../../profiles/vocabulary'
import type { TermHit, TerminologyProvider, TermKind } from '../types'

export const BUNDLED_PROVIDER_ID = 'bundled'

function toHit(term: VocabTerm, kind: TermKind): TermHit {
  const hit: TermHit = {
    iri: term.uri,
    label: term.label,
    source: term.source,
    providerId: BUNDLED_PROVIDER_ID,
    kind,
    shortForm: term.name,
  }
  if (term.description) hit.definition = term.description
  return hit
}

export const bundledProvider: TerminologyProvider = {
  id: BUNDLED_PROVIDER_ID,
  label: 'Bundled vocabulary',
  kinds: ['property', 'class'],
  async search(query, { limit }) {
    // The vocabulary chunk loads once per session; afterwards this resolves on
    // the microtask queue, so callers still perceive the provider as instant.
    const vocab = await loadVocabulary()
    return [
      ...searchVocabTerms(vocab.properties, query, limit).map((term) => toHit(term, 'property')),
      ...searchVocabTerms(vocab.classes, query, limit).map((term) => toHit(term, 'class')),
    ]
  },
}
