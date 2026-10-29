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
  vi.doMock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => realmNodes, THIS_COMPUTER: 'This computer' }))
  vi.doMock('@/lib/desktop', async () => ({
    ...(await vi.importActual<typeof import('@/lib/desktop')>('@/lib/desktop')),
    isDesktop: () => desktop,
  }))
  FederationPanel = (await import('./FederationPanel.vue')).default
})

function realmNode(nodeId: string, kind: string): Record<string, unknown> {
  return { node_id: nodeId, kind, configured: true, present: true, connection_status: 'connected' }
}

describe('topology', () => {
  const nodes = [realmNode('aaaa-mgmt-1111', 'management'), realmNode('bbbb-server-2222', 'server'), realmNode('cccc-server-3333', 'server')]
  const render = () => renderToString(createSSRApp({ render: () => h(FederationPanel, { nodes, localPeerId: 'aaaa-mgmt-1111' }) }))

  beforeEach(() => {
    desktop = false
  })

  it('draws a connected edge from the hub to every other node', async () => {
    expect((await render()).match(/class="fed-flow"/g)).toHaveLength(2)
  })

  it('shows only the map: no kind counts, label pills, node cards or counts the page states already', async () => {
    const text = (await render()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toContain('Node map')
    for (const gone of ['Kinds', 'Labels', 'present in DHT', 'replication', 'Node status', 'CONNECTED']) {
      expect(text).not.toContain(gone)
    }
  })

  it('names the realm node at the center in the desktop', async () => {
    desktop = true

    const html = await render()

    expect(html).toContain(', node-1</title>')
    expect(html).toMatch(/>\s*node-1\s*<\/text>/)
    expect(html).toContain('Connections as seen by node-1.')
    expect(html).not.toMatch(/>\s*this node\s*</)
    expect(html).not.toContain(', this node')
    expect(html).not.toContain('Edges show connections')
  })

  it('keeps this node and the portal footnote in the browser', async () => {
    const html = await render()

    expect(html).toContain(', this node</title>')
    expect(html).toMatch(/>\s*this node\s*<\/text>/)
    expect(html).toContain('Edges show connections as seen by the node serving this portal, not full mesh topology.')
    expect(html).not.toContain('Connections as seen by')
  })
})

describe('this computer', () => {
  const nodes = [realmNode('aaaa-mgmt-1111', 'management'), realmNode('bbbb-server-2222', 'server')]
  const render = (computer: unknown) =>
    renderToString(
      createSSRApp({ render: () => h(FederationPanel, { nodes, localPeerId: 'aaaa-mgmt-1111', computer }) }),
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
  })

  it('does not repeat "This computer" under a computer without its own name', async () => {
    const connected = await render({ id: laptop.id, name: 'This computer', peers: ['aaaa-mgmt-1111'] })
    expect(connected.match(/>\s*This computer\s*<\/text>/g)).toHaveLength(1)

    const away = await render({ id: laptop.id, name: 'This computer', peers: [] })
    expect(away).toMatch(/>\s*Not connected\s*<\/text>/)
  })

  it('dims it without lines when not connected', async () => {
    const html = await render({ ...laptop, peers: [] })

    expect(html).toMatch(/<g opacity="0.5"[^>]*><title[^>]*>Test-laptop!<\/title>/)
    expect(html).toContain('stroke-dasharray="2 2"')
    expect(html).not.toContain('stroke-dasharray="4 4"')
    expect(html).toMatch(/>\s*This computer, not connected\s*<\/text>/)
    expect(html).toContain('This computer is not connected right now.')
    expect(html).toContain('aria-label="Realm node topology. This computer, Test-laptop!, is not connected."')
  })

  it('cuts a long name', async () => {
    const name = 'research-workstation-in-room-4711.example.org'
    const html = await render({ id: laptop.id, name, peers: ['aaaa-mgmt-1111'] })

    expect(html).toMatch(/>\s*research-workstatio…\s*<\/text>/)
    expect(html).toContain(`>${name}</title>`)
    expect(html).toContain(`This computer, ${name}, is connected.`)

    const wide = await render({ id: laptop.id, name: 'W'.repeat(30), peers: ['aaaa-mgmt-1111'] })
    expect(wide).toMatch(new RegExp(`>\\s*${'W'.repeat(19)}…\\s*</text>`))
  })

  it('adds nothing when its own info is missing', async () => {
    const html = await render(null)

    expect(html).not.toContain('Test-laptop!')
    expect(html).not.toMatch(/>\s*This computer/)
  })

  it('stays out of the browser', async () => {
    desktop = false

    const html = await render({ ...laptop, peers: ['aaaa-mgmt-1111'] })

    expect(html).not.toContain('Test-laptop!')
    expect(html).not.toMatch(/>\s*This computer/)
  })
})
