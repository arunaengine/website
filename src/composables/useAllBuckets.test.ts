import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type BucketSearchHit, type BucketSearchResponse } from '@/lib/api'

const searchBuckets = vi.fn<
  (q: string, options: { limit?: number; groupId?: string; cursor?: string; database?: boolean }) => Promise<BucketSearchResponse>
>()
// The real session state and token setter; only the search request is a stand-in.
vi.mock('@/composables/useAruna', async () => {
  const state = await import('@/composables/aruna/state')
  const identity = await import('@/composables/aruna/identity')
  return {
    useAruna: () => ({
      apiBaseUrl: state.apiBaseUrl,
      currentUser: identity.currentUser,
      // The public database listing is its own request; these tests cover the group's pages.
      searchBuckets: (q: string, options: { database?: boolean }) =>
        options.database ? Promise.resolve({ hits: [], nodes_queried: 1, nodes_failed: 0, failed_nodes: [] }) : searchBuckets(q, options),
      sessionEpoch: state.sessionEpoch,
    }),
  }
})

// The realm names a node's kind once its list arrives; device-1 is a device.
const deviceKnown = ref(true)
vi.mock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => ({ isTarget: (id: string) => !deviceKnown.value || id !== 'device-1' }) }))

const { BUCKET_PAGE, forgetBucket, useAllBuckets } = await import('./useAllBuckets')
const { userInfo } = await import('@/composables/aruna/state')
const { setAuthToken } = await import('@/composables/aruna/session')

// What loading the identity after a token change puts in place.
function signIn(userId: string | null) {
  userInfo.value = userId
    ? ({ user: { user_id: userId, name: userId, attributes: {} }, preferences: {} } as never)
    : null
}

function hit(bucket: string, group = 'g1', node = 'n1'): BucketSearchHit {
  return { arn: '', bucket, node_id: node, group_id: group, created_at: '' }
}

function answer(hits: BucketSearchHit[], extra: Partial<BucketSearchResponse> = {}): BucketSearchResponse {
  return { hits, nodes_queried: 3, nodes_failed: 0, failed_nodes: [], ...extra }
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await nextTick()
}

const scopes: ReturnType<typeof effectScope>[] = []

function start(enabled = true) {
  const query = ref('')
  const scope = effectScope()
  scopes.push(scope)
  const list = scope.run(() => useAllBuckets(query, ref('g1'), ref(enabled)))!
  return { query, list, scope }
}

