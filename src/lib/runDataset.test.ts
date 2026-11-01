import { describe, expect, it } from 'vitest'
import { resultsDatasetCrate } from './runDataset'

const run = {
  inputs: [
    { id: 'https://w3id.org/aruna/data/arn:aruna:r:n2:s3/ncbi-refseq/genome.fna.gz@01M69M40GW80DTHHG98J4653CV', name: 'genome.fna.gz', contentUrls: ['s3://ncbi-refseq/genome.fna.gz'] },
    { id: 'db-file', name: 'db/version.json' },
  ],
  outputs: [{ id: 'gff', name: 'genome.gff3', contentSize: '1024', contentUrls: ['s3://results/out/genome.gff3', 'https://w3id.org/aruna/data/x'] }],
}

describe('results dataset', () => {
  it('names the results as parts, the inputs as its basis and mentions the run record', () => {
    const crate = resultsDatasetCrate(run, '01RECORD', { name: 'Results', description: 'Bakta results', license: 'https://spdx.org/licenses/CC-BY-4.0', published: '2026-11-01T08:00:00Z' })
    const [descriptor, root, ...files] = crate['@graph']

    expect(descriptor).toMatchObject({ '@id': 'ro-crate-metadata.json', about: { '@id': './' } })
    expect(root).toEqual({
      '@id': './',
      '@type': 'Dataset',
      name: 'Results',
      description: 'Bakta results',
      datePublished: '2026-11-01T08:00:00Z',
      license: { '@id': 'https://spdx.org/licenses/CC-BY-4.0' },
      hasPart: [{ '@id': 'gff' }],
      isBasedOn: [{ '@id': run.inputs[0]!.id }, { '@id': 'db-file' }],
      mentions: { '@id': 'https://w3id.org/aruna/01RECORD' },
    })
    expect(files).toEqual([
      { '@id': 'gff', '@type': 'File', name: 'genome.gff3', contentSize: '1024', contentUrl: ['s3://results/out/genome.gff3', 'https://w3id.org/aruna/data/x'] },
      { '@id': run.inputs[0]!.id, '@type': 'File', name: 'genome.fna.gz', contentUrl: 's3://ncbi-refseq/genome.fna.gz' },
      { '@id': 'db-file', '@type': 'File', name: 'db/version.json' },
    ])
  })

  it('leaves out a license nobody chose and an input that is also a result', () => {
    const crate = resultsDatasetCrate({ inputs: [{ id: 'gff', name: 'genome.gff3' }], outputs: run.outputs }, '01RECORD', { name: 'R', description: 'D', license: '', published: '2026-11-01T08:00:00Z' })
    const root = crate['@graph'][1] as Record<string, unknown>

    expect(root.license).toBeUndefined()
    expect(root.isBasedOn).toBeUndefined()
    expect(crate['@graph']).toHaveLength(3)
  })
})
