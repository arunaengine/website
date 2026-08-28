import { describe, expect, it } from 'vitest'
import { buildRoCrate, type DatasetDraft } from './build'
import { parseDatasetDraft } from './parse'

function graph(crate: Record<string, unknown>): Record<string, unknown>[] {
  return crate['@graph'] as Record<string, unknown>[]
}

describe('parseDatasetDraft', () => {
  it('round trips understood entities and parts through the pure builder', () => {
    const original: DatasetDraft = {
      basics: {
        groupId: 'group-1',
        path: 'datasets/example',
        title: 'Example dataset',
        description: 'Round trip fixture',
        datePublished: '2026-08-28',
        license: 'https://creativecommons.org/licenses/by/4.0/',
        keywords: ['example'],
      },
      entities: [
        {
          id: 'https://orcid.org/0000-0002-1825-0097',
          type: 'Person',
          properties: { name: 'Ada Example' },
          roles: ['author'],
        },
        {
          id: '#instrument-one',
          type: 'LaboratoryScience',
          properties: { name: 'Instrument one', calibration: '2026-01-01' },
          roles: [],
        },
      ],
      parts: [
        {
          kind: 'object',
          id: 'https://w3id.org/aruna/data/abc',
          name: 'reads.fastq',
          contentUrl: 's3://bucket/reads.fastq',
          identity: 'content',
        },
        { kind: 'external', url: 'https://example.test/data.csv', name: 'External data' },
        {
          kind: 'dataset',
          link: {
            iri: 'https://example.test/datasets/child',
            name: 'Child dataset',
            identifier: 'child-1',
            subjectOf: 'https://example.test/datasets/child/ro-crate-metadata.json',
          },
        },
      ],
      visibility: 'public',
    }

    const parsed = parseDatasetDraft(buildRoCrate(original), {
      groupId: 'group-1',
      path: 'datasets/example',
      public: true,
    })
    const rebuilt = buildRoCrate(parsed)

    expect(parsed.visibility).toBe('public')
    expect(parsed.parts.map((part) => part.kind)).toEqual(['object', 'external', 'dataset'])
    expect(parsed.entities).toContainEqual(original.entities[0])
    expect(parsed.entities).toContainEqual(original.entities[1])
    for (const id of [
      'https://orcid.org/0000-0002-1825-0097',
      '#instrument-one',
      'https://w3id.org/aruna/data/abc',
      'https://example.test/data.csv',
      'https://example.test/datasets/child',
    ]) {
      expect(graph(rebuilt).some((entity) => entity['@id'] === id), id).toBe(true)
    }
  })
})
