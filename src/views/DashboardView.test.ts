import * as VueRuntime from 'vue'
import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, content, compileClientComponent, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import { docsTopicBySlug } from '@/docs/v1'

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
const setScope = vi.fn(async () => undefined)
const refresh = vi.fn(async () => undefined)
let servedEpoch = -1
const loadInfo = vi.fn(async () => undefined)
const loadRealmView = vi.fn(async (): Promise<unknown> => null)
const signIn = vi.fn(async () => undefined)
const isNewUser = ref(false)
const dismissOnboarding = vi.fn(async () => undefined)
const startTour = vi.fn()
const tesEnabled = ref(true)

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
  props: { nodes: { type: Array, default: () => [] }, devices: { type: Array, default: () => [] } },
  setup: (props) => () =>
    h('div', [
      ...(props.nodes as Array<{ node_id: string; info?: { utilization?: { heartbeat_at_ms?: number } } }>).map((node) =>
        h('span', ` ${node.node_id} beat ${node.info?.utilization?.heartbeat_at_ms} `),
      ),
      h('em', `${props.devices.length} devices`),
    ]),
})
// Running imports by node, as the composable reads them.
const importsTotal = ref({ running: 0, atLeast: false })
const loadImports = vi.fn(async () => undefined)
const importsStub = { useNodeImports: () => ({ imports: ref(new Map()), total: importsTotal, load: loadImports }) }
const realmNodesStub = { useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'own-device' }) }
const databasesStub = { useDatabases: () => ({ rows: databaseRows, state: databaseState, complete: ref(true), ensure: () => {} }) }
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
  vi.doMock('@/composables/useOnboarding', () => ({
    useOnboarding: () => ({ isNewUser, dismissOnboarding }),
  }))
  vi.doMock('@/composables/useTour', () => ({ startTour }))
  vi.doMock('@/lib/config', async () => ({
    ...(await vi.importActual<typeof import('@/lib/config')>('@/lib/config')),
    featureEnabled: () => tesEnabled.value,
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
  vi.doMock('@/composables/useNodeImports', () => importsStub)
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
    '@/composables/useOnboarding': { useOnboarding: () => ({ isNewUser, dismissOnboarding }) },
    '@/composables/useTour': { startTour },
    '@/docs/v1': { docsTopicBySlug },
    '@/lib/config': { featureEnabled: () => tesEnabled.value },
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
    '@/composables/useNodeImports': importsStub,
    '@/composables/useRealmNodes': realmNodesStub,
    '@/components/ui/Skeleton.vue': moduleDefault(SkeletonStub),
    '@/components/ui/EmptyState.vue': moduleDefault(EmptyStub),
    '@/components/desktop/HomeCards.vue': moduleDefault(HomeCardsStub),
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
  isNewUser.value = false
  dismissOnboarding.mockClear()
  startTour.mockClear()
  tesEnabled.value = true
  refresh.mockClear()
  loadInfo.mockClear()
  loadRealmView.mockReset()
  loadRealmView.mockResolvedValue(null)
  databaseRows.value = []
  databaseState.value = 'idle'
  importsTotal.value = { running: 0, atLeast: false }
  loadImports.mockClear()
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
    expect(text).toContain('Data 11 objects 3 buckets, 2 databases')
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

describe('welcome card', () => {
  beforeEach(() => {
    currentUser.value = { id: 'user-id', name: 'Ada Lovelace' }
    isNewUser.value = true
  })

  it('leads with the docs and the tour, tutorials behind them', async () => {
    const text = await renderedText()

    expect(text).toContain('New here? Start with the basics.')
    expect(text).toContain('Open the docs')
    expect(text).toContain('Take the tour')
    expect(text).toContain('Compute tutorial')
    expect(text).toContain('Profile tutorial')
    expect(text).toContain('Not now')
  })

  it('points the docs button at the portal tour topic', async () => {
    const mounted = await mountApp(DashboardClient)

    const link = element(mounted.root, (node) => node.tag === 'a' && content(node).trim() === 'Open the docs')

    expect(link.props.to).toEqual({ name: 'docs', params: { topic: 'portal-tour' } })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('starts the portal tour from the card', async () => {
    const mounted = await mountApp(DashboardClient)

    await click(button(mounted.root, 'Take the tour'))

    expect(startTour).toHaveBeenCalledWith(docsTopicBySlug('portal-tour')?.tour)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('leaves the compute tutorial out where the node runs nothing', async () => {
    tesEnabled.value = false

    const text = await renderedText()

    expect(text).toContain('Profile tutorial')
    expect(text).not.toContain('Compute tutorial')
  })

  it('stays away from an account that already answered', async () => {
    isNewUser.value = false

    expect(await renderedText()).not.toContain('New here? Start with the basics.')
  })

  it('stays away while a stored session is still resolving', async () => {
    authPending.value = true

    expect(await renderedText()).not.toContain('New here? Start with the basics.')
  })

  it('stays away from a visitor who is not signed in', async () => {
    currentUser.value = null

    expect(await renderedText()).not.toContain('New here? Start with the basics.')
  })

  it('records the refusal when the card is dismissed', async () => {
    const mounted = await mountApp(DashboardClient)

    await click(button(mounted.root, 'Not now'))

    expect(dismissOnboarding).toHaveBeenCalledTimes(1)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})

describe('desktop home', () => {
  it('adds the desktop cards and its own description in the desktop', async () => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    desktopMode.value = true
    const mounted = await mountApp(DashboardClient)
    await flush()

    expect(content(mounted.root)).toContain('desktop-home-cards')
    expect(content(mounted.root)).toContain('Your realm and this computer at a glance.')
    mounted.app.unmount()
  })

  it('puts the welcome banner above the desktop cards', async () => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    isNewUser.value = true
    desktopMode.value = true
    const mounted = await mountApp(DashboardClient)
    await flush()
    const text = content(mounted.root)

    expect(text.indexOf('New here? Start with the basics.')).toBeGreaterThan(-1)
    expect(text.indexOf('New here? Start with the basics.')).toBeLessThan(text.indexOf('desktop-home-cards'))
    mounted.app.unmount()
  })

  it('keeps the web dashboard without them', async () => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    const mounted = await mountApp(DashboardClient)
    await flush()

    expect(content(mounted.root)).not.toContain('desktop-home-cards')
    expect(content(mounted.root)).toContain('Live data from the local Aruna API.')
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

  it('reads the imports of the realm nodes with each round and names them in the header', async () => {
    vi.stubGlobal('window', {})
    const mounted = await mountApp(DashboardClient)
    await flush()
    expect(loadImports).toHaveBeenCalledWith(['mgmt-node'], expect.any(Function))
    expect(content(mounted.root)).not.toContain('Imports running')

    importsTotal.value = { running: 16, atLeast: false }
    await flush()
    expect(content(mounted.root)).toContain('OverviewImports running: 16 jobs')
    mounted.app.unmount()
    vi.unstubAllGlobals()
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
