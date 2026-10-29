import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'
import type { NodeImports } from '@/composables/useNodeImports'
import NodeCards from './NodeCards.vue'

const node = (overrides: Partial<RealmNodeInfo> & { labels?: Record<string, string>; api?: string; load?: number } = {}): RealmNodeInfo => ({
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
    utilization: { storage_bytes_used: 2048, heartbeat_at_ms: 1, ...(overrides.load === undefined ? {} : { load_permille: overrides.load }) },
    updated_at_ms: 1,
  },
})

async function text(nodes: RealmNodeInfo[], imports = new Map<string, NodeImports>(), devices: RealmNodeInfo[] = [], extra: Record<string, unknown> = {}) {
  const html = await renderToString(createSSRApp({ render: () => h(NodeCards, { nodes, devices, imports, ...extra }) }))
  return html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('node cards', () => {
  it('names a node by its label, else by the first part of its API host, never by its id', async () => {
    expect(await text([node({ labels: { name: 'Giessen storage' } })])).toContain('Giessen storage')
    const shown = await text([node()])
    expect(shown).toContain('node-2')
    expect(shown).not.toContain('12D3KooW')
    expect(await text([node({ api: 'https://storage.example.org' })])).toContain('storage')
  })

  it('shows the state once, as one word, with one line of facts', async () => {
    const shown = await text([node({ load: 790 }), node({ node_id: 'b', present: false, api: 'https://api.node-3.example.org' })])
    expect(shown).toContain('node-2 online 2 KB stored, CPU 79%')
    expect(shown).toContain('node-3 offline 2 KB stored')
    expect(shown).not.toMatch(/connected/i)
  })

  it('tags the location, but not the default one, and names only roles other than server', async () => {
    const shown = await text([
      node({ labels: { 'aruna-engine.org/location': 'Giessen' } }),
      node({ node_id: 'm', kind: 'management', placement: { location: 'default', weight: 1, full: false, draining: false }, api: 'https://api.mgmt.example.org' }),
    ])
    expect(shown).toContain('node-2 Giessen online')
    expect(shown).toContain('mgmt management online')
    expect(shown).not.toContain('default')
    expect(shown).not.toContain('server')
  })

  it('marks a node that runs imports and sums devices in one line', async () => {
    const imports = new Map<string, NodeImports>([['12D3KooWHashHashHash', { running: 8, more: false }], ['b', { running: 0, more: false }]])
    const devices = [{ ...node({ kind: 'user' }), connection_status: 'seen' as const }, { ...node({ kind: 'user' }), connection_status: 'unknown' as const }]
    const shown = await text([node(), node({ node_id: 'b', api: 'https://api.node-3.example.org' })], imports, devices)
    expect(shown).toContain('Importing, 8 jobs')
    expect(shown.match(/Importing/g)).toHaveLength(1)
    expect(shown).toContain('2 devices, 1 active')
  })

  it('names the serving node, adds full or draining to the facts, and offers details on request', async () => {
    const full = node({ placement: { location: 'default', weight: 1, full: true, draining: true } })
    const other = node({ node_id: 'b', api: 'https://api.node-3.example.org' })
    expect(await text([full, other])).not.toContain('Details')

    const shown = await text([full, other], new Map(), [], { details: true, localNodeId: '12D3KooWHashHashHash', openId: 'b' })
    expect(shown).toContain('node-2 this node online 2 KB stored, full, draining Details')
    expect(shown).toContain('node-3 online 2 KB stored Hide details')
  })
})
