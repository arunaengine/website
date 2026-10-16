import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flush, mountApp } from '@/test/clientRender'

// A cached session: activating a group the browser already holds resolves at once.
const nodeIdFor = (node?: string | null) => (node && node !== 'n-local' ? node : 'n-local')
const searchBuckets = vi.fn(async () => ({ hits: [], nodes_queried: 1, nodes_failed: 0, failed_nodes: [] }))
const activeContext = ref<Record<string, unknown> | null>(null)
const s3 = {
  activeContext,
  activeKey: ref({ accessKeyId: 'k' }),
  activateContext: vi.fn(async (node: string | null, groupId: string) => {
    activeContext.value = { userId: 'u-1', nodeId: nodeIdFor(node), groupId, session: { accessKeyId: `k-${groupId}` } }
  }),
  nodeIdFor,
  createBucket: vi.fn<(name: string) => Promise<void>>(async () => undefined),
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
    sessionEpoch: ref(1),
    searchBuckets,
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

const { useDataManager } = await import('./useDataManager')

const View = defineComponent({ render: () => null })
const settle = async () => {
  // Router navigations settle over several tasks; a few empty turns let them finish.
  for (let round = 0; round < 6; round++) await new Promise((resolve) => setTimeout(resolve, 0))
}

async function start() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/buckets', name: 'buckets', component: View },
      { path: '/buckets/:bucketId', name: 'bucket', component: View },
    ],
  })
  await router.push({ name: 'buckets', query: { group: 'g-a' } })
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
  await settle()
  return { router, manager: manager! }
}

let unmount = () => {}
afterEach(() => unmount())

beforeEach(() => {
  searchBuckets.mockClear()
  s3.createBucket.mockReset().mockResolvedValue(undefined)
  activeContext.value = null
})

describe('bucket list node choice', () => {
  it('keeps the chosen node on the manager while that node opens', async () => {
    const { router, manager } = await start()
    expect(manager.bucketNodeChoice.value).toBeNull()

    manager.pickNode('n-far')
    await settle()

    expect(router.currentRoute.value.query.node).toBe('n-far')
    expect(manager.bucketNodeChoice.value).toBe('n-far')
    expect(activeContext.value?.nodeId).toBe('n-far')
  })

  it('reloads the all-nodes list on Refresh', async () => {
    const { manager } = await start()
    const before = searchBuckets.mock.calls.length
    expect(before).toBeGreaterThan(0)

    void manager.onRefresh()
    await flush()

    expect(searchBuckets.mock.calls.length).toBe(before + 1)
  })

  it('opens a new bucket only when the group stayed the same', async () => {
    const { router, manager } = await start()
    let finish!: () => void
    s3.createBucket.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)))
    manager.newBucketName.value = 'fresh-bucket'
    const creating = manager.createBucket()

    manager.selectedGroupId.value = 'g-b'
    await settle()
    finish()
    await creating
    await settle()

    expect(s3.createBucket).toHaveBeenCalledWith('fresh-bucket')
    expect(router.currentRoute.value.params.bucketId).toBeUndefined()
  })

  it('opens a new bucket on the node it was created on', async () => {
    const { router, manager } = await start()
    manager.newBucketName.value = 'fresh-bucket'

    await manager.createBucket()
    await settle()

    expect(router.currentRoute.value.params.bucketId).toBe('fresh-bucket')
  })
})
