import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'
import NodeDetailPanel from './NodeDetailPanel.vue'

const node: RealmNodeInfo = {
  node_id: 'server-node',
  kind: 'server',
  configured: true,
  present: true,
  connection_status: 'connected',
  placement: null,
  info: {
    executors: [],
    labels: { name: 'Giessen storage', 'aruna-engine.org/tier': 'hot' },
    urls: {},
    utilization: { storage_bytes_used: 1, heartbeat_at_ms: 1 },
    updated_at_ms: 1,
  },
}

describe('node details', () => {
  it('lists the labels and the browser latency, with kind and connection as plain words', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(NodeDetailPanel, { node, probe: { state: 'ok', latencyMs: 41.6 } as never }) }))
    const text = html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(text).toContain('Labels name=Giessen storage aruna-engine.org/tier=hot')
    expect(text).toContain('Latency 42 ms')
    expect(text).toContain('Kind server')
    expect(text).toContain('Connection connected')
    expect(html).not.toContain('uppercase">connected')
  })

  it('names the node first, with a rename for a realm admin', async () => {
    const plain = await renderToString(createSSRApp({ render: () => h(NodeDetailPanel, { node: { ...node, display_name: 'Giessen storage 1' } }) }))
    expect(plain.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).toContain('Name Giessen storage 1')
    expect(plain).not.toContain('Rename')

    const admin = await renderToString(createSSRApp({ render: () => h(NodeDetailPanel, { node, rename: async () => {} }) }))
    expect(admin).toContain('aria-label="Rename Giessen storage"')
  })
})
