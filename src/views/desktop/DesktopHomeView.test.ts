import { createSSRApp, computed, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceCompute, DeviceSyncStatus, DeviceTransfer, SyncedFolder } from '@/lib/deviceApi'
import type { NodeStatus } from '@/lib/desktopBridge'

const status = ref<NodeStatus | null>(null)
const nodeState = ref('running')
const nodeLabel = ref('online')
const deviceClient = ref<{ baseUrl: string; token: string } | null>(null)
const identity = ref<{ nodeId: string; realm: string } | null>(null)
const folders = ref<SyncedFolder[]>([])
const foldersState = ref('ready')
const syncTransfers = ref<DeviceTransfer[]>([])
const transfersState = ref('ready')
const compute = ref<DeviceCompute | null>(null)
const computeShown = ref(true)
const syncStatus = ref<DeviceSyncStatus>({
  realmReachable: true,
  lastSyncMs: null,
  pendingTotal: 0,
  documents: [],
  datasets: [],
})
const syncState = ref('ready')
const realmJobs = ref<Array<{ job_id: string; state: string }>>([])
const uploadItems = ref<Array<{ id: number; state: string }>>([])
const credentials = ref<Array<{ access_key_id: string; status: string }>>([])
const keysState = ref('ready')
const latestDecision = ref<{ text: string; atMs: number | null } | null>(null)
const startNode = vi.fn()

function folder(overrides: Partial<SyncedFolder> = {}): SyncedFolder {
  return {
    folder_id: 'f1',
    root: '/home/me/data-2026',
    local_bucket: 'dev-data',
    group_id: 'g1',
    remote: { node_id: 'n1', bucket: 'lab', prefix: 'raw/' },
    mode: 'two_way',
    propagate_deletes: true,
    state: 'active',
    counters: {
      in_sync: 412,
      uploading: 3,
      conflicts: 2,
      pending_replacements: 0,
      remote_deleted: 0,
      errors: 0,
    },
    last_reconcile_ms: null,
    created_at_ms: null,
    message: null,
    ...overrides,
  }
}

const EmptyStub = defineComponent(() => () => null)
// Renders the route it points at, so the home's destinations are testable.
const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], required: true } },
  setup: (props, { slots }) => () =>
    h('a', { href: typeof props.to === 'string' ? props.to : `#${(props.to as { name?: string }).name}` }, slots.default?.()),
})
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const TooltipStub = defineComponent((_, { slots }) => () => h('span', [slots.default?.(), slots.content?.()]))

let DesktopHomeView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ RouterLink: RouterLinkStub }))
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => ({ currentUser: ref({ id: 'u1' }) }) }))
  vi.doMock('@/composables/usePortalFeatures', () => ({ usePortalFeatures: () => ({ shown: (feature: string) => feature !== 'compute' || computeShown.value }) }))
  vi.doMock('@/composables/useRealm', () => ({
    useRealm: () => ({ realm: ref({ name: 'Test realm', shortName: 'Testrealm' }) }),
  }))
  vi.doMock('@/composables/useDeviceStatus', () => ({
    useDeviceStatus: () => ({
      status,
      state: nodeState,
      label: nodeLabel,
      identity,
      deviceClient,
      refresh: vi.fn(async () => undefined),
    }),
  }))
  vi.doMock('@/composables/useSyncedFolders', () => ({
    useSyncedFolders: () => ({
      folders,
      listState: foldersState,
      needsYouTotal: computed(() =>
        folders.value.reduce(
          (sum, entry) =>
            sum + entry.counters.conflicts + entry.counters.pending_replacements + entry.counters.remote_deleted,
          0,
        ),
      ),
      ensureLoaded: vi.fn(async () => undefined),
    }),
  }))
  vi.doMock('@/composables/useDeviceTransfers', () => ({
    useDeviceTransfers: () => ({
      all: syncTransfers,
      active: computed(() => syncTransfers.value.filter((entry) => entry.state === 'running')),
      state: transfersState,
      load: vi.fn(async () => undefined),
    }),
  }))
  vi.doMock('@/composables/useDeviceKeys', () => ({
    useDeviceKeys: () => ({ active: computed(() => credentials.value.filter((key) => key.status === 'active')), state: keysState }),
  }))
  vi.doMock('@/composables/useFolderDecisions', () => ({
    useFolderDecisions: () => ({ latest: latestDecision, load: vi.fn(async () => undefined) }),
  }))
  vi.doMock('@/composables/useNodeControl', () => ({
    useNodeControl: () => ({ busy: ref(false), error: ref(null), start: startNode }),
  }))
  vi.doMock('@/composables/useRealmNodes', () => ({
    useRealmNodes: () => ({ nodeById: () => null, displayName: () => 'lab node' }),
  }))
  vi.doMock('@/composables/useDeviceCompute', () => ({
    useDeviceCompute: () => ({ compute, ensureLoaded: vi.fn(async () => undefined) }),
  }))
  vi.doMock('@/composables/useDeviceSync', () => ({
    useDeviceSync: () => ({
      status: syncStatus,
      state: syncState,
      needsOwner: computed(
        () =>
          syncStatus.value.documents.filter((doc) => doc.state === 'invalid' || doc.state === 'failed').length +
          syncStatus.value.datasets.reduce((sum, set) => sum + set.conflicts, 0),
      ),
      load: vi.fn(async () => undefined),
    }),
  }))
  vi.doMock('@/composables/useJobs', () => ({
    useJobsList: () => ({ jobs: realmJobs, load: vi.fn(async () => undefined) }),
  }))
  vi.doMock('@/composables/useUploadQueue', () => ({ useUploadQueue: () => ({ items: uploadItems }) }))
  vi.doMock('@/lib/config', () => ({ featureEnabled: () => true }))
  vi.doMock('@/components/desktop/BindFolderDialog.vue', () => ({ default: EmptyStub }))
  vi.doMock('@/components/ui/Button.vue', () => ({ default: ButtonStub }))
  vi.doMock('@/components/ui/Badge.vue', () => ({ default: BadgeStub }))
  vi.doMock('@/components/ui/Tooltip.vue', () => ({ default: TooltipStub }))
  vi.doMock('@/components/ui/Skeleton.vue', () => ({ default: EmptyStub }))
  DesktopHomeView = (await import('./DesktopHomeView.vue')).default
})

