import * as VueRuntime from 'vue'
import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, content, compileClientComponent, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as NodeDisplay from '@/components/nodes/node-display'
import { formatBytes } from '@/lib/utils'
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
const isNewUser = ref(false)
const dismissOnboarding = vi.fn(async () => undefined)
const startTour = vi.fn()
const onboardingStub = { useOnboarding: () => ({ isNewUser, dismissOnboarding }) }
const tourStub = { startTour }
const PassStub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const IconButtonStub = defineComponent({
  props: { label: String },
  setup: (props, { attrs }) => () => h('button', { ...attrs, 'aria-label': props.label }, props.label),
})
const ThisComputerStub = defineComponent({
  props: { name: String, nodeId: String, connected: Object },
  setup: (props) => () => h('div', `computer section ${props.name} ${props.nodeId ?? ''} ${props.connected ? `${props.connected.count}/${props.connected.total}` : ''}`),
})
const isRealmAdmin = ref(false)
const renameNode = vi.fn(async () => undefined)
const nodeNamesStub = { useNodeNames: () => ({ renameNode }) }
// The map and the node table render what they were handed.
const MapStub = defineComponent({
  props: { nodes: { type: Array, default: () => [] }, computer: Object, highlight: String },
  emits: ['select', 'hover'],
  setup: (props) => () =>
    h('div', [
      'topology',
      ...(props.nodes as Array<{ node_id: string; info?: { utilization?: { heartbeat_at_ms?: number } } }>).map((node) =>
        h('span', ` ${node.node_id} beat ${node.info?.utilization?.heartbeat_at_ms} `)),
    ]),
})
const RunsCardStub = defineComponent({ props: { runs: Array, state: String }, setup: (props) => () => h('div', `recent runs ${props.state} ${props.runs?.length}`) })
const DatasetsCardStub = defineComponent({ props: { refreshRevision: Number }, setup: () => () => h('div', 'recent datasets') })
const TableStub = defineComponent({
  props: { nodes: { type: Array, default: () => [] }, computer: Object },
  setup: (props) => () =>
    h('table', [
      props.computer ? `first ${(props.computer as { node_id: string }).node_id} ` : '',
      ...(props.nodes as Array<{ node_id: string }>).map((node) => `row ${node.node_id} `),
    ]),
})
// The visible runs, as the landing view reads them.
const recentRunList = ref<unknown[]>([])
const runningRuns = ref({ count: 0, atLeast: false })
const runsState = ref('ready')
const loadRuns = vi.fn(async () => undefined)
// The caller's group counts, which split datasets from runs; the group cards read the same state.
const groupsAggregate = ref<{ datasets: number | null; processRuns: number | null; pending?: boolean }>({ datasets: null, processRuns: null })
const loadGroupsUsage = vi.fn(async () => undefined)
const refreshGroupsUsage = vi.fn(async () => undefined)
const groupsUsageStub = {
  useMyGroupsUsage: () => ({ aggregate: groupsAggregate, membershipKey: ref('k'), load: loadGroupsUsage, refresh: refreshGroupsUsage }),
}
const recentRunsStub = { useRecentRuns: () => ({ runs: recentRunList, running: runningRuns, state: runsState, load: loadRuns }) }
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
// The target is written out, so a test can check where a link leads.
const RouterLinkStub = defineComponent((_, { attrs, slots }) => () => h('a', { ...attrs, 'data-to': JSON.stringify(attrs.to) }, slots.default?.()))
const SkeletonStub = defineComponent(() => () => h('span', 'loading'))
const OverviewCellStub = defineComponent({
  props: { label: String, info: String },
  setup: (props, { slots }) => () => h('div', { 'data-info': props.info }, [h('span', props.label), slots.value?.(), ' ', slots.unit?.(), ' ', slots.default?.()]),
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
const SectionHeadingStub = defineComponent({
  props: { title: String, info: String },
  setup: (props, { slots }) => () => h('div', [h('h2', props.title), props.info ? h('i', props.info) : null, slots.actions?.()]),
})
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
  vi.doMock('@/composables/useRecentRuns', () => recentRunsStub)
  vi.doMock('@/composables/useMyGroupsUsage', () => groupsUsageStub)
  vi.doMock('@/components/dashboard/RealmTopology.vue', () => ({ default: MapStub }))
  vi.doMock('@/components/dashboard/NodeTable.vue', () => ({ default: TableStub }))
  vi.doMock('@/composables/useViewMode', () => ({ useViewMode: () => ref('cards') }))
  vi.doMock('@/components/dashboard/RecentRunsCard.vue', () => ({ default: RunsCardStub }))
  vi.doMock('@/components/dashboard/RecentDatasetsCard.vue', () => ({ default: DatasetsCardStub }))
  vi.doMock('@/composables/useOnboarding', () => onboardingStub)
  vi.doMock('@/composables/useTour', () => tourStub)
  vi.doMock('@/lib/config', () => ({ featureEnabled: () => true }))
  vi.doMock('@/composables/useRealmNodes', () => realmNodesStub)
  vi.doMock('@/components/ui/Skeleton.vue', () => ({ default: SkeletonStub }))
  vi.doMock('@/components/ui/SectionHeading.vue', () => ({ default: SectionHeadingStub }))
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
    '@/composables/useRecentRuns': recentRunsStub,
    '@/composables/usePublicNodes': { usePublicNodes: (recorded: unknown) => recorded },
    '@/composables/useMyGroupsUsage': groupsUsageStub,
    '@/components/dashboard/RealmTopology.vue': moduleDefault(MapStub),
    '@/components/dashboard/NodeTable.vue': moduleDefault(TableStub),
    '@/components/ui/ViewToggle.vue': moduleDefault(EmptyStub),
    '@/composables/useViewMode': { useViewMode: () => ref('cards') },
    '@/components/dashboard/RecentRunsCard.vue': moduleDefault(RunsCardStub),
    '@/components/dashboard/RecentDatasetsCard.vue': moduleDefault(DatasetsCardStub),
    '@/composables/useOnboarding': onboardingStub,
    '@/composables/useTour': tourStub,
    '@/docs/v1': { docsTopicBySlug: () => ({ tour: [] }) },
    '@/lib/config': { featureEnabled: () => true },
    '@/components/ui/IconButton.vue': moduleDefault(IconButtonStub),
    '@/components/ui/IconTile.vue': moduleDefault(EmptyStub),
    '@/components/ui/DropdownMenu.vue': moduleDefault(PassStub),
    '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(PassStub),
    '@/components/ui/DropdownMenuContent.vue': moduleDefault(PassStub),
    '@/components/ui/DropdownMenuItem.vue': moduleDefault(ButtonStub),
    '@/composables/useRealmNodes': realmNodesStub,
    '@/components/nodes/node-display': NodeDisplay,
    '@/components/ui/Skeleton.vue': moduleDefault(SkeletonStub),
    '@/components/ui/EmptyState.vue': moduleDefault(EmptyStub),
    '@/components/ui/Notice.vue': moduleDefault(PassStub),
    '@/components/ui/SectionHeading.vue': moduleDefault(SectionHeadingStub),
    '@/components/desktop/HomeCards.vue': moduleDefault(HomeCardsStub),
    '@/components/desktop/ThisComputer.vue': moduleDefault(ThisComputerStub),
    '@/lib/chunk-recovery': { asyncChunkError: vi.fn() },
    '@/lib/desktop': { isDesktop: () => desktopMode.value },
  })
})

