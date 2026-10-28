import { describe, expect, it, vi } from 'vitest'
import { ApiError, type OriginResponse } from '@/lib/api'
import { dataParts, emptyGraph, expand, expandAll, hasPending, runInputs, runRecordDetail, startDataset, startFile, type Readers } from './provenance'

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
    const database = graph.boxes['database:d1']
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
    expect(graph.boxes['database:d1'].identifiers).toEqual([])
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
