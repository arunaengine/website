// SPARQL console helpers. Paging deliberately stays INSIDE the SPARQL query
// text via LIMIT/OFFSET (issue #259): the SPARQL endpoints accept no paging
// fields and there is intentionally NO second cursor system. Prev/Next
// rewrite the visible query so the user always sees exactly what ran.
// Caveat (backend property): in distributed mode OFFSET applies per node
// before the merge, so pages are approximate; mode 'local' pages exactly.

import type { SparqlQueryMode } from '@/lib/api'

export const DEFAULT_SELECT_LIMIT = 100

// ---- query form ------------------------------------------------------------

// First significant keyword after comments/PREFIX/BASE headers.
export function sparqlQueryForm(query: string): 'select' | 'ask' | 'unknown' {
  // PREFIX/BASE declarations are IRI-aware (<[^>]*> tolerates an internal '#')
  // and MUST be stripped before comments, otherwise a hash-namespace IRI like
  // <http://www.w3.org/1999/02/22-rdf-syntax-ns#> loses its '#>' to the comment
  // strip and the query is misclassified as 'unknown' (rdf/rdfs/xsd/owl).
  const stripped = query
    .replace(/\b(?:PREFIX\s+[^\s<]*\s*<[^>]*>|BASE\s*<[^>]*>)/gi, ' ')
    .replace(/#[^\n]*/g, ' ')
    .trim()
  if (/^SELECT\b/i.test(stripped)) return 'select'
  if (/^ASK\b/i.test(stripped)) return 'ask'
  return 'unknown'
}

// ---- LIMIT/OFFSET slice on the query tail ----------------------------------

export interface QuerySlice {
  limit: number | null
  offset: number
  // Index where the trailing slice clause starts (query.length when absent).
  clauseStart: number
}

// Reads a trailing "LIMIT n [OFFSET m]" / "OFFSET m [LIMIT n]" clause. Only
// the tail is considered so subquery slices (which are followed by '}') are
// never touched — same "outermost only" semantics the backend applies when
// truncating merged distributed results.
const TAIL_SLICE =
  /\b(?:LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?|OFFSET\s+(\d+)(?:\s+LIMIT\s+(\d+))?)\s*$/i

export function parseQuerySlice(query: string): QuerySlice {
  const match = TAIL_SLICE.exec(query)
  if (!match) return { limit: null, offset: 0, clauseStart: query.length }
  const limit = match[1] ?? match[4]
  const offset = match[2] ?? match[3]
  return {
    limit: limit !== undefined ? Number(limit) : null,
    offset: offset !== undefined ? Number(offset) : 0,
    clauseStart: match.index,
  }
}

// Rewrites (or appends) the trailing slice clause. offset 0 is omitted.
export function withQuerySlice(query: string, limit: number, offset: number): string {
  const { clauseStart } = parseQuerySlice(query)
  const head = query.slice(0, clauseStart).replace(/\s+$/, '')
  const clause = offset > 0 ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}`
  return `${head}\n${clause}`
}

// Client-side guardrail: SELECT queries without an outermost LIMIT get
// DEFAULT_SELECT_LIMIT appended (the backend enforces no cap today).
export function ensureSelectLimit(query: string): string {
  if (sparqlQueryForm(query) !== 'select') return query
  const { limit, offset } = parseQuerySlice(query)
  if (limit !== null) return query
  return withQuerySlice(query, DEFAULT_SELECT_LIMIT, offset)
}

// ---- solution term rendering -------------------------------------------------

export type SparqlTerm =
  | { type: 'iri'; value: string; documentId: string | null }
  | { type: 'literal'; value: string; lang?: string; datatype?: string }
  | { type: 'blank'; value: string }
  | { type: 'unbound' }

// Graph IRIs are minted as https://w3id.org/aruna/{documentId ULID}
// (MetadataRegistryRecord::graph_iri_for). Anything under that prefix links
// to the portal's own metadata detail view.
const ARUNA_DOC_IRI = /^https:\/\/w3id\.org\/aruna\/([0-7][0-9A-HJKMNP-TV-Z]{25})(?:[/#].*)?$/

// Cells arrive in N-Triples syntax (craqle EncodedTerm / oxrdf Display).
export function parseSparqlTerm(raw: string | undefined): SparqlTerm {
  if (raw === undefined || raw === '') return { type: 'unbound' }
  if (raw.startsWith('<') && raw.endsWith('>')) {
    const iri = raw.slice(1, -1)
    const doc = ARUNA_DOC_IRI.exec(iri)
    return { type: 'iri', value: iri, documentId: doc ? doc[1] : null }
  }
  if (raw.startsWith('"')) {
    const closing = raw.lastIndexOf('"')
    const value = raw.slice(1, closing > 0 ? closing : raw.length)
    const suffix = closing > 0 ? raw.slice(closing + 1) : ''
    if (suffix.startsWith('@')) return { type: 'literal', value, lang: suffix.slice(1) }
    if (suffix.startsWith('^^<') && suffix.endsWith('>')) {
      return { type: 'literal', value, datatype: suffix.slice(3, -1) }
    }
    return { type: 'literal', value }
  }
  if (raw.startsWith('_:')) return { type: 'blank', value: raw }
  // Defensive: unknown encodings render as opaque literals, never crash.
  return { type: 'literal', value: raw }
}

// Column order: variables in their order of first appearance in the query
// text (projection order is lost in the response maps), then leftovers.
export function orderColumns(query: string, rows: Array<Record<string, string>>): string[] {
  const inRows = new Set(rows.flatMap((row) => Object.keys(row)))
  const ordered: string[] = []
  for (const match of query.matchAll(/\?([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (inRows.has(match[1]) && !ordered.includes(match[1])) ordered.push(match[1])
  }
  for (const name of [...inRows].sort()) {
    if (!ordered.includes(name)) ordered.push(name)
  }
  return ordered
}

// ---- starter examples --------------------------------------------------------

// PREFIXes are declared explicitly: the backend's query-form check parses the
// raw text (execution-time prefix injection does not apply to it). The graph
// vocabulary is http://schema.org/ (verified against the JSON-LD projection).
export interface ExampleQuery {
  label: string
  query: string
}

export const EXAMPLE_QUERIES: ExampleQuery[] = [
  {
    label: 'Distinct entity types',
    query: `PREFIX schema: <http://schema.org/>

SELECT DISTINCT ?type
WHERE { ?s a ?type }
ORDER BY ?type
LIMIT 100`,
  },
  {
    label: 'Datasets by keyword',
    query: `PREFIX schema: <http://schema.org/>

SELECT ?entity ?name ?keyword
WHERE {
  ?entity schema:name ?name ;
          schema:keywords ?keyword .
  FILTER(CONTAINS(LCASE(STR(?keyword)), "data"))
}
ORDER BY ?name
LIMIT 100`,
  },
  {
    label: 'Any dataset published? (ASK)',
    query: `PREFIX schema: <http://schema.org/>

ASK { ?s a schema:Dataset }`,
  },
]

// ---- local query history -------------------------------------------------------

export interface QueryHistoryEntry {
  query: string
  // 'realm' or a document id.
  scope: string
  mode: SparqlQueryMode
  at: number
}

const HISTORY_KEY = 'aruna.sparqlHistory.v1'
const HISTORY_MAX = 25

export function loadQueryHistory(): QueryHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is QueryHistoryEntry =>
        Boolean(e && typeof e === 'object')
        && typeof (e as QueryHistoryEntry).query === 'string'
        && typeof (e as QueryHistoryEntry).scope === 'string'
        && ((e as QueryHistoryEntry).mode === 'local' || (e as QueryHistoryEntry).mode === 'distributed')
        && typeof (e as QueryHistoryEntry).at === 'number',
    )
  } catch {
    return []
  }
}

// Newest first; consecutive duplicates (same query+scope) refresh in place.
export function pushQueryHistory(entry: QueryHistoryEntry): QueryHistoryEntry[] {
  const history = loadQueryHistory()
  const next =
    history[0] && history[0].query === entry.query && history[0].scope === entry.scope
      ? [entry, ...history.slice(1)]
      : [entry, ...history].slice(0, HISTORY_MAX)
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch { /* quota/private mode: history is best-effort */ }
  return next
}

export function clearQueryHistory(): void {
  try { window.localStorage.removeItem(HISTORY_KEY) } catch { /* ignore */ }
}
