import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const RouterLinkStub = defineComponent((_, { slots }) => () => h('a', slots.default?.()))
let FederationPanel: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({
    RouterLink: RouterLinkStub,
    useRouter: () => ({ push: vi.fn() }),
  }))
  vi.doMock('@vueuse/core', () => ({ useNow: () => ref(new Date(0)) }))
  vi.doMock('@/components/ui/Badge.vue', () => ({ default: BadgeStub }))
  FederationPanel = (await import('./FederationPanel.vue')).default
})

async function renderReplication(replicationFactor?: number | null): Promise<string> {
  const app = createSSRApp({
    render: () => h(FederationPanel, { nodes: [], replicationFactor }),
  })
  const html = await renderToString(app)
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function realmNode(nodeId: string, kind: string): Record<string, unknown> {
  return { node_id: nodeId, kind, configured: true, present: true, connection_status: 'connected' }
}

function device(nodeId: string, status: string, lastSeenMs?: number): Record<string, unknown> {
  return { node_id: nodeId, kind: 'user', configured: true, present: false, connection_status: status, last_seen_ms: lastSeenMs }
}

describe('devices in the realm', () => {
  it('summarizes them instead of drawing them as nodes', async () => {
    const app = createSSRApp({
      render: () =>
        h(FederationPanel, {
          nodes: [realmNode('aaaa-server-1111', 'server')],
          devices: [device('bbbb-device-2222', 'seen', 1_700_000_000_000)],
        }),
    })

    const html = await renderToString(app)

    expect(html).not.toContain('bbbb')
    expect(html).toContain('1 enrolled, 1 active')
  })

  it('counts a device it has never heard from as inactive', async () => {
    const app = createSSRApp({
      render: () =>
        h(FederationPanel, {
          nodes: [realmNode('aaaa-server-1111', 'server')],
          devices: [device('cccc-device-3333', 'unknown')],
        }),
    })

    expect(await renderToString(app)).toContain('1 enrolled, 0 active')
  })
})

describe('replication policy rendering', () => {
  it('renders a null default as all eligible nodes', async () => {
    const text = await renderReplication(null)
    expect(text).toContain('replication all eligible nodes')
    expect(text).not.toContain('replication ×1')
  })

  it('renders an absent default as unknown', async () => {
    expect(await renderReplication()).toContain('replication unknown')
  })
})
