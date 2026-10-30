import { crateGraph, crateRootId, stringProp, typesOf } from '@/lib/dataEntities'
import { toArray } from '@/lib/contextualEntities'
import { formatBinary, formatDate, isHttpUrl } from '@/lib/utils'

export interface IdentifierLink {
  text: string
  href?: string
}

export interface AboutFacts {
  published: string
  modified: string
  size: string
  /** File entities the crate lists; zero means none listed, not an empty dataset. */
  files: number
  identifiers: IdentifierLink[]
  /** The DOI link a citation leads with, when the crate gives one. */
  doi?: string
}

/** Root properties the About facts show, so the remaining property list skips them. */
export const ABOUT_KEYS = new Set(['datePublished', 'dateModified', 'contentSize', 'identifier'])

const DOI = /^(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i

function identifierLink(value: unknown, byId: Map<string, Record<string, unknown>>): IdentifierLink | null {
  const target = value && typeof value === 'object' ? byId.get(stringProp(value) ?? '') : undefined
  const raw = (target ? stringProp(target.value) ?? stringProp(target.url) ?? stringProp(target.name) : stringProp(value))?.trim()
  if (!raw) return null
  const doi = raw.match(DOI)?.[1]
  if (doi) return { text: `doi.org/${doi}`, href: `https://doi.org/${doi}` }
  return isHttpUrl(raw) ? { text: raw.replace(/^https?:\/\//, ''), href: raw } : { text: raw }
}

const dateOf = (value: unknown) => {
  const text = stringProp(value) ?? ''
  // Only an ISO date reads as a date; free text stays as written.
  return /^\d{4}-\d{2}-\d{2}/.test(text) && Number.isFinite(Date.parse(text)) ? formatDate(text.length === 10 ? `${text}T12:00:00` : text) : text
}

export function aboutFacts(crate: unknown): AboutFacts {
  const graph = crateGraph(crate)
  const byId = new Map(graph.map((entity) => [String(entity['@id']), entity]))
  const root = byId.get(crateRootId(crate) ?? '')
  const sizeText = stringProp(root?.contentSize)?.trim() ?? ''
  const identifiers = toArray(root?.identifier)
    .map((value) => identifierLink(value, byId))
    .filter((link): link is IdentifierLink => Boolean(link))
  return {
    published: dateOf(root?.datePublished),
    modified: dateOf(root?.dateModified),
    size: sizeText && Number.isFinite(Number(sizeText)) ? formatBinary(Number(sizeText)) : sizeText,
    files: graph.filter((entity) => typesOf(entity).some((type) => type === 'File' || type.endsWith('MediaObject'))).length,
    identifiers,
    doi: identifiers.find((link) => link.href?.startsWith('https://doi.org/'))?.href,
  }
}

export interface CitationParts {
  authors: string[]
  year: string
  title: string
  publisher: string
  link: string
}

/** "Doe, A., Roe, B. (2026). Title. Publisher. https://doi.org/..."; missing parts drop out. */
export function citationText(parts: CitationParts): string {
  const head = [parts.authors.join(', '), parts.year ? `(${parts.year})` : ''].filter(Boolean).join(' ')
  return [head, parts.title, parts.publisher, parts.link].filter(Boolean).map((part) => part.replace(/\.$/, '')).join('. ')
}
