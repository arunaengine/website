import { effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { BucketSearchHit, BucketSearchResponse, BucketUsageResponse } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  myGroups: { value: [{ id: 'g1', name: 'Genome Lab' }, { id: 'g2', name: 'Broken' }] },
  sessionEpoch: { value: 1 },
  searchBuckets: vi.fn(),
  getBucketUsage: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
vi.mock('@/composables/aruna/state', () => ({ nodeInfo: ref({ node: { peer_id: 'n1' } }) }))

const { addUsage, emptySum, useReachableUsage } = await import('./useReachableUsage')

const hit = (bucket: string, node: string, set?: string): BucketSearchHit => ({
  arn: `${node}/${bucket}`, bucket, node_id: node, group_id: 'g1', created_at: '', set_id: set ?? null,
})
const usage = (extra: Partial<BucketUsageResponse> = {}): BucketUsageResponse => ({
  bucket: 'b', objects: 10, versions: 10, delete_markers: 0, open_multipart_uploads: 0, logical_bytes: 100, referenced_bytes: 1000, complete: true, ...extra,
})
const page = (hits: BucketSearchHit[], extra: Partial<BucketSearchResponse> = {}): BucketSearchResponse => ({
  hits, nodes_queried: 3, nodes_failed: 0, failed_nodes: [], ...extra,
})

describe('reachable usage', () => {
  it('keeps an unread bucket and an unknown referenced size apart from zero', () => {
    const sum = [usage(), null, usage({ referenced_bytes: undefined, complete: false })].reduce(addUsage, emptySum())
    expect(sum).toEqual({ stored: 200, referenced: 1000, objects: 20, buckets: 3, unread: 1, referencedUnknown: 1, partial: true })
  })

  it('counts a distributed bucket once, asks buckets of other nodes there, and keeps a failed group apart', async () => {
    aruna.searchBuckets.mockImplementation(async (_q: string, options: { groupId: string; cursor?: string }) => {
      if (options.groupId === 'g2') throw new Error('no node answered')
      return options.cursor
        ? page([hit('bakrep', 'n3', 's1'), hit('raw', 'n2')], { nodes_failed: 1 })
        : page([hit('bakrep', 'n1', 's1'), hit('bakrep', 'n2', 's1'), hit('ws-run', 'n1')], { next_cursor: 'c1' })
    })
    aruna.getBucketUsage.mockImplementation(async (bucket: string, node: string | null) =>
      bucket === 'bakrep' ? usage({ logical_bytes: 0, referenced_bytes: 10_294_602, objects: 18 }) : usage({ referenced_bytes: 0 }),
    )
    const scope = effectScope()
    const reach = scope.run(() => useReachableUsage())!
    await reach.load()

    expect(aruna.getBucketUsage.mock.calls).toEqual([['bakrep', null], ['raw', 'n2']])
    const lab = reach.groups.value.find((group) => group.groupId === 'g1')!
    expect(lab).toMatchObject({ stored: 100, referenced: 10_294_602, objects: 28, buckets: 2, missing: true, error: null })
    expect(reach.groups.value.find((group) => group.groupId === 'g2')).toMatchObject({ error: 'no node answered', buckets: 0 })
    expect(reach.total.value).toMatchObject({ stored: 100, referenced: 10_294_602, buckets: 2 })
    scope.stop()
  })
})
