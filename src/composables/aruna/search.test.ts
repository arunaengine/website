import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()
const getBucketDistribution = vi.fn()
vi.mock('./state', async () => ({ request, sessionEpoch: (await import('vue')).ref(0) }))
vi.mock('./storage', () => ({ getBucketDistribution }))

const { searchBuckets } = await import('./search')
const { sessionEpoch } = await import('./state')

const hit = { bucket: 'refseq', node_id: 'n1', set_id: 'S1', group_id: 'g', arn: 'arn:x:n1:s3/refseq' }
const spread = { set_id: 'S1', members: [{ node_id: 'n1' }, { node_id: 'n2' }] }

beforeEach(() => {
  request.mockReset().mockResolvedValue({ hits: [hit], nodes_failed: 0 })
  getBucketDistribution.mockReset()
  sessionEpoch.value++
})

describe('bucket search members', () => {
  it('asks a set for its nodes once for searches close together', async () => {
    getBucketDistribution.mockResolvedValue(spread)
    const [first, second] = await Promise.all([searchBuckets(''), searchBuckets('')])
    const third = await searchBuckets('')
    expect(getBucketDistribution).toHaveBeenCalledTimes(1)
    for (const page of [first, second, third]) expect(page.hits.map((entry) => entry.node_id)).toEqual(['n1', 'n2'])
  })

  it('asks again after a failed read and in a new session', async () => {
    getBucketDistribution.mockRejectedValueOnce(new Error('down')).mockResolvedValue(spread)
    expect((await searchBuckets('')).hits).toHaveLength(1)
    expect((await searchBuckets('')).hits).toHaveLength(2)
    sessionEpoch.value++
    await searchBuckets('')
    expect(getBucketDistribution).toHaveBeenCalledTimes(3)
  })
})
