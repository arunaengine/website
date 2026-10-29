import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flush, mountApp } from '@/test/clientRender'

// A cached session: activating a group the browser already holds resolves at once.
const activeContext = ref<Record<string, unknown> | null>(null)
// Before the realm read with the token names node 2, neither its endpoint nor a session is known.
const endpointUrl = ref<string | null>(null)
const realmInfo = ref<{ nodes: Array<{ node_id: string }> } | null>({ nodes: [] })
// The account, session, quota read and upload queue an upload test steers.
const currentUser = ref<{ id: string } | null>({ id: 'u-1' })
const sessionEpoch = ref(1)
const getGroupUsage = vi.fn(async (): Promise<unknown> => null)
const enqueue = vi.fn()
const syncList = vi.fn(async () => ({ outgoing: [] as unknown[], incoming: [] as unknown[] }))
const s3 = {
  activeContext,
  activeKey: ref({ accessKeyId: 'k' }),
  activateContext: vi.fn(async (node: string | null, groupId: string) => {
    if (!realmInfo.value?.nodes.length) throw new Error('Node n-2 does not publish an API endpoint.')
    activeContext.value = { userId: 'u-1', nodeId: node ?? 'n-local', groupId, session: { accessKeyId: `k-${groupId}` } }
  }),
  nodeIdFor: (node: string | null) => node ?? 'n-local',
  contextMismatch: () => null,
  endpointForNode: () => endpointUrl.value,
  endpoint: () => 'https://s3.example',
  canRead: () => true,
  canWrite: () => true,
  canWritePrefix: () => true,
  canDeletePrefix: () => true,
  listObjects: vi.fn(async () => ({ folders: [], objects: [{ key: 'results/alignment/genome-vs-k12.paf', name: 'genome-vs-k12.paf' }] })),
  listDeletedObjects: vi.fn(async () => ({ deleted: [], truncated: false })),
  headBucket: vi.fn(async () => undefined),
}

