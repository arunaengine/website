import { effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { BucketSearchHit, UsageTotals } from '@/lib/api'

const aruna = vi.hoisted(() => ({ sessionEpoch: { value: 1 }, searchBuckets: vi.fn() }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { countText, listBuckets, useRealmBucketCount } = await import('./useBucketCount')

const hit = (bucket: string, node: string, group = 'g1', set?: string): BucketSearchHit => ({
  arn: `${node}/${bucket}`, bucket, node_id: node, group_id: group, created_at: '', set_id: set ?? null,
})

describe('bucket counts', () => {
  it('lists every page of a group and says whether every node answered', async () => {
    aruna.searchBuckets
      .mockResolvedValueOnce({ hits: [hit('a', 'n1'), hit('x', 'n1', 'g2')], nodes_queried: 2, nodes_failed: 0, failed_nodes: [], next_cursor: 'c1' })
      .mockResolvedValueOnce({ hits: [hit('b', 'n2')], nodes_queried: 2, nodes_failed: 1, failed_nodes: ['n3'] })
    const listing = await listBuckets(aruna.searchBuckets, 'g1', () => true)

    expect(listing.hits.map((entry) => entry.bucket)).toEqual(['a', 'b'])
    expect(listing.complete).toBe(false)
    expect(aruna.searchBuckets).toHaveBeenLastCalledWith('', { limit: 50, groupId: 'g1', cursor: 'c1' })
  })

  it('corrects the realm total by the distributed buckets it can list', async () => {
    aruna.searchBuckets.mockReset().mockResolvedValue({
      hits: [hit('bakrep', 'n1', 'g1', 's1'), hit('bakrep', 'n2', 'g1', 's1'), hit('bakrep', 'n3', 'g1', 's1'), hit('raw', 'n1'), hit('notes', 'n2')],
      nodes_queried: 3, nodes_failed: 0, failed_nodes: [],
    })
    const totals = ref<UsageTotals>({ buckets: 5, objects: 0, logical_bytes: 0, referenced_bytes: 0 })
    const scope = effectScope()
    const counted = scope.run(() => useRealmBucketCount(totals))!
    await vi.waitFor(() => expect(counted.value).toEqual({ count: 3, exact: true }))

    totals.value = { ...totals.value, buckets: 6 }
    expect(counted.value).toEqual({ count: 4, exact: false })
    scope.stop()
  })

  it('takes the node\'s distinct count as exact and lists nothing for it', async () => {
    aruna.searchBuckets.mockReset()
    aruna.sessionEpoch.value += 1
    const totals = ref<UsageTotals>({ buckets: 5, distinct_buckets: 3, objects: 0, logical_bytes: 0, referenced_bytes: 0 })
    const scope = effectScope()
    const counted = scope.run(() => useRealmBucketCount(totals))!

    expect(counted.value).toEqual({ count: 3, exact: true })
    expect(aruna.searchBuckets).not.toHaveBeenCalled()
    scope.stop()
  })
})

describe('bucket count text', () => {
  it('reads an upper bound as up to and an exact count as the number', () => {
    expect(countText({ count: 15, exact: false }, String)).toBe('up to 15')
    expect(countText({ count: 14, exact: true }, String)).toBe('14')
  })
})
