import { crateGraph, crateRootId } from '@/lib/dataEntities'
import { isAbsoluteUri } from '@/lib/profiles/uri'
import { isHttpUrl } from '@/lib/utils'

export interface LicenseRow {
  kind: 'Literal' | 'Internal reference' | 'External IRI'
  label: string
  href?: string
}

interface TermDefinition {
  id: string
  type: '@id' | '@vocab' | null
  context?: unknown
}

interface LicenseContext {
  vocab: string
  terms: Map<string, TermDefinition>
}

interface LicenseEntry {
  value: unknown
  coercion: '@id' | '@vocab' | null
  context: LicenseContext
}

function licenseValues(value: unknown): unknown[] {
  return Array.isArray(value) ? value.flatMap(licenseValues) : value == null ? [] : [value]
}

function cloneContext(context: LicenseContext): LicenseContext {
  return { vocab: context.vocab, terms: new Map(context.terms) }
}

function expandContextTerm(
  value: string,
  context: LicenseContext,
  useVocab = true,
  seen = new Set<string>(),
): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('@')) return value
  const separator = value.indexOf(':')
  if (separator > 0) {
    const prefix = context.terms.get(value.slice(0, separator))
    return prefix
      ? `${expandContextTerm(prefix.id, context, true, seen)}${value.slice(separator + 1)}`
      : value
  }
  const definition = context.terms.get(value)
  if (definition && !seen.has(value)) {
    return expandContextTerm(definition.id, context, true, new Set(seen).add(value))
  }
  return useVocab && context.vocab
    ? `${expandContextTerm(context.vocab, context, false, seen)}${value}`
    : value
}

function applyLicenseContext(value: unknown, context: LicenseContext) {
  if (value === null) {
    context.vocab = ''
    context.terms.clear()
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) applyLicenseContext(entry, context)
    return
  }
  if (typeof value === 'string') {
    if (/^https?:\/\/w3id\.org\/ro\/crate\/1\.[12]\/context\/?$/.test(value)) {
      context.terms.set('schema', { id: 'http://schema.org/', type: null })
      context.terms.set('license', { id: 'http://schema.org/license', type: null })
    }
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  if (Object.hasOwn(record, '@vocab')) {
    context.vocab = typeof record['@vocab'] === 'string' ? record['@vocab'] : ''
  }
  for (const [term, definition] of Object.entries(record)) {
    if (term.startsWith('@')) continue
    if (definition === null) {
      context.terms.delete(term)
    } else if (typeof definition === 'string') {
      context.terms.set(term, { id: definition, type: null })
    } else if (definition && typeof definition === 'object' && !Array.isArray(definition)) {
      const termDefinition = definition as Record<string, unknown>
      const id = typeof termDefinition['@id'] === 'string' ? termDefinition['@id'] : term
      const type = termDefinition['@type']
      context.terms.set(term, {
        id,
        type: type === '@id' || type === '@vocab' ? type : null,
        ...(Object.hasOwn(termDefinition, '@context') ? { context: termDefinition['@context'] } : {}),
      })
    }
  }
}

function licenseContext(crate: unknown, root: Record<string, unknown> | undefined): LicenseContext {
  const context: LicenseContext = { vocab: '', terms: new Map() }
  if (crate && typeof crate === 'object' && !Array.isArray(crate)) {
    applyLicenseContext((crate as Record<string, unknown>)['@context'], context)
  }
  applyLicenseContext(root?.['@context'], context)
  return context
}

function keywordValue(entry: Record<string, unknown>, keyword: string, context: LicenseContext): unknown {
  if (Object.hasOwn(entry, keyword)) return entry[keyword]
  const alias = Object.keys(entry).find((key) => expandContextTerm(key, context) === keyword)
  return alias ? entry[alias] : undefined
}

function licenseText(value: unknown, context?: LicenseContext): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return licenseText(value[0], context)
  if (value && typeof value === 'object') {
    const entry = value as Record<string, unknown>
    const text = context ? keywordValue(entry, '@value', context) ?? entry.name : entry['@value'] ?? entry.name
    return licenseText(text, context)
  }
  return ''
}

