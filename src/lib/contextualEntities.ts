// Pure mapper behind the metadata detail page's "People and context" section:
// groups every non-data entity of a crate for display. It reads only the
// already-loaded full crate (GET /metadata/{id}/rocrate?view=full, cached in
// fullCrates), whose export carries the complete contextual closure — every
// referenced entity not typed Dataset/MediaObject/File — so resolving what is
// listed here never needs a follow-up request.

import { crateGraph, crateRootId, stringProp } from '@/lib/dataEntities'
import { isArunaUserId, orcidOf, readableIri, rorOf } from '@/lib/identifiers'

export type ContextualGroupKey =
  | 'people'
  | 'organizations'
  | 'publications'
  | 'licenses'
  | 'software'
  | 'places'
  | 'terms'
  | 'comments'
  | 'other'

export interface EntityAffiliation {
  /** Set when the crate carries a card-rendering entity to jump to. */
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

export interface ContextualGroup {
  key: ContextualGroupKey
  label: string
  entities: ContextualEntity[]
}

export interface ContextualEntityOptions {
  /** Ids kept out of the listing (e.g. subcrate links shown elsewhere). */
  excludeIds?: Iterable<string>
}

const GROUPS: Array<{ key: ContextualGroupKey; label: string }> = [
  { key: 'people', label: 'People' },
  { key: 'organizations', label: 'Organizations' },
  { key: 'publications', label: 'Publications and citations' },
  { key: 'licenses', label: 'Licenses' },
  { key: 'software', label: 'Software' },
  { key: 'places', label: 'Places' },
  { key: 'terms', label: 'Terms and tags' },
  { key: 'comments', label: 'Comments' },
  { key: 'other', label: 'Other' },
]

// Root properties whose references earn a role badge, in badge order.
const ROLE_PROPS: Array<[string, string]> = [
  ['author', 'Author'],
  ['creator', 'Author'],
  ['contributor', 'Contributor'],
  ['publisher', 'Publisher'],
  ['sdPublisher', 'Publisher'],
  ['funder', 'Funder'],
  ['maintainer', 'Maintainer'],
  ['copyrightHolder', 'Copyright holder'],
  ['citation', 'Cited work'],
  ['license', 'License'],
]

// Where a root role places an entity whose types decide no group themselves.
const ROLE_GROUPS: Record<string, ContextualGroupKey> = {
  Author: 'people',
  Contributor: 'people',
  Maintainer: 'people',
  Publisher: 'organizations',
  Funder: 'organizations',
  'Copyright holder': 'organizations',
  'Cited work': 'publications',
  License: 'licenses',
}

// Data entities stay in the Referenced data table; PropertyValue rows are
// custom-field storage and would swamp the page (hidden by decision).
const EXCLUDED_TYPES = new Set(['File', 'Dataset', 'MediaObject', 'PropertyValue'])

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
}

function refId(value: unknown): string {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value['@id'] === 'string') return value['@id']
  return ''
}

function typesOf(entity: Record<string, unknown> | undefined): string[] {
  const t = entity?.['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}

function isStub(entity?: Record<string, unknown>): boolean {
  if (!entity) return true
  return Object.keys(entity).every((key) => key === '@id' || key === '@type')
}

type EntityIndex = Map<string, Record<string, unknown>>

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

function personName(entity: Record<string, unknown> | undefined): string {
  return [stringProp(entity?.givenName), stringProp(entity?.familyName)].filter(Boolean).join(' ')
}

function nameOf(value: unknown, byId: EntityIndex): string | undefined {
  const id = refId(value)
  const target = id ? byId.get(id) : undefined
  return stringProp(target?.name) || personName(target) || (id ? readableIri(id) : undefined)
}

function entityOf(
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

// Explicit types decide the group; a root role only claims untyped entities
// (and typed ones no group recognises), so a role wins over a missing type.
function groupOf(row: ContextualEntity): ContextualGroupKey {
  const { types, roles } = row
  if (types.includes('Person')) return 'people'
  if (types.some((t) => ORG_TYPES.has(t))) return 'organizations'
  if (types.some((t) => PUBLICATION_TYPES.has(t))) return 'publications'
  if (types.some((t) => SOFTWARE_TYPES.has(t))) return 'software'
  if (types.some((t) => PLACE_TYPES.has(t))) return 'places'
  if (types.some((t) => TERM_TYPES.has(t))) return 'terms'
  if (types.includes('Comment')) return 'comments'
  for (const role of roles) {
    const key = ROLE_GROUPS[role]
    if (key) return key
  }
  return 'other'
}

// Every contextual entity of the crate in display groups: graph entities minus
// descriptor, root, data entities, PropertyValue rows and `excludeIds`, plus a
// stub card per root-role reference without a graph entity. Dedup is by @id
// only — same-named entities under distinct ids stay separate cards.
export function contextualEntitiesOf(crate: unknown, options: ContextualEntityOptions = {}): ContextualGroup[] {
  const graph = crateGraph(crate)
  if (!graph.length) return []
  const rootId = crateRootId(crate)
  const excluded = new Set(options.excludeIds ?? [])
  const byId: EntityIndex = new Map()
  for (const entity of graph) {
    const id = entity['@id']
    if (typeof id === 'string' && !byId.has(id)) byId.set(id, entity)
  }
  const root = rootId ? byId.get(rootId) : undefined

  const roleIndex = new Map<string, string[]>()
  for (const [property, role] of ROLE_PROPS) {
    for (const ref of toArray(root?.[property])) {
      const id = refId(ref)
      if (!id) continue
      const roles = roleIndex.get(id) ?? []
      if (!roles.includes(role)) roles.push(role)
      roleIndex.set(id, roles)
    }
  }

  const rows = new Map<string, ContextualEntity>()
  const consider = (id: string, entity?: Record<string, unknown>) => {
    if (!id || rows.has(id) || id === 'ro-crate-metadata.json' || id === rootId || excluded.has(id)) return
    if (typesOf(entity).some((t) => EXCLUDED_TYPES.has(t))) return
    rows.set(id, entityOf(id, entity, roleIndex.get(id) ?? [], byId))
  }
  for (const entity of graph) {
    const id = entity['@id']
    if (typeof id === 'string') consider(id, byId.get(id))
  }
  for (const id of roleIndex.keys()) consider(id, byId.get(id))

  const buckets = new Map<ContextualGroupKey, ContextualEntity[]>()
  for (const row of rows.values()) {
    const key = groupOf(row)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else buckets.set(key, [row])
  }
  return GROUPS.flatMap((group) => {
    const entities = buckets.get(group.key)
    return entities?.length ? [{ ...group, entities }] : []
  })
}
