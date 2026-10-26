import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  sessionEpoch: { value: 1 },
  getBucketDistribution: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { useGrantGaps } = await import('@/composables/useGrantGaps')

const status = {
  members: [{ node_id: 'n1' }, { node_id: 'n2' }, { node_id: 'n3' }],
  recommended_grant: '/r/g/g1/data/*/spire/**',
}

function start(paths: string[]) {
  const suffixes = ref(paths)
  const scope = effectScope()
  const result = scope.run(() => useGrantGaps(suffixes))!
  return { suffixes, result, scope }
}

describe('grant gaps', () => {
  beforeEach(() => {
    aruna.getBucketDistribution.mockReset()
  })

  it('names the members a node-specific grant does not reach', async () => {
    aruna.getBucketDistribution.mockResolvedValue(status)
    const { result, scope } = start(['data/n1/spire/**', 'data/n2/spire/**'])
    await vi.waitFor(() => expect(result.gaps.value).toHaveLength(1))

    expect(result.gaps.value[0]).toEqual({ bucket: 'spire', missing: ['n3'], glob: '/r/g/g1/data/*/spire/**' })
    scope.stop()
  })

  it('warns about nothing for a node glob, an ordinary bucket or other paths', async () => {
    aruna.getBucketDistribution.mockImplementation(async (bucket: string) => {
      if (bucket === 'lab') throw new ApiError(404, 'not found')
      return status
    })
    const { result, scope } = start(['data/*/spire/**', 'data/n1/lab/**', 'meta/**'])
    await vi.waitFor(() => expect(aruna.getBucketDistribution).toHaveBeenCalledTimes(2))
    await nextTick()

    expect(result.gaps.value).toEqual([])
    scope.stop()
  })

  it('asks once per bucket while the grants change', async () => {
    aruna.getBucketDistribution.mockResolvedValue(status)
    const { suffixes, result, scope } = start(['data/n1/spire/**'])
    await vi.waitFor(() => expect(result.gaps.value).toHaveLength(1))
    suffixes.value = ['data/n1/spire/**', 'data/n2/spire/**']
    await vi.waitFor(() => expect(result.gaps.value[0].missing).toEqual(['n3']))

    expect(aruna.getBucketDistribution).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})