beforeEach(() => {
  status.value = {
    state: 'running',
    nodeId: '01HZY7QK4N8ZP3V2C6M9AB',
    realm: 'realm-id',
    enrolled: true,
    enrolling: false,
    ready: true,
    apiBaseUrl: 'http://127.0.0.1:9000/api/v1',
    version: '0.4.0',
    uptimeSeconds: 3600,
    message: null,
    realmMismatch: null,
    updateRequired: null,
  }
  nodeState.value = 'running'
  nodeLabel.value = 'online'
  deviceClient.value = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' }
  identity.value = null
  folders.value = [folder()]
  foldersState.value = 'ready'
  syncTransfers.value = []
  transfersState.value = 'ready'
  compute.value = null
  computeShown.value = true
  realmJobs.value = []
  uploadItems.value = []
  credentials.value = []
  keysState.value = 'ready'
  latestDecision.value = null
  startNode.mockReset()
  syncStatus.value = {
    realmReachable: true,
    lastSyncMs: null,
    pendingTotal: 0,
    documents: [],
    datasets: [],
  }
  syncState.value = 'ready'
})

function render(): Promise<string> {
  return renderToString(createSSRApp(DesktopHomeView))
}

function transfer(overrides: Partial<DeviceTransfer> = {}): DeviceTransfer {
  return {
    id: 't1',
    direction: 'upload',
    folder_id: 'f1',
    path: 'raw/scan.tiff',
    bucket: 'lab',
    key: 'raw/scan.tiff',
    state: 'transferring',
    bytes_total: 100,
    bytes_done: 40,
    attempts: 1,
    next_attempt_ms: null,
    message: null,
    ...overrides,
  }
}

