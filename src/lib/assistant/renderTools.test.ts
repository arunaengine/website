import { describe, expect, it, vi } from 'vitest'
import { renderTools, type ArtifactRef, type LoadedArtifact, type RenderHost } from './renderTools'
import type { RenderView } from './types'
import { runTool } from '@/test/aiTool'

function harness(crate: unknown = null, artifact: Partial<LoadedArtifact> = {}) {
  const kept: Array<[string, RenderView]> = []
  const host: RenderHost = {
    keep: (id, view) => kept.push([id, view]),
    loadCrate: vi.fn(async () => crate),
    loadArtifact: vi.fn(async (ref: ArtifactRef): Promise<LoadedArtifact> => ({
      url: 'blob:aruna/object',
      contentType: ref.contentType ?? 'application/octet-stream',
      kind: 'download',
      name: ref.filename ?? ref.key,
      ...artifact,
    })),
  }
  return { tools: renderTools(host), kept, host }
}

describe('show_table', () => {
  it('keeps the table on the call and answers a short acknowledgement', async () => {
    const { tools, kept } = harness()
    const output = await runTool(tools.show_table, {
      title: 'Buckets',
      columns: ['Name', 'Objects'],
      rows: [['raw', 12], ['derived', 3]],
    }, 'call-7')

    expect(output).toEqual({ shown: true, rows: 2, truncated: false })
    expect(kept).toEqual([['call-7', { kind: 'table', title: 'Buckets', columns: ['Name', 'Objects'], rows: [['raw', 12], ['derived', 3]] }]])
  })

  it('refuses a table without columns', async () => {
    const { tools, kept } = harness()
    expect(await runTool(tools.show_table, { title: 'x', columns: [], rows: [] })).toMatchObject({ error: expect.any(String) })
    expect(kept).toEqual([])
  })
})

describe('show_chart', () => {
  it('names unnamed series and trims values to the labels', async () => {
    const { tools, kept } = harness()
    await runTool(tools.show_chart, {
      title: 'Usage',
      kind: 'bar',
      labels: ['Jan', 'Feb'],
      series: [{ values: [1, 2, 3] }],
    })

    expect(kept[0][1]).toEqual({
      kind: 'chart',
      title: 'Usage',
      chart: 'bar',
      labels: ['Jan', 'Feb'],
      series: [{ name: 'Series 1', values: [1, 2] }],
    })
  })

  it('refuses a series that is not numbers', async () => {
    const { tools } = harness()
    const output = await runTool(tools.show_chart, {
      title: 'x',
      kind: 'line',
      labels: ['a'],
      series: [{ values: ['many'] }],
    })
    expect(output).toMatchObject({ error: expect.stringContaining('finite number') })
  })
})

describe('show_stats', () => {
  it('turns every value into text and drops unlabelled tiles', async () => {
    const { tools, kept } = harness()
    await runTool(tools.show_stats, { title: 'Totals', items: [{ label: 'Objects', value: 12, hint: 'in 2 buckets' }, { label: '', value: 1 }] })

    expect(kept[0][1]).toEqual({ kind: 'stats', title: 'Totals', items: [{ label: 'Objects', value: '12', hint: 'in 2 buckets' }] })
  })
})

describe('show_crate', () => {
  const crate = {
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
      { '@id': './', '@type': 'Dataset', name: 'Reads 2026' },
    ],
  }

  it('fetches a stored dataset by id and names it in the answer', async () => {
    const { tools, kept, host } = harness(crate)
    const output = await runTool(tools.show_crate, { document_id: 'doc-1' })

    expect(host.loadCrate).toHaveBeenCalledWith('doc-1')
    expect(output).toEqual({ shown: true, name: 'Reads 2026', document_id: 'doc-1' })
    expect(kept[0][1]).toMatchObject({ kind: 'crate', title: 'Reads 2026', documentId: 'doc-1' })
  })

  it('shows a crate handed over inline', async () => {
    const { tools, kept } = harness()
    expect(await runTool(tools.show_crate, { rocrate: crate })).toEqual({ shown: true, name: 'Reads 2026' })
    expect(kept[0][1]).toMatchObject({ kind: 'crate', crate })
  })

  it('reports a failed fetch instead of throwing', async () => {
    const { tools, host } = harness()
    const failing = renderTools({
      keep: vi.fn(),
      loadCrate: async () => { throw new Error('gone') },
      loadArtifact: host.loadArtifact,
    })
    expect(await runTool(failing.show_crate, { document_id: 'doc-x' })).toEqual({ error: 'gone' })
    expect(await runTool(tools.show_crate, {})).toMatchObject({ error: expect.any(String) })
  })
})