beforeEach(() => {
  currentUser.value = null
  isNewUser.value = false
  dismissOnboarding.mockClear()
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
  groupsAggregate.value = { datasets: null, processRuns: null }
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
  recentRunList.value = []
  runningRuns.value = { count: 0, atLeast: false }
  runsState.value = 'ready'
  loadRuns.mockClear()
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

  it('renders the realm-wide totals instead of guest-filtered zeros', async () => {
    realm.value = { id: 'realm-public', name: 'Gaia realm', description: 'Shared science data' }
    realmInfo.value = {
      metadata_replication: { default_replication_factor: null },
      nodes: [],
      public_overview: { live_datasets: 23, groups: 8, nodes_configured: 4, data_bytes: 5000, objects: 70 },
    }
    profiles.value = Array.from({ length: 12 })

    const text = await renderedText()

    // Data is one total, never split into stored and referenced.
    expect(text).toContain(`Data ${formatBytes(5000).replace(/\s/g, ' ')}`)
    expect(text).not.toContain('referenced')
    expect(text).toContain('Objects 70')
    expect(text).toContain('Datasets 23')
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

    expect(text).toContain('Data Unknown')
    expect(text).toContain('Objects Unknown')
    expect(text).toContain('Datasets Unknown')
    expect(text).toContain('Realm Unknown')
    expect(text).not.toContain('0 / 0')
  })
})