describe('desktop home', () => {
  it('names the node in one pill and keeps the long plate out', async () => {
    const html = await render()

    expect(html).toContain('Running')
    expect(html).toContain('Version')
    expect(html).toContain('Running for 1 hour')
    expect(html).toContain('Signed in to Test realm')
    expect(html).not.toContain('joining the realm')
    expect(html).not.toContain('Open buckets')
    expect(html).not.toContain('Drafts on this computer')
  })

  it('offers the two things to do from the header', async () => {
    const html = await render()

    expect(html).toContain('Connect your tools')
    expect(html).toContain('Link a local folder')
    expect(html).toContain('#tools')
  })

  it('puts the decisions the folders are waiting for on the folder row', async () => {
    const html = await render()

    expect(html).toContain('data-2026')
    expect(html).toContain('2 files need you')
    expect(html).toContain('lab/raw/ on')
  })

  it('lists folders in one card that opens the sync page', async () => {
    const html = await render()

    expect(html).toContain('#sync')
    expect(html).not.toContain('#folders')
    expect(html).not.toContain('#transfers')
  })

  it('reflects a folder transfer in that folder chip', async () => {
    folders.value = [folder({ counters: { ...folder().counters, uploading: 0, conflicts: 0 } })]
    syncTransfers.value = [transfer()]

    expect(await render()).toContain('Sending 1 file')
  })

  it('shows real progress only for bytes the node counted', async () => {
    syncTransfers.value = [transfer(), transfer({ id: 't2', path: 'raw/old.tiff', state: 'running', bytes_done: 0 })]
    const html = await render()

    expect(html).toContain('40%')
    expect(html).toContain('raw/old.tiff')
    expect(html).not.toMatch(/\b0%/)
  })

  it('counts failed files and the last decision under Activity', async () => {
    syncTransfers.value = [transfer({ state: 'failed' }), transfer({ id: 't2', state: 'failed' })]
    latestDecision.value = { text: 'Kept your version of report.xlsx', atMs: Date.now() }
    const html = await render()

    expect(html).toContain('2 files failed')
    expect(html).toContain('Retry')
    expect(html).toContain('Kept your version of report.xlsx')
  })

  it('says nothing moves instead of inventing activity', async () => {
    expect(await render()).toContain('Nothing is moving right now.')
  })

  it('walks through the first steps until each one is done', async () => {
    folders.value = []
    compute.value = null
    const html = await render()

    expect(html).toContain('Get started')
    expect(html).toContain('0 of 3 done')
    expect(html).toContain('Connect your tools')
    expect(html).toContain('Turn on local runs')
  })

  it('counts a step as done only on what the node and realm reported', async () => {
    credentials.value = [{ access_key_id: 'AK1', status: 'active' }]
    compute.value = { ...enabledCompute(), enabled: false }
    const html = await render()

    expect(html).toContain('2 of 3 done')
  })

  it('drops the list once every step is done', async () => {
    credentials.value = [{ access_key_id: 'AK1', status: 'active' }]
    compute.value = enabledCompute()

    expect(await render()).not.toContain('Get started')
  })

  it('shows no steps before the folders have loaded', async () => {
    foldersState.value = 'loading'
    folders.value = []

    expect(await render()).not.toContain('Get started')
  })

  it('shows no steps before the keys of this computer are read', async () => {
    keysState.value = 'loading'

    expect(await render()).not.toContain('Get started')
  })

  it('leaves out the runs step and card while compute is switched off', async () => {
    computeShown.value = false
    compute.value = enabledCompute()
    const html = await render()

    expect(html).not.toContain('in Testrealm')
    expect(html).not.toContain('Turn on local runs')
    expect(html).not.toContain('>Runs<')
  })

  it('shows the runs card only once the node runs jobs', async () => {
    realmJobs.value = [{ job_id: 'j1', state: 'running' }]
    expect(await render()).not.toContain('in Testrealm')

    compute.value = enabledCompute()
    const html = await render()

    expect(html).toContain('on this computer')
    expect(html).toContain('in Testrealm')
  })

  it('offers Start when the node is stopped', async () => {
    nodeState.value = 'stopped'
    deviceClient.value = null
    folders.value = []
    foldersState.value = 'offline'
    status.value = { ...status.value!, state: 'stopped', ready: false, message: 'The node was stopped by its owner.' }

    const html = await render()

    expect(html).toContain('Stopped')
    expect(html).toContain('This computer is not running.')
    expect(html).toContain('The node was stopped by its owner.')
    expect(html).toContain('Start')
    expect(html).not.toContain('Nothing syncs with this computer yet.')
  })

  it('does not read as running while the node is not serving yet', async () => {
    status.value = { ...status.value!, ready: false, message: 'The node is still starting.' }

    const html = await render()

    expect(html).toContain('Starting')
    expect(html).toContain('The node is still starting.')
    expect(html).not.toContain('This computer is running')
  })

  it('shows a draft card only while a draft waits', async () => {
    // Drafts load on mount, which a server render never reaches.
    const html = await render()

    expect(html).not.toContain('waiting to be published')
  })
})

function enabledCompute(): DeviceCompute {
  return {
    enabled: true,
    backend: 'docker',
    healthy: true,
    limits: { max_cpu_cores: null, max_ram_bytes: null, max_disk_bytes: null, max_concurrent: null },
    running: 0,
    queued: 0,
    paused: false,
    message: null,
  }
}
