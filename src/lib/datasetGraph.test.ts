import { describe, expect, it } from 'vitest'
import { kindCounts, withoutKinds } from './datasetGraph'

const crate = {
  '@context': 'https://w3id.org/ro/crate/1.2/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', author: [{ '@id': '#ada' }, { '@id': '#lab' }], hasPart: [{ '@id': 'a.txt' }], mentions: { '@id': '#run' } },
    { '@id': 'a.txt', '@type': 'File' },
    { '@id': '#ada', '@type': 'Person', affiliation: { '@id': '#lab' } },
    { '@id': '#lab', '@type': 'Organization' },
    { '@id': '#run', '@type': 'CreateAction', agent: { '@id': '#ada' }, result: { '@id': 'a.txt' } },
  ],
}

describe('dataset graph kinds', () => {
  it('counts each kind once, leaving out the root and the descriptor', () => {
    expect(kindCounts(crate)).toEqual([
      { kind: 'Runs', count: 1 },
      { kind: 'Files', count: 1 },
      { kind: 'People', count: 1 },
      { kind: 'Organizations', count: 1 },
    ])
  })

  it('drops a hidden kind and every reference to it', () => {
    const shown = withoutKinds(crate, new Set(['People'])) as typeof crate
    expect(shown['@graph'].map((entity) => entity['@id'])).toEqual(['ro-crate-metadata.json', './', 'a.txt', '#lab', '#run'])
    expect(shown['@graph'][1]).toMatchObject({ author: [{ '@id': '#lab' }] })
    expect(shown['@graph'][4]).not.toHaveProperty('agent')
    expect(withoutKinds(crate, new Set())).toBe(crate)
  })
})
