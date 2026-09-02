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
