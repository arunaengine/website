// Card-shaped mapping for people and organization entities plus the shared
// graph helpers the crate presenter builds on. Reads only the already-loaded
// full crate (GET /metadata/{id}/rocrate?view=full, cached in fullCrates), so
// resolving anything shown here never needs a follow-up request.

import { stringProp } from '@/lib/dataEntities'
import { isArunaUserId, orcidOf, readableIri, rorOf } from '@/lib/identifiers'

export type EntityKind =
  | 'people'
  | 'organizations'
  | 'publications'
  | 'software'
  | 'places'
  | 'terms'
  | 'comments'
  | 'other'

export interface EntityAffiliation {
  /** Set when the crate carries a displayed entity to jump to. */
  id?: string
  name: string
}

export interface ContextualEntity {
  id: string
  name: string
  types: string[]
  roles: string[]
  affiliations: EntityAffiliation[]
  email?: string
  url?: string
  description?: string
  version?: string
  address?: string
  orcid?: string
  ror?: string
  userId?: string
  /** Comment body, author and timestamp; set for Comment entities only. */
  text?: string
  authorName?: string
  created?: string
  /** True when the crate carries no details beyond the id itself. */
  unresolved: boolean
}

const ORG_TYPES = new Set([
  'Organization',
  'EducationalOrganization',
  'CollegeOrUniversity',
  'GovernmentOrganization',
  'ResearchOrganization',
  'Corporation',
  'Consortium',
  'FundingAgency',
  'NGO',
  'Project',
  'ResearchProject',
])
const PUBLICATION_TYPES = new Set([
  'ScholarlyArticle',
  'Article',
  'Book',
  'Chapter',
  'Thesis',
  'Report',
  'Periodical',
  'PublicationIssue',
  'PublicationVolume',
])
const SOFTWARE_TYPES = new Set([
  'SoftwareApplication',
  'SoftwareSourceCode',
  'ComputationalWorkflow',
  'WebApplication',
])
const PLACE_TYPES = new Set([
  'Place',
  'City',
  'Country',
  'State',
  'AdministrativeArea',
  'PostalAddress',
  'GeoCoordinates',
  'GeoShape',
])
const TERM_TYPES = new Set(['DefinedTerm', 'DefinedTermSet', 'CategoryCode', 'CategoryCodeSet'])

/** Display kind an entity's explicit types decide (untyped entities: 'other'). */
export function entityKind(types: string[]): EntityKind {
  if (types.includes('Person')) return 'people'
  if (types.some((t) => ORG_TYPES.has(t))) return 'organizations'
  if (types.some((t) => PUBLICATION_TYPES.has(t))) return 'publications'
  if (types.some((t) => SOFTWARE_TYPES.has(t))) return 'software'
  if (types.some((t) => PLACE_TYPES.has(t))) return 'places'
  if (types.some((t) => TERM_TYPES.has(t))) return 'terms'
  if (types.includes('Comment')) return 'comments'
  return 'other'
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
}

export function refId(value: unknown): string {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value['@id'] === 'string') return value['@id']
  return ''
}

export function typesOf(entity: Record<string, unknown> | undefined): string[] {
  const t = entity?.['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}

export function isStub(entity?: Record<string, unknown>): boolean {
  if (!entity) return true
  return Object.keys(entity).every((key) => key === '@id' || key === '@type')
}

export type EntityIndex = Map<string, Record<string, unknown>>

// identifier entries come as bare strings, `{ "@id" }` refs, or (referenced or
// inline) PropertyValue nodes whose `value` carries the actual identifier.
function identifierValues(entity: Record<string, unknown> | undefined, byId: EntityIndex): string[] {
  const values: string[] = []
  for (const raw of toArray(entity?.identifier)) {
    if (typeof raw === 'string') {
      values.push(raw)
      continue
    }
    if (!isRecord(raw)) continue
    const id = typeof raw['@id'] === 'string' ? raw['@id'] : ''
    const node = (id && byId.get(id)) || raw
    const value = stringProp(node.value) || id
    if (value) values.push(value)
  }
  return values
}

function affiliationsOf(entity: Record<string, unknown> | undefined, byId: EntityIndex): EntityAffiliation[] {
  const out: EntityAffiliation[] = []
  const seen = new Set<string>()
  for (const property of ['affiliation', 'worksFor', 'memberOf']) {
    for (const ref of toArray(entity?.[property])) {
      const id = refId(ref)
      const target = id ? byId.get(id) : undefined
      // A bare string is already the display name; a resolved ref uses the
      // organization's name and an unresolved IRI its readable tail.
      const name =
        stringProp(target?.name) || (typeof ref === 'string' && !target ? ref : id ? readableIri(id) : '')
      if (!name || seen.has(name)) continue
      seen.add(name)
      out.push({ id: target ? id : undefined, name })
    }
  }
  return out
}

function addressOf(entity: Record<string, unknown> | undefined, byId: EntityIndex): string | undefined {
  const raw = toArray(entity?.address)[0]
  if (typeof raw === 'string') return raw
  if (!isRecord(raw)) return undefined
  const id = typeof raw['@id'] === 'string' ? raw['@id'] : ''
  const target = (id && byId.get(id)) || raw
  const parts = ['streetAddress', 'postalCode', 'addressLocality', 'addressCountry']
    .map((key) => stringProp(target[key]))
    .filter(Boolean)
  return parts.join(', ') || stringProp(target.name)
}

export function personName(entity: Record<string, unknown> | undefined): string {
  return [stringProp(entity?.givenName), stringProp(entity?.familyName)].filter(Boolean).join(' ')
}

function nameOf(value: unknown, byId: EntityIndex): string | undefined {
  const id = refId(value)
  const target = id ? byId.get(id) : undefined
  return stringProp(target?.name) || personName(target) || (id ? readableIri(id) : undefined)
}

/** The fixed card shape for a person / organization entity (or role stub). */
export function cardEntity(
  id: string,
  entity: Record<string, unknown> | undefined,
  roles: string[],
  byId: EntityIndex,
): ContextualEntity {
  const types = typesOf(entity)
  const identifiers = [id, ...identifierValues(entity, byId)]
  const isComment = types.includes('Comment')
  return {
    id,
    name: stringProp(entity?.name) || personName(entity) || readableIri(id),
    types,
    roles,
    affiliations: affiliationsOf(entity, byId),
    email: stringProp(entity?.email)?.replace(/^mailto:/i, ''),
    url: stringProp(entity?.url),
    description: stringProp(entity?.description),
    version: stringProp(entity?.version) ?? stringProp(entity?.softwareVersion),
    address: addressOf(entity, byId),
    orcid: identifiers.map((value) => orcidOf(value)).find(Boolean),
    ror: identifiers.map((value) => rorOf(value)).find(Boolean),
    userId: identifiers.find((value) => isArunaUserId(value)),
    text: isComment ? stringProp(entity?.text) : undefined,
    authorName: isComment ? nameOf(entity?.author, byId) : undefined,
    created: isComment ? stringProp(entity?.dateCreated) : undefined,
    unresolved: isStub(entity),
  }
}
