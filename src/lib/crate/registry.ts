import {
  fromRoCrate,
  autoId,
  displayName,
  findSimilarEntity,
  newDraft,
  rootId,
  toRoCrate,
  typeLabel,
  type CrateDraft,
  type DraftEntity,
} from './editor'
import { documentIdFromIri, graphIriFor } from '@/lib/graphIri'
import { isAbsoluteUri } from '@/lib/profiles/uri'

// Registry graphs contain references; source descriptions are loaded on reuse.
export const REGISTRY_PATH = 'entity-registry'
export const REGISTRY_NAME = 'Entity registry'
const REGISTRY_TYPE = 'https://w3id.org/aruna/terms/EntityRegistry'
const ENTRY_TYPE = 'https://w3id.org/aruna/terms/EntityRegistryEntry'
const SOURCE_GRAPH = 'https://w3id.org/aruna/terms/sourceGraph'
const SOURCE_ENTITY = 'https://w3id.org/aruna/terms/sourceEntity'

export interface EntityReference {
  documentId: string
  entityId: string
}

export function referenceKey(reference: EntityReference): string {
  return JSON.stringify([reference.documentId, reference.entityId])
}

export function referenceNode(reference: EntityReference): Record<string, unknown> {
  return {
    '@id': `urn:aruna:entity-reference:${encodeURIComponent(referenceKey(reference))}`,
    '@type': ['CreativeWork', ENTRY_TYPE],
    [SOURCE_GRAPH]: graphIriFor(reference.documentId),
    [SOURCE_ENTITY]: reference.entityId,
  }
}

export function isRegistry(crate: unknown): boolean {
  return fromRoCrate(crate).entities[0]?.types.includes(REGISTRY_TYPE) === true
}

export function registryReferences(crate: unknown): EntityReference[] {
  const draft = fromRoCrate(crate)
  return draft.entities.flatMap((entity) => {
    if (!entity.types.includes(ENTRY_TYPE)) return []
    const documentId = documentIdFromIri(entity.properties[SOURCE_GRAPH]?.[0]?.value ?? '')
    const entityId = entity.properties[SOURCE_ENTITY]?.[0]?.value
    return documentId && entityId ? [{ documentId, entityId }] : []
  })
}

/** Entities of `type` among `entities`, matched by type label. */
export function entitiesOfType(entities: DraftEntity[], type: string): DraftEntity[] {
  const label = typeLabel(type)
  return entities.filter((entity) => entity.types.some((candidate) => typeLabel(candidate) === label))
}

/** Contextual entities `entity` references directly, so a copy stays complete. */
export function relatedEntities(draft: CrateDraft, entity: DraftEntity): DraftEntity[] {
  const root = rootId(draft)
  const ids = new Set(Object.values(entity.properties).flat()
    .filter((value) => value.kind === 'reference' && value.value && value.value !== root && value.value !== entity.id)
    .map((value) => value.value))
  return draft.entities.filter((candidate) => ids.has(candidate.id))
}

/** `draft` with `entity` added as it is; an id already present is left alone. */
export function placeEntity(draft: CrateDraft, entity: DraftEntity): CrateDraft {
  if (draft.entities.some((existing) => existing.id === entity.id)) return draft
  return { ...draft, entities: [...draft.entities, entity] }
}

export function copyEntity(draft: CrateDraft, entity: DraftEntity, related: DraftEntity[]) {
  const entities = [entity, ...related]
  const used = new Set(draft.entities.map((item) => item.id))
  const ids = new Map<string, string>()
  for (const item of entities) {
    const known = item === entity ? undefined : findSimilarEntity(draft, item.types[0] ?? 'Thing', displayName(item))
    const id = known?.id ?? (isAbsoluteUri(item.id) ? item.id : autoId(displayName(item), used))
    ids.set(item.id, id)
    used.add(id)
  }
  function rewrite(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rewrite)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, key === '@id' && typeof item === 'string' ? ids.get(item) ?? item : rewrite(item),
    ]))
  }
  let next = draft
  for (const item of entities) {
    next = placeEntity(next, {
      ...item,
      id: ids.get(item.id)!,
      properties: Object.fromEntries(Object.entries(item.properties).map(([key, values]) => [
        key, values.map((value) => value.kind === 'reference'
          ? { ...value, value: ids.get(value.value) ?? value.value } : { ...value }),
      ])),
      ...(item.extra ? { extra: rewrite(item.extra) as Record<string, unknown> } : {}),
    })
  }
  return { draft: next, entity: next.entities.find((item) => item.id === ids.get(entity.id))! }
}

function registryDraft(): CrateDraft {
  const draft = newDraft()
  const root = draft.entities[0]
  return {
    ...draft,
    entities: [{
      ...root,
      types: ['Dataset', REGISTRY_TYPE],
      properties: {
        ...root.properties,
        name: [{ kind: 'text', value: REGISTRY_NAME }],
        description: [{ kind: 'longtext', value: 'References to entities saved for reuse in this group.' }],
        license: [],
      },
    }],
  }
}

export function registryCrate(reference: EntityReference): Record<string, unknown> {
  const crate = toRoCrate(registryDraft())
  const graph = crate['@graph'] as unknown[]
  graph.push(referenceNode(reference))
  return crate
}