describe('visitor dashboard', () => {
  it('lists the realm nodes and the recent public datasets without a session', async () => {
    realmInfo.value = {
      metadata_replication: { default_replication_factor: 3 },
      nodes: [
        { node_id: 'node-a', kind: 'server', present: true, connection_status: 'connected', configured: true },
        { node_id: 'phone', kind: 'user', present: true, connection_status: 'seen', configured: true },
      ],
    }

    const text = await renderedText()

    expect(text).toContain('row node-a')
    expect(text).not.toContain('row phone')
    expect(text).toContain('recent datasets')
    expect(text).not.toContain('recent runs')
    // The Status page has nothing to show without a session, so nothing links there.
    expect(text).not.toContain('Status')
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

  it('shows my figures in the Overview, then my groups and no node list', async () => {
    signedInRealm()

    const text = await renderedText()
    const overview = text.indexOf('Overview')
    const realmCard = text.indexOf('Realm 2 nodes')

    expect(overview).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('my stats cards')).toBeGreaterThan(overview)
    expect(text.indexOf('Runs Unknown')).toBeGreaterThan(text.indexOf('my stats cards'))
    // One state signal: an offline node turns the online count into a warning.
    expect(text.indexOf('Realm 2 nodes 1/2 online')).toBeGreaterThan(text.indexOf('Runs Unknown'))
    expect(text.indexOf('Groups A bucket stored on several nodes counts once. Cards Table group quota cards')).toBeGreaterThan(realmCard)
    expect(text).toContain('scope toggle personal')
    expect(text).not.toContain('topology')
    expect(text).not.toContain('row node-a')
    // Refresh is the only page action; creating sits in the top bar.
    expect(text).not.toContain('Create dataset')
    expect(text).not.toContain('Open datasets')
    // The old sections and the boxes the sidebar already offers are gone.
    for (const gone of ['My statistics', 'Realm statistics', 'Replica-inclusive placement records held', 'Open Data']) {
      expect(text).not.toContain(gone)
    }
  })

  it('ends with groups, recent runs and recent datasets side by side, and no runs card without compute', async () => {
    signedInRealm()
    const text = await renderedText()
    const groups = text.indexOf('group quota cards')
    expect(groups).toBeGreaterThan(text.indexOf('Realm 2 nodes'))
    expect(text.indexOf('recent runs ready 0')).toBeGreaterThan(groups)
    expect(text.indexOf('recent datasets')).toBeGreaterThan(text.indexOf('recent runs'))

    runsState.value = 'off'
    expect(await renderedText()).not.toContain('recent runs')
  })

  it('points a user without a name to the profile settings until a name is set', async () => {
    signedInRealm()
    currentUser.value = { id: 'user-id', name: 'user-id', email: '' }
    expect(await renderedText()).toContain('Your profile has no name or email, so others see your user id. Add them in your profile settings')

    currentUser.value = { id: 'user-id', name: '', email: 'ada@example.org' }
    expect(await renderedText()).toContain('Your profile has no name, so others see your user id. Add it in your profile settings')

    currentUser.value = { id: 'user-id', name: 'Ada Lovelace', email: '' }
    expect(await renderedText()).not.toContain('Your profile has no name')
  })

  it('keeps the Groups section without groups and offers to create one', async () => {
    signedInRealm()
    myGroups.value = []
    const html = await renderToString(createSSRApp(DashboardView))
    const text = await renderedText()

    expect(text).toContain('Groups A bucket stored on several nodes counts once.')
    expect(text).toContain('You are not a member of any group yet, create one to get started. Create a group')
    expect(text).not.toContain('group quota cards')
    // The link opens the create dialog of the Groups page.
    expect(html).toContain(`data-to="${JSON.stringify({ name: 'groups', query: { create: 'group' } }).replace(/"/g, '&quot;')}"`)
  })

  it('shows the realm figures in the same cells when the account stored that scope', async () => {
    signedInRealm()
    scope.value = 'realm'
    databaseState.value = 'ready'
    databaseRows.value = [{}, {}]
    groupsAggregate.value = { datasets: 0, processRuns: 4 }
    runningRuns.value = { count: 0, atLeast: false }
    runsState.value = 'ready'

    const text = await renderedText()

    expect(text).toContain('scope toggle realm')
    expect(text).toContain('Storage 2.1 KiB total 2 KiB stored 64 B referenced')
    // The database list holds only what this caller may read, so it is no realm total.
    expect(text).toContain('Objects 11 3 buckets')
    expect(text).not.toContain('database')
    // The realm counts no runs apart, so the card counts the groups' runs and says so.
    expect(text).toContain('Runs 4')
    expect(text).not.toContain('in your groups')
    expect(text).not.toContain('completed')
    expect(text).not.toContain('9 datasets')

    // While a group still loads, the card waits instead of showing a partial sum.
    groupsAggregate.value = { datasets: 0, processRuns: 1, pending: true }
    const waiting = await renderedText()
    expect(waiting).not.toContain('Runs 1')
    // The realm scope lists the nodes instead of the groups.
    expect(text).toContain('Realm Status topology')
    expect(text).toMatch(/row node-a\s+row node-b/)
    expect(text).not.toContain('group quota cards')
    expect(text).not.toContain('my stats cards')
  })

  it('gives the Runs card the same hint in every scope', async () => {
    signedInRealm()
    groupsAggregate.value = { datasets: 0, processRuns: 4 }
    const hint = async () => /data-info="([^"]*)"[^>]*><span>Runs</.exec(await renderToString(createSSRApp(DashboardView)))?.[1]

    scope.value = 'personal'
    expect(await hint()).toBe('Runs of your groups. The realm counts no runs of its own.')
    scope.value = 'realm'
    expect(await hint()).toBe('Runs of your groups. The realm counts no runs of its own.')
  })

  it('switches the section through the stored scope', async () => {
    vi.stubGlobal('window', {})
    signedInRealm()

    const mounted = await mountApp(DashboardClient)
    expect(content(mounted.root)).toContain('my stats cards')
    expect(content(mounted.root)).not.toMatch(/Runs\s*2/)

    await click(button(mounted.root, 'show realm'))
    expect(setScope).toHaveBeenCalledWith('realm')

    // The composable flips `scope` optimistically; the view follows it.
    groupsAggregate.value = { datasets: 1, processRuns: 2 }
    scope.value = 'realm'
    await flush()
    expect(content(mounted.root)).toMatch(/Runs\s*2/)
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

    // The device is never counted or listed among the realm nodes.
    expect(text).toContain('Realm 1 node 1/1 online')
    expect(text).toContain('row server-node')
    expect(text).not.toContain('row owned-device')
  })

  it('names the metadata copies and claims no data replication', async () => {
    currentUser.value = { id: 'user-id', name: 'Ada Lovelace' }
    realmInfo.value = { metadata_replication: { default_replication_factor: 3 }, nodes: [{ node_id: 'server-node', kind: 'server', present: true }] }

    const text = await renderedText()

    expect(text).toContain('Metadata on 3 nodes')
    expect(text).not.toContain('Replication')
  })
})

