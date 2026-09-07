import { describe, expect, it } from 'vitest'
import { addEntity, addValue, fromRoCrate, newDraft, type DraftEntity } from './editor'
import { entitiesOfType, placeEntity, registryEntities, relatedEntities, withEntities } from './registry'

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

describe('entity registry crate', () => {
  it('creates a registry that mentions every saved entity and reads them back', () => {
    const crate = withEntities(null, [ada, institute])
    const graph = crate['@graph'] as Array<Record<string, unknown>>
    const root = graph.find((node) => node['@id'] === './')

    expect(root).toMatchObject({
      '@type': 'Dataset',
      name: 'Entity registry',
      mentions: [{ '@id': ada.id }, { '@id': institute.id }],
    })
    expect(typeof root?.datePublished).toBe('string')
    expect(registryEntities(crate)).toEqual([ada, institute])
  })

  it('replaces a saved entity by id and keeps the others', () => {
    const renamed = { ...ada, properties: { ...ada.properties, name: [{ kind: 'text' as const, value: 'Ada King' }] } }
    const crate = withEntities(withEntities(null, [ada, institute]), [renamed])

    const entities = registryEntities(crate)
    expect(entities).toHaveLength(2)
    expect(entities.find((entity) => entity.id === ada.id)?.properties.name).toEqual([{ kind: 'text', value: 'Ada King' }])
    const root = (crate['@graph'] as Array<Record<string, unknown>>).find((node) => node['@id'] === './')
    expect(root?.mentions).toEqual([{ '@id': ada.id }, { '@id': institute.id }])
  })

  it('finds the contextual entities a copy needs and filters by type', () => {
    const draft = fromRoCrate(withEntities(null, [ada, institute]))

    expect(relatedEntities(draft, draft.entities.find((entity) => entity.id === ada.id)!)).toEqual([institute])
    expect(entitiesOfType(registryEntities(withEntities(null, [ada, institute])), 'http://schema.org/Person')).toEqual([ada])
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
