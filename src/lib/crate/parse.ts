import { RO_CRATE_PROFILE_IRI, subcrateLinksOf } from '@/lib/subcrates'
import { RO_CRATE_PROFILE } from '@/lib/profiles/types'
import type { ContextEntity, DatasetDraft, Part, RootRole } from './build'

export interface ParseDatasetOptions {
  groupId?: string
  path?: string
  public?: boolean
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function values(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function idOf(value: unknown): string {
  if (typeof value === 'string') return value
  const object = record(value)
  return typeof object?.['@id'] === 'string' ? object['@id'] : ''
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function typeOf(value: unknown): string | string[] {
  if (Array.isArray(value)) return value.map(String)
  return typeof value === 'string' ? value : 'Thing'
}

function hasType(entity: Record<string, unknown>, type: string): boolean {
  return values(entity['@type']).some((value) => String(value).split('/').pop() === type)
}

function profileContextTerms(crate: Record<string, unknown>): Record<string, string> | undefined {
  const context = crate['@context']
  if (!Array.isArray(context)) return undefined
  const terms = context.map(record).find(Boolean)
  if (!terms) return undefined
  return Object.fromEntries(Object.entries(terms).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

export function parseDatasetDraft(crateValue: unknown, options: ParseDatasetOptions = {}): DatasetDraft {
  const crate = record(crateValue) ?? {}
  const graph = Array.isArray(crate['@graph']) ? crate['@graph'].map(record).filter(Boolean) as Record<string, unknown>[] : []
  const descriptor = graph.find((entity) => entity['@id'] === 'ro-crate-metadata.json')
  const rootId = idOf(descriptor?.about) || './'
  const root = graph.find((entity) => entity['@id'] === rootId) ?? {}
  const byId = new Map(graph
    .filter((entity) => typeof entity['@id'] === 'string')
    .map((entity) => [entity['@id'] as string, entity]))

  const license = idOf(root.license) || text(root.license)
  const stringKeywords = values(root.keywords).map(text).filter(Boolean)
  const subcrateLinks = subcrateLinksOf(crate)
  const subcratesById = new Map(subcrateLinks.map((link) => [link.iri, link]))
  const parts: Part[] = []
  const partIds = new Set<string>()
  const subjectIds = new Set<string>()
  for (const link of subcrateLinks) if (link.subjectOf) subjectIds.add(link.subjectOf)

  for (const reference of values(root.hasPart)) {
    const id = idOf(reference)
    if (!id || partIds.has(id)) continue
    const subcrate = subcratesById.get(id)
    if (subcrate) {
      partIds.add(id)
      parts.push({ kind: 'dataset', link: subcrate })
      continue
    }
    partIds.add(id)
    const entity = byId.get(id)
    const name = text(entity?.name) || id
    const contentUrl = text(entity?.contentUrl) || undefined
    if (contentUrl || id.startsWith('s3://') || id.startsWith('https://w3id.org/aruna/data/')) {
      parts.push({
        kind: 'object',
        id,
        name,
        contentUrl,
        identity: contentUrl && id.startsWith('https://w3id.org/aruna/data/') ? 'content' : 'location',
      })
    } else {
      parts.push({ kind: 'external', url: id, name: name === id ? undefined : name })
    }
  }

  const rolesById = new Map<string, RootRole[]>()
  const rootReserved = new Set([
    '@id', '@type', 'name', 'description', 'datePublished', 'license', 'identifier',
    'keywords', 'hasPart', 'conformsTo',
  ])
  for (const [property, value] of Object.entries(root)) {
    if (rootReserved.has(property)) continue
    for (const reference of values(value)) {
      const id = idOf(reference)
      if (!id || !byId.has(id) || partIds.has(id)) continue
      rolesById.set(id, [...(rolesById.get(id) ?? []), property])
    }
  }
  for (const reference of values(root.keywords)) {
    const id = idOf(reference)
    if (id && byId.has(id)) rolesById.set(id, [...(rolesById.get(id) ?? []), 'keywords'])
  }

  const conformsTo = values(root.conformsTo).map(idOf).filter(Boolean)
  const profileIri = conformsTo.find((iri) =>
    iri !== RO_CRATE_PROFILE
    && iri !== RO_CRATE_PROFILE_IRI
    && !iri.startsWith(`${RO_CRATE_PROFILE_IRI}/`),
  )
  const profileEntity = profileIri ? byId.get(profileIri) : undefined
  const excludedIds = new Set([
    rootId,
    'ro-crate-metadata.json',
    license,
    ...(profileIri ? [profileIri] : []),
    ...partIds,
    ...subjectIds,
  ].filter(Boolean))

  const entities: ContextEntity[] = []
  for (const entity of graph) {
    const id = typeof entity['@id'] === 'string' ? entity['@id'] : ''
    if (!id || excludedIds.has(id)) continue
    const { ['@id']: _id, ['@type']: rawType, ...properties } = entity
    entities.push({
      id,
      type: typeOf(rawType),
      properties,
      roles: [...new Set(rolesById.get(id) ?? [])],
    })
  }

  const custom: Record<string, unknown> = {}
  const roleProperties = new Set([...rolesById.values()].flat())
  for (const [property, value] of Object.entries(root)) {
    if (rootReserved.has(property) || roleProperties.has(property)) continue
    custom[property] = value
  }

  return {
    basics: {
      groupId: options.groupId,
      path: options.path,
      title: text(root.name),
      description: text(root.description),
      datePublished: text(root.datePublished),
      license,
      keywords: stringKeywords,
      identifier: text(root.identifier) || undefined,
    },
    entities,
    parts,
    visibility: options.public ? 'public' : 'group',
    ...(profileIri
      ? {
          profile: {
            iri: profileIri,
            name: text(profileEntity?.name) || undefined,
            version: text(profileEntity?.version) || undefined,
            contextTerms: profileContextTerms(crate),
          },
        }
      : {}),
    ...(Object.keys(custom).length ? { custom } : {}),
  }
}
