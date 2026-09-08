import {
  fromRoCrate,
  autoId,
  displayName,
  findSimilarEntity,
  rootId,
  typeLabel,
  type CrateDraft,
  type DraftEntity,
} from './editor'
import { isAbsoluteUri } from '@/lib/profiles/uri'

// Internal registry datasets are not reusable source datasets.
const REGISTRY_TYPE = 'https://w3id.org/aruna/terms/EntityRegistry'

export interface EntityReference {
  documentId: string
  entityId: string
}

export function referenceKey(reference: EntityReference): string {
  return JSON.stringify([reference.documentId, reference.entityId])
}

export function isRegistry(crate: unknown): boolean {
  return fromRoCrate(crate).entities[0]?.types.includes(REGISTRY_TYPE) === true
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
