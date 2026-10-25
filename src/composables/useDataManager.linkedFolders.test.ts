import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flush, mountApp } from '@/test/clientRender'
import type { SyncedFolder } from '@/lib/deviceApi'

// A cached session: activating a group the browser already holds resolves at once.
const activeContext = ref<Record<string, unknown> | null>(null)
const s3 = {
  activeContext,
  activeKey: ref({ accessKeyId: 'k' }),
  activateContext: vi.fn(async (_node: string | null, groupId: string) => {
    activeContext.value = { userId: 'u-1', nodeId: 'n-local', groupId, session: { accessKeyId: `k-${groupId}` } }
  }),
  nodeIdFor: () => 'n-local',
  contextMismatch: () => null,
  endpointForNode: () => 'https://s3.example',
  endpoint: () => 'https://s3.example',
  canRead: () => true,
  canWrite: () => true,
  canWritePrefix: () => true,
  canDeletePrefix: () => true,
  listObjects: vi.fn(async () => ({ folders: [], objects: [] })),
  listDeletedObjects: vi.fn(async () => ({ deleted: [], truncated: false })),
  headBucket: vi.fn(async () => undefined),
}

vi.mock('./useS3', () => ({
  useS3: () => s3,
  s3ErrorMessage: (err: Error) => err.message,
  isS3AuthError: () => false,
  isS3BucketMissingError: () => false,
  isS3NetworkError: () => false,
}))
vi.mock('./useAruna', () => ({
  useAruna: () => ({
    apiBaseUrl: ref('https://api.example'),
    authToken: ref('t'),
    currentUser: ref({ id: 'u-1' }),
    myGroups: ref([{ id: 'g-a', name: 'A' }, { id: 'g-b', name: 'B' }]),
    getGroupUsage: vi.fn(async () => null),
    listGroupConnectors: vi.fn(async () => ({ connectors: [] })),
    listSyncRelationships: vi.fn(async () => ({ outgoing: [], incoming: [] })),
    nodeInfo: ref(null),
    realmInfo: ref(null),
  }),
}))
vi.mock('./useBuckets', () => ({
  useBuckets: () => ({
    buckets: ref([{ name: 'reef' }, { name: 'archive' }]),
    loaded: ref(true),
    loading: ref(false),
    refreshing: ref(false),
    error: ref(null),
    authError: ref(false),
    ensure: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
  }),
}))
vi.mock('./useBucketShortcuts', () => ({
  useBucketShortcuts: () => ({ pinned: ref([]), recent: ref([]), recordRecent: vi.fn(), remove: vi.fn() }),
}))
vi.mock('./useGroupSelection', () => ({
  useGroupContext: () => ({ groupsLoading: ref(false), hasGroups: ref(true) }),
}))
vi.mock('./usePublicAccess', () => ({ usePublicAccess: () => ({ isPublic: () => false }) }))
vi.mock('./useRealmNodes', () => ({
  useRealmNodes: () => ({
    isLocalNode: (id: string) => id === 'n-local',
    displayName: (id: string) => id,
    localNodeId: ref('n-local'),
  }),
}))
vi.mock('./useStagingReferences', () => ({
  useStagingReferences: () => ({
    entries: ref([]),
    referencedByKey: ref(new Map()),
    stats: ref({ count: 0, bytes: 0, groups: [] }),
    reload: vi.fn(async () => undefined),
  }),
}))
vi.mock('./useUploadQueue', () => ({ useUploadQueue: () => ({ enqueue: vi.fn(), lastCompleted: ref(null) }) }))
const desktop = vi.hoisted(() => ({ on: true }))
const folders = ref<SyncedFolder[]>([])
const ensureLoaded = vi.fn(async () => undefined)
const load = vi.fn(async () => undefined)
const CLIENT = { baseUrl: 'http://127.0.0.1:34116/api/v1', token: 't' }
const deviceClient = ref<typeof CLIENT | null>(CLIENT)
vi.mock('@/lib/desktop', async (original) => ({
  ...(await original<typeof import('@/lib/desktop')>()),
  isDesktop: () => desktop.on,
}))
vi.mock('./useSyncedFolders', () => ({ useSyncedFolders: () => ({ folders, ensureLoaded, load }) }))
vi.mock('./useDeviceStatus', () => ({ useDeviceStatus: () => ({ deviceClient }) }))

