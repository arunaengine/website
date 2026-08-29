import { describe, expect, it, vi } from 'vitest'
import { renderTools, type RenderHost } from './renderTools'
import type { RenderView } from './types'
import { runTool } from '@/test/aiTool'

function harness(crate: unknown = null) {
  const kept: Array<[string, RenderView]> = []
  const host: RenderHost = {
    keep: (id, view) => kept.push([id, view]),
    loadCrate: vi.fn(async () => crate),
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
    const { tools } = harness()
    const failing = renderTools({ keep: vi.fn(), loadCrate: async () => { throw new Error('gone') } })
    expect(await runTool(failing.show_crate, { document_id: 'doc-x' })).toEqual({ error: 'gone' })
    expect(await runTool(tools.show_crate, {})).toMatchObject({ error: expect.any(String) })
  })
})