describe('show_job', () => {
  it('keeps the job card and answers without repeating the status', async () => {
    const { tools, kept } = harness()
    const output = await runTool(tools.show_job, {
      job_id: 'job-1',
      state: 'succeeded',
      title: 'gc analysis',
      kind: 'execution',
      submitted_at: '2026-09-04T10:00:00Z',
      finished_at: '2026-09-04T10:02:00Z',
      node_id: 'node-2',
      attempts: 1,
      outputs: [{ bucket: 'lorem', key: 'results/gc.json', size: 82 }, { bucket: 'lorem', key: '' }],
    }, 'call-3')

    expect(output).toEqual({ shown: true, state: 'succeeded', outputs: 1 })
    expect(kept[0]).toEqual(['call-3', {
      kind: 'job',
      title: 'gc analysis',
      jobId: 'job-1',
      state: 'succeeded',
      jobKind: 'execution',
      submittedAt: '2026-09-04T10:00:00Z',
      finishedAt: '2026-09-04T10:02:00Z',
      nodeId: 'node-2',
      attempts: 1,
      outputs: [{ bucket: 'lorem', key: 'results/gc.json', size: 82 }],
    }])
  })

  it('names a job that came without a title and keeps its failure', async () => {
    const { tools, kept } = harness()
    await runTool(tools.show_job, { job_id: 'job-9', state: 'failed', error: 'exit code 1' })

    expect(kept[0][1]).toEqual({
      kind: 'job',
      title: 'Job job-9',
      jobId: 'job-9',
      state: 'failed',
      error: 'exit code 1',
      outputs: [],
    })
  })

  it('refuses a job card without a state', async () => {
    const { tools, kept } = harness()
    expect(await runTool(tools.show_job, { job_id: 'job-1', state: ' ' })).toMatchObject({
      error: expect.stringContaining('get_job'),
    })
    expect(kept).toEqual([])
  })
})

describe('show_object', () => {
  it('keeps the object card with only the facts it was given', async () => {
    const { tools, kept } = harness()
    const output = await runTool(tools.show_object, {
      bucket: 'test',
      key: 'notes/hello.txt',
      caption: 'Created',
      size: 24,
      content_type: 'text/plain; charset=utf-8',
      version_id: '01M1NXGE23RMY4RFBRBYTQDWDS',
      last_modified: ' ',
    }, 'call-3')

    expect(output).toEqual({ shown: true })
    expect(kept).toEqual([['call-3', {
      kind: 'object',
      bucket: 'test',
      key: 'notes/hello.txt',
      caption: 'Created',
      contentType: 'text/plain; charset=utf-8',
      versionId: '01M1NXGE23RMY4RFBRBYTQDWDS',
      size: 24,
    }]])
  })

  it('refuses an object card without a key', async () => {
    const { tools, kept } = harness()
    expect(await runTool(tools.show_object, { bucket: 'test', key: ' ' })).toMatchObject({
      error: expect.any(String),
    })
    expect(kept).toEqual([])
  })
})

