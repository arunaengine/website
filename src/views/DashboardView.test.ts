import * as VueRuntime from 'vue'
import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, content, compileClientComponent, flush, moduleDefault, mountApp } from '@/test/clientRender'

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
const setScope = vi.fn(async () => undefined)
const refresh = vi.fn(async () => undefined)
const loadInfo = vi.fn(async () => undefined)
const listRecentMetadata = vi.fn(async () => [])
const signIn = vi.fn(async () => undefined)
const isNewUser = ref(false)
const dismissOnboarding = vi.fn(async () => undefined)
const tesEnabled = ref(true)

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup(props, { slots }) {
    return () => h('header', [h('h1', props.title), h('p', props.description), slots.actions?.()])
  },
})
const RouterLinkStub = defineComponent((_, { attrs, slots }) => () => h('a', attrs, slots.default?.()))
const StatCardStub = defineComponent({
  props: { label: String, value: [String, Number], hint: String },
  setup(props) {
    return () => h('div', [h('strong', String(props.value)), h('span', props.label), props.hint ? h('small', props.hint) : null])
  },
})
const SkeletonStub = defineComponent(() => () => h('span', 'loading'))
const GroupQuotaCardsStub = defineComponent(() => () => h('div', 'group quota cards'))
const MyStatsCardsStub = defineComponent(() => () => h('div', 'my stats cards'))
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
// Renders what it was handed, so the view's own node/device split is testable.
const FederationPanelStub = defineComponent({
  props: { nodes: { type: Array, default: () => [] }, devices: { type: Array, default: () => [] } },
  setup: (props) => () =>
    h('div', [
      'federation panel',
      ...(props.nodes as Array<{ node_id: string }>).map((node) => h('span', ` ${node.node_id} `)),
      h('em', `${props.devices.length} devices`),
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
      listRecentMetadata,
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
  vi.doMock('@/components/dashboard/FederationPanel.vue', () => ({ default: FederationPanelStub }))
  vi.doMock('@/components/dashboard/GroupQuotaCards.vue', () => ({ default: GroupQuotaCardsStub }))
  vi.doMock('@/components/dashboard/MyStatsCards.vue', () => ({ default: MyStatsCardsStub }))
  vi.doMock('@/components/dashboard/DashboardScopeToggle.vue', () => ({ default: ScopeToggleStub }))
  vi.doMock('@/components/metadata/ProfileChip.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/ui/StatCard.vue', () => ({ default: StatCardStub }))
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
        loadInfo,
        listRecentMetadata,
      }),
    },
    '@/composables/useAuth': { useAuth: () => ({ authPending }) },
    '@vueuse/core': {
      useDocumentVisibility: () => ref('hidden'),
      useIntervalFn: () => ({ pause: vi.fn(), resume: vi.fn() }),
    },
    '@/lib/poll': { POLL_SLOW_MS: 15_000, follow: () => () => {}, onWake: () => () => {} },
    '@/composables/useNotifications': { useNotifications: () => ({ dashboardRevision }) },
    '@/composables/useDashboardScope': { useDashboardScope: () => ({ scope, setScope }) },
    '@/composables/useOnboarding': { useOnboarding: () => ({ isNewUser, dismissOnboarding }) },
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
    '@/components/dashboard/FederationPanel.vue': moduleDefault(FederationPanelStub),
    '@/components/dashboard/GroupQuotaCards.vue': moduleDefault(GroupQuotaCardsStub),
    '@/components/dashboard/MyStatsCards.vue': moduleDefault(MyStatsCardsStub),
    '@/components/dashboard/DashboardScopeToggle.vue': moduleDefault(ScopeToggleStub),
    '@/components/metadata/ProfileChip.vue': moduleDefault(EmptyStub),
    '@/components/auth/SignInPanel.vue': moduleDefault(EmptyStub),
    '@/components/ui/StatCard.vue': moduleDefault(StatCardStub),
    '@/components/ui/Skeleton.vue': moduleDefault(SkeletonStub),
    '@/components/ui/EmptyState.vue': moduleDefault(EmptyStub),
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
  setScope.mockClear()
  authPending.value = false
  authStage.value = 'idle'
  authStageError.value = null
  isNewUser.value = false
  dismissOnboarding.mockClear()
  tesEnabled.value = true
  refresh.mockClear()
  loadInfo.mockClear()
  listRecentMetadata.mockClear()
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
    expect(text).not.toContain('Realm statistics')
    mounted.app.unmount()
    vi.unstubAllGlobals()
  })

  it('reads again when the dashboard is opened', async () => {
    // The view mounts fresh on every visit, so opening it must not show the
    // numbers of the previous visit until the slow poll lands.
    await renderedText()

    expect(listRecentMetadata).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('renders the dashboard while the recency window settles', async () => {
    vi.stubGlobal('window', {})
    let resolveRecent!: (value: never[]) => void
    const pendingRecent = new Promise<never[]>((resolve) => {
      resolveRecent = resolve
    })
    listRecentMetadata.mockImplementationOnce(() => pendingRecent)

    const mounted = await mountApp(DashboardClient)
    expect(content(mounted.root)).not.toContain('Loading dashboard')
    expect(content(mounted.root)).toContain('Realm statistics')
    expect(content(mounted.root)).toContain('Recent datasets')

    resolveRecent([])
    await flush()

    expect(content(mounted.root)).toContain('Realm statistics')
    mounted.app.unmount()
    vi.unstubAllGlobals()
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

    expect(text).toMatch(/23 Live datasets/)
    expect(text).toMatch(/8 Realm groups/)
    expect(text).toMatch(/4 Configured nodes/)
    expect(text).toContain('Gaia realm')
    expect(text).toContain('Shared science data')
    expect(text).toContain('Sign in')
    expect(text).not.toContain('Loaded profiles')
    expect(text).not.toContain('Nodes online')
    expect(text).not.toContain('0 / 0')
    expect(text).not.toContain('My statistics')
    expect(text).not.toContain('my stats cards')
    expect(text).not.toContain('scope toggle')
    expect(text).not.toContain('federation panel')
  })

  it('renders absent public counts as unknown rather than zero', async () => {
    const text = await renderedText()

    expect(text).toMatch(/Unknown Live datasets/)
    expect(text).toMatch(/Unknown Realm groups/)
    expect(text).toMatch(/Unknown Configured nodes/)
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
        { node_id: 'node-a', info: { utilization: { documents_held: 6 } } },
        { node_id: 'node-b', info: { utilization: {} } },
      ],
    }
  }

  it('shows My statistics alone by default, then the nodes panel', async () => {
    signedInRealm()

    const text = await renderedText()
    const personalIndex = text.indexOf('My statistics')

    expect(personalIndex).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('my stats cards')).toBeGreaterThan(personalIndex)
    expect(text.indexOf('group quota cards')).toBeGreaterThan(personalIndex)
    expect(text.indexOf('federation panel')).toBeGreaterThan(personalIndex)
    expect(text).toContain('scope toggle personal')
    expect(text).not.toContain('Realm statistics')
    expect(text).not.toContain('Replica-inclusive placement records held')
  })

  it('shows the realm section alone when the account stored that scope', async () => {
    signedInRealm()
    scope.value = 'realm'

    const text = await renderedText()

    expect(text).toContain('Realm statistics')
    expect(text).toContain('scope toggle realm')
    expect(text).toContain('Replica-inclusive placement records held')
    expect(text).toContain('1 of 2 nodes reporting')
    expect(text).not.toContain('My statistics')
    expect(text).not.toContain('my stats cards')
    expect(text).not.toContain('group quota cards')
  })

  it('switches the section through the stored scope', async () => {
    vi.stubGlobal('window', {})
    signedInRealm()

    const mounted = await mountApp(DashboardClient)
    expect(content(mounted.root)).toContain('my stats cards')
    expect(content(mounted.root)).not.toContain('Realm statistics')

    await click(button(mounted.root, 'show realm'))
    expect(setScope).toHaveBeenCalledWith('realm')

    // The composable flips `scope` optimistically; the view follows it.
    scope.value = 'realm'
    await flush()
    expect(content(mounted.root)).toContain('Realm statistics')
    expect(content(mounted.root)).not.toContain('my stats cards')
    mounted.app.unmount()
    vi.unstubAllGlobals()
  })

  it('keeps the realm section to realm-wide figures only', async () => {
    signedInRealm()
    scope.value = 'realm'

    const text = await renderedText()

    expect(text).toMatch(/9 Realm datasets/)
    expect(text).toMatch(/8 Realm groups/)
    expect(text).toMatch(/11 Objects/)
    expect(text).toMatch(/2 KB Stored data/)
    expect(text).toMatch(/3 Buckets/)
    expect(text).toContain('Logical size across the realm')
    // Node-local counters and the client-window tile moved out of the section.
    expect(text).not.toContain('Loaded profiles')
    expect(text).not.toContain('physical blob locations')
    expect(text).not.toContain('Aggregate blob storage on this node')
    expect(text).not.toContain('Node-reported total')
  })

  it('keeps devices out of node health and counts them apart', async () => {
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

    expect(text).toContain('server-node')
    expect(text).not.toContain('owned-device')
    expect(text).toContain('1 devices')
    expect(text).toMatch(/1 \/ 1 Nodes online/)
  })
})

