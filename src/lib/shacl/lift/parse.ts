import { DataFactory, Parser, Store, type Quad_Object, type Quad_Subject, type Term } from 'n3'
import { CRATE_BASE_IRI } from '../projection'
import { isValidPropertyTermName, SCHEMA_ORG, termNameFromUri } from '../../profiles/uri'

export interface LiftNote {
  kind: 'partial' | 'no-field'
  message: string
  // Shapes / properties the message applies to. One note per distinct message,
  // so a file that repeats a construct 40 times reports it once.
  scopes: string[]
}

// Reactive caches hand out DeepReadonly notes; copy them back into the
// mutable LiftNote shape the presentation components declare.
export function cloneLiftNotes(
  notes: readonly { readonly kind: LiftNote['kind']; readonly message: string; readonly scopes: readonly string[] }[],
): LiftNote[] {
  return notes.map((note) => ({ kind: note.kind, message: note.message, scopes: [...note.scopes] }))
}

export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
export const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'
const RDF_REST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
const RDF_NIL = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'
export const SCHEMA_DATASET = `${SCHEMA_ORG}Dataset`
const HTTPS_SCHEMA_ORG = 'https://schema.org/'

// schema.org is written both http and https in the wild, and a file may mix the
// two. The portal's own form is http (uri.ts SCHEMA_ORG), and a profile holding
// both would bind one compact term to two different URIs, so every term and type
// IRI is canonicalized as it enters the rule model.
export function canonicalIri(value: string): string {
  return value.startsWith(HTTPS_SCHEMA_ORG) ? `${SCHEMA_ORG}${value.slice(HTTPS_SCHEMA_ORG.length)}` : value
}

// Throws on unparseable Turtle; the caller turns that into a file error.
export function parseTurtle(turtle: string): { store: Store; prefixes: Record<string, string> } {
  const store = new Store()
  const prefixes: Record<string, string> = {}
  const parser = new Parser({ baseIRI: CRATE_BASE_IRI })
  store.addQuads(parser.parse(turtle, null, (prefix, node) => { prefixes[prefix] = node.value }))
  return { store, prefixes }
}

// Collects notes, merging repeats of the same message into one entry.
export class Notes {
  private readonly byMessage = new Map<string, LiftNote>()

  add(kind: LiftNote['kind'], message: string, scope?: string) {
    const key = `${kind}\u0000${message}`
    const existing = this.byMessage.get(key)
    if (existing) {
      if (scope && !existing.scopes.includes(scope)) existing.scopes.push(scope)
      return
    }
    this.byMessage.set(key, { kind, message, scopes: scope ? [scope] : [] })
  }

  list(): LiftNote[] {
    // No-field notes first: they are the ones an author must act on.
    return [...this.byMessage.values()].sort(
      (a, b) => Number(b.kind === 'no-field') - Number(a.kind === 'no-field'),
    )
  }
}

export function listItems(store: Store, head: Quad_Subject | Term): Quad_Object[] | undefined {
  const items: Quad_Object[] = []
  let current: Term = head as Term
  const seen = new Set<string>()
  while (current.value !== RDF_NIL) {
    if (current.termType !== 'BlankNode' && current.termType !== 'NamedNode') return undefined
    const key = termKey(current)
    if (seen.has(key)) return undefined
    seen.add(key)
    const firsts = store.getQuads(current as Quad_Subject, RDF_FIRST, null, null)
    const rests = store.getQuads(current as Quad_Subject, RDF_REST, null, null)
    if (firsts.length !== 1 || rests.length !== 1) return undefined
    items.push(firsts[0].object)
    current = rests[0].object
  }
  return items
}

export function classNameFor(type: string): string {
  const raw = termNameFromUri(type).replace(/[^A-Za-z0-9]+/g, '')
  const named = /^[A-Za-z]/.test(raw) ? raw : `Type${raw}`
  return named[0].toUpperCase() + named.slice(1)
}

// A compact term name that always satisfies isValidPropertyTermName. Opaque
// numeric terms (MIxS and other OBO-style IRIs) keep their digits behind a `p`
// prefix so they stay distinct from each other.
export function propertyNameFor(path: string): string {
  const raw = termNameFromUri(path).replace(/[^A-Za-z0-9]+/g, '')
  if (!raw) return 'value'
  const candidate = raw[0].toLowerCase() + raw.slice(1)
  return isValidPropertyTermName(candidate) ? candidate : `p${candidate}`
}

// A readable field label: the term's own name when it has one, else its
// prefixed name from the file's own @prefix declarations (mixs:0001107 reads
// better than 0001107), else the raw IRI.
export function labelForPath(path: string, prefixes: Record<string, string>): string {
  const local = termNameFromUri(path)
  if (/[A-Za-z]/.test(local)) return humanLabel(local)
  return toCurie(path, prefixes) || local || path
}

export function humanLabel(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : ''
}

function toCurie(iri: string, prefixes: Record<string, string>): string {
  let best = ''
  let bestPrefix = ''
  for (const [prefix, namespace] of Object.entries(prefixes)) {
    if (prefix && iri.startsWith(namespace) && namespace.length > best.length) {
      best = namespace
      bestPrefix = prefix
    }
  }
  return best ? `${bestPrefix}:${iri.slice(best.length)}` : ''
}

// Required-instance ids are stored the way the crate writes them: crate-local
// paths stay relative, absolute URIs pass through.
export function crateLocalValue(value: string): string {
  return value.startsWith(CRATE_BASE_IRI) ? value.slice(CRATE_BASE_IRI.length) : value
}

export function objectValue(store: Store, subject: Quad_Subject, predicate: string): string | undefined {
  const quads = store.getQuads(subject, predicate, null, null)
  return quads.length ? quads[0].object.value : undefined
}

export function literalValue(store: Store, subject: Quad_Subject, predicate: string): string | undefined {
  const quads = store.getQuads(subject, predicate, null, null)
  const literalQuad = quads.find((quad) => quad.object.termType === 'Literal')
  return literalQuad?.object.value
}

export function intValue(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function floatValue(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function addTerm(map: Map<string, Quad_Subject>, term: Quad_Subject) {
  map.set(termKey(term), term)
}

export function termKey(term: Term): string {
  return `${term.termType}:${term.value}`
}

export function namedNode(value: string) {
  return DataFactory.namedNode(value)
}

export function shortTerm(term: Term): string {
  return term.termType === 'BlankNode' ? 'an inline shape' : shortIri(term.value)
}

export function shortIri(value: string | undefined): string {
  if (!value) return '(none)'
  const hash = value.lastIndexOf('#')
  if (hash >= 0 && hash < value.length - 1) return value.slice(hash + 1)
  return value
}