describe('show_artifact', () => {
  it('shows a png as an image card and answers without its bytes', async () => {
    const { tools, kept, host } = harness(null, {
      url: 'blob:aruna/chart',
      contentType: 'image/png',
      kind: 'image',
      name: 'chart.png',
      size: 4096,
    })

    const output = await runTool(tools.show_artifact, {
      bucket: 'work',
      key: 'results/run-1/chart.png',
      version_id: 'v-1',
      job_id: 'job-1',
      content_type: 'image/png',
      caption: 'Reads per day',
    }, 'call-9')

    expect(host.loadArtifact).toHaveBeenCalledWith({
      bucket: 'work',
      key: 'results/run-1/chart.png',
      versionId: 'v-1',
      contentType: 'image/png',
    })
    expect(output).toEqual({ shown: true, content_type: 'image/png', kind: 'image' })
    expect(kept).toEqual([['call-9', {
      kind: 'artifact',
      title: 'chart.png',
      caption: 'Reads per day',
      artifact: {
        url: 'blob:aruna/chart',
        contentType: 'image/png',
        previewKind: 'image',
        name: 'chart.png',
        size: 4096,
        bucket: 'work',
        key: 'results/run-1/chart.png',
        versionId: 'v-1',
        jobId: 'job-1',
      },
    }]])
  })

  it('shows a json output as text', async () => {
    const { tools, kept } = harness(null, {
      url: 'blob:aruna/summary',
      contentType: 'application/json',
      kind: 'text',
      name: 'summary.json',
      size: 82,
    })

    const output = await runTool(tools.show_artifact, { bucket: 'work', key: 'out/summary.json' })

    expect(output).toEqual({ shown: true, content_type: 'application/json', kind: 'text' })
    expect(kept[0][1]).toMatchObject({ kind: 'artifact', artifact: { previewKind: 'text' } })
  })

  it('keeps an artifact the host capped as a download row', async () => {
    const { tools, kept } = harness(null, {
      url: 'https://s3.node.test/work/big.tif?signature',
      contentType: 'image/tiff',
      kind: 'download',
      name: 'big.tif',
      size: 60 * 1024 * 1024,
    })

    const output = await runTool(tools.show_artifact, { bucket: 'work', key: 'big.tif' })

    expect(output).toEqual({ shown: true, content_type: 'image/tiff', kind: 'download' })
    expect(kept[0][1]).toMatchObject({ artifact: { previewKind: 'download', size: 60 * 1024 * 1024 } })
  })

  it('carries the endpoint and node hints of a job output', async () => {
    const { tools, host } = harness(null, { kind: 'image', contentType: 'image/png', name: 'plot.png' })

    await runTool(tools.show_artifact, {
      bucket: 'work',
      key: 'plot.png',
      node_id: 'node-2',
      endpoint_url: 'https://s3.node.test',
      filename: 'plot.png',
      size: 12,
    })

    expect(host.loadArtifact).toHaveBeenCalledWith({
      bucket: 'work',
      key: 'plot.png',
      nodeId: 'node-2',
      endpointUrl: 'https://s3.node.test',
      filename: 'plot.png',
      size: 12,
    })
  })

  it('refuses a reference without a bucket or key and reports a failed read', async () => {
    const { tools, kept } = harness()
    expect(await runTool(tools.show_artifact, { bucket: ' ', key: 'x' })).toMatchObject({ error: expect.any(String) })
    expect(kept).toEqual([])

    const failing = renderTools({
      keep: vi.fn(),
      loadCrate: vi.fn(),
      loadArtifact: async () => { throw new Error('no S3 session') },
    })
    expect(await runTool(failing.show_artifact, { bucket: 'work', key: 'a.png' })).toEqual({ error: 'no S3 session' })
  })
})

describe('show_tree', () => {
  it('keeps the entries and the bucket the files link through', async () => {
    const { tools, kept } = harness()
    const output = await runTool(tools.show_tree, {
      title: 'Raw reads',
      bucket: 'lorem',
      entries: [
        { path: 'reads/', kind: 'folder' },
        { path: '/reads/a.fastq', kind: 'file', size: 900 },
        { path: '  ', kind: 'file' },
      ],
    }, 'call-9')

    expect(output).toEqual({ shown: true, entries: 2, truncated: false })
    expect(kept).toEqual([['call-9', {
      kind: 'tree',
      title: 'Raw reads',
      bucket: 'lorem',
      entries: [{ path: 'reads', kind: 'folder' }, { path: 'reads/a.fastq', kind: 'file', size: 900 }],
    }]])
  })

  it('caps a huge listing and says how much it left out', async () => {
    const { tools, kept } = harness()
    const entries = Array.from({ length: 620 }, (_, index) => ({ path: `p/${index}.txt`, kind: 'file' }))
    const output = await runTool(tools.show_tree, { title: 'All', entries })

    expect(output).toEqual({ shown: true, entries: 500, truncated: true })
    expect(kept[0][1]).toMatchObject({ dropped: 120 })
  })

  it('refuses a tree without a usable path', async () => {
    const { tools, kept } = harness()
    expect(await runTool(tools.show_tree, { title: 'x', entries: [{ path: '/', kind: 'file' }] }))
      .toMatchObject({ error: expect.any(String) })
    expect(kept).toEqual([])
  })
})

