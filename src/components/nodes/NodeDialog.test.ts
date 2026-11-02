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

const DialogStub = defineComponent({
  emits: ['update:open'],
  setup: (_, { emit, slots }) => () => h('div', [h('header', [slots.header?.(), slots.actions?.()]), slots.default?.(), h('button', { onClick: () => emit('update:open', false) }, 'Close')]),
})
const LinkStub = defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) })
// Each editor keeps its own draft, so a new one shows as a new instance.
const editors = { made: 0 }
const sessionEpoch = ref(1)
const NameStub = defineComponent({
  props: { name: String, save: Function },
  setup: (props) => {
    editors.made++
    return () => h('button', { onClick: () => (props.save as (name: string) => Promise<void>)('New name') }, `Rename ${props.name}`)
  },
})
const PanelStub = defineComponent({ props: { node: Object, hideName: Boolean, probe: Object }, setup: (props) => () => h('section', `details hideName=${props.hideName}`) })

const CardStub = defineComponent({
  props: { label: String },
  setup: (props, { slots }) => () => h('div', { 'data-card': props.label }, [`${props.label} `, slots.value?.(), ' ', slots.unit?.(), ' ', slots.default?.()]),
})
const DetailsStub = defineComponent({
  props: { items: Array },
  setup: (props, { slots }) => () =>
    h('dl', (props.items as Array<{ key?: string; label: string; value: string }>).map((item) =>
      h('div', [h('dt', item.label), h('dd', slots[item.key ?? item.label]?.({ item }) ?? item.value)]))),
})
const RunsStub = defineComponent({ props: { runs: Array, hideNode: Boolean }, setup: (props) => () => h('section', `runs ${(props.runs as Array<{ task: { id: string } }>).map((run) => run.task.id).join(',')} hideNode=${props.hideNode}`) })
const MarkStub = defineComponent({ props: { label: String }, setup: (props) => () => h('i', { 'data-mark': props.label }) })
const recentRuns = ref<unknown[]>([])
const runsState = ref('ready')
const loadRuns = vi.fn(async () => undefined)
const loadInfo = vi.fn(async () => undefined)
const task = (id: string, state: string, nodeId: string | null) => ({ task: { id, state }, nodeId })

const NodeDialog = compileClientComponent(new URL('./NodeDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/components/ui/DetailDialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogTitle.vue': moduleDefault(defineComponent((_, { slots }) => () => h('h2', slots.default?.()))),
  '@/components/dashboard/OverviewCell.vue': moduleDefault(CardStub),
  '@/components/dashboard/RecentRunsCard.vue': moduleDefault(RunsStub),
  '@/components/ui/CopyButton.vue': moduleDefault(defineComponent(() => () => null)),
  '@/components/ui/DetailList.vue': moduleDefault(DetailsStub),
  '@/components/ui/IconTile.vue': moduleDefault(defineComponent(() => () => null)),
  '@/components/ui/RefreshButton.vue': moduleDefault(defineComponent((_, { attrs }) => () => h('button', attrs, 'Refresh'))),
  '@/components/ui/SectionHeading.vue': moduleDefault(defineComponent({ props: { title: String }, setup: (props) => () => h('h2', props.title) })),
  '@/components/ui/StatusMark.vue': moduleDefault(MarkStub),
  '@/components/ui/EmptyState.vue': moduleDefault(defineComponent({ props: { title: String }, setup: (props) => () => h('p', props.title) })),
  '@/components/nodes/NodeDetailPanel.vue': moduleDefault(PanelStub),
  '@/components/nodes/NodeNameEdit.vue': moduleDefault(NameStub),
  '@/components/nodes/node-display': NodeDisplay,
  '@/components/nodes/node-probe': { nodeApiBase: (node: RealmNodeInfo) => node.info?.urls.api ?? null, probeNode },
  '@/composables/useAruna': {
    useAruna: () => ({ authToken: ref('session'), currentUser, myGroups: ref([{ id: 'g1', name: 'demo' }]), nodeInfo, usageInfo: ref(null), isRealmAdmin, searchBuckets, sessionEpoch, loadInfo }),
  },
  '@/composables/useDatabases': {
    useDatabases: () => ({ ensure: () => {}, rows: ref([{ bucket: 'refseq', title: 'NCBI RefSeq genomes', metadata: {}, places: [{ nodeId: 'store-1' }] }]) }),
  },
  '@/composables/useBucketUsage': {
    useListedUsage: () => ({ ensure: () => {}, textOf: (bucket: string) => (bucket === 'refseq' ? '21 files, 1.8 GiB' : null) }),
  },
  '@/composables/useRecentRuns': { useRecentRuns: () => ({ runs: recentRuns, state: runsState, load: loadRuns }) },
  '@/composables/useRefresh': { useRefresh: (run: () => unknown) => ({ busy: ref(false), refresh: run }) },
  '@/lib/tes': { isActiveTesState: (state: string) => state === 'RUNNING' },
  '@/composables/useNodeNames': { useNodeNames: () => ({ renameNode, renameDevice }) },
  '@/composables/useRealmNodes': { computerName: () => 'This computer', useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'mgmt', localNodeId: ref('mgmt') }) },
  '@/composables/useRealmSnapshot': { useRealmSnapshot: () => ({ realm }) },
  '@/lib/formatCount': FormatCount,
  '@/lib/placement': Placement,
  '@/lib/utils': Utils,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
})

// The Status page hands the dialog the node its query names; a test changes it through `params`.
const closed = vi.fn()
const NodeView = defineComponent(() => () => h(NodeDialog, { nodeId: params.value.nodeId, onClose: closed }))

