import { describe, expect, it } from 'vitest'
import { datasetCard, inputsText, outputsText, runCard, sizeRow } from './crateCard'

const RUN = 'https://w3id.org/aruna/01RUNRECORD'

function runCrate(action: Record<string, unknown>, extra: Array<Record<string, unknown>> = []) {
  return {
    '@graph': [
      { '@id': 'ro-crate-metadata.json', about: { '@id': RUN } },
      { '@id': RUN, '@type': 'Dataset', conformsTo: { '@id': 'https://w3id.org/ro/wfrun/process/0.5' }, name: 'Bakta', mentions: { '@id': '#run-01EXEC' } },
      { '@id': '#run-01EXEC', '@type': 'CreateAction', ...action },
      ...extra,
    ],
  }
}

const bakta = runCrate({
  actionStatus: 'http://schema.org/CompletedActionStatus',
  startTime: '2026-10-29T13:57:48Z',
  endTime: '2026-10-29T14:02:00Z',
  location: { '@id': '#execution-site' },
  instrument: { '@id': '#bakta' },
  object: [{ '@id': 'db-1' }, { '@id': 'db-2' }, { '@id': 'genome' }],
  result: [{ '@id': 'out-1' }, { '@id': 'out-2' }],
}, [
  { '@id': '#execution-site', '@type': 'Place', identifier: 'node-2' },
  { '@id': '#bakta', '@type': 'SoftwareApplication', name: 'bakta-rs', softwareVersion: '1.11.4' },
  { '@id': 'db-1', '@type': 'File', name: 'db/rRNA.i1i', isPartOf: [{ '@id': '#bucket-metadata-01' }, { '@id': 'https://w3id.org/aruna/rel' }] },
  { '@id': 'db-2', '@type': 'File', name: 'db/psc.dmnd', isPartOf: [{ '@id': '#bucket-metadata-01' }] },
  { '@id': 'genome', '@type': 'File', name: 'genome.txt', isPartOf: [{ '@id': '#bucket-metadata-02' }] },
  { '@id': '#bucket-metadata-01', '@type': 'Dataset', name: 'Bakta database (light) (at admission)', identifier: ['https://doi.org/10.5281/zenodo.14916843'] },
  { '@id': 'https://w3id.org/aruna/rel', '@type': 'Dataset', name: 'Release 6.0 light' },
  { '@id': '#bucket-metadata-02', '@type': 'Dataset', name: 'NCBI RefSeq genomes (at admission)' },
  { '@id': 'out-1', '@type': 'File', contentSize: '3000', contentUrl: 's3://work/results/bakta/genome.gff3' },
  { '@id': 'out-2', '@type': 'File', contentSize: '1000', contentUrl: 's3://work/results/bakta/genome.tsv' },
])