function literalRow(value: unknown, context?: LicenseContext): LicenseRow {
  const label = licenseText(value, context) || String(value)
  const href = label.trim()
  return { kind: 'Literal', label, ...(isHttpUrl(href) ? { href } : {}) }
}

function isLicenseTerm(value: string): boolean {
  return /^https?:\/\/schema\.org\/license$/.test(value)
}

function licenseEntries(root: Record<string, unknown> | undefined, context: LicenseContext): LicenseEntry[] {
  if (!root) return []
  const entries: LicenseEntry[] = []
  for (const [term, value] of Object.entries(root)) {
    const definition = context.terms.get(term)
    const isLicense = isLicenseTerm(expandContextTerm(term, context))
      || (term === 'license' && !definition)
    if (!isLicense) continue
    const valueContext = cloneContext(context)
    if (definition?.context !== undefined) applyLicenseContext(definition.context, valueContext)
    for (const item of licenseValues(value)) {
      entries.push({ value: item, coercion: definition?.type ?? null, context: valueContext })
    }
  }
  return entries
}

function expandLicenseId(
  value: string,
  context: LicenseContext,
  coercion: '@id' | '@vocab' | null = '@id',
): string {
  return expandContextTerm(value, context, coercion === '@vocab')
}

function licenseEntity(
  graph: Array<Record<string, unknown>>,
  id: string,
  expandedId: string,
  context: LicenseContext,
): Record<string, unknown> | undefined {
  return graph.find((candidate) => {
    const candidateContext = cloneContext(context)
    applyLicenseContext(candidate['@context'], candidateContext)
    const candidateId = keywordValue(candidate, '@id', candidateContext)
    if (typeof candidateId !== 'string') return false
    const expandedCandidate = expandLicenseId(candidateId, candidateContext)
    return candidateId === id || candidateId === expandedId
      || expandedCandidate === id || expandedCandidate === expandedId
  })
}

function licenseRow(entry: LicenseEntry, graph: Array<Record<string, unknown>>): LicenseRow {
  const { value, coercion } = entry
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (typeof value === 'string' && coercion) {
      const id = expandLicenseId(value, entry.context, coercion)
      const entity = licenseEntity(graph, value, id, entry.context)
      const kind = entity || !isAbsoluteUri(id) ? 'Internal reference' : 'External IRI'
      return {
        kind,
        label: licenseText(entity?.name, entry.context) || value,
        ...(isHttpUrl(id) ? { href: id } : {}),
      }
    }
    return literalRow(value, entry.context)
  }
  const valueContext = cloneContext(entry.context)
  applyLicenseContext((value as Record<string, unknown>)['@context'], valueContext)
  const object = value as Record<string, unknown>
  const rawId = keywordValue(object, '@id', valueContext)
  const id = typeof rawId === 'string' ? rawId : ''
  if (!id) {
    if (keywordValue(object, '@value', valueContext) === undefined) {
      return {
        kind: 'Internal reference',
        label: licenseText(object, valueContext) || JSON.stringify(object),
      }
    }
    return literalRow(object, valueContext)
  }
  const expandedId = expandLicenseId(id, valueContext)
  const entity = licenseEntity(graph, id, expandedId, valueContext)
  const embedded = Object.keys(object).some((key) => {
    const expandedKey = key === '@context' ? '@context' : expandContextTerm(key, valueContext)
    return expandedKey !== '@id' && expandedKey !== '@context'
  })
  const kind = entity || embedded
    ? 'Internal reference'
    : isAbsoluteUri(expandedId)
      ? 'External IRI'
      : 'Internal reference'
  return {
    kind,
    label: licenseText(object, valueContext) || licenseText(entity?.name, valueContext) || id,
    ...(isHttpUrl(expandedId) ? { href: expandedId } : {}),
  }
}

export function resolveLicenseRows(crate: unknown, fallback?: string | null): LicenseRow[] {
  const graph = crateGraph(crate)
  const rootId = crateRootId(crate)
  const root = rootId ? graph.find((entity) => entity['@id'] === rootId) : undefined
  const context = licenseContext(crate, root)
  const entries = licenseEntries(root, context)
  if (!entries.length && fallback) return [literalRow(fallback)]
  return entries.map((entry) => licenseRow(entry, graph))
}
