import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type DistributedResponse } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  sessionEpoch: { value: 1 },
  getBucketDistribution: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { useBucketDistribution } = await import('@/composables/useBucketDistribution')

function status(bucket: string): DistributedResponse {
  return {
    set_id: 's1',
    bucket,
    group_id: 'g1',
    publisher: 'n1',
    revision: 1,
    phase: 'active',
    serving: true,
    conflicted: false,
    configuration_changes_unavailable: false,
    degraded: false,
    members: [],
    ranges: [],
    recommended_grant: '/r/g/g1/data/*/' + bucket + '/**',
  }
}

function start(name = 'spire', node: string | null = null) {
  const bucket = ref(name)
  const nodeId = ref(node)
  const scope = effectScope()
  const distribution = scope.run(() => useBucketDistribution(bucket, nodeId))!
  return { bucket, nodeId, distribution, scope }
}

describe('bucket distribution', () => {
  beforeEach(() => {
    aruna.sessionEpoch.value = 1
    aruna.getBucketDistribution.mockReset()
  })

  it('shows the set of a bucket stored on more nodes', async () => {
    aruna.getBucketDistribution.mockResolvedValue(status('spire'))
    const { distribution, scope } = start()
    await vi.waitFor(() => expect(distribution.state.value).toBe('ready'))

    expect(distribution.view.value?.name).toBe('spire')
    expect(distribution.view.value?.live?.recommendedGrant).toContain('/spire/')
    scope.stop()
  })

  it('treats a 404 as an ordinary bucket, not as an error', async () => {
    aruna.getBucketDistribution.mockRejectedValue(new ApiError(404, 'not found'))
    const { distribution, scope } = start('lab')
    await vi.waitFor(() => expect(distribution.state.value).toBe('ordinary'))

    expect(distribution.view.value).toBeNull()
    expect(distribution.error.value).toBeNull()
    scope.stop()
  })

  it('keeps unknown apart from ordinary when the node fails or refuses', async () => {
    aruna.getBucketDistribution.mockRejectedValue(new ApiError(503, 'node busy'))
    const { distribution, scope } = start()
    await vi.waitFor(() => expect(distribution.state.value).toBe('unavailable'))

    expect(distribution.error.value).toBe('node busy')
    scope.stop()
  })

  it('asks nothing for a bucket on another node', async () => {
    const { distribution, scope } = start('spire', 'node-2')
    await nextTick()

    expect(distribution.state.value).toBe('unavailable')
    expect(aruna.getBucketDistribution).not.toHaveBeenCalled()
    scope.stop()
  })

  it('drops a late answer for the bucket that was open before', async () => {
    let late: (value: DistributedResponse) => void = () => {}
    aruna.getBucketDistribution.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)))
    aruna.getBucketDistribution.mockResolvedValueOnce(status('other'))
    const { bucket, distribution, scope } = start('spire')
    bucket.value = 'other'
    await vi.waitFor(() => expect(distribution.view.value?.name).toBe('other'))
    late(status('spire'))
    await nextTick()

    expect(distribution.view.value?.name).toBe('other')
    scope.stop()
  })

  it('keeps the last status of the bucket when a refresh fails', async () => {
    aruna.getBucketDistribution.mockResolvedValueOnce(status('spire'))
    const { distribution, scope } = start()
    await vi.waitFor(() => expect(distribution.state.value).toBe('ready'))
    aruna.getBucketDistribution.mockRejectedValueOnce(new ApiError(503, 'node busy'))
    await distribution.reload()

    expect(distribution.view.value?.name).toBe('spire')
    expect(distribution.error.value).toBe('node busy')
    scope.stop()
  })
})
