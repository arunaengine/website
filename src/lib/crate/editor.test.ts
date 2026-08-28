import { beforeAll, describe, expect, it } from 'vitest'
import {
  addEntity,
  addFilePart,
  addSubcratePart,
  addValue,
  autoId,
  changeKind,
  displayName,
  findEntity,
  fromRoCrate,
  liveIssues,
  newDraft,
  orderedEntities,
  removeEntity,
  removeValue,
  renameEntity,
  toRoCrate,
  valueKindsFor,
  type CrateDraft,
} from './editor'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})

function seeded(): CrateDraft {
  const draft = newDraft()
  const named = addValue(
    { ...draft, entities: [{ ...draft.entities[0], properties: { ...draft.entities[0].properties, name: [] } }] },
    './',
    'name',
    { kind: 'text', value: 'Example dataset' },
  )
  const person = addEntity(named, { type: 'Person', name: 'Ada Lovelace' })
  return addValue(person.draft, './', 'author', { kind: 'reference', value: person.entity.id })
}

describe('crate draft', () => {
  it('round trips a crate through the model', () => {
    const crate = toRoCrate(seeded())
    const draft = fromRoCrate(crate)

    expect(toRoCrate(draft)).toEqual(crate)
    expect(displayName(draft.entities[1])).toBe('Ada Lovelace')
  })

  it('keeps unknown properties and types verbatim', () => {
    const crate = {
      '@context': 'https://w3id.org/ro/crate/1.1/context',
      '@graph': [
        { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', conformsTo: { '@id': 'x' }, about: { '@id': './' } },
        { '@id': './', '@type': ['Dataset', 'UnknownThing'], name: 'Kept', weird: { nested: { deep: [1, 2] } } },
        { '@id': '#odd', '@type': 'UnknownResearchThing', retained: true, count: 3 },
      ],
    }
    const draft = fromRoCrate(crate)
    const graph = toRoCrate(draft)['@graph'] as Array<Record<string, unknown>>

    expect(draft.entities[0].types).toEqual(['Dataset', 'UnknownThing'])
    expect(graph.find((node) => node['@id'] === './')).toMatchObject({ weird: { nested: { deep: [1, 2] } } })
    expect(graph.find((node) => node['@id'] === '#odd')).toMatchObject({ retained: true, count: 3 })
  })

  it('numbers the slug of a repeated name', () => {
    const first = autoId('Ada Lovelace', [])
    const second = autoId('Ada Lovelace', [first])

    expect(first).toBe('#ada-lovelace')
    expect(second).toBe('#ada-lovelace-2')
  })

  it('rewrites the references of a renamed entity', () => {
    const draft = renameEntity(seeded(), '#ada-lovelace', 'https://orcid.org/0000-0002-1825-0097')

    expect(findEntity(draft, 'https://orcid.org/0000-0002-1825-0097')).toBeDefined()
    expect(draft.entities[0].properties.author[0].value).toBe('https://orcid.org/0000-0002-1825-0097')
  })

  it('reports what pointed at a removed entity', () => {
    const { draft, removed } = removeEntity(seeded(), '#ada-lovelace')

    expect(removed).toEqual([{ entityId: './', property: 'author' }])
    expect(draft.entities).toHaveLength(1)
    expect(draft.entities[0].properties.author).toBeUndefined()
  })

  it('drops the property when its last value goes', () => {
    const draft = removeValue(seeded(), './', 'author', 0)

    expect(draft.entities[0].properties.author).toBeUndefined()
  })

  it('changes a value kind without losing what was typed', () => {
    const draft = changeKind(seeded(), './', 'name', 0, 'longtext')

    expect(draft.entities[0].properties.name[0]).toEqual({ kind: 'longtext', value: 'Example dataset' })
  })

  it('lists the root first, then the parts, then the rest', () => {
    const draft = addFilePart(seeded(), { id: 's3://bucket/one.csv', name: 'one.csv', encodingFormat: 'text/csv' })
    const order = orderedEntities(draft).map((entity) => entity.id)

    expect(order).toEqual(['./', 's3://bucket/one.csv', '#ada-lovelace'])
    expect(draft.entities[0].properties.hasPart[0].value).toBe('s3://bucket/one.csv')
  })

  it('links another dataset as a subcrate part', () => {
    const draft = addSubcratePart(seeded(), {
      iri: 'https://example.test/crates/child',
      name: 'Child dataset',
      identifier: 'doc-2',
      subjectOf: 'https://api.example.test/metadata/doc-2/rocrate',
    })
    const child = findEntity(draft, 'https://example.test/crates/child')

    expect(child?.types).toEqual(['Dataset'])
    expect(child?.properties.conformsTo[0].value).toBe('https://w3id.org/ro/crate')
    expect(findEntity(draft, 'https://api.example.test/metadata/doc-2/rocrate')?.types).toEqual(['CreativeWork'])
  })

  it('offers the value kinds a property range allows', () => {
    expect(valueKindsFor(vocab, 'author')).toEqual(['reference'])
    expect(valueKindsFor(vocab, 'datePublished')).toEqual(['date', 'datetime'])
    expect(valueKindsFor(vocab, 'license')).toEqual(['reference', 'url'])
    expect(valueKindsFor(vocab, 'somethingInvented')).toEqual(['text'])
  })
})

describe('live issues', () => {
  it('asks the root for the four things a dataset needs', () => {
    const issues = liveIssues(newDraft())

    expect(issues.filter((issue) => issue.severity === 'error').map((issue) => issue.property)).toEqual(['name'])
    expect(issues.map((issue) => issue.property)).toEqual(['name', 'description', 'license'])
  })

  it('warns about an entity without a name', () => {
    const draft = addEntity(seeded(), { type: 'Person', id: '#nobody' }).draft

    expect(liveIssues(draft).some((issue) => issue.entityId === '#nobody' && issue.severity === 'warning')).toBe(true)
  })

  it('reports a reference that resolves to nothing', () => {
    const draft = addValue(seeded(), './', 'publisher', { kind: 'reference', value: '#ghost' })
    const issue = liveIssues(draft).find((entry) => entry.property === 'publisher')

    expect(issue?.severity).toBe('error')
    expect(issue?.message).toContain('#ghost')
  })

  it('accepts an external reference URL', () => {
    const draft = addValue(seeded(), './', 'publisher', { kind: 'reference', value: 'https://ror.org/02nv7yv05' })

    expect(liveIssues(draft).some((issue) => issue.property === 'publisher')).toBe(false)
  })

  it('warns when a reference leaves the property range', () => {
    const place = addEntity(seeded(), { type: 'Place', name: 'Giessen' })
    const draft = addValue(place.draft, './', 'author', { kind: 'reference', value: place.entity.id })
    const issue = liveIssues(draft, vocab).find((entry) => entry.key.startsWith('range:'))

    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('Person')
  })

  it('warns about a value left empty', () => {
    const draft = addValue(seeded(), './', 'keywords', { kind: 'text', value: '' })

    expect(liveIssues(draft).some((issue) => issue.key.startsWith('empty:'))).toBe(true)
  })
})
