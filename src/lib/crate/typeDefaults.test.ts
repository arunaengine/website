import { beforeAll, describe, expect, it } from 'vitest'
import { defaultProperties, defaultRows } from './typeDefaults'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'

let vocab: VocabIndex
beforeAll(async () => {
  vocab = await loadVocabIndex()
})

function entries(type: string): string[] {
  return defaultProperties(vocab, type).map((entry) => `${entry.key}:${entry.kind}`)
}

describe('defaultProperties', () => {
  it('offers the common properties of every listed type', () => {
    expect(entries('Person')).toEqual(['givenName:text', 'familyName:text', 'affiliation:reference'])
    expect(entries('Organization')).toEqual(['url:url'])
    expect(entries('ContactPoint')).toEqual(['email:text', 'contactType:text'])
    expect(entries('CreativeWork')).toEqual(['url:url', 'datePublished:date', 'author:reference'])
    expect(entries('WebPage')).toEqual(['url:url'])
    expect(entries('ScholarlyArticle')).toEqual(['url:url', 'datePublished:date', 'author:reference'])
    expect(entries('SoftwareSourceCode'))
      .toEqual(['codeRepository:url', 'programmingLanguage:text', 'version:text'])
    expect(entries('SoftwareApplication')).toEqual(['url:url', 'softwareVersion:text'])
    expect(entries('MediaObject')).toEqual(['encodingFormat:text', 'contentUrl:url'])
    expect(entries('Place')).toEqual(['address:text', 'url:url'])
    expect(entries('Event')).toEqual(['startDate:date', 'endDate:date', 'location:reference'])
  })

  it('takes the kind the vocabulary allows over the listed one', () => {
    // schema.org description ranges over Text, so the long-text row is narrowed.
    expect(entries('Dataset')).toEqual(['url:url', 'description:text'])
  })

  it('drops a property the vocabulary does not know', () => {
    expect(entries('DefinedTerm')).toEqual(['url:url'])
    expect(entries('Taxon')).toEqual(['url:url'])
  })

  it('inherits the defaults of the nearest listed superclass', () => {
    expect(entries('AboutPage')).toEqual(['url:url'])
    expect(entries('http://schema.org/AboutPage')).toEqual(['url:url'])
  })

  it('reads a File as the MediaObject it stands for', () => {
    expect(entries('File')).toEqual(['encodingFormat:text', 'contentUrl:url'])
  })

  it('offers nothing for a type it does not cover', () => {
    expect(entries('Thing')).toEqual([])
    expect(entries('Nonesuch')).toEqual([])
  })

  it('looks the exact type up without a vocabulary', () => {
    expect(defaultProperties(null, 'Person')).toEqual([
      { key: 'givenName', kind: 'text' },
      { key: 'familyName', kind: 'text' },
      { key: 'affiliation', kind: 'reference' },
    ])
    expect(defaultProperties(null, 'AboutPage')).toEqual([])
  })
})

describe('defaultRows', () => {
  it('turns the defaults into empty rows', () => {
    expect(defaultRows(vocab, 'Person')).toEqual({
      givenName: [{ kind: 'text', value: '' }],
      familyName: [{ kind: 'text', value: '' }],
      affiliation: [{ kind: 'reference', value: '' }],
    })
    expect(defaultRows(vocab, 'Nonesuch')).toEqual({})
  })
})
