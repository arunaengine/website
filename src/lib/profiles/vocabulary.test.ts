import { beforeAll, describe, expect, it } from 'vitest'
import { datatypeKind, loadVocabIndex, type VocabIndex } from './vocabulary'
import { SCHEMA_ORG } from './uri'

let vocab: VocabIndex

beforeAll(async () => {
  vocab = await loadVocabIndex()
})

const uri = (name: string) => `${SCHEMA_ORG}${name}`

describe('vocabulary index', () => {
  it('walks a class up to Thing', () => {
    const ancestors = vocab.classAncestors(uri('ScholarlyArticle'))

    expect(ancestors[0]).toBe(uri('ScholarlyArticle'))
    expect(ancestors).toContain(uri('Article'))
    expect(ancestors).toContain(uri('CreativeWork'))
    expect(ancestors).toContain(uri('Thing'))
  })

  it('collects the subclasses of a class', () => {
    const descendants = vocab.classDescendants(uri('CreativeWork'))

    expect(descendants).toContain(uri('CreativeWork'))
    expect(descendants).toContain(uri('Dataset'))
    expect(descendants).toContain(uri('ScholarlyArticle'))
    expect(descendants).not.toContain(uri('Person'))
  })

  it('suggests inherited properties for a type', () => {
    const names = vocab.propertiesForTypes([uri('Dataset')]).map((term) => term.name)

    // license is declared on CreativeWork, name on Thing.
    expect(names).toContain('license')
    expect(names).toContain('name')
    expect(names).toContain('distribution')
    expect(names).not.toContain('familyName')
  })

  it('keeps the universal properties for a type without a domain', () => {
    const names = vocab.propertiesForTypes(['https://example.test/CustomThing']).map((term) => term.name)

    expect(names).toEqual(['description', 'identifier', 'name', 'url'])
  })

  it('expands a property range to its subclasses', () => {
    const author = vocab.property(uri('author'))
    const names = vocab.classesInRange(author?.targets).map((term) => term.name)

    expect(names).toContain('Person')
    expect(names).toContain('Organization')
    expect(names).toContain('EducationalOrganization')
    expect(names).not.toContain('Text')
  })

  it('ranks an exact property name above a description hit', () => {
    const hits = vocab.searchProperties('author').map((term) => term.name)

    expect(hits[0]).toBe('author')
  })

  it('floats the properties that suit the entity types', () => {
    const hits = vocab.searchProperties('date', [uri('Dataset')]).map((term) => term.name)

    expect(hits).toContain('datePublished')
    expect(hits.indexOf('datePublished')).toBeLessThan(hits.indexOf('dateVehicleFirstRegistered'))
  })

  it('finds a class by label', () => {
    expect(vocab.searchClasses('scholarly article').map((term) => term.name)).toContain('ScholarlyArticle')
  })

  it('reads the primitive ranges as values, not entities', () => {
    expect(datatypeKind(uri('Text'))).toBe('text')
    expect(datatypeKind(uri('DateTime'))).toBe('datetime')
    expect(datatypeKind(uri('Person'))).toBeUndefined()
  })
})
