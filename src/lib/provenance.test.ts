import { describe, expect, it, vi } from 'vitest'
import { ApiError, type OriginResponse } from '@/lib/api'
import { addWriters, bucketOf, chainColumns, dataParts, databaseFrames, drawnChain, emptyGraph, expand, expandAll, hasPending, intoRecord, linkedBuckets, runInputs, runRecordDetail, startDataset, startFile, type Box, type Readers } from './provenance'

const bakrep = { database: true, dataset: 'd1' }
// The title comes from the dataset the bucket links.
const described = { title: 'BakRep', identifiers: [] }

const arn = (key: string, version: string) => `https://w3id.org/aruna/data/arn:aruna:realm:node:s3/lab/${key}@${version}`
const V1 = '01K8W1B3D5F7H9KMQ1S3V5X7Z1'
const V2 = '01K8W1B3D5F7H9KMQ1S3V5X7Z2'
const DIGEST = `https://w3id.org/aruna/data/${'a'.repeat(64)}`

const origin = (extra: Partial<OriginResponse>): OriginResponse => ({
  version_id: V1,
  created_by: 'u1',
  created_at: '2026-10-20T10:00:00Z',
  projection: [],
  ...extra,
})

function readers(answers: Record<string, OriginResponse | Error>, crate: unknown = null): Readers {
  return {
    origin: vi.fn(async (id: string) => {
      const answer = answers[id]
      if (!answer) throw new ApiError(404, 'not found')
      if (answer instanceof Error) throw answer
      return answer
    }),
    run: vi.fn(async (runId: string) => ({ run_id: runId, run_crate: 'doc1' })),
    crate: vi.fn(async () => crate),
  }
}

// Two inputs with the same bytes but different versions, and one without an exact version.
const runCrate = {
  '@graph': [
    { '@id': '#run', '@type': 'CreateAction', name: 'Genome annotation', object: [{ '@id': DIGEST }, { '@id': 's3://lab/b.faa' }, { '@id': 's3://lab/c.yaml' }] },
    { '@id': DIGEST, '@type': 'File', name: 'a.faa', contentUrl: ['s3://lab/a.faa', arn('a.faa', V1)] },
    { '@id': 's3://lab/b.faa', '@type': 'File', name: 'b.faa', contentUrl: ['s3://lab/b.faa', arn('b.faa', V2)] },
    { '@id': 's3://lab/c.yaml', '@type': 'File', name: 'c.yaml', contentUrl: 's3://lab/c.yaml' },
  ],
}

