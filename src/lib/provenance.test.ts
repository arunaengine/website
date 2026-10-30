import { describe, expect, it, vi } from 'vitest'
import { ApiError, type OriginResponse } from '@/lib/api'
import { bucketOf, chainColumns, dataParts, drawnChain, emptyGraph, expand, expandAll, hasPending, intoRecord, runInputs, runRecordDetail, startDataset, startFile, type Box, type Readers } from './provenance'

const bakrep = { database: true, title: 'BakRep', dataset: 'd1', identifiers: [] }

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
        [arn('a.faa', V1)]: origin({ origin: { kind: 'source' }, bucket_metadata: bakrep, identifiers: found }),
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

  it('reads each version once, also in a cycle', async () => {
    const [a, b] = [arn('a', V1), arn('b', V2)]
    const read = readers({ [b]: origin({ origin: { kind: 'copy', from: a } }) })
    const graph = emptyGraph()
    startFile(graph, a, 'a', origin({ origin: { kind: 'copy', from: b } }))
    await expandAll(graph, read, () => false)

    expect(read.origin).toHaveBeenCalledTimes(1)
    expect(graph.boxes[b].from).toEqual([a])
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
    const from = (value: string) => origin({ origin: { kind: 'source' }, bucket_metadata: bakrep, identifiers: found(value) })
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
    const untitled = { database: true, identifiers: [] }
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
      bucket_metadata: { ...bakrep, title: 'Bakta database' },
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
    expect(folded.sources.map((node) => node.ids[0])).toEqual(['release:6', 'run:prep'])
    expect(folded.sources[1]!.sources[0]!.sources[0]!.ids).toEqual(['source:zenodo'])
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
    put(graph, 'db', 'file', ['release:6'])
    put(graph, 'release:6', 'database', ['source:zenodo'])
    put(graph, 'source:zenodo', 'source')
    graph.roots = ['dataset:d1']

    const [record] = intoRecord(graph, drawnChain(graph))
    expect(record!.sources.map((node) => [node.ids, node.repeat])).toEqual([[['run:r1'], false]])

    const full = chainColumns(graph, [record!], false)
    const place = (id: string) => full.cards.find((card) => card.node.ids[0] === id)
    expect(full.columns).toBe(5)
    expect(full.rows).toBe(2)
    expect(place('dataset:d1')).toMatchObject({ column: 4, row: 0.5, into: null })
    expect(place('run:r1')).toMatchObject({ column: 3, row: 0.5 })
    expect(place('genome')).toMatchObject({ column: 2, row: 0 })
    expect(place('source:zenodo')).toMatchObject({ column: 0, row: 1, into: place('release:6')!.id })

    put(graph, 'db', 'file', ['release:6', 'run:prep'])
    put(graph, 'run:prep', 'run', ['tarball'])
    put(graph, 'tarball', 'file')
    const halves = chainColumns(graph, intoRecord(graph, drawnChain(graph)), false)
    expect(halves.cards.every((card) => Number.isInteger(card.row * 2))).toBe(true)

    const direct = chainColumns(graph, [record!], true)
    expect(direct.cards.map((card) => card.node.ids[0])).toEqual(['genome', 'db', 'run:r1', 'dataset:d1'])
    expect(direct.cards.find((card) => card.node.ids[0] === 'db')).toMatchObject({ column: 0, open: false })

    // Opening the database card in place draws one step more; closing the run hides its inputs.
    const db = direct.cards.find((card) => card.node.ids[0] === 'db')!
    const run = direct.cards.find((card) => card.node.ids[0] === 'run:r1')!
    const opened = chainColumns(graph, [record!], true, new Map([[db.id, true]]))
    expect(opened.cards.map((card) => [card.node.ids[0], card.open])).toEqual([['genome', false], ['release:6', false], ['db', true], ['run:r1', true], ['dataset:d1', true]])
    const closed = chainColumns(graph, [record!], true, new Map([[run.id, false]]))
    expect(closed.cards.map((card) => card.node.ids[0])).toEqual(['run:r1', 'dataset:d1'])
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

