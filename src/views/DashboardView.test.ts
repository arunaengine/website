import * as VueRuntime from 'vue'
import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, content, compileClientComponent, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as NodeDisplay from '@/components/nodes/node-display'
const RealmNodes = await vi.importActual<typeof import('@/composables/useRealmNodes')>('@/composables/useRealmNodes')

const firstPaintMock = vi.hoisted(() => ({
  useFirstPaint: () => ({ value: true }),
}))
vi.mock('@/composables/useFirstPaint', () => firstPaintMock)

const currentUser = ref<Record<string, unknown> | null>(null)
const metadata = ref<unknown[]>([])
const profiles = ref<unknown[]>([])
const nodes = ref<Array<{ status: string }>>([])
const myGroups = ref<Array<{ id: string; name: string }>>([])
const discoverableGroups = ref<Array<{ id: string; name: string }>>([])
const realm = ref({ id: 'realm-id', name: 'Test realm', description: 'Public research data' })
const nodeInfo = ref<Record<string, unknown> | null>(null)
const realmInfo = ref<Record<string, any> | null>(null)
const usageInfo = ref<Record<string, any> | null>(null)
const loading = ref(false)
const bootstrapped = ref(true)
const sessionEpoch = ref(0)
const authPending = ref(false)
const authStage = ref('idle')
const authStageError = ref<string | null>(null)
const dashboardRevision = ref(0)
const scope = ref<'personal' | 'realm'>('personal')
const desktopMode = ref(false)
const HomeCardsStub = defineComponent(() => () => h('div', 'desktop-home-cards'))
const WebStartStub = defineComponent(() => () => h('div', 'web-first-steps'))
const DeviceRowStub = defineComponent({ props: { name: String, nodeId: String }, setup: (props) => () => h('div', `device row ${props.name} ${props.nodeId ?? ''}`) })
const isRealmAdmin = ref(false)
const renameNode = vi.fn(async () => undefined)
const nodeNamesStub = { useNodeNames: () => ({ renameNode }) }
const setScope = vi.fn(async () => undefined)
const refresh = vi.fn(async () => undefined)
let servedEpoch = -1
const loadInfo = vi.fn(async () => undefined)
const loadRealmView = vi.fn(async (): Promise<unknown> => null)
const signIn = vi.fn(async () => undefined)

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup(props, { slots }) {
    return () => h('header', [h('h1', props.title), h('p', props.description), slots.actions?.()])
  },
})
const RouterLinkStub = defineComponent((_, { attrs, slots }) => () => h('a', attrs, slots.default?.()))
const SkeletonStub = defineComponent(() => () => h('span', 'loading'))
const OverviewCellStub = defineComponent({
  props: { label: String },
  setup: (props, { slots }) => () => h('div', [h('span', props.label), slots.value?.(), slots.default?.()]),
})
// The realm's database list; its count shows once the list was read.
const databaseRows = ref<unknown[]>([])
const databaseState = ref('idle')
// Renders what it was handed, so the view's own node/device split is testable.
const NodeCardsStub = defineComponent({
  props: { nodes: { type: Array, default: () => [] }, devices: { type: Array, default: () => [] }, rename: Function },
  setup: (props) => () =>
    h('div', [
      props.rename ? 'renamable ' : '',
      ...(props.nodes as Array<{ node_id: string; info?: { utilization?: { heartbeat_at_ms?: number } } }>).map((node) =>
        h('span', ` ${node.node_id} beat ${node.info?.utilization?.heartbeat_at_ms} `),
      ),
      h('em', `${props.devices.length} devices`),
    ]),
})
const realmNodesStub = {
  useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'own-device' }),
  computerName: RealmNodes.computerName,
}
const reloadDatabases = vi.fn(async () => undefined)
const databasesStub = { useDatabases: () => ({ rows: databaseRows, state: databaseState, complete: ref(true), ensure: () => {}, reload: reloadDatabases }) }
const GroupQuotaCardsStub = defineComponent({
  props: { refreshRevision: Number },
  setup: (props) => () => h('div', `group quota cards ${props.refreshRevision}`),
})
let pollInfo: () => unknown = () => undefined
const MyStatsCardsStub = defineComponent({
  props: { refreshRevision: Number },
  setup: (props) => () => h('div', `my stats cards ${props.refreshRevision}`),
})
// The node total stands as the exact count; the correction itself is tested with the count rule.
const bucketCountStub = {
  countText: (counted: { count: number }, format: (value: number) => string) => format(counted.count),
  useRealmBucketCount: (totals: { value: { buckets: number; distinct_buckets?: number } | null | undefined }) =>
    VueRuntime.computed(() => (totals.value == null ? null : { count: totals.value.distinct_buckets ?? totals.value.buckets, exact: true })),
}
// Names the current scope and offers the other one, so the view's wiring of
// setScope is testable without the real segmented control.
const ScopeToggleStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', [
      `scope toggle ${props.modelValue}`,
      h('button', { onClick: () => emit('update:modelValue', 'personal') }, 'show personal'),
      h('button', { onClick: () => emit('update:modelValue', 'realm') }, 'show realm'),
    ]),
})
const EmptyStub = defineComponent(() => () => null)
const RefreshButtonStub = defineComponent((_, { attrs }) => () => h('button', attrs, 'Refresh'))
const icons = new Proxy({}, { get: () => EmptyStub })

