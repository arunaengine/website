import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type BucketSearchHit, type BucketSearchResponse } from '@/lib/api'

const searchBuckets = vi.fn<
  (q: string, options: { limit?: number; groupId?: string; cursor?: string }) => Promise<BucketSearchResponse>
>()
const authToken = ref('t')
const sessionEpoch = ref(1)
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ authToken, searchBuckets, sessionEpoch }) }))

const { BUCKET_PAGE, useAllBuckets } = await import('./useAllBuckets')

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
    authToken.value = 't'
    sessionEpoch.value = 1
  })
  afterEach(() => {
    vi.useRealTimers()
    scopes.splice(0).forEach((scope) => scope.stop())
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
    authToken.value = ''
    searchBuckets.mockResolvedValue(answer([hit('results')]))
    const { list } = start()
    await settle()
    expect(searchBuckets).not.toHaveBeenCalled()

    authToken.value = 't'
    sessionEpoch.value = 2
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

    // The first account reaches an older node, which needs a name.
    sessionEpoch.value = 2
    await settle()
    expect(list.hits.value).toEqual([])
    expect(list.needsName.value).toBe(true)

    sessionEpoch.value = 3
    await settle()
    expect(searchBuckets).toHaveBeenLastCalledWith('', { limit: BUCKET_PAGE, groupId: 'g1', cursor: undefined })
    expect(list.needsName.value).toBe(false)
    expect(list.hits.value.map((entry) => entry.bucket)).toEqual(['theirs'])
    expect(list.more.value).toBe(false)
  })

  it('stays quiet while one node is chosen', async () => {
    start(false)
    await settle()
    expect(searchBuckets).not.toHaveBeenCalled()
  })
})
