import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const RouterLinkStub = defineComponent((_, { slots }) => () => h('a', slots.default?.()))
const names: Record<string, string> = { 'aaaa-mgmt-1111': 'node-1' }
const realmNodes = {
  nodeById: (nodeId: string) => (names[nodeId] ? { nodeId, label: names[nodeId] } : null),
  displayName: (nodeId: string) => names[nodeId] ?? nodeId,
}
let desktop = false
let FederationPanel: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({
    RouterLink: RouterLinkStub,
    useRouter: () => ({ push: vi.fn() }),
  }))
  vi.doMock('@vueuse/core', () => ({ useNow: () => ref(new Date(0)) }))
  vi.doMock('@/components/ui/Badge.vue', () => ({ default: BadgeStub }))
  vi.doMock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => realmNodes }))
  vi.doMock('@/lib/desktop', async () => ({
    ...(await vi.importActual<typeof import('@/lib/desktop')>('@/lib/desktop')),
    isDesktop: () => desktop,
  }))
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

describe('topology', () => {
  const nodes = [realmNode('aaaa-mgmt-1111', 'management'), realmNode('bbbb-server-2222', 'server'), realmNode('cccc-server-3333', 'server')]
  const render = () => renderToString(createSSRApp({ render: () => h(FederationPanel, { nodes, localPeerId: 'aaaa-mgmt-1111' }) }))

  beforeEach(() => {
    desktop = false
  })

  it('draws a connected edge from the hub to every other node', async () => {
    expect((await render()).match(/class="fed-flow"/g)).toHaveLength(2)
  })

  it('names the realm node at the center in the desktop', async () => {
    desktop = true

    const html = await render()

    expect(html).toContain('· node-1</title>')
    expect(html).toMatch(/>\s*node-1\s*<\/text>/)
    expect(html).toContain('Connections as seen by node-1.')
    expect(html).not.toMatch(/>\s*this node\s*</)
    expect(html).not.toContain('· this node')
    expect(html).not.toContain('Edges show connections')
  })

  it('keeps this node and the portal footnote in the browser', async () => {
    const html = await render()

    expect(html).toContain('· this node</title>')
    expect(html).toMatch(/>\s*this node\s*<\/text>/)
    expect(html).toContain('Edges show connections as seen by the node serving this portal, not full mesh topology.')
    expect(html).not.toContain('Connections as seen by')
  })
})

describe('this computer', () => {
  const nodes = [realmNode('aaaa-mgmt-1111', 'management'), realmNode('bbbb-server-2222', 'server')]
  const devices = [device('dddd-device-4444', 'seen')]
  const render = (computer: unknown) =>
    renderToString(
      createSSRApp({ render: () => h(FederationPanel, { nodes, devices, localPeerId: 'aaaa-mgmt-1111', computer }) }),
    )
  const laptop = { id: 'dddd-device-4444', name: 'Test-laptop!' }

  beforeEach(() => {
    desktop = true
  })

  it('draws one quiet line to each connected realm node', async () => {
    const html = await render({ ...laptop, peers: ['aaaa-mgmt-1111', 'ffff-unknown-9999'] })

    expect(html).toMatch(/>\s*Test-laptop!\s*<\/text>/)
    expect(html).toMatch(/>\s*This computer\s*<\/text>/)
    expect(html.match(/stroke-dasharray="4 4"/g)).toHaveLength(1)
    expect(html.match(/class="fed-flow"/g)).toHaveLength(1)
    expect(html).toContain('This computer shows its own.')
    expect(html).toContain('aria-label="Realm node topology. This computer, Test-laptop!, is connected."')
    expect(html).toContain('1 enrolled, 1 active')
  })

  it('dims it without lines when not connected', async () => {
    const html = await render({ ...laptop, peers: [] })

    expect(html).toMatch(/<g opacity="0.5"[^>]*><title[^>]*>Test-laptop!<\/title>/)
    expect(html).toContain('stroke-dasharray="2 2"')
    expect(html).not.toContain('stroke-dasharray="4 4"')
    expect(html).toMatch(/>\s*This computer, not connected\s*<\/text>/)
    expect(html).toContain('This computer is not connected right now.')
    expect(html).toContain('aria-label="Realm node topology. This computer, Test-laptop!, is not connected."')
    expect(html).toContain('1 enrolled, 0 active')
  })

  it('adds nothing when its own info is missing', async () => {
    const html = await render(null)

    expect(html).not.toContain('Test-laptop!')
    expect(html).not.toMatch(/>\s*This computer/)
    expect(html).toContain('1 enrolled, 1 active')
  })

  it('stays out of the browser', async () => {
    desktop = false

    const html = await render({ ...laptop, peers: ['aaaa-mgmt-1111'] })

    expect(html).not.toContain('Test-laptop!')
    expect(html).not.toMatch(/>\s*This computer/)
  })
})