beforeEach(() => {
  params.value = { nodeId: 'store-1' }
  realm.value = { nodes: [record()] }
  isRealmAdmin.value = false
  currentUser.value = { id: 'u1' }
  searchBuckets.mockReset().mockResolvedValue({ hits: [] })
  recentRuns.value = []
  runsState.value = 'ready'
  loadRuns.mockClear()
  renameNode.mockClear()
  renameDevice.mockClear()
})

describe('node dialog', () => {
  it('heads the node with its state, type, place and work, then stat cards and its details', async () => {
    recentRuns.value = [task('r1', 'COMPLETE', 'store-1'), task('r2', 'COMPLETE', 'store-1'), task('r3', 'COMPLETE', null)]
    searchBuckets.mockResolvedValue({ hits: [{ bucket: 'refseq', node_id: 'store-1', group_id: 'g1' }] })
    const mounted = await mountApp(NodeView)
    await flush()
    const text = content(mounted.root)
    const card = (label: string) => content(element(mounted.root, (node) => node.props['data-card'] === label)).replace(/\s+/g, ' ').trim()

    expect(text).toContain('Giessen storage 1')
    expect(nodes(mounted.root).some((node) => node.props['data-mark'] === 'Online')).toBe(true)
    expect(text).toContain('Storage nodeGiessenImporting, 1 job')
    expect(card('Stored')).toBe('Stored 2 KiB 1 bucket')
    expect(card('CPU')).toBe('CPU 34%')
    // Only the runs that ran on this node count, among the recent ones.
    expect(card('Runs')).toBe('Runs 2 recent 2/2 completed')
    expect(text).toContain('runs r1,r2 hideNode=true')
    expect(text).toContain('TypeStorage node')
    expect(text).toContain('LocationGiessen')
    expect(text).toContain('Version3.0.0-alpha.140')
    expect(text).toContain('details hideName=true')
    expect(text).not.toContain('Open in status')
    mounted.app.unmount()
  })

  it('asks the Status page to close it', async () => {
    closed.mockClear()
    const mounted = await mountApp(NodeView)
    await flush()
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node) === 'Close'))
    expect(closed).toHaveBeenCalledOnce()
    mounted.app.unmount()
  })

  it('marks an offline node with an icon and says when it was last seen', async () => {
    realm.value = { nodes: [record({ present: false })] }
    const mounted = await mountApp(NodeView)
    await flush()
    expect(nodes(mounted.root).some((node) => node.props['data-mark'] === 'Offline')).toBe(true)
    expect(content(mounted.root)).toContain('Last seen')
    mounted.app.unmount()
  })

  it('reads the node, its buckets and its runs again on Refresh', async () => {
    const mounted = await mountApp(NodeView)
    await flush()
    const reads = searchBuckets.mock.calls.length
    loadRuns.mockClear()
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node) === 'Refresh'))
    await flush()
    expect(loadInfo).toHaveBeenCalled()
    expect(loadRuns).toHaveBeenCalledOnce()
    expect(searchBuckets.mock.calls.length).toBeGreaterThan(reads)
    mounted.app.unmount()
  })

  it('lists only the buckets this node holds, each opening the bucket there', async () => {
    searchBuckets.mockResolvedValue({ hits: [
      { bucket: 'refseq', node_id: 'store-1', group_id: 'g1' },
      { bucket: 'elsewhere', node_id: 'store-2', group_id: 'g1' },
    ] })
    const mounted = await mountApp(NodeView)
    await flush()

    expect(content(mounted.root)).toContain('refseqNCBI RefSeq genomes, 21 files, 1.8 GiB')
    expect(content(mounted.root)).not.toContain('elsewhere')
    const link = element(mounted.root, (node) => node.tag === 'a' && content(node).includes('refseq'))
    expect(JSON.parse(String(link.props['data-to']))).toEqual({ name: 'bucket', params: { bucketId: 'refseq' }, query: { group: 'g1', node: 'store-1' } })
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
    expect(nodes(mounted.root).some((node) => node.props['data-mark'] === 'Online')).toBe(true)
    mounted.app.unmount()
  })

  it('says so when the realm does not list the node', async () => {
    params.value = { nodeId: 'gone' }
    const mounted = await mountApp(NodeView)
    await flush()
    expect(content(mounted.root)).toContain("This node is not in the realm's node list")
    mounted.app.unmount()
  })

  it('starts a fresh rename editor for another node or session, so no draft moves along', async () => {
    isRealmAdmin.value = true
    realm.value = { nodes: [record(), record({ node_id: 'store-2', display_name: 'Giessen storage 2' })] }
    const mounted = await mountApp(NodeView)
    await flush()
    const made = editors.made

    params.value = { nodeId: 'store-2' }
    await flush()
    expect(editors.made).toBe(made + 1)
    sessionEpoch.value++
    await flush()
    expect(editors.made).toBe(made + 2)
    mounted.app.unmount()
  })

  it('never says there are none when a node did not answer the bucket search', async () => {
    searchBuckets.mockResolvedValue({ hits: [], nodes_failed: 1, failed_nodes: ['store-1'] })
    const empty = await mountApp(NodeView)
    await flush()
    expect(content(empty.root)).not.toContain('None that you can open.')
    expect(content(empty.root)).toContain('Not every node answered, so its buckets may be missing.')
    empty.app.unmount()

    searchBuckets.mockResolvedValue({ hits: [{ bucket: 'refseq', node_id: 'store-1', group_id: 'g1' }], nodes_failed: 1 })
    const some = await mountApp(NodeView)
    await flush()
    expect(content(element(some.root, (node) => node.props['data-card'] === 'Stored'))).toContain('at least 1 bucket')
    some.app.unmount()
  })
})