let DashboardView: Component
let DashboardClient: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({
    RouterLink: RouterLinkStub,
    useRouter: () => ({ push: vi.fn() }),
  }))
  vi.doMock('@/composables/useAruna', () => ({
    useAruna: () => ({
      currentUser,
      metadata,
      profiles,
      nodes,
      myGroups,
      discoverableGroups,
      realm,
      nodeInfo,
      realmInfo,
      usageInfo,
      loading,
      bootstrapped,
      sessionEpoch,
      refresh,
      loadInfo,
      loadRealmView,
      isRealmAdmin,
    }),
  }))
  vi.doMock('@/composables/useAuth', () => ({
    useAuth: () => ({ authPending, signIn, stage: authStage, stageError: authStageError }),
  }))
  vi.doMock('@/composables/useNotifications', () => ({
    useNotifications: () => ({ dashboardRevision }),
  }))
  vi.doMock('@/composables/useDashboardScope', () => ({
    useDashboardScope: () => ({ scope, setScope }),
  }))
  vi.doMock('@vueuse/core', () => ({
    useDocumentVisibility: () => ref('hidden'),
    useIntervalFn: () => ({ pause: vi.fn(), resume: vi.fn() }),
    useVModel: (props: Record<string, unknown>, key: string) => ref(props[key]),
  }))
  vi.doMock('@/components/ui/Button.vue', () => ({ default: ButtonStub }))
  vi.doMock('@/components/dashboard/PageHeader.vue', () => ({ default: PageHeaderStub }))
  vi.doMock('@/components/dashboard/GroupQuotaCards.vue', () => ({ default: GroupQuotaCardsStub }))
  vi.doMock('@/components/dashboard/MyStatsCards.vue', () => ({ default: MyStatsCardsStub }))
  vi.doMock('@/composables/useBucketCount', () => bucketCountStub)
  vi.doMock('@/components/dashboard/DashboardScopeToggle.vue', () => ({ default: ScopeToggleStub }))
  vi.doMock('@/components/dashboard/OverviewCell.vue', () => ({ default: OverviewCellStub }))
  vi.doMock('@/composables/useDatabases', () => databasesStub)
  vi.doMock('@/components/dashboard/NodeCards.vue', () => ({ default: NodeCardsStub }))
  vi.doMock('@/composables/useNodeNames', () => nodeNamesStub)
  vi.doMock('@/components/dashboard/WebStart.vue', () => ({ default: WebStartStub }))
  vi.doMock('@/composables/useRealmNodes', () => realmNodesStub)
  vi.doMock('@/components/ui/Skeleton.vue', () => ({ default: SkeletonStub }))
  DashboardView = (await import('./DashboardView.vue')).default
  const FirstPaint = await vi.importActual<typeof import('@/composables/useFirstPaint')>('@/composables/useFirstPaint')

  DashboardClient = compileClientComponent(new URL('./DashboardView.vue', import.meta.url), {
    vue: VueRuntime,
    'vue-router': {
      RouterLink: RouterLinkStub,
      useRouter: () => ({ push: vi.fn() }),
    },
    '@lucide/vue': icons,
    '@/composables/useAruna': {
      useAruna: () => ({
        currentUser,
        metadata,
        profiles,
        myGroups,
        discoverableGroups,
        realm,
        nodeInfo,
        realmInfo,
        usageInfo,
        loading,
        bootstrapped,
        sessionEpoch,
        refresh,
        refreshedEpoch: () => servedEpoch,
        loadInfo,
        loadRealmView,
        isRealmAdmin,
      }),
    },
    '@/composables/useAuth': { useAuth: () => ({ authPending }) },
    '@vueuse/core': {
      useDocumentVisibility: () => ref('hidden'),
      useIntervalFn: () => ({ pause: vi.fn(), resume: vi.fn() }),
    },
    '@/lib/poll': {
      POLL_SLOW_MS: 15_000,
      follow: (run: () => unknown) => {
        pollInfo = run
        return () => {}
      },
      onWake: () => () => {},
    },
    '@/composables/useNotifications': { useNotifications: () => ({ dashboardRevision }) },
    '@/composables/useDashboardScope': { useDashboardScope: () => ({ scope, setScope }) },
    '@/composables/useRefresh': {
      useRefresh: (run: () => unknown) => ({ busy: ref(false), refresh: run }),
    },
    '@/composables/useFirstPaint': FirstPaint,
    '@/lib/formatCount': { formatCount: (value: number) => String(value) },
    '@/lib/utils': {
      formatBytes: (value: number) => String(value),
      formatNumber: (value: number) => String(value),
      relativeTime: (value: string) => value,
    },
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/RefreshButton.vue': moduleDefault(RefreshButtonStub),
    '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
    '@/components/dashboard/GroupQuotaCards.vue': moduleDefault(GroupQuotaCardsStub),
    '@/components/dashboard/MyStatsCards.vue': moduleDefault(MyStatsCardsStub),
    '@/composables/useBucketCount': bucketCountStub,
    '@/components/dashboard/DashboardScopeToggle.vue': moduleDefault(ScopeToggleStub),
    '@/components/auth/SignInPanel.vue': moduleDefault(EmptyStub),
    '@/components/dashboard/OverviewCell.vue': moduleDefault(OverviewCellStub),
    '@/composables/useDatabases': databasesStub,
    '@/components/dashboard/NodeCards.vue': moduleDefault(NodeCardsStub),
    '@/composables/useNodeNames': nodeNamesStub,
    '@/components/dashboard/WebStart.vue': moduleDefault(WebStartStub),
    '@/composables/useRealmNodes': realmNodesStub,
    '@/components/nodes/node-display': NodeDisplay,
    '@/components/ui/Skeleton.vue': moduleDefault(SkeletonStub),
    '@/components/ui/EmptyState.vue': moduleDefault(EmptyStub),
    '@/components/desktop/HomeCards.vue': moduleDefault(HomeCardsStub),
    '@/components/desktop/DeviceRow.vue': moduleDefault(DeviceRowStub),
    '@/lib/chunk-recovery': { asyncChunkError: vi.fn() },
    '@/lib/desktop': { isDesktop: () => desktopMode.value },
  })
})