describe('welcome card', () => {
  beforeEach(() => {
    currentUser.value = { id: 'user-id', name: 'Ada Lovelace' }
    isNewUser.value = true
  })

  it('offers both tutorials to an account that has answered nothing', async () => {
    const text = await renderedText()

    expect(text).toContain('New here? Practise on made-up data.')
    expect(text).toContain('Start the compute tutorial')
    expect(text).toContain('Build a profile')
    expect(text).toContain('Not now')
  })

  it('leaves the compute tutorial out where the node runs nothing', async () => {
    tesEnabled.value = false

    const text = await renderedText()

    expect(text).toContain('Build a profile')
    expect(text).not.toContain('Start the compute tutorial')
  })

  it('stays away from an account that already answered', async () => {
    isNewUser.value = false

    expect(await renderedText()).not.toContain('New here? Practise on made-up data.')
  })

  it('stays away while a stored session is still resolving', async () => {
    authPending.value = true

    expect(await renderedText()).not.toContain('New here? Practise on made-up data.')
  })

  it('stays away from a visitor who is not signed in', async () => {
    currentUser.value = null

    expect(await renderedText()).not.toContain('New here? Practise on made-up data.')
  })

  it('records the refusal when the card is dismissed', async () => {
    const mounted = await mountApp(DashboardClient)

    await click(button(mounted.root, 'Not now'))

    expect(dismissOnboarding).toHaveBeenCalledTimes(1)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
