import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocationAggregate } from '@/lib/placement'

const source = readFileSync(fileURLToPath(new URL('./StatusView.vue', import.meta.url)), 'utf8')

const realm = ref({ id: 'realm-id', name: 'Test realm', description: 'Public research data', color: '#08216C' })
const realmInfo = ref<Record<string, any> | null>(null)
const nodeInfo = ref<Record<string, unknown> | null>(null)
const usageInfo = ref<Record<string, unknown> | null>(null)
const currentUser = ref<Record<string, unknown> | null>(null)
const apiBaseUrl = ref('http://127.0.0.1:8080/api/v1')
const loadInfo = vi.fn(async () => undefined)

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const BadgeStub = defineComponent({
  props: { variant: String },
  setup: (_, { slots }) => () => h('span', slots.default?.()),
})
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), slots.actions?.()]),
})
const AggregatesStub = defineComponent({
  props: { aggregates: { type: Array, default: () => [] } },
  setup: (props) => () =>
    h('div', (props.aggregates as LocationAggregate[]).map((a) => `${a.location}=${a.nodeCount}`).join(' ')),
})

let StatusView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({
    useRoute: () => ({ query: {} }),
    useRouter: () => ({ push: vi.fn() }),
    RouterLink: defineComponent((_, { slots }) => () => h('a', slots.default?.())),
  }))
  vi.doMock('@/composables/useAruna', () => ({
    useAruna: () => ({ realm, realmInfo, nodeInfo, usageInfo, currentUser, apiBaseUrl, loadInfo, sessionEpoch: ref(0), loadRealmView: vi.fn(async () => null), isRealmAdmin: ref(false) }),
  }))
  vi.doMock('@vueuse/core', () => ({
    useDocumentVisibility: () => ref('hidden'),
    useIntervalFn: () => ({ pause: vi.fn(), resume: vi.fn() }),
  }))
  vi.doMock('@/components/dashboard/PageHeader.vue', () => ({ default: PageHeaderStub }))
  vi.doMock('@/components/ui/Button.vue', () => ({ default: ButtonStub }))
  vi.doMock('@/components/ui/Badge.vue', () => ({ default: BadgeStub }))
  vi.doMock('@/components/ui/CopyButton.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/nodes/LocalNodeDetails.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/nodes/NodeDialog.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/placement/LocationAggregates.vue', () => ({ default: AggregatesStub }))
  vi.doMock('@/composables/useNodeNames', () => ({ useNodeNames: () => ({ renameNode: vi.fn() }) }))
  vi.doMock('@/composables/useDeviceStatus', () => ({ useDeviceStatus: () => ({ identity: ref(null) }) }))
  vi.doMock('@/components/dashboard/RealmTopology.vue', () => ({
    default: defineComponent({ props: { nodes: Array }, setup: (props) => () => h('div', `node map ${props.nodes?.length}`) }),
  }))
  StatusView = (await import('./StatusView.vue')).default
})

beforeEach(() => {
  realmInfo.value = { metadata_replication: { default_replication_factor: 2 }, nodes: [] }
  nodeInfo.value = null
  usageInfo.value = null
  currentUser.value = null
  loadInfo.mockClear()
})