beforeEach(() => {
  currentUser.value = null
  metadata.value = []
  profiles.value = []
  nodes.value = []
  myGroups.value = []
  discoverableGroups.value = []
  realm.value = { id: 'realm-id', name: 'Test realm', description: 'Public research data' }
  nodeInfo.value = null
  realmInfo.value = {
    metadata_replication: { default_replication_factor: 3 },
    nodes: [],
  }
  usageInfo.value = null
  loading.value = false
  bootstrapped.value = true
  sessionEpoch.value = 0
  scope.value = 'personal'
  desktopMode.value = false
  setScope.mockClear()
  authPending.value = false
  authStage.value = 'idle'
  authStageError.value = null
  refresh.mockClear()
  loadInfo.mockClear()
  loadRealmView.mockReset()
  loadRealmView.mockResolvedValue(null)
  databaseRows.value = []
  databaseState.value = 'idle'
  reloadDatabases.mockClear()
  isRealmAdmin.value = false
  signIn.mockClear()
})

async function renderedText(): Promise<string> {
  const html = await renderToString(createSSRApp(DashboardView))
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

describe('guest dashboard truth', () => {
  it('holds the dashboard body in one skeleton during bootstrap', async () => {
    vi.stubGlobal('window', {})
    loading.value = true
    bootstrapped.value = false
    authPending.value = true

    const mounted = await mountApp(DashboardClient)
    const text = content(mounted.root)

    expect(text).toContain('Loading dashboard')
    expect(text).not.toContain('Overview')
    mounted.app.unmount()
    vi.unstubAllGlobals()
  })

  it('reads again when the dashboard is opened', async () => {
    // The view mounts fresh on every visit, so opening it must not show the
    // numbers of the previous visit until the slow poll lands.
    await renderedText()

    expect(refresh).toHaveBeenCalledOnce()
  })

  it('renders the three public_overview counts instead of guest-filtered zeros', async () => {
    realm.value = { id: 'realm-public', name: 'Gaia realm', description: 'Shared science data' }
    realmInfo.value = {
      metadata_replication: { default_replication_factor: null },
      nodes: [],
      public_overview: { live_datasets: 23, groups: 8, nodes_configured: 4 },
    }
    profiles.value = Array.from({ length: 12 })

    const text = await renderedText()

    expect(text).toContain('Work 23 datasets')
    expect(text).toContain('Realm 4 nodes')
    expect(text).toContain('Sign in')
    // Storage and data are figures of a signed-in session.
    expect(text).not.toContain('Storage')
    expect(text).not.toContain('Loaded profiles')
    expect(text).not.toContain('Nodes online')
    expect(text).not.toContain('0 / 0')
    expect(text).not.toContain('My statistics')
    expect(text).not.toContain('my stats cards')
    expect(text).not.toContain('scope toggle')
  })

  it('renders absent public counts as unknown rather than zero', async () => {
    const text = await renderedText()

    expect(text).toContain('Work Unknown')
    expect(text).toContain('Realm Unknown')
    expect(text).toContain('Public counts are unavailable from this node')
    expect(text).not.toContain('0 / 0')
  })
})

describe('authenticated dashboard scope', () => {
  function signedInRealm() {
    currentUser.value = { id: 'user-id', name: 'Ada Lovelace' }
    profiles.value = [{}, {}]
    nodes.value = [{ status: 'healthy' }, { status: 'offline' }]
    myGroups.value = [{ id: 'group-id', name: 'Research group' }]
    usageInfo.value = {
      buckets: 2,
      objects: 5,
      stored_blobs: 7,
      stored_bytes: 1024,
      metadata_documents: 9,
      realm: { buckets: 3, objects: 11, logical_bytes: 2048, referenced_bytes: 64 },
    }
    realmInfo.value = {
      metadata_replication: { default_replication_factor: null },
      public_overview: { live_datasets: 9, groups: 8, nodes_configured: 2 },
      nodes: [
        { node_id: 'node-a', present: true, info: { utilization: { documents_held: 6 } } },
        { node_id: 'node-b', info: { utilization: {} } },
      ],
    }
  }

  it('shows my figures in the Overview by default, the realm cell and then the groups', async () => {
    signedInRealm()

    const text = await renderedText()
    const overview = text.indexOf('Overview')

    expect(overview).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('my stats cards')).toBeGreaterThan(overview)
    expect(text.indexOf('Realm 1 node online')).toBeGreaterThan(text.indexOf('my stats cards'))
    expect(text.indexOf('group quota cards')).toBeGreaterThan(text.indexOf('Realm 1 node online'))
    expect(text).toContain('scope toggle personal')
    expect(text).toContain('Replication on all eligible nodes Status')
    // The old sections and the boxes the sidebar already offers are gone.
    for (const gone of ['My statistics', 'Realm statistics', 'Replica-inclusive placement records held', 'Recent datasets', 'Open Data']) {
      expect(text).not.toContain(gone)
    }
  })

  it('shows the realm figures in the same cells when the account stored that scope', async () => {
    signedInRealm()
    scope.value = 'realm'
    databaseState.value = 'ready'
    databaseRows.value = [{}, {}]

    const text = await renderedText()

    expect(text).toContain('scope toggle realm')
    expect(text).toContain('Storage 2 KB stored 64 B referenced')
    // The database list holds only what this caller may read, so it is no realm total.
    expect(text).toContain('Data 11 objects 3 buckets')
    expect(text).not.toContain('database')
    expect(text).toContain('Work 9 datasets')
    expect(text).toContain('group quota cards')
    expect(text).not.toContain('my stats cards')
  })

  it('switches the section through the stored scope', async () => {
    vi.stubGlobal('window', {})
    signedInRealm()

    const mounted = await mountApp(DashboardClient)
    expect(content(mounted.root)).toContain('my stats cards')
    expect(content(mounted.root)).not.toContain('9 datasets')

    await click(button(mounted.root, 'show realm'))
    expect(setScope).toHaveBeenCalledWith('realm')

    // The composable flips `scope` optimistically; the view follows it.
    scope.value = 'realm'
    await flush()
    expect(content(mounted.root)).toContain('9 datasets')
    expect(content(mounted.root)).not.toContain('my stats cards')
    mounted.app.unmount()
    vi.unstubAllGlobals()
  })

  it('counts realm nodes without the devices', async () => {
    currentUser.value = { id: 'user-id', name: 'Ada Lovelace' }
    scope.value = 'realm'
    realmInfo.value = {
      metadata_replication: { default_replication_factor: null },
      nodes: [
        { node_id: 'server-node', kind: 'server', present: true },
        { node_id: 'owned-device', kind: 'user', present: true },
      ],
    }

    const text = await renderedText()

    expect(text).toContain('Realm 1 node online')
  })
})

