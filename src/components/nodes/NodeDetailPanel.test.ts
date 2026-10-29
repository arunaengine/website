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
  it('folds the labels, shows the browser latency, and leaves role and state to the card or page', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(NodeDetailPanel, { node, probe: { state: 'ok', latencyMs: 41.6 } as never }) }))
    const text = html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>Labels \(2\)<\/summary>/)
    expect(text).toContain('name=Giessen storage aruna-engine.org/tier=hot')
    expect(text).toContain('Latency 42 ms')
    for (const repeated of ['Kind', 'Connection', 'Present']) expect(text).not.toContain(repeated)
  })

  it('leaves the name to the page header when asked', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(NodeDetailPanel, { node, hideName: true }) }))
    expect(html).not.toContain('>Name<')
  })

  it('names the node first, with a rename for a realm admin', async () => {
    const plain = await renderToString(createSSRApp({ render: () => h(NodeDetailPanel, { node: { ...node, display_name: 'Giessen storage 1' } }) }))
    expect(plain.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).toContain('Name Giessen storage 1')
    expect(plain).not.toContain('Rename')

    const admin = await renderToString(createSSRApp({ render: () => h(NodeDetailPanel, { node, rename: async () => {} }) }))
    expect(admin).toContain('aria-label="Rename Giessen storage"')
  })
})
