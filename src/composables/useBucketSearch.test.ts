import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BucketSearchHit } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  authToken: { value: 'token' },
  searchBuckets: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { useBucketSearch } = await import('@/composables/useBucketSearch')

function hit(bucket: string): BucketSearchHit {
  return { bucket, node_id: 'n1', group_id: 'g2', arn: bucket } as BucketSearchHit
}

function answer(hits: BucketSearchHit[]) {
  return { hits, nodes_queried: 1, nodes_failed: 0 }
}

describe('bucket search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    aruna.searchBuckets.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('clears the hits at once when the query gets too short', async () => {
    aruna.searchBuckets.mockResolvedValue(answer([hit('reads')]))
    const query = ref('re')
    const scope = effectScope()
    const search = scope.run(() => useBucketSearch(query))!
    await vi.advanceTimersByTimeAsync(300)
    expect(search.hits.value.map((entry) => entry.bucket)).toEqual(['reads'])

    query.value = 'r'
    await nextTick()
    expect(search.hits.value).toEqual([])
    scope.stop()
  })

  it('lists every bucket for an empty query when asked to', async () => {
    aruna.searchBuckets.mockResolvedValue(answer([hit('reads'), hit('runs')]))
    const scope = effectScope()
    const search = scope.run(() => useBucketSearch(ref(''), { listAll: true }))!
    await vi.advanceTimersByTimeAsync(300)

    expect(aruna.searchBuckets).toHaveBeenCalledWith('', { limit: 50 })
    expect(search.hits.value.map((entry) => entry.bucket)).toEqual(['reads', 'runs'])
    scope.stop()
  })

  it('drops a late answer for an older query', async () => {
    let late: (value: unknown) => void = () => {}
    aruna.searchBuckets.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)))
    const query = ref('re')
    const scope = effectScope()
    const search = scope.run(() => useBucketSearch(query))!
    await vi.advanceTimersByTimeAsync(300)

    query.value = ''
    await nextTick()
    late(answer([hit('stale')]))
    await vi.advanceTimersByTimeAsync(0)
    expect(search.hits.value).toEqual([])
    scope.stop()
  })
})