describe('runCard', () => {
  it('reads state, timing, place, tool, inputs and outputs of a run record', () => {
    const run = runCard(bakta)!

    expect(run).toMatchObject({
      state: 'succeeded',
      finishedAt: '2026-10-29T14:02:00Z',
      duration: '4m 12s',
      nodeId: 'node-2',
      tool: 'bakta-rs 1.11.4',
      inputFiles: 3,
      outputFiles: 2,
      outputBytes: 4000,
      folder: { bucket: 'work', prefix: 'results/bakta' },
    })
    // A release counts only for files without their bucket's database.
    expect(run.inputDatasets).toEqual([
      { id: '#bucket-metadata-01', name: 'Bakta database (light)', link: 'https://doi.org/10.5281/zenodo.14916843' },
      { id: '#bucket-metadata-02', name: 'NCBI RefSeq genomes' },
    ])
    expect(inputsText(run)).toBe('2\u00a0datasets, 3\u00a0files')
    expect(outputsText(run)).toBe('2\u00a0result files, 3.9\u00a0KiB')
  })

  it('leaves the output size out when one output names none', () => {
    const graph = bakta['@graph'].map((entity) => (entity['@id'] === 'out-2' ? { ...entity, contentSize: undefined } : entity))
    const run = runCard({ '@graph': graph })!

    expect(run.outputBytes).toBeUndefined()
    expect(outputsText(run)).toBe('2\u00a0result files')
  })

  it('keeps two input datasets apart when they share a name', () => {
    const crate = runCrate({ object: [{ '@id': 'a' }, { '@id': 'b' }] }, [
      { '@id': 'a', '@type': 'File', isPartOf: [{ '@id': '#bucket-metadata-01' }] },
      { '@id': 'b', '@type': 'File', isPartOf: [{ '@id': '#bucket-metadata-02' }] },
      { '@id': '#bucket-metadata-01', '@type': 'Dataset', name: 'Reference genomes' },
      { '@id': '#bucket-metadata-02', '@type': 'Dataset', name: 'Reference genomes' },
    ])

    expect(runCard(crate)?.inputDatasets).toHaveLength(2)
  })

  it('links an input dataset only through a web address or a DOI', () => {
    const part = (id: string, identifier: string) => ({ '@id': id, '@type': 'Dataset', name: id, identifier: [identifier] })
    const crate = runCrate({ object: ['a', 'b', 'c', 'd'].map((id) => ({ '@id': id })) }, [
      ...['a', 'b', 'c', 'd'].map((id) => ({ '@id': id, '@type': 'File', isPartOf: [{ '@id': `#bucket-metadata-${id}` }] })),
      part('#bucket-metadata-a', 'javascript:alert(1)'),
      part('#bucket-metadata-b', 'data:text/html,<script>alert(1)</script>'),
      part('#bucket-metadata-c', '10.5281/zenodo.14916843'),
      part('#bucket-metadata-d', 'https://example.org/genomes'),
    ])

    expect(runCard(crate)?.inputDatasets.map((source) => source.link)).toEqual([
      undefined,
      undefined,
      'https://doi.org/10.5281/zenodo.14916843',
      'https://example.org/genomes',
    ])
  })

  it('names a run that is still going as running', () => {
    expect(runCard(runCrate({ actionStatus: 'ActiveActionStatus' }))?.state).toBe('running')
  })

  it('is null for a crate that is not a run record', () => {
    expect(runCard({ '@graph': [{ '@id': './', '@type': 'Dataset' }] })).toBeNull()
  })
})

function dataset(parts: Array<Record<string, unknown>>) {
  return {
    '@graph': [
      { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
      { '@id': './', '@type': 'Dataset', name: 'Lahn', description: 'Weekly samples.', hasPart: parts.map((part) => ({ '@id': part['@id'] })) },
      ...parts,
    ],
  }
}

describe('datasetCard', () => {
  it('sums the size when every file names one', () => {
    const card = datasetCard(dataset([
      { '@id': 'a.csv', '@type': 'File', contentSize: '1024' },
      { '@id': 'b.csv', '@type': 'File', contentSize: '1024' },
    ]))

    expect(card).toEqual({ description: 'Weekly samples.', files: 2, folders: 0, bytes: 2048 })
    expect(sizeRow(card)).toEqual({ label: 'Size', value: '2\u00a0KiB in 2\u00a0files' })
  })

  it('counts files without a size when one is unknown, never as zero bytes', () => {
    const card = datasetCard(dataset([{ '@id': 'a.csv', '@type': 'File', contentSize: '1024' }, { '@id': 'b.csv', '@type': 'File' }]))

    expect(card.bytes).toBeUndefined()
    expect(sizeRow(card)).toEqual({ label: 'Files', value: '2\u00a0files' })
  })

  it('treats a blank size as unknown, not as zero bytes', () => {
    const card = datasetCard(dataset([{ '@id': 'a.csv', '@type': 'File', contentSize: '1024' }, { '@id': 'b.csv', '@type': 'File', contentSize: ' ' }]))

    expect(card.bytes).toBeUndefined()
  })

  it('names folders instead of a size it cannot know', () => {
    const card = datasetCard(dataset([{ '@id': 'raw/', '@type': 'Dataset' }, { '@id': 'a.csv', '@type': 'File', contentSize: '10' }]))

    expect(sizeRow(card)).toEqual({ label: 'Parts', value: '1\u00a0folder, 1\u00a0file' })
  })

  it('knows a folder by its full type IRI too', () => {
    const card = datasetCard(dataset([{ '@id': 'raw/', '@type': 'http://schema.org/Dataset' }, { '@id': 'a.csv', '@type': 'File', contentSize: '10' }]))

    expect(card).toMatchObject({ files: 1, folders: 1 })
  })

  it('shows no size row for a dataset without parts', () => {
    expect(sizeRow(datasetCard(dataset([])))).toBeNull()
  })
})
