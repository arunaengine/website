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

let DesktopHomeView: Component

beforeAll(async () => {
  vi.doMock('vue-router', () => ({ RouterLink: RouterLinkStub }))
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => ({ currentUser: ref({ id: 'u1' }) }) }))
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
  realmJobs.value = []
  uploadItems.value = []
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

describe('desktop home', () => {
  it('leads with what the node on this machine is', async () => {
    const html = await render()

    expect(html).toContain('This computer')
    expect(html).toContain('online')
    expect(html).toContain('Testrealm')
    expect(html).toContain('0.4.0')
    expect(html).toContain('1h 00m')
  })

  it('puts the decisions the folders are waiting for in front', async () => {
    const html = await render()

    expect(html).toContain('folder bound')
    expect(html).toContain('data-2026')
    expect(html).toContain('412 in sync')
    expect(html).toContain('2 waiting for your decision')
  })

  it('keeps every sync surface in one card', async () => {
    const html = await render()

    expect(html).toContain('#sync')
    expect(html).not.toContain('#folders')
    expect(html).not.toContain('#transfers')
    expect(html).toContain('Sync')
  })

  it('counts transfers from both halves of the machine', async () => {
    syncTransfers.value = [
      {
        id: 't1',
        direction: 'upload',
        folder_id: 'f1',
        path: 'raw/scan.tiff',
        bucket: 'lab',
        key: 'raw/scan.tiff',
        state: 'running',
        bytes_total: 100,
        bytes_done: 40,
        attempts: 1,
        next_attempt_ms: null,
        message: null,
      },
    ]
    uploadItems.value = [{ id: 1, state: 'uploading' }]

    const html = await render()

    expect(html).toContain('2</span> in flight')
    expect(html).toContain('1 from folder sync')
    expect(html).toContain('raw/scan.tiff')
  })

  it('separates the runs by where they execute', async () => {
    realmJobs.value = [{ job_id: 'j1', state: 'running' }]
    compute.value = {
      enabled: false,
      backend: null,
      healthy: false,
      limits: { max_cpu_cores: null, max_ram_bytes: null, max_disk_bytes: null, max_concurrent: null },
      running: 0,
      queued: 0,
      paused: false,
      message: null,
    }

    const html = await render()

    expect(html).toContain('on this computer')
    expect(html).toContain('in Testrealm')
    expect(html).toContain('runs no jobs itself yet')
  })

  it('names the state of a node with no identity yet', async () => {
    status.value = { ...status.value!, nodeId: null, enrolled: false, enrolling: true }
    expect(await render()).toContain('joining the realm')

    status.value = { ...status.value!, enrolling: false }
    expect(await render()).toContain('not set up')
  })

  it('takes the node id from the node itself', async () => {
    // The shell reports none, so an enrolled device must not read as unset.
    status.value = { ...status.value!, nodeId: null }
    expect(await render()).toContain('joined')

    identity.value = { nodeId: '01HZY7QK4N8ZP3V2C6M9AB', realm: 'realm-id' }
    const html = await render()

    expect(html).toContain('01HZY7QK')
    expect(html).not.toContain('joined')
  })

  it('says the node is down instead of showing an empty folder list', async () => {
    nodeState.value = 'stopped'
    nodeLabel.value = 'stopped'
    deviceClient.value = null
    folders.value = []
    foldersState.value = 'offline'
    status.value = { ...status.value!, state: 'stopped', message: 'The node was stopped by its owner.' }

    const html = await render()

    expect(html).toContain('not running')
    expect(html).toContain('The node was stopped by its owner.')
    expect(html).not.toContain('folder bound')
  })

  it('does not read as online while the node is not serving yet', async () => {
    nodeLabel.value = 'starting'
    status.value = { ...status.value!, ready: false, message: 'The node is still starting.' }

    const html = await render()

    expect(html).toContain('The node is still starting.')
    expect(html).not.toContain('online')
  })

  it('separates what the sync owes from what it cannot fix alone', async () => {
    syncStatus.value = {
      realmReachable: false,
      lastSyncMs: null,
      pendingTotal: 3,
      documents: [
        {
          documentId: 'd1',
          path: 'lab/run.json',
          groupId: 'g1',
          state: 'invalid',
          pendingEdits: 1,
          localOnly: false,
          validationFindings: 2,
          lastError: null,
          lastSyncedMs: null,
        },
      ],
      datasets: [
        { folderId: 'f1', label: 'data-2026', state: 'pending', pendingUploads: 2, unsyncedFiles: 2, conflicts: 1 },
      ],
    }

    const html = await render()

    expect(html).toContain('3</span> changes pending')
    expect(html).toContain('2 need your attention')
    expect(html).toContain('Offline: your edits go out once it answers.')
  })

  it('invents no drafts while the first read is still in flight', async () => {
    // Drafts load on mount, which a server render never reaches.
    const html = await render()

    expect(html).toContain('Drafts on this device')
    expect(html).not.toContain('waiting to be published')
    expect(html).not.toContain('does not serve')
  })
})