const { useDataManager } = await import('./useDataManager')

const View = defineComponent({ render: () => null })

function folder(id: string, nodeId: string, bucket: string): SyncedFolder {
  return { folder_id: id, root: `/home/me/${id}`, remote: { node_id: nodeId, bucket, prefix: '' } } as SyncedFolder
}

let unmount = () => {}
afterEach(() => unmount())

beforeEach(() => {
  desktop.on = true
  ensureLoaded.mockReset()
  load.mockReset()
  deviceClient.value = CLIENT
  folders.value = [
    folder('reef-folder', 'n-local', 'reef'),
    folder('far-folder', 'n-far', 'archive'),
    folder('second', 'n-far', 'archive'),
    folder('unnamed', '', 'loose'),
  ]
})

async function start() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/buckets', name: 'buckets', component: View },
      { path: '/buckets/:bucketId', name: 'bucket', component: View },
    ],
  })
  await router.push({ name: 'bucket', params: { bucketId: 'reef' }, query: { group: 'g-a' } })
  let manager: ReturnType<typeof useDataManager> | null = null
  const host = defineComponent({
    setup: () => {
      manager = useDataManager()
      return () => null
    },
  })
  const { app, errors } = await mountApp(host, { router })
  expect(errors).toEqual([])
  unmount = () => app.unmount()
  await flush()
  return manager!
}

describe('buckets linked to a folder on this computer', () => {
  it('reads the folders and matches each by its node and bucket', async () => {
    const manager = await start()

    expect(ensureLoaded).toHaveBeenCalledTimes(1)
    expect(manager.linkedFolderFor('n-far', 'archive')?.folder_id).toBe('far-folder')
    expect(manager.linkedFolderFor('n-far', 'reef')).toBeNull()
    expect(manager.linkedFolderFor('n-other', 'archive')).toBeNull()
  })

  it('treats the connected node and its own id as the same place', async () => {
    const manager = await start()

    expect(manager.linkedFolderFor(null, 'reef')?.folder_id).toBe('reef-folder')
    expect(manager.linkedFolderFor('n-local', 'reef')?.folder_id).toBe('reef-folder')
    expect(manager.currentLinkedFolder.value?.folder_id).toBe('reef-folder')
  })

  it('never links a bucket through a folder without a node', async () => {
    const manager = await start()

    expect(manager.linkedFolderFor(null, 'loose')).toBeNull()
  })

  it('follows a folder that is linked or removed later', async () => {
    const manager = await start()
    folders.value = [folder('scans', 'n-far', 'scans')]

    expect(manager.linkedFolderFor('n-far', 'scans')?.folder_id).toBe('scans')
    expect(manager.currentLinkedFolder.value).toBeNull()
  })

  it('reads the folders once this computer answers', async () => {
    // Opened straight into Data: the node answers only after the view asked for the folders.
    const listed = folders.value
    folders.value = []
    deviceClient.value = null
    ensureLoaded.mockImplementation(async () => {
      if (deviceClient.value) folders.value = listed
    })
    const manager = await start()
    expect(manager.linkedFolderFor('n-far', 'archive')).toBeNull()

    deviceClient.value = CLIENT
    await flush()

    expect(ensureLoaded).toHaveBeenCalledTimes(2)
    expect(manager.linkedFolderFor('n-far', 'archive')?.folder_id).toBe('far-folder')
  })

  it('reads the folders again on refresh', async () => {
    const manager = await start()
    load.mockImplementation(async () => {
      folders.value = [folder('scans', 'n-local', 'reef')]
    })

    await manager.onRefresh()

    expect(load).toHaveBeenCalledTimes(1)
    expect(manager.currentLinkedFolder.value?.folder_id).toBe('scans')
  })

  it('reads and links nothing on the web', async () => {
    desktop.on = false
    const manager = await start()

    expect(ensureLoaded).not.toHaveBeenCalled()
    expect(manager.linkedFolderFor(null, 'reef')).toBeNull()
    expect(manager.currentLinkedFolder.value).toBeNull()
  })
})