describe('welcome card', () => {
  it('greets a new user on the web with the docs, the tour and the tutorials', async () => {
    vi.stubGlobal('window', {})
    currentUser.value = { id: 'user-id', name: 'Ada Lovelace' }
    isNewUser.value = true

    const mounted = await mountApp(DashboardClient)
    const text = content(mounted.root)
    for (const shown of ['New here? Start with the basics.', 'Open the docs', 'Take the tour', 'Tutorials', 'Compute tutorial', 'Profile tutorial']) {
      expect(text).toContain(shown)
    }
    await click(button(mounted.root, 'Take the tour'))
    expect(startTour).toHaveBeenCalled()
    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Not now'))
    expect(dismissOnboarding).toHaveBeenCalledOnce()
    mounted.app.unmount()
    vi.unstubAllGlobals()
  })

  it('leaves it out for a returning user, while a session resolves, for a visitor and in the desktop', async () => {
    currentUser.value = { id: 'user-id', name: 'Ada Lovelace' }
    expect(await renderedText()).not.toContain('New here?')

    isNewUser.value = true
    authPending.value = true
    expect(await renderedText()).not.toContain('New here?')

    authPending.value = false
    currentUser.value = null
    expect(await renderedText()).not.toContain('New here?')

    currentUser.value = { id: 'user-id', name: 'Ada Lovelace' }
    desktopMode.value = true
    const mounted = await mountApp(DashboardClient)
    expect(content(mounted.root)).not.toContain('New here?')
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

  it('shows this computer above the Overview, named as the realm knows it, with the nodes it reaches', async () => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    desktopMode.value = true
    scope.value = 'realm'
    nodeInfo.value = { node: { peer_id: 'own-device' }, connections: [{ peer_id: 'mgmt', status: 'connected' }] }
    realmInfo.value = {
      metadata_replication: { default_replication_factor: 3 },
      nodes: [
        { node_id: 'own-device', kind: 'user', info: { labels: { device: 'Microbiology laptop' } } },
        { node_id: 'mgmt', kind: 'management', present: true },
        { node_id: 'store', kind: 'server', present: true },
      ],
    }
    const mounted = await mountApp(DashboardClient)
    await flush()

    expect(content(mounted.root)).toContain('computer section Microbiology laptop  1/2')
    expect(content(mounted.root).indexOf('computer section')).toBeLessThan(content(mounted.root).indexOf('Overview'))
    expect(content(mounted.root).indexOf('computer section')).toBeGreaterThan(content(mounted.root).indexOf('desktop-home-cards'))
    // The realm table lists this computer first.
    expect(content(mounted.root)).toContain('first own-device')
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
    expect(content(mounted.root)).toContain('computer section Lab laptop own-device')
    mounted.app.unmount()

    // Its own record has no name yet; the realm node's copy does.
    realmInfo.value = { metadata_replication: { default_replication_factor: 3 }, nodes: [{ node_id: 'own-device', kind: 'user' }] }
    mounted = await mountApp(DashboardClient)
    await flush()
    expect(content(mounted.root)).toContain('computer section Old name')
    mounted.app.unmount()
  })

  it('offers renaming this computer only to the user who owns it', async () => {
    currentUser.value = { id: 'u2', name: 'Guest Researcher' }
    desktopMode.value = true
    nodeInfo.value = { node: { peer_id: 'own-device' } }
    realmInfo.value = { metadata_replication: { default_replication_factor: 3 }, nodes: [{ node_id: 'own-device', kind: 'user', owner: 'u1', display_name: 'Lab laptop' }] }
    const mounted = await mountApp(DashboardClient)
    await flush()

    expect(content(mounted.root)).toContain('computer section Lab laptop ')
    expect(content(mounted.root)).not.toContain('own-device')
    mounted.app.unmount()
  })

  it('keeps the web dashboard without them', async () => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    const mounted = await mountApp(DashboardClient)
    await flush()

    expect(content(mounted.root)).not.toContain('desktop-home-cards')
    expect(content(mounted.root)).not.toContain('computer section')
    // The web dashboard needs no technical subtitle.
    expect(content(mounted.root)).not.toContain('Live data from the local Aruna API.')
    mounted.app.unmount()
  })
})

