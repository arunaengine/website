import { fileEntityForReference, type ContentReferenceIdentity } from '@/lib/contentIdentity'
import { orcidOf } from '@/lib/identifiers'
import { buildProfileContext } from '@/lib/profiles/propertyCatalog'
import { slugify } from '@/lib/profiles/emit'
import { licenseEntity } from '@/lib/profiles/rocrate'
import { DX_PROFILE, RO_CRATE_PROFILE } from '@/lib/profiles/types'
import { addSubcrateLink, type SubcrateLink } from '@/lib/subcrates'

export type RootRole =
  | 'author'
  | 'contributor'
  | 'maintainer'
  | 'publisher'
  | 'funder'
  | 'affiliation'
  | 'citation'
  | 'spatialCoverage'
  | 'contactPoint'
  | 'about'
  | 'keywords'
  | (string & {})

export interface ContextEntity {
  id: string
  type: string | string[]
  properties: Record<string, unknown>
  roles: RootRole[]
}

export interface DatasetBasics {
  groupId?: string
  path?: string
  title: string
  description: string
  datePublished: string
  license: string
  keywords?: string[]
  identifier?: string
}

export interface DatasetDraftProfile {
  iri: string
  name?: string
  version?: string
  contextTerms?: Record<string, string>
}

export type Part =
  | {
      kind: 'object'
      id: string
      name: string
      contentUrl?: string
      identity: ContentReferenceIdentity
    }
  | { kind: 'external'; url: string; name?: string }
  | { kind: 'dataset'; link: SubcrateLink }

export interface DatasetDraft {
  basics: DatasetBasics
  entities: ContextEntity[]
  parts: Part[]
  visibility: 'group' | 'public'
  profile?: DatasetDraftProfile
  custom?: Record<string, unknown>
}

export interface DatasetBuildResult {
  public: boolean
  rocrate: Record<string, unknown>
}

export interface SignedInUser {
  id: string
  name: string
  orcid?: string
  affiliation?: string
  attributes?: Record<string, string>
}

function values(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function referenceId(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>)['@id']
    return typeof id === 'string' ? id : ''
  }
  return ''
}

export function signedInUserEntity(user: SignedInUser, roles: RootRole[] = ['author']): ContextEntity {
  const orcid = orcidOf(user.orcid ?? user.attributes?.orcid)
  const canonicalOrcid = orcid ? `https://orcid.org/${orcid}` : undefined
  return {
    id: canonicalOrcid ?? `#person-${slugify(user.name) || 'user'}`,
    type: 'Person',
    properties: {
      name: user.name,
      identifier: canonicalOrcid ? [user.id, canonicalOrcid] : user.id,
      ...(user.affiliation ? { affiliation: user.affiliation } : {}),
    },
    roles,
  }
}

export function visibilityToPublic(visibility: DatasetDraft['visibility']): boolean {
  return visibility === 'public'
}

export function buildDataset(draft: DatasetDraft): DatasetBuildResult {
  return { public: visibilityToPublic(draft.visibility), rocrate: buildRoCrate(draft) }
}

export function buildRoCrate(draft: DatasetDraft): Record<string, unknown> {
  const dataset: Record<string, unknown> = {
    '@id': './',
    '@type': 'Dataset',
    name: draft.basics.title,
    description: draft.basics.description,
    datePublished: draft.basics.datePublished,
    license: { '@id': draft.basics.license },
  }
  if (draft.basics.keywords?.length) dataset.keywords = [...draft.basics.keywords]
  if (draft.basics.identifier) dataset.identifier = draft.basics.identifier

  for (const [key, value] of Object.entries(draft.custom ?? {})) {
    if (key === '@id' || key === '@type' || key === 'conformsTo' || key in dataset) continue
    dataset[key] = value
  }

  const contextualEntities: Record<string, unknown>[] = []
  const byId = new Map<string, Record<string, unknown>>()
  const addEntity = (entity: Record<string, unknown>) => {
    const id = typeof entity['@id'] === 'string' ? entity['@id'] : ''
    if (!id) return
    const existing = byId.get(id)
    if (existing) {
      for (const [key, value] of Object.entries(entity)) {
        if (existing[key] === undefined) existing[key] = value
      }
      return
    }
    const copy = { ...entity }
    byId.set(id, copy)
    contextualEntities.push(copy)
  }
  const attachReference = (property: string, id: string) => {
    if (!id) return
    const current = values(dataset[property])
    if (!current.some((entry) => referenceId(entry) === id)) current.push({ '@id': id })
    dataset[property] = current
  }

  if (draft.profile?.iri) {
    dataset.conformsTo = [{ '@id': draft.profile.iri }]
    addEntity({
      '@id': draft.profile.iri,
      '@type': ['CreativeWork', DX_PROFILE],
      ...(draft.profile.name ? { name: draft.profile.name } : {}),
      ...(draft.profile.version ? { version: draft.profile.version } : {}),
    })
  }
  if (draft.basics.license) addEntity(licenseEntity(draft.basics.license))

  for (const entity of draft.entities) {
    addEntity({ '@id': entity.id, '@type': entity.type, ...entity.properties })
    for (const role of entity.roles) attachReference(role, entity.id)
  }

  for (const part of draft.parts) {
    if (part.kind === 'dataset') continue
    const id = part.kind === 'object' ? part.id : part.url
    attachReference('hasPart', id)
    addEntity(
      part.kind === 'object'
        ? fileEntityForReference(
            { id: part.id, contentUrl: part.contentUrl, identity: part.identity },
            part.name,
          )
        : { '@id': part.url, '@type': 'File', name: part.name || part.url },
    )
  }

  const crate: Record<string, unknown> = {
    '@context': buildProfileContext([], draft.profile?.contextTerms ?? {}),
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': RO_CRATE_PROFILE },
        about: { '@id': './' },
      },
      dataset,
      ...contextualEntities,
    ],
  }
  for (const part of draft.parts) {
    if (part.kind === 'dataset') addSubcrateLink(crate, part.link)
  }
  return crate
}