describe('first steps', () => {
  it('shows the one-line first steps on the web, without the welcome card and its tours', async () => {
    currentUser.value = { id: 'user-id', name: 'Ada Lovelace' }

    const text = await renderedText()

    expect(text).toContain('web-first-steps')
    for (const gone of ['New here?', 'Take the tour', 'Compute tutorial', 'Profile tutorial', 'Not now']) {
      expect(text).not.toContain(gone)
    }
  })

  it('leaves them out while a stored session resolves and for a visitor', async () => {
    currentUser.value = { id: 'user-id', name: 'Ada Lovelace' }
    authPending.value = true
    expect(await renderedText()).not.toContain('web-first-steps')

    authPending.value = false
    currentUser.value = null
    expect(await renderedText()).not.toContain('web-first-steps')
  })
})

describe('desktop home', () => {
  it('adds the desktop cards and its own description in the desktop', async () => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    desktopMode.value = true
    const mounted = await mountApp(DashboardClient)
    await flush()

    expect(content(mounted.root)).toContain('desktop-home-cards')
    expect(content(mounted.root)).not.toContain('web-first-steps')
    expect(content(mounted.root)).toContain('Your realm and this computer at a glance.')
    mounted.app.unmount()
  })

  it('ends the Overview with this computer, named as the realm knows it', async () => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    desktopMode.value = true
    nodeInfo.value = { node: { peer_id: 'own-device' } }
    realmInfo.value = {
      metadata_replication: { default_replication_factor: 3 },
      nodes: [{ node_id: 'own-device', kind: 'user', info: { labels: { device: 'Microbiology laptop' } } }],
    }
    const mounted = await mountApp(DashboardClient)
    await flush()

    expect(content(mounted.root)).toContain('device row Microbiology laptop')
    expect(content(mounted.root).indexOf('device row')).toBeGreaterThan(content(mounted.root).indexOf('Realm'))
    mounted.app.unmount()
  })

  it('names this computer by its own realm record first, then by the realm node copy', async () => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    desktopMode.value = true
    nodeInfo.value = { node: { peer_id: 'own-device' } }
    realmInfo.value = { metadata_replication: { default_replication_factor: 3 }, nodes: [{ node_id: 'own-device', kind: 'user', owner: 'u1', display_name: 'Lab laptop' }] }
    loadRealmView.mockResolvedValue({ info: { node: { peer_id: 'mgmt' } }, realm: { nodes: [{ node_id: 'own-device', kind: 'user', display_name: 'Old name' }] } })
    let mounted = await mountApp(DashboardClient)
    await flush()
    // The row renames this computer through the device route, by its node id.
    expect(content(mounted.root)).toContain('device row Lab laptop own-device')
    mounted.app.unmount()

    // Its own record has no name yet; the realm node's copy does.
    realmInfo.value = { metadata_replication: { default_replication_factor: 3 }, nodes: [{ node_id: 'own-device', kind: 'user' }] }
    mounted = await mountApp(DashboardClient)
    await flush()
    expect(content(mounted.root)).toContain('device row Old name')
    mounted.app.unmount()
  })

  it('offers renaming this computer only to the user who owns it', async () => {
    currentUser.value = { id: 'u2', name: 'Guest Researcher' }
    desktopMode.value = true
    nodeInfo.value = { node: { peer_id: 'own-device' } }
    realmInfo.value = { metadata_replication: { default_replication_factor: 3 }, nodes: [{ node_id: 'own-device', kind: 'user', owner: 'u1', display_name: 'Lab laptop' }] }
    const mounted = await mountApp(DashboardClient)
    await flush()

    expect(content(mounted.root)).toContain('device row Lab laptop')
    expect(content(mounted.root)).not.toContain('own-device')
    mounted.app.unmount()
  })

  it('keeps a space between the replication and the Status link', async () => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    const mounted = await mountApp(DashboardClient)
    await flush()

    expect(content(mounted.root)).toContain('Replication ×3 Status')
    mounted.app.unmount()
  })

  it('keeps the web dashboard without them', async () => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    const mounted = await mountApp(DashboardClient)
    await flush()

    expect(content(mounted.root)).not.toContain('desktop-home-cards')
    expect(content(mounted.root)).not.toContain('device row')
    // The web dashboard needs no technical subtitle.
    expect(content(mounted.root)).not.toContain('Live data from the local Aruna API.')
    mounted.app.unmount()
  })
})

