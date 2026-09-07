import {
  fromRoCrate,
  newDraft,
  rootId,
  toRoCrate,
  typeLabel,
  type CrateDraft,
  type DraftEntity,
} from './editor'

// One ordinary RO-Crate per group at a fixed path holds the entities people
// save for reuse; its root mentions every saved entity.
export const REGISTRY_PATH = 'entity-registry'
export const REGISTRY_NAME = 'Entity registry'
const REGISTRY_DESCRIPTION = "Entities saved for reuse in this group's datasets."

/** The saved entities of a registry crate, without its root. */
export function registryEntities(crate: unknown): DraftEntity[] {
  const draft = fromRoCrate(crate)
  const root = rootId(draft)
  return draft.entities.filter((entity) => entity.id !== root)
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

function registryDraft(): CrateDraft {
  const draft = newDraft()
  const root = draft.entities[0]
  return {
    ...draft,
    entities: [{
      ...root,
      properties: {
        ...root.properties,
        name: [{ kind: 'text', value: REGISTRY_NAME }],
        description: [{ kind: 'longtext', value: REGISTRY_DESCRIPTION }],
        license: [],
      },
    }],
  }
}

/** The registry crate with `entities` added or replaced by id, each mentioned from the root. */
export function withEntities(crate: unknown | null, entities: DraftEntity[]): Record<string, unknown> {
  const draft = crate ? fromRoCrate(crate) : registryDraft()
  const root = rootId(draft)
  const rootEntity = draft.entities.find((entity) => entity.id === root) ?? draft.entities[0]
  const byId = new Map(draft.entities.filter((entity) => entity.id !== root).map((entity) => [entity.id, entity]))
  for (const entity of entities) if (entity.id !== root) byId.set(entity.id, entity)
  const mentions = [...byId.keys()].map((id) => ({ kind: 'reference' as const, value: id }))
  const nextRoot = { ...rootEntity, properties: { ...rootEntity.properties, mentions } }
  return toRoCrate({ ...draft, entities: [nextRoot, ...byId.values()] })
}
