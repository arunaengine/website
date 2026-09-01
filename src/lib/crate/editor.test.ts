import { beforeAll, describe, expect, it } from 'vitest'
import {
  addEntity,
  allowedKinds,
  addValue,
  autoId,
  changeKind,
  displayName,
  findEntity,
  fromRoCrate,
  linkProperties,
  liveIssues,
  newDraft,
  promoteValue,
  referencesTo,
  orderedEntities,
  removeEntity,
  removeValue,
  renameEntity,
  setTypes,
  toRoCrate,
  updateValue,
  valueKindsFor,
  type CrateDraft,
} from './editor'
import { addFilePart, addSubcratePart } from './references'
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
  it('leaves empty rows out of the crate', () => {
    // A blank row is a prompt, not a value; an empty literal would satisfy a profile by accident.
    const graph = toRoCrate(newDraft())['@graph'] as Array<Record<string, unknown>>
    const root = graph.find((node) => node['@id'] === './')

    expect(root).not.toHaveProperty('name')
    expect(root).not.toHaveProperty('license')
    expect(root).toHaveProperty('datePublished')
  })

  it('promotes a text value into a named entity', () => {
    const draft = addValue(newDraft(), './', 'publisher', { kind: 'text', value: 'ACME Research' })
    const promoted = promoteValue(draft, './', 'publisher', 0, 'Organization')

    expect(promoted?.entity).toMatchObject({
      id: '#acme-research',
      types: ['Organization'],
      properties: { name: [{ kind: 'text', value: 'ACME Research' }] },
    })
    expect(findEntity(promoted!.draft, './')?.properties.publisher).toEqual([
      { kind: 'reference', value: '#acme-research' },
    ])
  })

  it('promotes a license preset under its URL with the preset name', () => {
    // newDraft seeds an empty license row; the preset replaces it in place.
    const draft = updateValue(newDraft(), './', 'license', 0, 'https://creativecommons.org/licenses/by/4.0/')
    const promoted = promoteValue(draft, './', 'license', 0, 'CreativeWork')

    expect(promoted?.entity).toMatchObject({
      id: 'https://creativecommons.org/licenses/by/4.0/',
      types: ['CreativeWork'],
      properties: { name: [{ kind: 'text', value: 'CC BY 4.0' }] },
    })
  })

  it('promotes an email address into a mailto contact', () => {
    const draft = addValue(newDraft(), './', 'contactPoint', { kind: 'text', value: 'team@example.org' })
    const promoted = promoteValue(draft, './', 'contactPoint', 0, 'ContactPoint')

    expect(promoted?.entity).toMatchObject({
      id: 'mailto:team@example.org',
      properties: { email: [{ kind: 'text', value: 'team@example.org' }] },
    })
  })

  it('refuses to promote a reference or an empty value', () => {
    const draft = addValue(newDraft(), './', 'publisher', { kind: 'reference', value: '#org' })
    expect(promoteValue(draft, './', 'publisher', 0, 'Organization')).toBeUndefined()
    expect(promoteValue(newDraft(), './', 'license', 0, 'CreativeWork')).toBeUndefined()
  })

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

  it('keeps one entry when an imported crate names a part twice', () => {
    const crate = {
      '@context': 'https://w3id.org/ro/crate/1.1/context',
      '@graph': [
        { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', conformsTo: { '@id': 'x' }, about: { '@id': './' } },
        { '@id': './', '@type': 'Dataset', hasPart: [{ '@id': 's3://bucket/one.csv' }, { '@id': 's3://bucket/one.csv' }] },
        { '@id': 's3://bucket/one.csv', '@type': 'File', name: 'one.csv' },
      ],
    }
    const draft = fromRoCrate(crate)

    expect(draft.entities[0].properties.hasPart).toEqual([
      { kind: 'reference', value: 's3://bucket/one.csv' },
    ])
  })

  it('keeps an absolute class IRI while editing types', () => {
    const iri = 'http://purl.org/dc/terms/Agent'
    const created = addEntity(newDraft(), { type: iri, id: '#agent' }).draft
    const added = setTypes(created, '#agent', [iri, 'Person'])
    const removed = setTypes(added, '#agent', [iri])

    expect(findEntity(added, '#agent')?.types).toEqual([iri, 'Person'])
    expect(findEntity(removed, '#agent')?.types).toEqual([iri])
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

  it('keeps text and a link on offer when the range is unknown', () => {
    expect(allowedKinds(vocab, 'somethingInvented')).toEqual(['text', 'reference'])
    expect(allowedKinds(vocab, 'author')).toEqual(['reference'])
  })

  it('names the root properties a type can be linked through', () => {
    const names = linkProperties(vocab, ['Dataset'], ['Person']).map((term) => term.name)

    expect(names).toContain('author')
    expect(names).not.toContain('keywords')
  })
})

describe('references', () => {
  it('lists every place an entity is referenced from', () => {
    const draft = addValue(seeded(), './', 'publisher', { kind: 'reference', value: '#ada-lovelace' })

    expect(referencesTo(draft, '#ada-lovelace')).toEqual([
      { entityId: './', property: 'author', index: 0 },
      { entityId: './', property: 'publisher', index: 0 },
    ])
  })
})

describe('live issues', () => {
  it('asks the root for the four things a dataset needs', () => {
    const issues = liveIssues(newDraft())

    // The node rejects a crate without name or description; a license only reads badly.
    expect(issues.filter((issue) => issue.severity === 'error').map((issue) => issue.property)).toEqual(['name', 'description'])
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

  it('passes on what a selected profile asks for', () => {
    const profile = { name: 'Genomics', properties: ['identifier'], types: ['Person', 'Place'], contents: [] }
    const keys = liveIssues(seeded(), null, profile).map((issue) => issue.key)

    expect(keys).toContain('profile:identifier')
    expect(keys).toContain('profileType:Place')
    expect(keys).not.toContain('profileType:Person')
  })

  it('names the entry a profile wants the parts list to hold', () => {
    // A required instance is checked against the row, not against a hidden list.
    const profile = {
      name: 'Genomics',
      properties: [],
      types: [],
      contents: [{
        id: 'parts',
        label: 'Has part',
        description: '',
        kind: 'entity' as const,
        propertyUri: 'http://schema.org/hasPart',
        valueName: 'hasPart',
        obligation: 'MUST' as const,
        requiredInstances: [{ name: 'index.html', hint: 'The landing page.' }],
      }],
    }
    const issue = liveIssues(seeded(), null, profile).find((entry) => entry.key.startsWith('contents:'))

    expect(issue).toMatchObject({ severity: 'error', property: 'hasPart' })
    expect(issue?.message).toContain('index.html')
    expect(issue?.message).toContain('The landing page.')
  })

  it('reports a file the dataset cannot reach, as the node would', () => {
    const draft = addEntity(seeded(), { type: 'File', id: 's3://bucket/stray.csv', name: 'stray.csv' }).draft
    const issue = liveIssues(draft).find((entry) => entry.key.startsWith('orphan:'))

    expect(issue).toMatchObject({ severity: 'error', entityId: 's3://bucket/stray.csv' })
    expect(issue?.message).toContain('stray.csv')
  })

  it('warns about a value left empty', () => {
    const draft = addValue(seeded(), './', 'keywords', { kind: 'text', value: '' })

    expect(liveIssues(draft).some((issue) => issue.key.startsWith('empty:'))).toBe(true)
  })
})