describe('realm nodes in the overview', () => {
  const beat = (node_id: string, kind: string, heartbeat_at_ms: number) => ({ node_id, kind, present: true, info: { utilization: { heartbeat_at_ms } } })

  beforeEach(() => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    nodeInfo.value = { node: { peer_id: 'own-device' } }
    // The device's own view: stale heartbeats and itself as the serving node.
    realmInfo.value = {
      metadata_replication: { default_replication_factor: null },
      nodes: [beat('mgmt-node', 'management', 1000), beat('own-device', 'user', 1000)],
    }
  })

  it('lists the realm nodes from a realm node in the desktop, devices apart', async () => {
    desktopMode.value = true
    loadRealmView.mockResolvedValue({
      info: { node: { peer_id: 'mgmt-node' } },
      realm: { nodes: [beat('mgmt-node', 'management', 9000), beat('server-node', 'server', 8000), beat('own-device', 'user', 7000)] },
    })
    const mounted = await mountApp(DashboardClient)
    await flush()
    const text = content(mounted.root)

    expect(text).toContain('mgmt-node beat 9000')
    expect(text).toContain('server-node beat 8000')
    expect(text).toContain('1 devices')
    expect(text).not.toContain('beat 1000')
    mounted.app.unmount()
  })

  it('keeps a slow answer that lands after periodic refreshes', async () => {
    desktopMode.value = true
    let answer: (view: unknown) => void = () => undefined
    loadRealmView.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    loadRealmView.mockImplementation(() => new Promise(() => undefined))
    const mounted = await mountApp(DashboardClient)
    await flush()
    // Each periodic read replaces the realm info with a fresh object of the same realm.
    realmInfo.value = { ...realmInfo.value }
    await flush()
    realmInfo.value = { ...realmInfo.value }
    await flush()

    answer({ info: { node: { peer_id: 'mgmt-node' } }, realm: { nodes: [beat('mgmt-node', 'management', 9000)] } })
    await flush()

    expect(loadRealmView).toHaveBeenCalledTimes(3)
    expect(content(mounted.root)).toContain('mgmt-node beat 9000')
    mounted.app.unmount()
  })

  it('keeps the device view when no realm node answers, and the browser on its own node', async () => {
    desktopMode.value = true
    const desktop = await mountApp(DashboardClient)
    await flush()
    expect(loadRealmView).toHaveBeenCalled()
    expect(content(desktop.root)).toContain('mgmt-node beat 1000')
    desktop.app.unmount()

    loadRealmView.mockClear()
    desktopMode.value = false
    const web = await mountApp(DashboardClient)
    await flush()
    expect(loadRealmView).not.toHaveBeenCalled()
    expect(content(web.root)).toContain('mgmt-node beat 1000')
    web.app.unmount()
  })

  it('lets a realm admin rename nodes from the cards, nobody else', async () => {
    let mounted = await mountApp(DashboardClient)
    await flush()
    expect(content(mounted.root)).not.toContain('renamable')
    mounted.app.unmount()

    isRealmAdmin.value = true
    mounted = await mountApp(DashboardClient)
    await flush()
    expect(content(mounted.root)).toContain('renamable')
    mounted.app.unmount()
  })

  it('sums the imports the realm snapshot reports in the header, and drops them with a new snapshot', async () => {
    desktopMode.value = true
    // The device's own copy has no heartbeats; the realm node's snapshot counts the imports.
    loadRealmView.mockResolvedValue({
      info: { node: { peer_id: 'mgmt-node' } },
      realm: { nodes: [
        { ...beat('mgmt-node', 'management', 9000), info: { utilization: { heartbeat_at_ms: 9000, jobs_running: 12, imports_running: 9 } } },
        { ...beat('server-node', 'server', 8000), info: { utilization: { heartbeat_at_ms: 8000, imports_running: 7 } } },
      ] },
    })
    let mounted = await mountApp(DashboardClient)
    await flush()
    expect(content(mounted.root)).toContain('OverviewImports running: 16 jobs')
    mounted.app.unmount()

    // One node has no heartbeat count: the known imports are a lower bound.
    loadRealmView.mockResolvedValue({
      info: { node: { peer_id: 'mgmt-node' } },
      realm: { nodes: [
        { ...beat('mgmt-node', 'management', 9000), info: { utilization: { heartbeat_at_ms: 9000, imports_running: 2 } } },
        beat('server-node', 'server', 8000),
      ] },
    })
    mounted = await mountApp(DashboardClient)
    await flush()
    expect(content(mounted.root)).toContain('OverviewImports running: at least 2 jobs')

    // Another session reads its own snapshot; the old counts never linger.
    loadRealmView.mockResolvedValue(null)
    sessionEpoch.value++
    realmInfo.value = { metadata_replication: { default_replication_factor: null }, nodes: [beat('mgmt-node', 'management', 1000)] }
    await flush()
    await flush()
    expect(content(mounted.root)).not.toContain('Imports running')
    mounted.app.unmount()
  })
})

