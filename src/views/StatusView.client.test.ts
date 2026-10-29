import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as NodeDisplay from '@/components/nodes/node-display'
import * as Placement from '@/lib/placement'
import * as Utils from '@/lib/utils'

const realmInfo = ref<Record<string, any> | null>(null)
const nodeInfo = ref<Record<string, any> | null>(null)
const loadRealmView = vi.fn(async (): Promise<unknown> => null)
const desktop = { on: false }

const node = (node_id: string, name?: string, present = true) => ({
  node_id,
  kind: 'server',
  configured: true,
  present,
  connection_status: present ? 'connected' : 'configured',
  placement: null,
  info: name ? { executors: [], labels: { name }, urls: {}, utilization: { storage_bytes_used: 1, heartbeat_at_ms: 1 }, updated_at_ms: 1 } : null,
})

const Plain = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const Empty = defineComponent(() => () => null)
// The map and the cards render what they were handed and offer their choices as buttons.
const MapStub = defineComponent({
  props: { nodes: { type: Array, default: () => [] } },
  emits: ['select'],
  setup: (props, { emit }) => () =>
    h('div', (props.nodes as Array<{ node_id: string }>).map((entry) => h('button', { 'data-map': entry.node_id, onClick: () => emit('select', entry.node_id) }, `map ${entry.node_id}`))),
})
const CardsStub = defineComponent({
  props: { nodes: { type: Array, default: () => [] }, openId: String },
  emits: ['details'],
  setup: (props, { emit }) => () =>
    h('div', (props.nodes as Array<{ node_id: string; present: boolean; info?: { labels?: Record<string, string> } | null }>).map((entry) =>
      h('button', { 'data-card': entry.node_id, onClick: () => emit('details', entry.node_id) }, `card ${entry.info?.labels?.name ?? 'unnamed'} ${entry.present ? 'online' : 'offline'}`))),
})
const DetailStub = defineComponent({ props: { node: { type: Object, required: true } }, setup: (props) => () => h('div', `details ${(props.node as { node_id: string }).node_id}`) })

const StatusView = compileClientComponent(new URL('./StatusView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRoute: () => ({ query: {} }) },
  '@/components/dashboard/PageHeader.vue': moduleDefault(Plain),
  '@/components/dashboard/FederationPanel.vue': moduleDefault(MapStub),
  '@/components/dashboard/NodeCards.vue': moduleDefault(CardsStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(Empty),
  '@/components/ui/Badge.vue': moduleDefault(Plain),
  '@/components/ui/Notice.vue': moduleDefault(Plain),
  '@/components/ui/CopyButton.vue': moduleDefault(Empty),
  '@/components/ui/ListSkeleton.vue': moduleDefault(Empty),
  '@/components/ui/NodeLabel.vue': moduleDefault(Empty),
  '@/components/nodes/LocalNodeDetails.vue': moduleDefault(Empty),
  '@/components/nodes/NodeDetailPanel.vue': moduleDefault(DetailStub),
  '@/components/placement/LocationAggregates.vue': moduleDefault(Empty),
  '@/components/ui/SectionSkeleton.vue': moduleDefault(Empty),
  '@/components/ui/EmptyState.vue': moduleDefault(Empty),
  '@/components/nodes/node-display': NodeDisplay,
  '@/components/nodes/node-probe': { nodeApiBase: () => null, probeNode: () => new Promise(() => undefined) },
  '@/composables/useAruna': {
    useAruna: () => ({
      realm: ref({ id: 'realm-id', name: 'Test realm', description: '', color: '#08216C' }),
      realmInfo,
      nodeInfo,
      usageInfo: ref(null),
      apiBaseUrl: ref('/api/v1'),
      currentUser: ref({ id: 'u1' }),
      loadInfo: vi.fn(async () => undefined),
      sessionEpoch: ref(0),
      loadRealmView,
    }),
  },
  '@/composables/useRefresh': { useRefresh: (run: () => unknown) => ({ busy: ref(false), refresh: run }) },
  '@vueuse/core': { useDocumentVisibility: () => ref('hidden'), useIntervalFn: () => ({ pause: vi.fn(), resume: vi.fn() }) },
  '@/lib/poll': { onWake: () => () => {}, POLL_SLOW_MS: 15_000 },
  '@/lib/placement': Placement,
  '@/lib/utils': Utils,
  '@/lib/desktop': { isDesktop: () => desktop.on },
  '@/composables/useRealmNodes': { computerName: () => 'This computer' },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/composables/useFirstPaint': { useFirstPaint: () => ref(true) },
})

beforeEach(() => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
  vi.stubGlobal('document', { getElementById: () => null })
  desktop.on = false
  nodeInfo.value = { node: { peer_id: 'own-device' } }
  realmInfo.value = { metadata_replication: { default_replication_factor: 2 }, nodes: [node('server-a', 'Giessen storage')] }
  loadRealmView.mockReset().mockResolvedValue(null)
})

afterEach(() => vi.unstubAllGlobals())

describe('status nodes', () => {
  it('reads the cards from the realm snapshot the map shows in the desktop', async () => {
    desktop.on = true
    // The device's own copy knows the node only by id and has not heard from it.
    realmInfo.value = { metadata_replication: { default_replication_factor: 2 }, nodes: [node('server-a', undefined, false)] }
    loadRealmView.mockResolvedValue({ info: { node: { peer_id: 'server-a' } }, realm: { nodes: [node('server-a', 'Giessen storage')] } })
    const mounted = await mountApp(StatusView)
    await flush()

    expect(content(mounted.root)).toContain('map server-a')
    expect(content(mounted.root)).toContain('card Giessen storage online')
    await click(element(mounted.root, (entry) => entry.props['data-card'] === 'server-a'))
    expect(content(mounted.root)).toContain('details server-a')
    mounted.app.unmount()
  })

  it('opens a node chosen on the map again after its details were hidden', async () => {
    const mounted = await mountApp(StatusView)
    await flush()
    const onMap = () => element(mounted.root, (entry) => entry.props['data-map'] === 'server-a')
    const card = () => element(mounted.root, (entry) => entry.props['data-card'] === 'server-a')

    await click(onMap())
    expect(content(mounted.root)).toContain('details server-a')
    await click(card())
    expect(content(mounted.root)).not.toContain('details server-a')
    await click(onMap())
    expect(content(mounted.root)).toContain('details server-a')
    mounted.app.unmount()
  })
})
