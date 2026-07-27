import { describe, expect, it } from 'vitest'
import { contextualEntitiesOf, type ContextualEntity, type ContextualGroup } from './contextualEntities'

const ARUNA_USER = `01ARZ3NDEKTSV4RRFFQ69G5FAV@${'A'.repeat(43)}`

function crate(rootExtra: Record<string, unknown>, entities: Array<Record<string, unknown>>) {
  return {
    '@context': 'https://w3id.org/ro/crate/1.1/context',
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
      { '@id': './', '@type': 'Dataset', name: 'Root', ...rootExtra },
      ...entities,
    ],
  }
}

function entityById(groups: ContextualGroup[], id: string): ContextualEntity | undefined {
  return groups.flatMap((group) => group.entities).find((entity) => entity.id === id)
}

function groupOf(groups: ContextualGroup[], id: string): string | undefined {
  return groups.find((group) => group.entities.some((entity) => entity.id === id))?.key
}

describe('contextualEntitiesOf', () => {
  it('composes person names', () => {
    // elabftw Persons carry no `name`, only givenName/familyName.
    const groups = contextualEntitiesOf(
      crate({ author: { '@id': 'person://abc?hash_algo=sha256' } }, [
        { '@id': 'person://abc?hash_algo=sha256', '@type': 'Person', givenName: 'Toni', familyName: 'Tester' },
      ]),
    )
    const person = entityById(groups, 'person://abc?hash_algo=sha256')
    expect(person?.name).toBe('Toni Tester')
    expect(groupOf(groups, 'person://abc?hash_algo=sha256')).toBe('people')
  })

  it('indexes root roles', () => {
    const groups = contextualEntitiesOf(
      crate(
        {
          author: { '@id': '#p1' },
          publisher: { '@id': '#org' },
          citation: { '@id': 'https://doi.org/10.5555/12345678' },
          license: { '@id': 'https://spdx.org/licenses/MIT' },
        },
        [
          { '@id': '#p1', '@type': 'Person', name: 'Ann Author' },
          { '@id': '#org', '@type': 'Organization', name: 'Example Lab' },
          { '@id': 'https://doi.org/10.5555/12345678', '@type': 'ScholarlyArticle', name: 'A cited paper' },
          { '@id': 'https://spdx.org/licenses/MIT', '@type': 'CreativeWork', name: 'MIT License' },
        ],
      ),
    )
    expect(entityById(groups, '#p1')?.roles).toEqual(['Author'])
    expect(entityById(groups, '#org')?.roles).toEqual(['Publisher'])
    expect(entityById(groups, 'https://doi.org/10.5555/12345678')?.roles).toEqual(['Cited work'])
    expect(entityById(groups, 'https://spdx.org/licenses/MIT')?.roles).toEqual(['License'])
    expect(groups.map((group) => group.key)).toEqual(['people', 'organizations', 'publications', 'licenses'])
  })

  it('detects identifiers', () => {
    const groups = contextualEntitiesOf(
      crate({ author: { '@id': 'https://orcid.org/0000-0002-1825-0097' } }, [
        {
          '@id': 'https://orcid.org/0000-0002-1825-0097',
          '@type': 'Person',
          name: 'Josiah Carberry',
          identifier: [ARUNA_USER, { '@id': '#idprop' }],
          affiliation: { '@id': 'https://ror.org/05f950310' },
          email: 'mailto:josiah@example.org',
        },
        { '@id': '#idprop', '@type': 'PropertyValue', propertyID: 'internal', value: 'staff-42' },
        {
          '@id': 'https://ror.org/05f950310',
          '@type': 'Organization',
          name: 'Example University',
          identifier: 'https://ror.org/05f950310',
        },
      ]),
    )
    const person = entityById(groups, 'https://orcid.org/0000-0002-1825-0097')
    expect(person?.orcid).toBe('0000-0002-1825-0097')
    expect(person?.userId).toBe(ARUNA_USER)
    expect(person?.email).toBe('josiah@example.org')
    expect(person?.affiliations).toEqual([{ id: 'https://ror.org/05f950310', name: 'Example University' }])
    expect(entityById(groups, 'https://ror.org/05f950310')?.ror).toBe('05f950310')
  })

  it('hides property values', () => {
    // 33+ PropertyValue custom fields per ELN export must never render.
    const groups = contextualEntitiesOf(
      crate({}, [
        { '@id': '#field-1', '@type': 'PropertyValue', propertyID: 'ph', value: '7.4' },
        { '@id': '#field-2', '@type': 'PropertyValue', propertyID: 'temp', value: '21' },
      ]),
    )
    expect(groups).toEqual([])
  })

  it('skips data entities', () => {
    const groups = contextualEntitiesOf(
      crate({}, [
        { '@id': 'data.csv', '@type': 'File', name: 'data.csv' },
        { '@id': 'img.png', '@type': ['File', 'MediaObject'], name: 'img.png' },
        { '@id': 'sub/', '@type': 'Dataset', name: 'a dataset' },
        { '@id': '#term', '@type': 'DefinedTerm', name: 'a term' },
      ]),
    )
    expect(groups.map((group) => group.key)).toEqual(['terms'])
  })

  it('dedups by id', () => {
    // Same entity referenced as author and maintainer: one card, both badges.
    const groups = contextualEntitiesOf(
      crate({ author: { '@id': '#p1' }, maintainer: { '@id': '#p1' } }, [
        { '@id': '#p1', '@type': 'Person', name: 'Ann Author' },
        { '@id': '#p1', '@type': 'Person', name: 'Duplicate node' },
      ]),
    )
    const people = groups.find((group) => group.key === 'people')?.entities ?? []
    expect(people).toHaveLength(1)
    expect(people[0]?.name).toBe('Ann Author')
    expect(people[0]?.roles).toEqual(['Author', 'Maintainer'])
  })

  it('keeps role stubs', () => {
    // Untyped/absent references still earn a card in the role's group.
    const groups = contextualEntitiesOf(
      crate(
        {
          author: { '@id': '#ghost-author' },
          citation: { '@id': 'https://example.org/papers/deep-thought' },
        },
        [{ '@id': '#ghost-author' }],
      ),
    )
    const author = entityById(groups, '#ghost-author')
    expect(groupOf(groups, '#ghost-author')).toBe('people')
    expect(author?.unresolved).toBe(true)
    const cited = entityById(groups, 'https://example.org/papers/deep-thought')
    expect(groupOf(groups, 'https://example.org/papers/deep-thought')).toBe('publications')
    expect(cited?.unresolved).toBe(true)
    expect(cited?.name).toBe('deep-thought')
  })

  it('excludes subcrate ids', () => {
    const groups = contextualEntitiesOf(
      crate({ hasPart: { '@id': 'https://w3id.org/aruna/01ARZ3NDEKTSV4RRFFQ69G5FAV' } }, [
        {
          '@id': 'https://w3id.org/aruna/01ARZ3NDEKTSV4RRFFQ69G5FAV',
          '@type': 'CreativeWork',
          conformsTo: { '@id': 'https://w3id.org/ro/crate' },
          name: 'Child crate',
        },
        { '@id': '#p1', '@type': 'Person', name: 'Kept Person' },
      ]),
      { excludeIds: new Set(['https://w3id.org/aruna/01ARZ3NDEKTSV4RRFFQ69G5FAV']) },
    )
    expect(entityById(groups, 'https://w3id.org/aruna/01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBeUndefined()
    expect(entityById(groups, '#p1')).toBeDefined()
  })

  it('maps comment entities', () => {
    const groups = contextualEntitiesOf(
      crate({}, [
        {
          '@id': 'comment://abc',
          '@type': 'Comment',
          text: 'Looks good to me.',
          dateCreated: '2026-07-01T12:00:00Z',
          author: { '@id': '#p1' },
        },
        { '@id': '#p1', '@type': 'Person', givenName: 'Toni', familyName: 'Tester' },
      ]),
    )
    const comment = entityById(groups, 'comment://abc')
    expect(groupOf(groups, 'comment://abc')).toBe('comments')
    expect(comment?.text).toBe('Looks good to me.')
    expect(comment?.authorName).toBe('Toni Tester')
    expect(comment?.created).toBe('2026-07-01T12:00:00Z')
  })

  it('orders groups', () => {
    const groups = contextualEntitiesOf(
      crate({}, [
        { '@id': '#misc', '@type': 'Thing', name: 'Something else' },
        { '@id': '#app', '@type': 'SoftwareApplication', name: 'A tool' },
        { '@id': '#org', '@type': 'Organization', name: 'A lab' },
        { '@id': '#p1', '@type': 'Person', name: 'A person' },
      ]),
    )
    expect(groups.map((group) => group.key)).toEqual(['people', 'organizations', 'software', 'other'])
  })
})
