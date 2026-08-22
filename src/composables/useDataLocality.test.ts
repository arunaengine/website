import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'

const getBlobLocations = vi.fn()

vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ getBlobLocations }) }))
vi.mock('@/composables/useRealmNodes', () => ({
  useRealmNodes: () => ({
    executorsByNode: computed(() => new Map([['compute-node', ['docker']]])),
    displayName: (nodeId: string) => `node ${nodeId}`,
    nodes: ref([]),
  }),
}))

const { useDataLocality } = await import('@/composables/useDataLocality')

function locations(nodeId: string) {
  return {
    bucket: 'b',
    key: 'k',
    version_id: 'v',
    copies: [{ node_id: nodeId, local: false, bucket: 'b', key: 'k', state: 'present' }],
    complete: true,
    limits: [],
  }
}

describe('input locality lookups', () => {
  it('answers once per key and reuses the answer', async () => {
    getBlobLocations.mockResolvedValue(locations('compute-node'))
    const { load, entryFor } = useDataLocality()

    const first = await load('b', 'cached-key')
    const second = await load('b', 'cached-key')

    expect(getBlobLocations).toHaveBeenCalledTimes(1)
    expect(first.hint?.verdict).toBe('compute-to-data-possible')
    expect(second).toBe(first)
    expect(entryFor('b', 'cached-key')).toBe(first)
  })

  it('reports an absent endpoint as unavailable rather than as no copies', async () => {
    getBlobLocations.mockRejectedValue(new ApiError(404, 'Not found'))
    const { load } = useDataLocality()

    const entry = await load('b', 'missing-endpoint')

    expect(entry.state).toBe('unavailable')
    expect(entry.hint).toBeNull()
  })

  it('separates a refused read from an absent endpoint', async () => {
    getBlobLocations.mockRejectedValue(new ApiError(403, 'Forbidden'))
    const { load } = useDataLocality()

    expect((await load('b', 'refused-key')).state).toBe('forbidden')
  })

  it('retries a key whose lookup failed outright', async () => {
    getBlobLocations.mockRejectedValueOnce(new Error('network down'))
    getBlobLocations.mockResolvedValueOnce(locations('compute-node'))
    const { load } = useDataLocality()

    const failed = await load('b', 'retried-key')
    const retried = await load('b', 'retried-key')

    expect(failed.state).toBe('error')
    expect(retried.state).toBe('ready')
  })
})