async function renderedText(): Promise<string> {
  const html = await renderToString(createSSRApp(StatusView))
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('realm node map', () => {
  it('shows the node map to a signed-in user, the one the dashboard no longer shows', async () => {
    realmInfo.value = { metadata_replication: { default_replication_factor: 3 }, nodes: [
      { node_id: 'server-node', kind: 'server', configured: true, present: true, connection_status: 'connected', placement: { location: 'eu-west', weight: 1, full: false, draining: false } },
      { node_id: 'laptop-beta', kind: 'user', owner: 'user-2', configured: true, present: false, connection_status: 'unknown' },
    ] }
    expect(await renderedText()).not.toContain('node map')

    currentUser.value = { id: 'u1' }
    expect(await renderedText()).toContain('node map 1')
  })
})

describe('realm node cards', () => {
  it('says each fact once: one state word, no kind badges, no connection pills, details on request', async () => {
    currentUser.value = { id: 'u1' }
    nodeInfo.value = { node: { peer_id: 'server-node', status: 'healthy' }, services: { interfaces: { rest: { status: 'ok' }, s3: { status: 'ok' }, grpc: { status: 'ok' } } } }
    realmInfo.value = {
      metadata_replication: { default_replication_factor: 2 },
      nodes: [{
        node_id: 'server-node',
        kind: 'server',
        configured: true,
        present: true,
        connection_status: 'connected',
        placement: { location: 'eu-west', weight: 1, full: false, draining: false },
        info: { executors: [], labels: { name: 'Giessen storage', 'aruna-engine.org/tier': 'hot' }, urls: {}, utilization: { storage_bytes_used: 2048, heartbeat_at_ms: 1 }, updated_at_ms: 1 },
      }],
    }

    const text = await renderedText()

    expect(text).toContain('Giessen storage This node eu-west 2 KiB stored Details')
    expect(text).not.toMatch(/connected/i)
    expect(text).not.toContain('SERVER')
    // Labels wait behind Details.
    expect(text).not.toContain('aruna-engine.org/tier')
  })
})

describe('this node header', () => {
  it('says nothing about a healthy node and one plain word about a node with a problem', async () => {
    nodeInfo.value = { node: { peer_id: 'p', status: 'healthy' }, services: { interfaces: { rest: { status: 'available' }, s3: { status: 'available' } } } }
    const healthy = await renderedText()
    expect(healthy).toContain('This node')
    expect(healthy).not.toMatch(/healthy/i)

    nodeInfo.value = { node: { peer_id: 'p', status: 'degraded' }, services: { interfaces: { rest: { status: 'available' }, s3: { status: 'available' } } } }
    expect((await renderedText()).match(/degraded/gi)).toHaveLength(1)
  })
})

describe('node outage presentation', () => {
  it('requires a failed browser probe instead of treating configured DHT state as an outage', () => {
    const predicate = source.match(/const unreachableNodes = computed\([\s\S]*?\n\)/)?.[0] ?? ''

    expect(predicate).toContain("probeFor(node)?.state === 'unreachable'")
    expect(predicate).not.toContain('node.configured')
    expect(predicate).not.toContain('connection_status')
    expect(source).toContain('The browser API probe failed')
    expect(source).toContain('const onlineCount = computed(() => cardNodes.value.filter((node) => node.present).length)')
  })
})

describe('first status paint', () => {
  it('keeps unknown realm data behind the info skeleton before the first load', async () => {
    realmInfo.value = null

    const text = await renderedText()

    expect(text).toContain('Loading realm status')
    expect(text).not.toContain('No nodes reported for this realm yet')
  })

  it('settles the first paint on either info outcome without changing probe commits', () => {
    expect(source).toContain('const painted = useFirstPaint(() => firstInfoReady.value)')
    expect(source).toContain('infoSettled.value = true')
    expect(source).toContain('probes.value = { ...probes.value, [id]: probe }')
  })
})

describe('this node storage', () => {
  it('reports the answering node figures the dashboard no longer carries', async () => {
    nodeInfo.value = { node: { status: 'healthy', peer_id: 'local-node' }, warnings: [] }
    usageInfo.value = { buckets: 4, objects: 12, stored_blobs: 7, stored_bytes: 2048, referenced_bytes: 0 }

    const text = await renderedText()

    expect(text).toContain('This node')
    expect(text).toMatch(/This node 2 KiB stored/)
    expect(text).toContain('12 objects')
    expect(text).toContain('4 buckets')
  })

  it('keeps the block for a node that reports usage but no info yet', async () => {
    usageInfo.value = { buckets: 1, objects: 2, referenced_bytes: 0 }

    const text = await renderedText()

    expect(text).toContain('This node')
    expect(text).toContain('2 objects')
  })
})

describe('device summary', () => {
  it('summarizes user nodes instead of listing them among realm nodes', async () => {
    currentUser.value = { id: 'user-1' }
    realmInfo.value = {
      metadata_replication: { default_replication_factor: 2 },
      nodes: [
        {
          node_id: 'server-node',
          kind: 'server',
          configured: true,
          present: true,
          connection_status: 'connected',
          placement: { location: 'eu-west', weight: 1, full: false, draining: false },
        },
        {
          node_id: 'laptop-alpha',
          kind: 'user',
          owner: 'user-1',
          configured: true,
          present: false,
          connection_status: 'seen',
          last_seen_ms: Date.now() - 4 * 60_000,
        },
        { node_id: 'laptop-beta', kind: 'user', owner: 'user-2', configured: true, present: false, connection_status: 'unknown' },
      ],
    }

    const text = await renderedText()

    expect(text).toContain('Devices')
    expect(text).toContain('2 enrolled 1 active 1 offline 1 yours Seen 4m ago')
    // The realm node is one card; devices are only counted.
    expect(text).toContain('Nodes Unnamed node eu-west')
    expect(text).not.toContain('laptop-')
    expect(text).not.toContain('user-2')
    // Devices are owner-bound computers: they stay out of the placement buckets.
    expect(text).toContain('eu-west=1')
    expect(text).not.toContain('(not in placement map)')
    // A plain line instead of the DHT term, with the replication beside it.
    expect(text).toContain('1/1 online All reachable Metadata on 2 nodes')
    expect(text).not.toContain('present in DHT')
  })

  it('claims no activity for a device it has never heard from', async () => {
    realmInfo.value = {
      metadata_replication: { default_replication_factor: 2 },
      nodes: [
        { node_id: 'server-node', kind: 'server', configured: true, present: true, connection_status: 'connected' },
        { node_id: 'laptop-gamma', kind: 'user', owner: 'user-3', configured: true, present: false, connection_status: 'unknown' },
      ],
    }

    const text = await renderedText()

    expect(text).toContain('1 enrolled 0 active 1 offline')
    expect(text).not.toContain('Seen')
  })

  it('renders no device summary for a realm without devices', async () => {
    realmInfo.value = {
      metadata_replication: { default_replication_factor: 2 },
      nodes: [{ node_id: 'server-node', kind: 'server', configured: true, present: true, connection_status: 'connected' }],
    }

    const text = await renderedText()

    expect(text).not.toContain('Devices')
    expect(text).not.toContain('enrolled')
  })
})
