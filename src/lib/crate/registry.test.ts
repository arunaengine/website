import { describe, expect, it } from 'vitest'
import { addEntity, addValue, newDraft, type DraftEntity } from './editor'
import { copyEntity, entitiesOfType, isRegistry, placeEntity, referenceKey, relatedEntities } from './registry'

const reference = { documentId: '01J00000000000000000000001', entityId: '#author' }

const institute: DraftEntity = {
  id: 'https://ror.org/03yrm5c26',
  types: ['Organization'],
  properties: { name: [{ kind: 'text', value: 'Example Institute' }] },
}
const ada: DraftEntity = {
  id: 'https://orcid.org/0000-0002-1825-0097',
  types: ['Person'],
  properties: {
    name: [{ kind: 'text', value: 'Ada Lovelace' }],
    affiliation: [{ kind: 'reference', value: institute.id }],
  },
}

describe('entity reuse', () => {
  it('distinguishes identical fragment ids from different source graphs', () => {
    const other = { ...reference, documentId: '01J00000000000000000000002' }
    expect(referenceKey(reference)).not.toBe(referenceKey(other))
  })

  it('recognizes only the marker on an obsolete registry dataset', () => {
    expect(isRegistry({ '@graph': [{ '@id': './', '@type': ['Dataset', 'https://w3id.org/aruna/terms/EntityRegistry'] }] })).toBe(true)
    expect(isRegistry({ '@graph': [{ '@id': './', '@type': 'Dataset', name: 'Entity registry' }] })).toBe(false)
  })

  it('finds the contextual entities a copy needs and filters by type', () => {
    const draft = { ...newDraft(), entities: [newDraft().entities[0], ada, institute] }

    expect(relatedEntities(draft, draft.entities.find((entity) => entity.id === ada.id)!)).toEqual([institute])
    expect(entitiesOfType(draft.entities, 'http://schema.org/Person')).toEqual([ada])
  })

  it('remaps copied local ids and references without overwriting existing entities', () => {
    const local = { ...ada, id: '#author', properties: { ...ada.properties, affiliation: [{ kind: 'reference' as const, value: '#institute' }] },
      extra: { custom: { '@id': '#institute' } } }
    const organization = { ...institute, id: '#institute' }
    const existing = { ...newDraft(), entities: [...newDraft().entities, { ...local, properties: { name: [{ kind: 'text' as const, value: 'Someone else' }] } }] }
    const copied = copyEntity(existing, local, [organization])
    expect(copied.entity.id).not.toBe('#author')
    expect(existing.entities[1].properties.name[0].value).toBe('Someone else')
    const organizationId = copied.entity.properties.affiliation[0].value
    expect(copied.draft.entities.find((entity) => entity.id === organizationId)?.properties.name).toEqual(institute.properties.name)
    expect(copied.entity.extra?.custom).toEqual({ '@id': organizationId })
    expect(copyEntity(newDraft(), ada, [institute]).entity.id).toBe(ada.id)
  })

  it('retargets related context to an existing matching entity', () => {
    const existing = { ...institute, id: '#institute' }
    const draft = { ...newDraft(), entities: [...newDraft().entities, existing] }
    const copied = copyEntity(draft, ada, [institute])
    expect(copied.entity.properties.affiliation).toEqual([{ kind: 'reference', value: '#institute' }])
    expect(copied.draft.entities.filter((entity) => entity.types.includes('Organization'))).toEqual([existing])
  })

  it('places an entity as it is and leaves an existing id alone', () => {
    const placed = placeEntity(newDraft(), ada)
    expect(placed.entities.map((entity) => entity.id)).toEqual(['./', ada.id])

    const existing = addEntity(addValue(newDraft(), './', 'author', { kind: 'reference', value: '' }), {
      type: 'Person',
      id: ada.id,
      name: 'Someone else',
    }).draft
    expect(placeEntity(existing, ada)).toBe(existing)
  })
})
