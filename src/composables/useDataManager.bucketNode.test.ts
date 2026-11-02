import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { flush, mountApp } from '@/test/clientRender'

// A cached session: activating a group the browser already holds resolves at once.
const activeContext = ref<Record<string, unknown> | null>(null)
const endpointUrl = ref('https://s3.example')
const searchBuckets = vi.fn(async (_q: string, _options?: unknown) => ({
  hits: [
    { bucket: 'laptop-old', node_id: 'n-local', group_id: 'g-a' },
    { bucket: 'laptop', node_id: 'n-2', group_id: 'g-a' },
  ],
  nodes_queried: 2,
  nodes_failed: 0,
  failed_nodes: [],
}))
const s3 = {
  activeContext,
  activeKey: ref({ accessKeyId: 'k' }),
  activateContext: vi.fn(async (_node: string | null, groupId: string) => {
    activeContext.value = { userId: 'u-1', nodeId: 'n-local', groupId, session: { accessKeyId: `k-${groupId}` } }
  }),
  nodeIdFor: () => 'n-local',
  contextMismatch: () => null,
  endpointForNode: () => endpointUrl.value,
  endpoint: () => 'https://s3.example',
  canRead: () => true,
  canWrite: () => true,
  canWritePrefix: () => true,
  canDeletePrefix: () => true,
  // The serving node lacks the bucket; another node of the group holds it.
  listObjects: vi.fn(async (_bucket: string, _prefix: string, _token: unknown, node: string | null) => {
    if (!node) throw new Error('That bucket does not exist.')
    return { folders: [], objects: [] }
  }),
  listDeletedObjects: vi.fn(async () => ({ deleted: [], truncated: false })),
  headBucket: vi.fn(async () => undefined),
}

vi.mock('./useS3', () => ({
  useS3: () => s3,
  s3ErrorMessage: (err: Error) => err.message,
  isS3AuthError: () => false,
  isS3BucketMissingError: () => true,
  isS3SessionRejected: () => false,
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
    searchBuckets,
    sessionEpoch: ref(1),
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

describe('bucket address without a node', () => {
  it('opens the bucket on the node of the group that holds it', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/buckets', name: 'buckets', component: View },
        { path: '/buckets/:bucketId', name: 'bucket', component: View },
      ],
    })
    await router.push({ name: 'bucket', params: { bucketId: 'laptop' }, query: { group: 'g-a', prefix: 'runs/' } })
    const host = defineComponent({
      setup: () => {
        useDataManager()
        return () => null
      },
    })
    await mountApp(host, { router })
    for (let round = 0; round < 8; round++) await new Promise((resolve) => setTimeout(resolve, 0))

    expect(searchBuckets).toHaveBeenCalledWith('laptop', { limit: 50, groupId: 'g-a' })
    expect(router.currentRoute.value.query).toEqual({ group: 'g-a', prefix: 'runs/', node: 'n-2' })
    await flush()
  })

  it('drops a lookup of another group once a bucket of the new group opened', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/buckets', name: 'buckets', component: View },
        { path: '/buckets/:bucketId', name: 'bucket', component: View },
      ],
    })
    // Only the group-A lookup of the missing bucket waits; the bucket list answers at once.
    let answerA: ((value: unknown) => void) | null = null
    const answer = searchBuckets.getMockImplementation()!
    searchBuckets.mockImplementation((query: string, options?: unknown) =>
      query === 'laptop' && (options as { groupId?: string }).groupId === 'g-a' && !answerA
        ? (new Promise((resolve) => (answerA = resolve)) as never)
        : answer(query, options))
    await router.push({ name: 'bucket', params: { bucketId: 'laptop' }, query: { group: 'g-a' } })
    const host = defineComponent({
      setup: () => {
        useDataManager()
        return () => null
      },
    })
    await mountApp(host, { router })
    for (let round = 0; round < 8; round++) await new Promise((resolve) => setTimeout(resolve, 0))
    expect(searchBuckets).toHaveBeenLastCalledWith('laptop', { limit: 50, groupId: 'g-a' })

    await router.push({ name: 'bucket', params: { bucketId: 'laptop' }, query: { group: 'g-b' } })
    for (let round = 0; round < 8; round++) await new Promise((resolve) => setTimeout(resolve, 0))
    answerA!({ hits: [{ bucket: 'laptop', node_id: 'n-2', group_id: 'g-a' }], nodes_queried: 2, nodes_failed: 0, failed_nodes: [] })
    for (let round = 0; round < 8; round++) await new Promise((resolve) => setTimeout(resolve, 0))

    expect(router.currentRoute.value.query).toEqual({ group: 'g-b' })
    searchBuckets.mockImplementation(answer)
  })
})

describe('deleted bucket', () => {
  async function open(query: Record<string, string>) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/buckets', name: 'buckets', component: View },
        { path: '/buckets/:bucketId', name: 'bucket', component: View },
      ],
    })
    await router.push({ name: 'bucket', params: { bucketId: 'gone' }, query })
    let manager: ReturnType<typeof useDataManager> | null = null
    const host = defineComponent({
      setup: () => {
        manager = useDataManager()
        return () => null
      },
    })
    await mountApp(host, { router })
    for (let round = 0; round < 8; round++) await new Promise((resolve) => setTimeout(resolve, 0))
    return { router, manager: manager! }
  }

  it('is gone when the node of the address no longer has it', async () => {
    const original = s3.listObjects.getMockImplementation()!
    s3.listObjects.mockImplementation(async () => {
      throw new Error('That bucket does not exist.')
    })
    const { router, manager } = await open({ group: 'g-a', node: 'n-2' })
    expect(manager.bucketMissing.value).toBe(true)
    expect(router.currentRoute.value.query).toEqual({ group: 'g-a', node: 'n-2' })
    s3.listObjects.mockImplementation(original)
    await flush()
  })

  it('stays unknown with a retry when a node did not answer the search', async () => {
    const answer = searchBuckets.getMockImplementation()!
    searchBuckets.mockImplementation(async () => ({ hits: [], nodes_queried: 2, nodes_failed: 1, failed_nodes: [] }))
    const { manager } = await open({ group: 'g-a' })
    expect(manager.bucketMissing.value).toBe(false)
    expect(manager.listError.value).toContain('Not every node answered')
    searchBuckets.mockImplementation(answer)
    await flush()
  })

  it('reads every search page before it calls a bucket gone', async () => {
    const answer = searchBuckets.getMockImplementation()!
    searchBuckets.mockImplementation(async (_q: string, options?: unknown) => {
      const more = !(options as { cursor?: string }).cursor
      const hits = more ? [] : [{ bucket: 'gone', node_id: 'n-2', group_id: 'g-a' }]
      return { hits, nodes_queried: 2, nodes_failed: 0, failed_nodes: [], ...(more ? { next_cursor: 'c2' } : {}) }
    })
    const { router, manager } = await open({ group: 'g-a' })
    expect(manager.bucketMissing.value).toBe(false)
    expect(router.currentRoute.value.query).toEqual({ group: 'g-a', node: 'n-2' })
    searchBuckets.mockImplementation(answer)
    await flush()
  })

  it('is gone when no node of the group holds it', async () => {
    const { router, manager } = await open({ group: 'g-a' })
    expect(searchBuckets).toHaveBeenCalledWith('gone', { limit: 50, groupId: 'g-a' })
    expect(manager.bucketMissing.value).toBe(true)
    expect(router.currentRoute.value.query).toEqual({ group: 'g-a' })
    await flush()
  })
})
