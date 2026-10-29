import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as NodeDisplay from '@/components/nodes/node-display'
import * as FormatCount from '@/lib/formatCount'
import * as Placement from '@/lib/placement'
import * as Utils from '@/lib/utils'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import type { RealmNodeInfo } from '@/lib/api'

const params = ref<Record<string, string>>({ nodeId: 'store-1' })
const realm = ref<{ nodes: RealmNodeInfo[] } | null>(null)
const nodeInfo = ref<Record<string, unknown> | null>({ node: { peer_id: 'mgmt' } })
const isRealmAdmin = ref(false)
const currentUser = ref<{ id: string } | null>({ id: 'u1' })
const searchBuckets = vi.fn()
const renameNode = vi.fn(async () => undefined)
const renameDevice = vi.fn(async () => undefined)
const probeNode = vi.fn(async () => ({ state: 'ok', info: { api_version: '3.0.0-alpha.140' }, usage: null }))

const record = (overrides: Partial<RealmNodeInfo> = {}): RealmNodeInfo => ({
  node_id: 'store-1',
  kind: 'server',
  configured: true,
  present: true,
  connection_status: 'connected',
  display_name: 'Giessen storage 1',
  placement: { location: 'Giessen', weight: 1, full: false, draining: false },
  info: {
    executors: [],
    labels: {},
    urls: { api: 'https://api.store-1.example.org/api/v1' },
    utilization: { storage_bytes_used: 2048, heartbeat_at_ms: 1, load_permille: 340, jobs_running: 1, imports_running: 1 },
    updated_at_ms: 1,
  },
  ...overrides,
})

const Plain = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const HeaderStub = defineComponent({
  props: { title: String, description: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), h('p', props.description), slots.actions?.()]),
})
const LinkStub = defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) })
const NameStub = defineComponent({
  props: { name: String, save: Function },
  setup: (props) => () => h('button', { onClick: () => (props.save as (name: string) => Promise<void>)('New name') }, `Rename ${props.name}`),
})
const PanelStub = defineComponent({ props: { node: Object, hideName: Boolean, probe: Object }, setup: (props) => () => h('section', `details hideName=${props.hideName}`) })

const NodeView = compileClientComponent(new URL('./NodeView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub, useRoute: () => ({ params: params.value }) },
  '@/components/dashboard/PageHeader.vue': moduleDefault(HeaderStub),
  '@/components/ui/Badge.vue': moduleDefault(Plain),
  '@/components/ui/EmptyState.vue': moduleDefault(defineComponent({ props: { title: String }, setup: (props) => () => h('p', props.title) })),
  '@/components/nodes/NodeDetailPanel.vue': moduleDefault(PanelStub),
  '@/components/nodes/NodeNameEdit.vue': moduleDefault(NameStub),
  '@/components/nodes/node-display': NodeDisplay,
  '@/components/nodes/node-probe': { nodeApiBase: (node: RealmNodeInfo) => node.info?.urls.api ?? null, probeNode },
  '@/composables/useAruna': {
    useAruna: () => ({ currentUser, nodeInfo, usageInfo: ref(null), isRealmAdmin, searchBuckets, sessionEpoch: ref(1) }),
  },
  '@/composables/useNodeNames': { useNodeNames: () => ({ renameNode, renameDevice }) },
  '@/composables/useRealmNodes': { computerName: () => 'This computer', useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'mgmt' }) },
  '@/composables/useRealmSnapshot': { useRealmSnapshot: () => ({ realm }) },
  '@/lib/formatCount': FormatCount,
  '@/lib/placement': Placement,
  '@/lib/utils': Utils,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
})

beforeEach(() => {
  params.value = { nodeId: 'store-1' }
  realm.value = { nodes: [record()] }
  isRealmAdmin.value = false
  currentUser.value = { id: 'u1' }
  searchBuckets.mockReset().mockResolvedValue({ hits: [] })
  renameNode.mockClear()
  renameDevice.mockClear()
})

describe('node page', () => {
  it('names the node and states its role, place, state, load, work and version once each', async () => {
    const mounted = await mountApp(NodeView)
    await flush()
    const text = content(mounted.root)

    expect(text).toContain('Giessen storage 1')
    expect(text).toContain('storage, Giessen')
    expect(text).toContain('Stateonline')
    expect(text).toContain('Stored2 KB')
    expect(text).toContain('CPU34%')
    expect(text).toContain('Importing, 1 job')
    expect(text).toContain('3.0.0-alpha.140')
    expect(text).toContain('details hideName=true')
    expect(text.match(/online/g)).toHaveLength(1)
    mounted.app.unmount()
  })

  it('lists only the buckets this node holds, each opening the bucket there', async () => {
    searchBuckets.mockResolvedValue({ hits: [
      { bucket: 'refseq', node_id: 'store-1', group_id: 'g1' },
      { bucket: 'elsewhere', node_id: 'store-2', group_id: 'g1' },
    ] })
    const mounted = await mountApp(NodeView)
    await flush()

    expect(content(mounted.root)).toContain('refseq')
    expect(content(mounted.root)).not.toContain('elsewhere')
    const link = element(mounted.root, (node) => node.tag === 'a' && content(node) === 'refseq')
    expect(JSON.parse(String(link.props['data-to']))).toEqual({ name: 'bucket', params: { bucketId: 'refseq' }, query: { group: 'g1', node: 'store-1' } })
    expect(content(mounted.root)).toContain('1 bucket you can open')
    mounted.app.unmount()
  })

  it('lets an admin rename any node and an owner only their own device', async () => {
    let mounted = await mountApp(NodeView)
    await flush()
    expect(nodes(mounted.root).some((node) => content(node).startsWith('Rename'))).toBe(false)
    mounted.app.unmount()

    isRealmAdmin.value = true
    mounted = await mountApp(NodeView)
    await flush()
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).startsWith('Rename')))
    expect(renameNode).toHaveBeenCalledWith('store-1', 'New name')
    mounted.app.unmount()

    isRealmAdmin.value = false
    params.value = { nodeId: 'laptop' }
    realm.value = { nodes: [record({ node_id: 'laptop', kind: 'user', owner: 'u1', connection_status: 'seen', present: false })] }
    mounted = await mountApp(NodeView)
    await flush()
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node).startsWith('Rename')))
    expect(renameDevice).toHaveBeenCalledWith('laptop', 'New name')
    expect(content(mounted.root)).toContain('Stateonline')
    mounted.app.unmount()
  })

  it('says so when the realm does not list the node', async () => {
    params.value = { nodeId: 'gone' }
    const mounted = await mountApp(NodeView)
    await flush()
    expect(content(mounted.root)).toContain("This node is not in the realm's node list.")
    mounted.app.unmount()
  })
})