describe('all-nodes bucket list', () => {
  beforeEach(() => {
    searchBuckets.mockReset()
    setAuthToken('t1')
    signIn('u1')
  })
  afterEach(() => {
    vi.useRealTimers()
    scopes.splice(0).forEach((scope) => scope.stop())
  })

  it('shows the last first page on a new visit while it is read again', async () => {
    searchBuckets.mockResolvedValue(answer([hit('results')]))
    const first = start()
    await settle()
    first.scope.stop()
    let answerNow: (value: BucketSearchResponse) => void = () => {}
    searchBuckets.mockReturnValue(new Promise((resolve) => (answerNow = resolve)))
    const { list } = start()
    await settle()
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['results'])
    expect(list.loading.value).toBe(true)
    answerNow(answer([hit('results'), hit('new')]))
    await settle()
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['results', 'new'])
  })

  it('never shows a deleted bucket from the last first page', async () => {
    searchBuckets.mockResolvedValue(answer([hit('results'), hit('gone')]))
    const first = start()
    await settle()
    first.scope.stop()
    forgetBucket('gone')
    searchBuckets.mockReturnValue(new Promise(() => {}))
    const { list } = start()
    await settle()
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['results'])
  })

  it('shows no page of another account', async () => {
    searchBuckets.mockResolvedValue(answer([hit('mine')]))
    start().scope.stop()
    await settle()
    setAuthToken('t2')
    signIn('u2')
    searchBuckets.mockReturnValue(new Promise(() => {}))
    const { list } = start()
    await settle()
    expect(list.hits.value).toEqual([])
  })

  it('leaves out a device bucket once the realm names the device, after the answer came', async () => {
    deviceKnown.value = false
    searchBuckets.mockResolvedValue(answer([hit('results', 'g1', 'n2'), hit('laptop-notes', 'g1', 'device-1')]))
    const { list } = start()
    await settle()
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['results', 'laptop-notes'])

    deviceKnown.value = true
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['results'])
  })

  it('leaves out the buckets a device answers for', async () => {
    searchBuckets.mockResolvedValue(answer([hit('results', 'g1', 'n2'), hit('laptop-notes', 'g1', 'device-1')]))
    const { list } = start()
    await settle()

    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['results'])
  })

  it('lists the group buckets of every node and counts nodes that did not answer', async () => {
    searchBuckets.mockResolvedValue(
      answer([hit('results', 'g1', 'n2'), hit('other', 'g2'), hit('ws-scratch')], { nodes_failed: 2 }),
    )
    const { list } = start()
    await settle()

    expect(searchBuckets).toHaveBeenCalledWith('', { limit: BUCKET_PAGE, groupId: 'g1', cursor: undefined })
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['results'])
    expect(list.failedNodes.value).toBe(2)
  })

  it('lists a distributed bucket once, even when its nodes answer on two pages', async () => {
    const member = (node: string) => ({ ...hit('bakrep', 'g1', node), set_id: 'set-1' })
    searchBuckets
      .mockResolvedValueOnce(answer([member('n1'), member('n2')], { next_cursor: 'c1' }))
      .mockResolvedValueOnce(answer([member('n3'), hit('bakrep', 'g1', 'n4')]))
    const { list } = start()
    await settle()
    await list.loadMore()

    expect(list.hits.value.map((entry) => [entry.node_id, entry.nodes])).toEqual([
      ['n1', ['n1', 'n2', 'n3']],
      ['n4', ['n4']],
    ])
  })

  it('ends the list when a full page comes without a cursor', async () => {
    const full = Array.from({ length: BUCKET_PAGE }, (_, index) => hit(`b${index}`))
    searchBuckets.mockResolvedValueOnce(answer(full))
    const { list } = start()
    await settle()

    expect(list.more.value).toBe(false)
    await list.loadMore()
    expect(searchBuckets).toHaveBeenCalledTimes(1)
  })

  it('appends the next page when the node returns a cursor', async () => {
    searchBuckets
      .mockResolvedValueOnce(answer([hit('a')], { next_cursor: 'c1' }))
      .mockResolvedValueOnce(answer([hit('b')]))
    const { list } = start()
    await settle()

    await list.loadMore()

    expect(searchBuckets).toHaveBeenLastCalledWith('', { limit: BUCKET_PAGE, groupId: 'g1', cursor: 'c1' })
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['a', 'b'])
    expect(list.more.value).toBe(false)
  })

  it('reports an older node that needs a name, then searches the typed name', async () => {
    vi.useFakeTimers()
    searchBuckets.mockRejectedValueOnce(new ApiError(400, 'Bad Request')).mockResolvedValue(answer([hit('raw-data')]))
    const { list, query } = start()
    await settle()
    expect(list.needsName.value).toBe(true)
    expect(list.error.value).toBeNull()

    query.value = 'r'
    await vi.advanceTimersByTimeAsync(300)
    expect(searchBuckets).toHaveBeenCalledTimes(1)

    query.value = 'raw'
    await vi.advanceTimersByTimeAsync(300)
    await settle()
    expect(searchBuckets).toHaveBeenLastCalledWith('raw', { limit: BUCKET_PAGE, groupId: 'g1', cursor: undefined })
    expect(list.needsName.value).toBe(false)
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['raw-data'])
  })

  it('drops old results and a late answer as soon as the name changes', async () => {
    vi.useFakeTimers()
    let answerLate!: (value: BucketSearchResponse) => void
    searchBuckets
      .mockResolvedValueOnce(answer([hit('raw-data')]))
      .mockReturnValueOnce(new Promise((resolve) => (answerLate = resolve)))
    const { list, query } = start()
    await settle()
    expect(list.hits.value).toHaveLength(1)

    query.value = 'ra'
    await vi.advanceTimersByTimeAsync(300)
    query.value = 'z'
    await settle()
    expect(list.hits.value).toEqual([])
    expect(list.loading.value).toBe(false)

    answerLate(answer([hit('raw-data')]))
    await settle()
    expect(list.hits.value).toEqual([])
  })

  it('waits for the sign-in of a deep link, then lists', async () => {
    setAuthToken('')
    searchBuckets.mockResolvedValue(answer([hit('results')]))
    const { list } = start()
    await settle()
    expect(searchBuckets).not.toHaveBeenCalled()

    setAuthToken('t2')
    signIn('u1')
    await settle()

    expect(searchBuckets).toHaveBeenCalledTimes(1)
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['results'])
  })

  it('starts over for another account in the same group', async () => {
    searchBuckets
      .mockResolvedValueOnce(answer([hit('mine')], { next_cursor: 'c1' }))
      .mockRejectedValueOnce(new ApiError(400, 'Bad Request'))
      .mockResolvedValueOnce(answer([hit('theirs')]))
    const { list } = start()
    await settle()
    expect(list.more.value).toBe(true)

    // The second account reaches an older node, which needs a name.
    setAuthToken('t2')
    signIn('u2')
    await settle()
    expect(list.hits.value).toEqual([])
    expect(list.needsName.value).toBe(true)

    setAuthToken('t3')
    signIn('u3')
    await settle()
    expect(searchBuckets).toHaveBeenLastCalledWith('', { limit: BUCKET_PAGE, groupId: 'g1', cursor: undefined })
    expect(list.needsName.value).toBe(false)
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['theirs'])
    expect(list.more.value).toBe(false)
  })

  it('keeps the loaded pages when the same account renews its token', async () => {
    searchBuckets
      .mockResolvedValueOnce(answer([hit('a')], { next_cursor: 'c1' }))
      .mockResolvedValueOnce(answer([hit('b')], { next_cursor: 'c2' }))
    const { list } = start()
    await settle()
    await list.loadMore()

    setAuthToken('t2')
    await settle()
    signIn('u1')
    await settle()

    expect(searchBuckets).toHaveBeenCalledTimes(2)
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['a', 'b'])
    expect(list.more.value).toBe(true)
  })

  it('drops a page asked with the old token and asks again for the same account', async () => {
    let answerOld!: (value: BucketSearchResponse) => void
    searchBuckets
      .mockResolvedValueOnce(answer([hit('a')], { next_cursor: 'c1' }))
      .mockReturnValueOnce(new Promise((resolve) => (answerOld = resolve)))
      .mockResolvedValueOnce(answer([hit('b')]))
    const { list } = start()
    await settle()
    void list.loadMore()
    await settle()

    setAuthToken('t2')
    await settle()
    answerOld(answer([hit('stale')]))
    signIn('u1')
    await settle()

    expect(searchBuckets).toHaveBeenCalledTimes(3)
    expect(searchBuckets).toHaveBeenLastCalledWith('', { limit: BUCKET_PAGE, groupId: 'g1', cursor: 'c1' })
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['a', 'b'])
  })

  it('stays quiet while one node is chosen', async () => {
    start(false)
    await settle()
    expect(searchBuckets).not.toHaveBeenCalled()
  })
})