describe('provenance graph', () => {
  it('follows a result to its run, its inputs and their database', async () => {
    const found = [{ name: 'BioSample', value: 'SAMN1', url: 'https://x.org/SAMN1', target: 'key' as const }]
    const read = readers(
      {
        [arn('a.faa', V1)]: origin({ origin: { kind: 'source' }, bucket_metadata: bakrep, description: described, identifiers: found }),
        [arn('b.faa', V2)]: origin({ origin: { kind: 'upload', node_id: 'n1' } }),
      },
      runCrate,
    )
    const graph = emptyGraph()
    startFile(graph, arn('out.tsv', V1), 'out.tsv', origin({ origin: { kind: 'job', run_id: 'r1' } }))
    await expandAll(graph, read, () => false)

    const run = graph.boxes['run:r1']
    expect(run.title).toBe('Genome annotation')
    expect(run.link?.document).toBe('doc1')
    expect([...run.from].sort()).toEqual([arn('a.faa', V1), arn('b.faa', V2), 's3://lab/c.yaml'].sort())
    expect(graph.boxes['s3://lab/c.yaml'].detail).toBe('No exact version recorded')
    const database = graph.boxes['database:node/lab']
    expect(database.title).toBe('BakRep')
    expect(graph.boxes[arn('a.faa', V1)].identifiers[0].value).toBe('SAMN1')
    expect(graph.steps).toBe(3)
    expect(hasPending(graph)).toBe(false)
  })

  it('names the person and device a run input was uploaded from', async () => {
    const read = readers({ [arn('b.faa', V2)]: origin({ origin: { kind: 'upload', node_id: 'n1', device: 'd1' } }) }, runCrate)
    const graph = emptyGraph()
    startFile(graph, arn('out.tsv', V1), 'out.tsv', origin({ origin: { kind: 'job', run_id: 'r1' } }))
    await expandAll(graph, read, () => false)

    expect(graph.boxes[arn('b.faa', V2)].from).toEqual(['person:u1\nd1'])
    expect(graph.boxes['person:u1\nd1']).toMatchObject({ kind: 'person', role: 'Uploaded by', title: 'u1', device: 'd1' })
  })

  it('reads each version once, also in a cycle', async () => {
    const [a, b] = [arn('a', V1), arn('b', V2)]
    const read = readers({ [b]: origin({ origin: { kind: 'copy', from: a } }) })
    const graph = emptyGraph()
    startFile(graph, a, 'a', origin({ origin: { kind: 'copy', from: b } }))
    await expandAll(graph, read, () => false)

    expect(read.origin).toHaveBeenCalledTimes(1)
    expect(graph.boxes[b].from).toEqual([`copy:${b}`])
    expect(graph.boxes[`copy:${b}`]).toMatchObject({ kind: 'system', title: 'Copy', from: [a] })
    expect(graph.boxes[`copy:${a}`].from).toEqual([b])
    expect(drawnChain(graph)[0]!.sources[0]!.sources[0]!.sources[0]!.sources).toEqual([])
  })

  it('names a hidden file by its content id only, and lets a silent node be asked again', async () => {
    const read = readers({ [arn('b.faa', V2)]: new ApiError(503, 'busy') }, runCrate)
    const graph = emptyGraph()
    startFile(graph, arn('out.tsv', V1), 'out.tsv', origin({ origin: { kind: 'job', run_id: 'r1' } }))
    await expandAll(graph, read, () => false)

    expect(graph.boxes[DIGEST]).toMatchObject({ kind: 'hidden', title: 'Not visible to you' })
    expect(JSON.stringify(graph.boxes[DIGEST])).not.toContain('a.faa')
    const silent = graph.boxes[`silent:${arn('b.faa', V2)}`]
    expect(silent.title).toBe('Node did not answer')

    vi.mocked(read.origin).mockResolvedValueOnce(origin({ origin: { kind: 'upload', node_id: 'n1' } }))
    await expand(graph, silent.id, read)
    expect(graph.boxes[silent.id]).toBeUndefined()
    expect(graph.boxes['run:r1'].from).toContain(arn('b.faa', V2))
  })

  it('stops when asked and starts a dataset from its exact parts', async () => {
    const read = readers({}, runCrate)
    const graph = emptyGraph()
    startDataset(graph, 'Gut isolates', 'd9', runCrate)
    const root = graph.boxes['dataset:d9']
    expect(root.pending.map((hop) => hop.kind === 'version' && hop.id)).toEqual([arn('a.faa', V1), arn('b.faa', V2)])
    expect(root.from).toEqual(['s3://lab/c.yaml'])

    await expandAll(graph, read, () => graph.steps >= 1)
    expect(graph.steps).toBe(2)
  })

  it('hangs the runs that wrote into a linked bucket under the dataset and reads them as runs', async () => {
    const bucket = {
      '@graph': [
        { '@id': './', '@type': 'Dataset', hasPart: [{ '@id': 'arn:aruna:realm:n2:s3/bakta-results/' }] },
        { '@id': 'arn:aruna:realm:n2:s3/bakta-results/', '@type': 'Dataset', name: 'bakta-results' },
      ],
    }
    expect(linkedBuckets(bucket)).toEqual([{ bucket: 'bakta-results', prefix: '', nodeId: 'n2' }])
    const graph = emptyGraph()
    startDataset(graph, 'Bakta annotation results', 'd5', bucket)
    addWriters(graph, 'd5', ['r1', 'r2', 'r1'])
    expect(graph.boxes['dataset:d5'].pending).toEqual([{ kind: 'run', runId: 'r1' }, { kind: 'run', runId: 'r2' }])

    const read = readers({}, runCrate)
    await expand(graph, 'dataset:d5', read, () => true)
    expect(read.run).toHaveBeenCalledWith('r1')
    expect(graph.boxes['run:r1']).toBeDefined()
  })

  it('starts a run record from its results, its inputs showing through the run only', () => {
    const record = {
      '@graph': [
        { '@id': '#run', '@type': 'CreateAction', object: [{ '@id': '#in' }], result: [{ '@id': '#out' }] },
        { '@id': '#in', '@type': 'MediaObject', name: 'genome.fasta', contentUrl: [arn('genome.fasta', V1)] },
        { '@id': '#out', '@type': 'MediaObject', name: 'genome.gff3', contentUrl: [arn('genome.gff3', V2)] },
      ],
    }
    const graph = emptyGraph()
    startDataset(graph, 'Bakta run', 'd1', record)

    expect(graph.boxes['dataset:d1']!.pending.map((hop) => hop.kind === 'version' && hop.id)).toEqual([arn('genome.gff3', V2)])
  })

  it('names a run input by its stored file name, not by the input name the crate gives it', () => {
    const record = {
      '@graph': [
        { '@id': '#run-01JOB', '@type': 'CreateAction', name: 'Bakta', object: [{ '@id': '#in' }], result: [{ '@id': '#out' }] },
        { '@id': '#in', '@type': 'MediaObject', name: 'genome', contentUrl: [arn('inputs/genome.fasta', V1)] },
        { '@id': '#out', '@type': 'MediaObject', name: 'genome.gff3', contentUrl: ['s3://lab/genome.gff3'] },
      ],
    }
    const graph = emptyGraph()
    startDataset(graph, 'Bakta run', 'd1', record)

    expect(graph.boxes['run:01JOB']!.pending).toEqual([{ kind: 'version', id: arn('inputs/genome.fasta', V1), name: 'genome.fasta', digest: '#in', role: 'Input file' }])
  })

  it('keeps a run record\'s inputs through its run when the result has no exact version', () => {
    const record = {
      '@graph': [
        { '@id': '#run-01JOB', '@type': 'CreateAction', name: 'Bakta', object: [{ '@id': '#in' }], result: [{ '@id': '#out' }] },
        { '@id': '#in', '@type': 'MediaObject', name: 'genome.fasta', contentUrl: [arn('genome.fasta', V1)] },
        { '@id': '#out', '@type': 'MediaObject', name: 'genome.gff3', contentUrl: ['s3://lab/genome.gff3'] },
      ],
    }
    const graph = emptyGraph()
    startDataset(graph, 'Bakta run', 'd1', record)

    expect(graph.boxes['dataset:d1']!.from).toEqual(['run:01JOB', '#out'])
    expect(graph.boxes['#out']!.from).toEqual(['run:01JOB'])
    expect(drawnChain(graph)[0]!.sources.map((node) => node.ids)).toEqual([['#out']])
    expect(graph.boxes['run:01JOB']!.pending).toEqual([{ kind: 'version', id: arn('genome.fasta', V1), name: 'genome.fasta', digest: '#in', role: 'Input file' }])
    expect(graph.seen['run:01JOB']).toBe('run:01JOB')
  })

  it('shows a run record\'s run and inputs when its result\'s origin is refused', async () => {
    const record = {
      '@graph': [
        { '@id': '#run-01JOB', '@type': 'CreateAction', name: 'Bakta', object: [{ '@id': '#in' }], result: [{ '@id': '#out' }] },
        { '@id': '#in', '@type': 'MediaObject', name: 'genome.fasta', contentUrl: [arn('genome.fasta', V1)] },
        { '@id': '#out', '@type': 'MediaObject', name: 'genome.gff3', contentUrl: [arn('genome.gff3', V2)] },
      ],
    }
    const read = readers({
      [arn('genome.fasta', V1)]: origin({ origin: { kind: 'upload', node_id: 'n1' } }),
      [arn('genome.gff3', V2)]: new ApiError(403, 'forbidden'),
    })
    const graph = emptyGraph()
    startDataset(graph, 'Bakta run', 'd1', record)
    await expandAll(graph, read, () => false)

    const [root] = drawnChain(graph)
    const run = root!.sources.find((node) => node.ids[0] === 'run:01JOB')!
    expect(run.sources.map((node) => graph.boxes[node.ids[0]!]!.title)).toEqual(['genome.fasta'])
    expect(hasPending(graph)).toBe(false)
  })

  it('draws a run reached through a result once, under the result', () => {
    const graph = emptyGraph()
    const put = (id: string, kind: Box['kind'], from: string[] = []) => {
      graph.boxes[id] = { id, kind, role: kind, title: id, identifiers: [], from, pending: [] }
    }
    put('dataset', 'file', ['run', 'result'])
    put('result', 'file', ['run'])
    put('run', 'run', ['input'])
    put('input', 'file')
    graph.roots = ['dataset']

    const [root] = drawnChain(graph)
    expect(root!.sources.map((node) => node.ids)).toEqual([['result']])
    expect(root!.sources[0]!.sources[0]!.sources[0]!.ids).toEqual(['input'])
  })

  it('titles a file by the last part of its path and keeps the path', () => {
    const graph = emptyGraph()
    startFile(graph, arn('genome.fasta', V1), 'work/in/genome.fasta', origin({}))

    expect(graph.boxes[arn('genome.fasta', V1)]).toMatchObject({ title: 'genome.fasta', path: 'work/in/genome.fasta' })
  })

  it('reads stored file parts, whose links come in any order', () => {
    const stored = { '@graph': [{ '@id': '#a', '@type': 'MediaObject', name: 'a', contentUrl: [arn('a', V1), 's3://lab/a'] }] }
    expect(dataParts(stored)).toEqual([{ id: '#a', name: 'a', exact: arn('a', V1) }])
  })

  it('keeps identifiers on each file, not on their shared database', async () => {
    const found = (value: string) => [{ name: 'BioSample', value, url: `https://x.org/${value}`, target: 'key' as const }]
    const from = (value: string) => origin({ origin: { kind: 'source' }, bucket_metadata: bakrep, description: described, identifiers: found(value) })
    const read = readers({ [arn('a.faa', V1)]: from('SAMN1'), [arn('b.faa', V2)]: from('SAMN2') }, runCrate)
    const graph = emptyGraph()
    startFile(graph, arn('out.tsv', V1), 'out.tsv', origin({ origin: { kind: 'job', run_id: 'r1' } }))
    await expandAll(graph, read, () => false)

    expect(graph.boxes[arn('a.faa', V1)].identifiers[0].value).toBe('SAMN1')
    expect(graph.boxes[arn('b.faa', V2)].identifiers[0].value).toBe('SAMN2')
    expect(graph.boxes['database:node/lab'].identifiers).toEqual([])
  })

  it('keeps databases of different buckets apart, also with the same or no title', async () => {
    const other = (key: string, version: string) => arn(key, version).replace('s3/lab/', 's3/other/')
    const untitled = { database: true, dataset: 'd2' }
    const stored = { '@graph': [
      { '@id': '#a', '@type': 'File', name: 'a', contentUrl: arn('a', V1) },
      { '@id': '#b', '@type': 'File', name: 'b', contentUrl: other('b', V2) },
      { '@id': '#c', '@type': 'File', name: 'c', contentUrl: arn('c', V2) },
      { '@id': '#d', '@type': 'File', name: 'd', contentUrl: `https://w3id.org/aruna/data/realm/${V1}` },
      { '@id': '#e', '@type': 'File', name: 'e', contentUrl: `https://w3id.org/aruna/data/realm/${V2}` },
    ] }
    const read = readers({
      [arn('a', V1)]: origin({ bucket_metadata: untitled }),
      [other('b', V2)]: origin({ bucket_metadata: untitled }),
      [arn('c', V2)]: origin({ bucket_metadata: untitled }),
      [`https://w3id.org/aruna/data/realm/${V1}`]: origin({ bucket_metadata: bakrep }),
      [`https://w3id.org/aruna/data/realm/${V2}`]: origin({ bucket_metadata: bakrep }),
    })
    const graph = emptyGraph()
    startDataset(graph, 'Set', 'doc', stored)
    await expandAll(graph, read, () => false)

    const databases = Object.keys(graph.boxes).filter((id) => id.startsWith('database:')).sort()
    expect(databases).toEqual([
      `database:https://w3id.org/aruna/data/realm/${V1}`,
      `database:https://w3id.org/aruna/data/realm/${V2}`,
      'database:node/lab',
      'database:node/other',
    ])
    expect(graph.boxes['database:node/lab'].title).toBe('A database')
    expect(bucketOf(DIGEST)).toBeNull()
  })

  it('names the release that pins a version, or says membership could not be checked', () => {
    const doi = { name: 'DOI', value: '10.5281/zenodo.4247252', url: 'https://doi.org/10.5281/zenodo.4247252' }
    const pinned = emptyGraph()
    startFile(pinned, arn('a', V1), 'a', origin({
      bucket_metadata: bakrep,
      description: { title: 'Bakta database', identifiers: [] },
      releases: [{ crate_version: 'rv1', label: '6.0', upstream: [doi] }],
      releases_complete: true,
    }))
    const release = pinned.boxes['release:rv1']
    expect([release.role, release.title, release.link?.label, release.detail]).toEqual(['Database release', 'Bakta database 6.0', 'doi:10.5281/zenodo.4247252', undefined])
    expect(pinned.boxes['database:node/lab']).toBeUndefined()

    const unchecked = emptyGraph()
    startFile(unchecked, arn('a', V1), 'a', origin({ bucket_metadata: bakrep, releases: [], releases_complete: false }))
    expect(unchecked.boxes['database:node/lab'].detail).toBe('Release membership could not be checked everywhere.')
  })

  it('gives every file the person, system job or external source it came from', () => {
    const graph = emptyGraph()
    const ncbi = (key: string) => origin({
      origin: { kind: 'source' },
      source: { url: `https://ftp.ncbi.nlm.nih.gov/genomes/${key}`, path: key, digests: [], sources: [{ url: `https://ftp.ncbi.nlm.nih.gov/genomes/${key}`, path: key, connector_id: 'c1' }] },
    })
    startFile(graph, arn('a.fna', V1), 'a.fna', ncbi('a.fna'))
    startFile(graph, arn('b.fna', V2), 'b.fna', ncbi('b.fna'))
    const [a, b] = [graph.boxes[arn('a.fna', V1)]!, graph.boxes[arn('b.fna', V2)]!]
    // Files of one source share its box, so they fold into one card; no staging job is drawn.
    expect(a.from).toEqual(b.from)
    expect(a.detail).toMatch(/^Downloaded /)
    expect(graph.boxes[a.from[0]!]).toMatchObject({ kind: 'source', title: 'ftp.ncbi.nlm.nih.gov', connector: 'c1', link: { url: 'https://ftp.ncbi.nlm.nih.gov' } })

    // A private source without a URL is still drawn, by its connector.
    startFile(graph, arn('c', V1), 'c', origin({ origin: { kind: 'source' }, source: { path: 'c', digests: [], sources: [{ path: 'c', connector_id: 'c2' }] } }))
    const hidden = graph.boxes[graph.boxes[arn('c', V1)]!.from[0]!]!
    expect(hidden).toMatchObject({ kind: 'source', title: 'External source', connector: 'c2' })
    expect(hidden.link).toBeUndefined()

    startFile(graph, arn('d', V1), 'd', origin({ origin: { kind: 'upload', node_id: 'n1' } }))
    expect(graph.boxes[graph.boxes[arn('d', V1)]!.from[0]!]).toMatchObject({ kind: 'person', role: 'Uploaded by', title: 'u1' })
    startFile(graph, arn('e', V1), 'e', origin({ origin: { kind: 'storage', backend_id: '01K8W1B3D5F7H9KMQ1S3V5X7ZB', key: 'raw/e' } }))
    expect(graph.boxes[arn('e', V1)]!.detail).not.toMatch(/^Downloaded/)
    expect(graph.boxes[graph.boxes[arn('e', V1)]!.from[0]!]).toMatchObject({ kind: 'source', title: 'Storage folder' })
    startFile(graph, arn('f', V1), 'f', origin({ origin: { kind: 'upload', node_id: 'n1' }, hop: { relationship_id: 's1', from: arn('g', V2) } }))
    const sync = graph.boxes[`sync:${arn('f', V1)}`]!
    expect(sync).toMatchObject({ kind: 'system', title: 'Sync', pending: [{ kind: 'version', id: arn('g', V2), role: 'Synced from' }] })
  })

  it('keeps the system job, upload client, connector name and run starter the node recorded', async () => {
    const graph = emptyGraph()
    const imported = (key: string, job: string) => origin({
      origin: { kind: 'source', job_id: job },
      source: { path: key, digests: [], sources: [{ path: key, connector_id: 'c1', connector_name: 'Lab archive' }] },
    })
    startFile(graph, arn('a', V1), 'a', imported('a', 'j1'))
    startFile(graph, arn('b', V1), 'b', imported('b', 'j2'))
    const [a, b] = [graph.boxes[arn('a', V1)]!, graph.boxes[arn('b', V1)]!]
    // Two imports of one source share its box; both read through the same connector.
    expect(a.from).toEqual(b.from)
    expect(graph.boxes[a.from[0]!]).toMatchObject({ kind: 'source', connector: 'c1', connectorName: 'Lab archive' })
    startFile(graph, arn('c', V1), 'c', origin({ origin: { kind: 'copy', from: arn('d', V2), job_id: 'j3' } }))
    expect(graph.boxes[`copy:${arn('c', V1)}`]).toMatchObject({ job: 'j3' })
    startFile(graph, arn('e', V1), 'e', origin({ origin: { kind: 'upload', node_id: 'n1', client: 'portal' } }))
    expect(graph.boxes['person:u1\n\nportal']).toMatchObject({ kind: 'person', client: 'portal' })

    const run = readers({}, runCrate)
    startFile(graph, arn('f', V1), 'f', origin({ origin: { kind: 'job', run_id: 'r1', started_by: 'u2' } }))
    await expand(graph, arn('f', V1), run)
    expect(graph.boxes['run:r1']).toMatchObject({ kind: 'run', startedBy: 'u2' })
  })

  it('follows what a dataset is based on and the datasets it holds, and stops at a cycle', async () => {
    const DOC = '01K8W1B3D5F7H9KMQ1S3V5X7ZD'
    const PART = '01K8W1B3D5F7H9KMQ1S3V5X7ZE'
    const root = {
      '@graph': [
        { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
        {
          '@id': './',
          '@type': 'Dataset',
          isBasedOn: [{ '@id': `https://w3id.org/aruna/${DOC}` }, { '@id': arn('a.faa', V1) }, { '@id': 'https://doi.org/10.5281/zenodo.1' }],
          hasPart: [{ '@id': `https://w3id.org/aruna/${PART}` }],
        },
      ],
    }
    const graph = emptyGraph()
    startDataset(graph, 'Annotations', 'd0', root)
    const start = graph.boxes['dataset:d0']!
    expect(start.pending).toEqual([
      { kind: 'dataset', documentId: DOC, role: 'Based on' },
      { kind: 'version', id: arn('a.faa', V1), role: 'Based on' },
      { kind: 'dataset', documentId: PART, role: 'Part' },
    ])
    expect(graph.boxes['source:https://doi.org/10.5281/zenodo.1']).toMatchObject({ kind: 'source', role: 'Based on', title: 'doi:10.5281/zenodo.1' })

    // The first dataset is based on the start again and names a bucket written by a run.
    const based = {
      '@graph': [
        { '@id': './', '@type': 'Dataset', name: 'Bakta database', isBasedOn: { '@id': 'https://w3id.org/aruna/d0' }, hasPart: { '@id': 'arn:aruna:realm:n2:s3/bakta-db/' } },
        { '@id': 'arn:aruna:realm:n2:s3/bakta-db/', '@type': 'Dataset' },
      ],
    }
    const read = readers({ [arn('a.faa', V1)]: origin({ origin: { kind: 'upload', node_id: 'n1' } }) })
    read.crate = vi.fn(async (doc: string) => (doc === DOC ? based : { '@graph': [{ '@id': './', '@type': 'Dataset', isBasedOn: { '@id': `https://w3id.org/aruna/${DOC}` } }] }))
    read.writers = vi.fn(async () => ['prep'])
    await expandAll(graph, read, () => false)

    const database = graph.boxes[`dataset:${DOC}`]!
    expect(database).toMatchObject({ kind: 'dataset', role: 'Based on', title: 'Bakta database', link: { document: DOC } })
    expect(read.writers).toHaveBeenCalledWith('bakta-db', '', 'n2')
    expect(database.from).toContain('run:prep')
    // The nested part is based on the first dataset, read once and drawn without its chain again.
    expect(graph.boxes[`dataset:${PART}`]!.from).toEqual([`dataset:${DOC}`])
    expect(read.crate).toHaveBeenCalledTimes(3)
    expect(hasPending(graph)).toBe(false)
  })

  it('reads only the links a closed card asks for', async () => {
    const graph = emptyGraph()
    graph.boxes.x = { id: 'x', kind: 'file', role: 'File', title: 'x', identifiers: [], from: [], pending: [{ kind: 'version', id: arn('a.faa', V1), role: 'Input file' }, { kind: 'run', runId: 'r1' }] }
    const read = readers({}, runCrate)
    await expand(graph, 'x', read, () => true, (hop) => hop.kind === 'run')
    expect(read.run).toHaveBeenCalledWith('r1')
    expect(read.origin).not.toHaveBeenCalled()
    expect(graph.boxes.x!.pending).toEqual([{ kind: 'version', id: arn('a.faa', V1), role: 'Input file' }])
  })

  it('drops an answer that comes back after the view moved on', async () => {
    let answer: (value: OriginResponse) => void = () => {}
    const read = readers({})
    vi.mocked(read.origin).mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    const graph = emptyGraph()
    startFile(graph, arn('a', V1), 'a', origin({ origin: { kind: 'copy', from: arn('b', V2) } }))
    let current = true
    const pending = expand(graph, arn('a', V1), read, () => current)
    current = false
    Object.assign(graph, emptyGraph())
    answer(origin({ origin: { kind: 'upload', node_id: 'n1' } }))
    await pending

    expect(graph.boxes).toEqual({})
    expect(graph.seen).toEqual({})
  })

  it('reads the inputs a run crate names', () => {
    expect(runInputs(runCrate).parts.map((part) => part.exact !== null)).toEqual([true, true, false])
    expect(runInputs(null)).toEqual({ name: null, parts: [] })
  })
})

describe('runRecordDetail', () => {
  it('says why a run shows no record', () => {
    expect(runRecordDetail({ status: 'denied', message: 'metadata write access denied' })).toBe(
      'Run record not written: metadata write access denied',
    )
    expect(runRecordDetail({ status: 'local' })).toBe('Run record kept on the device')
    expect(runRecordDetail({ status: 'pending' })).toBe('No run record yet')
    expect(runRecordDetail(null)).toBe('No run record yet')
  })
})

describe('drawn chain', () => {
  it('folds sibling files with the same sources and draws a shared chain once', () => {
    const graph = emptyGraph()
    const put = (id: string, kind: Box['kind'], role: string, from: string[] = []) => {
      graph.boxes[id] = { id, kind, role, title: id, identifiers: [], from, pending: [] }
    }
    const files = Array.from({ length: 66 }, (_, index) => `db-${index}`)
    put('result', 'file', 'This file', ['run:bakta'])
    put('run:bakta', 'run', 'Run', ['genome', ...files])
    put('genome', 'file', 'Input file')
    for (const id of files) put(id, 'file', 'Input file', ['release:6', 'run:prep'])
    put('release:6', 'database', 'Database release')
    put('run:prep', 'run', 'Run', ['tarball'])
    put('tarball', 'file', 'Input file', ['source:zenodo'])
    put('source:zenodo', 'source', 'Source')
    put('other', 'file', 'File', ['run:bakta'])
    graph.roots = ['result', 'other']

    const [result, other] = drawnChain(graph)
    const run = result!.sources[0]!
    expect(run.sources.map((node) => node.ids.length)).toEqual([1, 66])
    const folded = run.sources[1]!
    // The release is a frame around the files, never a card of its own.
    expect(folded.sources.map((node) => node.ids[0])).toEqual(['run:prep'])
    expect(folded.sources[0]!.sources[0]!.sources[0]!.ids).toEqual(['source:zenodo'])
    expect(other!.sources[0]).toMatchObject({ ids: ['run:bakta'], repeat: true, sources: [] })
  })
})

describe('chain columns', () => {
  const put = (graph: ReturnType<typeof emptyGraph>, id: string, kind: Box['kind'], from: string[] = []) => {
    graph.boxes[id] = { id, kind, role: kind, title: id, identifiers: [], from, pending: [] }
  }

  it('folds a run record\'s results into the record, which then comes from the run', () => {
    const graph = emptyGraph()
    const results = Array.from({ length: 12 }, (_, index) => `out-${index}`)
    put(graph, 'dataset:d1', 'file', ['run:r1', ...results])
    for (const id of results) put(graph, id, 'unversioned', ['run:r1'])
    put(graph, 'run:r1', 'run', ['genome', 'db'])
    put(graph, 'genome', 'file')
    put(graph, 'db', 'file', ['release:6', 'source:zenodo'])
    put(graph, 'release:6', 'database')
    put(graph, 'source:zenodo', 'source')
    graph.roots = ['dataset:d1']

    const [record] = intoRecord(graph, drawnChain(graph))
    expect(record!.sources.map((node) => [node.ids, node.repeat])).toEqual([[['run:r1'], false]])

    const full = chainColumns(graph, [record!], false)
    const place = (id: string) => full.cards.find((card) => card.node.ids[0] === id)
    expect(full.columns).toBe(4)
    expect(full.rows).toBe(2)
    expect(place('dataset:d1')).toMatchObject({ column: 3, row: 0.5, into: null })
    expect(place('run:r1')).toMatchObject({ column: 2, row: 0.5 })
    expect(place('genome')).toMatchObject({ column: 1, row: 0 })
    expect(place('source:zenodo')).toMatchObject({ column: 0, row: 1, into: place('db')!.id })
    // The release frames the file and the source it came from.
    expect(place('release:6')).toBeUndefined()
    expect(databaseFrames(graph, full.cards)).toEqual([{ id: place('db')!.id, boxes: ['release:6'], first: 0, last: 1, top: 1, bottom: 1 }])

    put(graph, 'db', 'file', ['release:6', 'run:prep'])
    put(graph, 'run:prep', 'run', ['tarball'])
    put(graph, 'tarball', 'file')
    const halves = chainColumns(graph, intoRecord(graph, drawnChain(graph)), false)
    expect(halves.cards.every((card) => Number.isInteger(card.row * 2))).toBe(true)

    // The direct view opens each input and draws the run that made it, with that run's inputs closed.
    const [later] = intoRecord(graph, drawnChain(graph))
    const direct = chainColumns(graph, [later!], true)
    expect(direct.cards.map((card) => [card.node.ids[0], card.open, card.upstream])).toEqual([
      ['genome', true, false],
      ['tarball', false, true],
      ['run:prep', true, true],
      ['db', true, false],
      ['run:r1', true, false],
      ['dataset:d1', true, false],
    ])

    // Closing an input card hides what made it; closing the run hides its inputs.
    const db = direct.cards.find((card) => card.node.ids[0] === 'db')!
    const run = direct.cards.find((card) => card.node.ids[0] === 'run:r1')!
    const shut = chainColumns(graph, [later!], true, new Map([[db.id, false]]))
    expect(shut.cards.map((card) => [card.node.ids[0], card.open])).toEqual([['genome', true], ['run:prep', false], ['db', false], ['run:r1', true], ['dataset:d1', true]])
    // The frame stays around the file that is left and goes with it.
    expect(databaseFrames(graph, shut.cards)).toMatchObject([{ id: db.id, first: 1, last: 1 }])
    const closed = chainColumns(graph, [later!], true, new Map([[run.id, false]]))
    expect(closed.cards.map((card) => card.node.ids[0])).toEqual(['run:r1', 'dataset:d1'])
    expect(databaseFrames(graph, closed.cards)).toEqual([])
  })

  it('stops the direct view one run above the inputs, and the full view draws every step', () => {
    const graph = emptyGraph()
    put(graph, 'dataset:d3', 'file', ['run:a'])
    put(graph, 'run:a', 'run', ['x'])
    put(graph, 'x', 'file', ['run:b'])
    put(graph, 'run:b', 'run', ['y'])
    put(graph, 'y', 'file', ['run:c'])
    put(graph, 'run:c', 'run', ['z'])
    put(graph, 'z', 'file')
    graph.roots = ['dataset:d3']

    const chain = drawnChain(graph)
    const direct = chainColumns(graph, chain, true)
    // The closed input still shows the run that made it, closed too.
    expect(direct.cards.map((card) => [card.node.ids[0], card.open, card.upstream])).toEqual([
      ['run:c', false, true],
      ['y', false, true],
      ['run:b', true, true],
      ['x', true, false],
      ['run:a', true, false],
      ['dataset:d3', true, false],
    ])
    const full = chainColumns(graph, chain, false)
    expect(full.cards.map((card) => card.node.ids[0])).toEqual(['z', 'run:c', 'y', 'run:b', 'x', 'run:a', 'dataset:d3'])
    expect(full.cards.filter((card) => card.upstream).map((card) => card.node.ids[0])).toEqual(['z', 'run:c', 'y', 'run:b'])
  })

  it('folds many files without sources into one card, a few stay apart', () => {
    const graph = emptyGraph()
    const parts = Array.from({ length: 40 }, (_, index) => `part-${index}`)
    put(graph, 'dataset:d2', 'file', parts)
    for (const id of parts) put(graph, id, 'unversioned')
    put(graph, 'run:r2', 'run', ['a', 'b'])
    put(graph, 'a', 'file')
    put(graph, 'b', 'file')
    graph.roots = ['dataset:d2', 'run:r2']

    const [dataset, run] = drawnChain(graph)
    expect(dataset!.sources.map((node) => node.ids.length)).toEqual([40])
    expect(run!.sources.map((node) => node.ids)).toEqual([['a'], ['b']])
  })
})

