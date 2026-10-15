import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { flush, mountApp } from '@/test/clientRender'

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

const { useDataManager } = await import('./useDataManager')

const View = defineComponent({ render: () => null })

describe('search hit in another group', () => {
  it('opens the hit bucket even when the cached session syncs its group query', async () => {
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
    const { errors } = await mountApp(host, { router })
    expect(errors).toEqual([])
    await flush()
    expect(activeContext.value?.groupId).toBe('g-a')

    manager!.openSearchHit({ bucket: 'archive', node_id: 'n-local', group_id: 'g-b', group_name: 'B' } as never)
    // Router navigations settle over several tasks; a few empty turns let both finish.
    for (let round = 0; round < 6; round++) await new Promise((resolve) => setTimeout(resolve, 0))

    expect(router.currentRoute.value.params.bucketId).toBe('archive')
    expect(router.currentRoute.value.query.group).toBe('g-b')
    expect(activeContext.value?.groupId).toBe('g-b')
  })
})
