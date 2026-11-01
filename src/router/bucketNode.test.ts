import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'

const aruna = vi.hoisted(() => ({
  bootstrapped: { value: true },
  refresh: vi.fn(async () => undefined),
  currentUser: { value: { id: 'u1' } as { id: string } | null },
  searchBuckets: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
vi.mock('@/composables/useGroupSelection', () => ({ activeGroupId: ref('g1') }))
vi.mock('@/composables/useRealmNodes', () => ({ useRealmNodes: () => ({ isLocalNode: (id: string) => id === 'n1' }) }))

const { bucketNodeRoute } = await import('./bucketNode')

const to = (query: Record<string, string> = {}) => ({ params: { bucketId: 'refseq' }, query, hash: '' }) as unknown as RouteLocationNormalized
const hit = (node: string, group = 'g1') => ({ bucket: 'refseq', node_id: node, group_id: group })

beforeEach(() => {
  aruna.bootstrapped.value = true
  aruna.currentUser.value = { id: 'u1' }
  aruna.searchBuckets.mockReset()
})

describe('bucket address without a node', () => {
  it('opens the bucket on the node of the group that holds it', async () => {
    aruna.searchBuckets.mockResolvedValue({ hits: [hit('n9', 'g2'), hit('n2')] })

    expect(await bucketNodeRoute(to({ prefix: 'raw' }))).toEqual({
      name: 'bucket', params: { bucketId: 'refseq' }, query: { prefix: 'raw', node: 'n2' }, hash: '', replace: true,
    })
    expect(aruna.searchBuckets).toHaveBeenCalledWith('refseq', expect.objectContaining({ limit: 50, groupId: 'g1' }))
  })

  it('stays on the connected node when it holds the bucket, or nobody does', async () => {
    aruna.searchBuckets.mockResolvedValue({ hits: [hit('n2'), hit('n1')] })
    expect(await bucketNodeRoute(to())).toBe(true)
    aruna.searchBuckets.mockRejectedValue(new Error('down'))
    expect(await bucketNodeRoute(to())).toBe(true)
  })

  it('asks nothing for an address with a node or a visitor, and loads the session first', async () => {
    expect(await bucketNodeRoute(to({ node: 'n2' }))).toBe(true)
    aruna.bootstrapped.value = false
    aruna.currentUser.value = null
    expect(await bucketNodeRoute(to())).toBe(true)
    expect(aruna.refresh).toHaveBeenCalled()
    expect(aruna.searchBuckets).not.toHaveBeenCalled()
  })
})