describe('show_timeline', () => {
  it('orders events and takes a time as ISO or milliseconds', async () => {
    const { tools, kept } = harness()
    const output = await runTool(tools.show_timeline, {
      title: 'Job history',
      events: [
        { at: '2026-09-04T10:05:00Z', label: 'Finished', state: 'succeeded' },
        { at: 1_756_982_700_000, label: 'Started', detail: 'on node-2' },
        { at: 'whenever', label: 'Dropped' },
      ],
    }, 'call-4')

    expect(output).toEqual({ shown: true, events: 2, truncated: false })
    expect(kept[0][1]).toEqual({
      kind: 'timeline',
      title: 'Job history',
      events: [
        { at: '2025-09-04T10:45:00.000Z', label: 'Started', detail: 'on node-2' },
        { at: '2026-09-04T10:05:00.000Z', label: 'Finished', state: 'succeeded' },
      ],
    })
  })

  it('caps a long history', async () => {
    const { tools, kept } = harness()
    const events = Array.from({ length: 260 }, (_, index) => ({ at: 1_000 + index, label: `Step ${index}` }))
    const output = await runTool(tools.show_timeline, { title: 'Sync', events })

    expect(output).toEqual({ shown: true, events: 200, truncated: true })
    expect((kept[0][1] as { events: unknown[] }).events).toHaveLength(200)
  })

  it('refuses a timeline whose events carry no usable time', async () => {
    const { tools, kept } = harness()
    expect(await runTool(tools.show_timeline, { title: 'x', events: [{ at: 'soon', label: 'a' }] }))
      .toMatchObject({ error: expect.any(String) })
    expect(kept).toEqual([])
  })
})

describe('show_code', () => {
  it('keeps the block and lowercases the language', async () => {
    const { tools, kept } = harness()
    const output = await runTool(tools.show_code, {
      title: 'GC script',
      language: 'Python',
      code: 'print(1)\n',
      caption: 'Writes gc.json',
    }, 'call-5')

    expect(output).toEqual({ shown: true, truncated: false })
    expect(kept).toEqual([['call-5', {
      kind: 'code',
      title: 'GC script',
      language: 'python',
      code: 'print(1)\n',
      caption: 'Writes gc.json',
    }]])
  })

  it('cuts an oversized block and says so', async () => {
    const { tools, kept } = harness()
    const output = await runTool(tools.show_code, { title: 'x', language: 'text', code: 'a'.repeat(24_000) })

    expect(output).toEqual({ shown: true, truncated: true })
    expect((kept[0][1] as { code: string }).code).toHaveLength(20_000)
  })

  it('refuses an empty block', async () => {
    const { tools, kept } = harness()
    expect(await runTool(tools.show_code, { title: 'x', language: 'python', code: '   ' }))
      .toMatchObject({ error: expect.any(String) })
    expect(kept).toEqual([])
  })
})

describe('show_diff', () => {
  it('keeps both texts with a label for each side', async () => {
    const { tools, kept } = harness()
    const output = await runTool(tools.show_diff, {
      title: 'Config change',
      before: 'a\nb',
      after: 'a\nc',
      after_label: 'Version 2',
    }, 'call-6')

    expect(output).toEqual({ shown: true, changed: true })
    expect(kept).toEqual([['call-6', {
      kind: 'diff',
      title: 'Config change',
      before: 'a\nb',
      after: 'a\nc',
      beforeLabel: 'Before',
      afterLabel: 'Version 2',
    }]])
  })

  it('compares only the first lines of a long text', async () => {
    const { tools, kept } = harness()
    const before = Array.from({ length: 400 }, (_, index) => `line ${index}`).join('\n')
    await runTool(tools.show_diff, { title: 'x', before, after: 'line 0' })

    expect((kept[0][1] as { before: string }).before.split('\n')).toHaveLength(300)
  })

  it('refuses a comparison with nothing on either side', async () => {
    const { tools, kept } = harness()
    expect(await runTool(tools.show_diff, { title: 'x', before: '', after: '' }))
      .toMatchObject({ error: expect.any(String) })
    expect(kept).toEqual([])
  })
})
