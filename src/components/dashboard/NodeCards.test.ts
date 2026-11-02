import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'
import NodeCards from './NodeCards.vue'

// Links render as anchors naming where they go.
vi.mock('vue-router', async () => {
  const { defineComponent, h } = await import('vue')
  return { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) }) }
})

type Overrides = Partial<RealmNodeInfo> & { labels?: Record<string, string>; api?: string; load?: number; jobs?: number; imports?: number }
const node = (overrides: Overrides = {}): RealmNodeInfo => ({
  node_id: overrides.node_id ?? '12D3KooWHashHashHash',
  kind: overrides.kind ?? 'server',
  configured: true,
  present: overrides.present ?? true,
  connection_status: 'connected',
  placement: overrides.placement ?? null,
  info: {
    executors: [],
    labels: overrides.labels ?? {},
    urls: { api: overrides.api ?? 'https://api.node-2.v3-debug.example.org' },
    utilization: {
      storage_bytes_used: 2048,
      heartbeat_at_ms: 1,
      ...(overrides.load === undefined ? {} : { load_permille: overrides.load }),
      ...(overrides.jobs === undefined ? {} : { jobs_running: overrides.jobs }),
      ...(overrides.imports === undefined ? {} : { imports_running: overrides.imports }),
    },
    updated_at_ms: 1,
  },
})

async function text(nodes: RealmNodeInfo[], devices: RealmNodeInfo[] = [], extra: Record<string, unknown> = {}) {
  const html = await renderToString(createSSRApp({ render: () => h(NodeCards, { nodes, devices, ...extra }) }))
  return html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('node cards', () => {
  it('names a node by its label, else by the first part of its API host, never by its id', async () => {
    expect(await text([node({ labels: { name: 'Giessen storage' } })])).toContain('Giessen storage')
    expect(await text([{ ...node({ labels: { name: 'old label' } }), display_name: 'Giessen storage 1' }])).toContain('Giessen storage 1')
    const shown = await text([node()])
    expect(shown).toContain('node-2')
    expect(shown).not.toContain('12D3KooW')
    expect(await text([node({ api: 'https://storage.example.org' })])).toContain('storage')
  })

  it('marks an online node with a check and names only an offline one, with one line of facts', async () => {
    const shown = await text([node({ load: 790 }), node({ node_id: 'b', present: false, api: 'https://api.node-3.example.org' })])
    expect(shown).toContain('node-2 2 KiB stored, CPU 79%')
    expect(shown).toContain('node-3 Offline 2 KiB stored')
    expect(shown).not.toMatch(/connected/i)
  })

  it('tags the location, but not the default one, and names a role other than storage in the facts', async () => {
    const shown = await text([
      node({ labels: { 'aruna-engine.org/location': 'Giessen' } }),
      node({ node_id: 'm', kind: 'management', placement: { location: 'default', weight: 1, full: false, draining: false }, api: 'https://api.mgmt.example.org' }),
    ])
    expect(shown).toContain('node-2 Giessen 2 KiB stored')
    // The header keeps only name and state, so a long name has room.
    expect(shown).toContain('mgmt Management node, 2 KiB stored')
    expect(shown).not.toContain('default')
    expect(shown).not.toContain('server')
  })

  it('marks what a node runs from its heartbeat, imports first, and sums devices in one line', async () => {
    const devices = [{ ...node({ kind: 'user' }), connection_status: 'seen' as const }, { ...node({ kind: 'user' }), connection_status: 'unknown' as const }]
    const shown = await text([
      node({ jobs: 10, imports: 8 }),
      node({ node_id: 'b', api: 'https://api.node-3.example.org', jobs: 1, imports: 0 }),
      node({ node_id: 'c', api: 'https://api.node-4.example.org', jobs: 0, imports: 0 }),
      node({ node_id: 'd', api: 'https://api.node-5.example.org' }),
    ], devices)
    expect(shown).toContain('node-2 2 KiB stored Importing, 8 jobs')
    expect(shown).toContain('node-3 2 KiB stored Busy, 1 job')
    // No count, or a zero, shows nothing.
    expect(shown).toContain('node-4 2 KiB stored node-5')
    expect(shown.match(/Importing|Busy/g)).toHaveLength(2)
    expect(shown).toContain('2 devices, 1 active')
  })

  it('names the serving node, adds full or draining to the facts, and offers details on request', async () => {
    const full = node({ placement: { location: 'default', weight: 1, full: true, draining: true } })
    const other = node({ node_id: 'b', api: 'https://api.node-3.example.org' })
    expect(await text([full, other])).not.toContain('Details')

    const shown = await text([full, other], [], { details: true, localNodeId: '12D3KooWHashHashHash' })
    expect(shown).toContain('node-2 This node 2 KiB stored, full, draining Details')
    expect(shown).toContain('node-3 2 KiB stored Details')
  })

  it('offers a rename on each card only when renaming is allowed', async () => {
    expect(await renderToString(createSSRApp({ render: () => h(NodeCards, { nodes: [node()], devices: [] }) }))).not.toContain('Rename')
    const html = await renderToString(createSSRApp({ render: () => h(NodeCards, { nodes: [node()], devices: [], rename: async () => {} }) }))
    expect(html).toContain('aria-label="Rename node-2"')
    // The Pencil stays visible; it never waits for hover.
    expect(html).not.toContain('opacity-0')
  })

  it('links each name to its node page', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(NodeCards, { nodes: [node()], devices: [] }) }))
    expect(html).toContain(`data-to="${JSON.stringify({ name: 'node', params: { nodeId: '12D3KooWHashHashHash' } }).replace(/"/g, '&quot;')}"`)
  })
})