describe('dashboard refresh', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {})
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    myGroups.value = [{ id: 'g1', name: 'Genome Lab' }]
  })

  afterEach(() => vi.unstubAllGlobals())

  it('loads a session once when it changes during the first round and leaves the cards to themselves', async () => {
    let finish!: () => void
    refresh.mockImplementationOnce(() => new Promise<undefined>((resolve) => (finish = () => resolve(undefined))))
    const mounted = await mountApp(DashboardClient)
    sessionEpoch.value++
    await flush()
    servedEpoch = sessionEpoch.value
    finish()
    await flush()
    const revision = (name: string) => Number(content(mounted.root).match(new RegExp(`${name} (\\d+)`))?.[1])

    expect(refresh).toHaveBeenCalledOnce()
    expect([revision('group quota cards'), revision('my stats cards')]).toEqual([0, 0])
    servedEpoch = -1

    dashboardRevision.value++
    await flush()
    await flush()
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(revision('group quota cards')).toBe(1)
    mounted.app.unmount()
    servedEpoch = -1
  })

  it('reads the shared database list again with each refresh, so a newly joined group counts', async () => {
    const mounted = await mountApp(DashboardClient)
    await flush()
    expect(reloadDatabases).toHaveBeenCalledOnce()

    dashboardRevision.value++
    await flush()
    await flush()
    expect(reloadDatabases).toHaveBeenCalledTimes(2)
    mounted.app.unmount()
  })

  it('reads the group quota figures again on the info poll, never every bucket', async () => {
    const mounted = await mountApp(DashboardClient)
    await flush()
    const revision = (name: string) => Number(content(mounted.root).match(new RegExp(`${name} (\\d+)`))?.[1])
    const [cards, reachable] = [revision('group quota cards'), revision('my stats cards')]
    expect([cards, reachable].every(Number.isInteger)).toBe(true)

    await pollInfo()
    await flush()

    expect(loadInfo).toHaveBeenCalled()
    expect(revision('group quota cards')).toBe(cards + 1)
    expect(revision('my stats cards')).toBe(reachable)
    mounted.app.unmount()
  })
})