describe('realm nodes in the overview', () => {
  const beat = (node_id: string, kind: string, heartbeat_at_ms: number) => ({ node_id, kind, present: true, info: { utilization: { heartbeat_at_ms } } })

  beforeEach(() => {
    currentUser.value = { id: 'u1', name: 'Lena Hartmann' }
    scope.value = 'realm'
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
    expect(text).toMatch(/Realm\s*2\s*nodes/)
    expect(text).not.toContain('beat 1000')
    mounted.app.unmount()
  })

  it('draws the topology even when the nodes carry coordinates', async () => {
    realmInfo.value = {
      metadata_replication: { default_replication_factor: null },
      nodes: [{ ...beat('mgmt-node', 'management', 1000), coordinates: { lat: 50.58, lon: 8.68 } }, beat('own-device', 'user', 1000)],
    }
    const mounted = await mountApp(DashboardClient)
    await flush()
    expect(content(mounted.root)).toContain('topology')
    expect(content(mounted.root)).toContain('mgmt-node beat 1000')
    mounted.app.unmount()
  })

  it('keeps the group figures fresh for the Runs card while no group card is shown', async () => {
    const mounted = await mountApp(DashboardClient)
    await flush()
    expect(loadGroupsUsage).toHaveBeenCalled()
    refreshGroupsUsage.mockClear()
    await pollInfo()
    await flush()
    expect(refreshGroupsUsage).toHaveBeenCalledOnce()
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

  it('sums the imports the realm snapshot reports in the realm scope, and drops them with a new snapshot', async () => {
    desktopMode.value = true
    scope.value = 'realm'
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
    expect(content(mounted.root).replace(/\s+/g, ' ')).toContain('Realm2 nodes 16 importing')
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
    expect(content(mounted.root).replace(/\s+/g, ' ')).toContain('at least 2 importing')

    // Another session reads its own snapshot; the old counts never linger. No count yet: the online count.
    loadRealmView.mockResolvedValue(null)
    sessionEpoch.value++
    realmInfo.value = { metadata_replication: { default_replication_factor: null }, nodes: [beat('mgmt-node', 'management', 1000)] }
    await flush()
    await flush()
    expect(content(mounted.root)).not.toContain('importing')
    expect(content(mounted.root)).toContain('1/1 online')
    mounted.app.unmount()

    // One node says 0 and another has no count yet: nothing known, so the online count.
    loadRealmView.mockResolvedValue({
      info: { node: { peer_id: 'mgmt-node' } },
      realm: { nodes: [
        { ...beat('mgmt-node', 'management', 9000), info: { utilization: { heartbeat_at_ms: 9000, imports_running: 0 } } },
        beat('server-node', 'server', 8000),
      ] },
    })
    mounted = await mountApp(DashboardClient)
    await flush()
    expect(content(mounted.root)).not.toContain('importing')
    mounted.app.unmount()

    // Every node says 0: zero is known.
    loadRealmView.mockResolvedValue({
      info: { node: { peer_id: 'mgmt-node' } },
      realm: { nodes: [
        { ...beat('mgmt-node', 'management', 9000), info: { utilization: { heartbeat_at_ms: 9000, imports_running: 0 } } },
        { ...beat('server-node', 'server', 8000), info: { utilization: { heartbeat_at_ms: 8000, imports_running: 0 } } },
      ] },
    })
    mounted = await mountApp(DashboardClient)
    await flush()
    expect(content(mounted.root)).toContain('0 importing')
    mounted.app.unmount()
  })

  it('counts the listed runs as completed only when the list holds every run, else the running ones', async () => {
    scope.value = 'personal'
    myGroups.value = [{ id: 'g1', name: 'Genome Lab' }]
    groupsAggregate.value = { datasets: 0, processRuns: 3 }
    const run = (state: string) => ({ task: { id: state + Math.random(), state }, nodeId: null })
    recentRunList.value = [run('COMPLETE'), run('COMPLETE'), run('EXECUTOR_ERROR')]
    expect(await renderedText()).toContain('Runs 3 2/3 completed')

    runningRuns.value = { count: 1, atLeast: true }
    expect(await renderedText()).toContain('Runs 3 at least 1 running')

    runningRuns.value = { count: 0, atLeast: true }
    expect(await renderedText()).not.toContain('completed')
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