vi.mock('./useS3', () => ({
  useS3: () => s3,
  s3ErrorMessage: (err: Error) => err.message,
  isS3AuthError: () => false,
  isS3BucketMissingError: () => false,
  isS3SessionRejected: () => false,
  isS3NetworkError: () => false,
}))
vi.mock('./useAruna', () => ({
  useAruna: () => ({
    apiBaseUrl: ref('https://api.example'),
    authToken: ref('t'),
    currentUser,
    myGroups: ref([{ id: 'g-a', name: 'A' }, { id: 'g-b', name: 'B' }]),
    getGroupUsage: (...args: unknown[]) => getGroupUsage(...(args as [])),
    listGroupConnectors: vi.fn(async () => ({ connectors: [] })),
    listSyncRelationships: (...args: unknown[]) => syncList(...(args as [])),
    nodeInfo: ref(null),
    realmInfo,
    searchBuckets: vi.fn(),
    sessionEpoch,
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
vi.mock('./useUploadQueue', () => ({ useUploadQueue: () => ({ enqueue: (...args: unknown[]) => enqueue(...args), lastCompleted: ref(null) }) }))

const { useDataManager } = await import('./useDataManager')

const View = defineComponent({ render: () => null })
const settle = async () => {
  for (let round = 0; round < 8; round++) await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('a folder on another node opened by its address', () => {
  it('waits for the realm and never calls the unlisted folder empty', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/buckets', name: 'buckets', component: View },
        { path: '/buckets/:bucketId', name: 'bucket', component: View },
      ],
    })
    await router.push({ name: 'bucket', params: { bucketId: 'laptop' }, query: { group: 'g-a', node: 'n-2', prefix: 'results/alignment/' } })
    let manager: ReturnType<typeof useDataManager> | null = null
    const host = defineComponent({
      setup: () => {
        manager = useDataManager()
        return () => null
      },
    })
    const { app } = await mountApp(host, { router })
    await settle()
    expect(manager!.isEmpty.value).toBe(false)
    expect(s3.listObjects).not.toHaveBeenCalled()

    realmInfo.value = { nodes: [{ node_id: 'n-2' }] }
    endpointUrl.value = 'https://s3.node-2.example'
    await settle()
    await flush()

    expect(s3.listObjects).toHaveBeenCalledWith('laptop', 'results/alignment/', undefined, 'n-2', expect.anything())
    expect(manager!.visibleObjects.value.map((object) => object.key)).toEqual(['results/alignment/genome-vs-k12.paf'])
    expect(manager!.isEmpty.value).toBe(false)
    app.unmount()
  })
})

describe('the sync overview of the bucket list', () => {
  it('names the other node of each sync once, and none for a sync within one node', async () => {
    const relation = (id: string, source: string, target: string) => ({ id, source, target })
    // The view may read the overview itself at mount, so every read gets the same answer.
    syncList.mockResolvedValue({
      outgoing: [
        relation('s1', 'arn:aruna:realm:n-local:s3/reef', 'arn:aruna:realm:n-laptop:s3/reef'),
        relation('s2', 'arn:aruna:realm:n-local:s3/reef', 'arn:aruna:realm:n-laptop:s3/reef/raw'),
        relation('s3', 'arn:aruna:realm:n-local:s3/reef', 'arn:aruna:realm:n-local:s3/archive'),
      ],
      incoming: [],
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/buckets', name: 'buckets', component: View }] })
    await router.push({ name: 'buckets', query: { group: 'g-a' } })
    let manager: ReturnType<typeof useDataManager> | null = null
    const { app } = await mountApp(defineComponent({ setup: () => ((manager = useDataManager()), () => null) }), { router })
    await manager!.loadSyncOverview()

    const info = (node: string | null, bucket: string) => manager!.syncByBucket.value.get(manager!.syncKeyFor(node, bucket))
    expect(info(null, 'reef')?.partners).toEqual(['n-laptop'])
    expect(info('n-laptop', 'reef')?.partners).toEqual(['n-local'])
    expect(info(null, 'archive')?.partners).toEqual([])
    syncList.mockResolvedValue({ outgoing: [], incoming: [] })
    app.unmount()
  })
})

describe('an upload across a change of account', () => {
  async function open() {
    // The realm and the endpoint are known, so the session opens at once.
    realmInfo.value = { nodes: [{ node_id: 'n-2' }] }
    endpointUrl.value = 'https://s3.example'
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/buckets/:bucketId', name: 'bucket', component: View }] })
    await router.push({ name: 'bucket', params: { bucketId: 'reef' }, query: { group: 'g-a' } })
    let manager: ReturnType<typeof useDataManager> | null = null
    const { app } = await mountApp(defineComponent({ setup: () => ((manager = useDataManager()), () => null) }), { router })
    await settle()
    mounted.push(app)
    return manager!
  }
  // Each view goes with its test, so no earlier view opens its own session again.
  const mounted: { unmount: () => void }[] = []
  afterEach(() => mounted.splice(0).forEach((app) => app.unmount()))
  const file = { name: 'reads.fastq', size: 10 } as File

  it('never enqueues the files of the last account once the quota answer comes back', async () => {
    const manager = await open()
    let answer!: (usage: unknown) => void
    getGroupUsage.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    enqueue.mockClear()
    const upload = manager.requestUpload([file])
    currentUser.value = { id: 'u-2' }
    sessionEpoch.value++
    answer({ quota: { quota_bytes: null } })
    await upload
    expect(enqueue).not.toHaveBeenCalled()
    currentUser.value = { id: 'u-1' }
  })

  it('drops an open quota question with the account, so its confirm uploads nothing', async () => {
    const manager = await open()
    getGroupUsage.mockResolvedValueOnce({ logical_bytes: 100, quota: { quota_bytes: 50, ceiling_bytes: null, warning: false } })
    enqueue.mockClear()
    await manager.requestUpload([{ name: 'big.fastq', size: 10 } as File])
    expect(manager.precheck.value).not.toBeNull()

    sessionEpoch.value++
    await settle()
    expect(manager.precheck.value).toBeNull()
    manager.confirmPrecheckUpload()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('still uploads for the account that picked the files', async () => {
    const manager = await open()
    getGroupUsage.mockResolvedValueOnce(null)
    enqueue.mockClear()
    await manager.requestUpload([file])
    expect(enqueue).toHaveBeenCalledWith([file], expect.objectContaining({ bucket: 'reef', groupId: 'g-a', key: 'reads.fastq' }))
  })
})
