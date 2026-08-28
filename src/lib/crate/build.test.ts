import { describe, expect, it } from 'vitest'
import {
  buildDataset,
  buildRoCrate,
  signedInUserEntity,
  type DatasetDraft,
} from './build'

function draft(overrides: Partial<DatasetDraft> = {}): DatasetDraft {
  return {
    basics: {
      title: 'Example dataset',
      description: 'An example crate',
      datePublished: '2026-08-28',
      license: 'https://creativecommons.org/licenses/by/4.0/',
    },
    entities: [],
    parts: [],
    visibility: 'group',
    ...overrides,
  }
}

function graph(crate: Record<string, unknown>): Record<string, unknown>[] {
  return crate['@graph'] as Record<string, unknown>[]
}

function root(crate: Record<string, unknown>): Record<string, unknown> {
  return graph(crate).find((entity) => entity['@id'] === './') as Record<string, unknown>
}

describe('buildRoCrate', () => {
  it('deduplicates contextual entities by id and merges missing properties', () => {
    const crate = buildRoCrate(draft({
      entities: [
        {
          id: 'https://orcid.org/0000-0002-1825-0097',
          type: 'Person',
          properties: { name: 'Ada Example' },
          roles: ['author'],
        },
        {
          id: 'https://orcid.org/0000-0002-1825-0097',
          type: 'Person',
          properties: { url: 'https://example.test/ada' },
          roles: ['contributor'],
        },
      ],
    }))

    const matches = graph(crate).filter((entity) => entity['@id'] === 'https://orcid.org/0000-0002-1825-0097')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ name: 'Ada Example', url: 'https://example.test/ada' })
  })

  it('pairs an object hasPart reference with its File entity', () => {
    const crate = buildRoCrate(draft({
      parts: [{
        kind: 'object',
        id: 'https://w3id.org/aruna/data/abc',
        name: 'reads.fastq',
        contentUrl: 's3://example/reads.fastq',
        identity: 'content',
      }],
    }))

    expect(root(crate).hasPart).toEqual([{ '@id': 'https://w3id.org/aruna/data/abc' }])
    expect(graph(crate)).toContainEqual({
      '@id': 'https://w3id.org/aruna/data/abc',
      '@type': 'File',
      name: 'reads.fastq',
      contentUrl: 's3://example/reads.fastq',
    })
  })

  it('adds an existing dataset through the subcrate helper', () => {
    const crate = buildRoCrate(draft({
      parts: [{
        kind: 'dataset',
        link: {
          iri: 'https://example.test/crates/child',
          name: 'Child dataset',
          identifier: 'child-1',
          subjectOf: 'https://example.test/crates/child/ro-crate-metadata.json',
        },
      }],
    }))

    expect(root(crate).hasPart).toEqual([{ '@id': 'https://example.test/crates/child' }])
    expect(graph(crate)).toContainEqual(expect.objectContaining({
      '@id': 'https://example.test/crates/child',
      '@type': 'Dataset',
      name: 'Child dataset',
    }))
  })

  it('wires a Person entity to the author root role', () => {
    const crate = buildRoCrate(draft({
      entities: [{
        id: '#person-ada',
        type: 'Person',
        properties: { name: 'Ada Example' },
        roles: ['author'],
      }],
    }))

    expect(root(crate).author).toEqual([{ '@id': '#person-ada' }])
    expect(graph(crate)).toContainEqual({
      '@id': '#person-ada',
      '@type': 'Person',
      name: 'Ada Example',
    })
  })

  it('maps group and public visibility to the API boolean', () => {
    expect(buildDataset(draft()).public).toBe(false)
    expect(buildDataset(draft({ visibility: 'public' })).public).toBe(true)
  })

  it('uses the signed-in user ORCID attribute as the Person id', () => {
    expect(signedInUserEntity({
      id: 'user-1',
      name: 'Ada Example',
      attributes: { orcid: '0000-0002-1825-0097' },
    })).toEqual(expect.objectContaining({
      id: 'https://orcid.org/0000-0002-1825-0097',
      type: 'Person',
      roles: ['author'],
    }))
  })
})
