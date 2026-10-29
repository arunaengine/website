import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'

// The interface list has its own tests; here only the panel's own lines count.
vi.mock('./LocalNodeDetails.vue', () => ({ default: { render: () => null } }))
const NodeDetailPanel = (await import('./NodeDetailPanel.vue')).default

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

  it('shows the node id itself with a copy button, never the display name', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(NodeDetailPanel, { node: { ...node, node_id: 'b4f1c0de9a7e44d1a3c5f0e2b7d9c8a1f3e5d7c9b1a3f5e7d9c1b3a5f7e9d1c3', display_name: 'Giessen storage 1' }, hideName: true }) }))
    const box = html.slice(html.indexOf('>Node id<'))
    // The id is the text people read and copy, not only a tooltip.
    const shown = box.replace(/<[^>]+>/g, ' ')
    expect(shown).toContain('b4f1c0de9a7e44d1a3c5f0e2b7d9c8a1f3e5d7c9b1a3f5e7d9c1b3a5f7e9d1c3')
    expect(shown).not.toContain('Giessen storage 1')
    expect(box).toContain('aria-label="Copy node id"')
  })

  it('names the node status only when it is a problem, and hides a "default" location', async () => {
    const info = { node: { status: 'available' } } as never
    const placed = { ...node, placement: { location: 'default', weight: 100, full: false, draining: false } }
    const fine = await renderToString(createSSRApp({ render: () => h(NodeDetailPanel, { node: placed, probe: { state: 'ok', info } as never }) }))
    const text = fine.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).not.toMatch(/available/i)
    expect(text).not.toContain('default')
    expect(text).toContain('Weight 100')
    expect(text).toContain('Draining no')

    const draining = await renderToString(createSSRApp({ render: () => h(NodeDetailPanel, { node, probe: { state: 'ok', info: { node: { status: 'draining' } } } as never }) }))
    expect(draining.replace(/<[^>]+>/g, ' ')).toContain('draining')
  })
})
