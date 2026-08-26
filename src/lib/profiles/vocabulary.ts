// Bundled ontology vocabulary for the profile builder's autocomplete: the
// schema.org core release (CC BY-SA 3.0, https://schema.org/docs/terms.html)
// plus the DCMI Metadata Terms (CC BY 4.0). vocab.json is generated from the
// official releases; no GPL-licensed sources. Loaded lazily (dynamic import)
// so the ~400 KB data lands in its own async chunk, fetched only when a picker
// actually needs suggestions.
import type { ProfileValueKind } from './types'

export interface VocabTerm {
  uri: string
  name: string
  label: string
  description: string
  source: string
  // Present on properties only: a suggested value kind derived from the term's
  // range ('entity' terms also carry their suggested target types).
  kind?: string
  targets?: string[]
}

export interface VocabData {
  properties: VocabTerm[]
  classes: VocabTerm[]
}

let vocabPromise: Promise<VocabData> | null = null

export function loadVocabulary(): Promise<VocabData> {
  vocabPromise ??= import('./vocab.json').then((module) => module.default as VocabData)
  return vocabPromise
}

// The generator's kind strings map 1:1 onto ProfileValueKind scalars; keep the
// mapping explicit so an unexpected value degrades to undefined, not a crash.
const KINDS: ReadonlySet<string> = new Set([
  'text',
  'longtext',
  'integer',
  'number',
  'boolean',
  'date',
  'datetime',
  'url',
  'email',
  'entity',
])

export function vocabKind(term: VocabTerm): ProfileValueKind | undefined {
  return term.kind && KINDS.has(term.kind) ? (term.kind as ProfileValueKind) : undefined
}

// Ranked substring search over name/label/description. Exact name/label matches
// first, then prefix matches, then substring, then description hits.
export function searchVocabTerms(terms: VocabTerm[], query: string, limit = 8): VocabTerm[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: Array<{ term: VocabTerm; score: number }> = []
  for (const term of terms) {
    const name = term.name.toLowerCase()
    const label = term.label.toLowerCase()
    let score = -1
    if (name === q || label === q) score = 0
    else if (name.startsWith(q) || label.startsWith(q)) score = 1
    else if (name.includes(q) || label.includes(q)) score = 2
    else if (term.description.toLowerCase().includes(q)) score = 3
    if (score >= 0) scored.push({ term, score })
  }
  scored.sort((a, b) => a.score - b.score || a.term.name.localeCompare(b.term.name))
  return scored.slice(0, limit).map((entry) => entry.term)
}

// Short source tag for display ("schema.org" / "dcterms").
export function vocabSourceLabel(term: VocabTerm): string {
  return term.source === 'dcterms' ? 'Dublin Core' : term.source
}
