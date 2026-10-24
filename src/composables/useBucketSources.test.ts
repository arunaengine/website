import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type FileSourcesResponse } from '@/lib/api'

const aruna = vi.hoisted(() => ({ sessionEpoch: { value: 1 }, getBucketSources: vi.fn() }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { useBucketSources } = await import('@/composables/useBucketSources')

const answer = (complete = true): FileSourcesResponse => ({
  sources: [{ kind: 'sync', relationship_id: 's1', source: 'arn:aruna:r:n:s3/a', mode: 'once' }],
  complete,
})

function start(name = 'lab', node: string | null = null) {
  const bucket = ref(name)
  const nodeId = ref(node)
  const scope = effectScope()
  return { bucket, sources: scope.run(() => useBucketSources(bucket, nodeId))!, scope }
}

describe('bucket sources', () => {
  beforeEach(() => aruna.getBucketSources.mockReset())

  it('lists the incoming paths and says when there are more', async () => {
    aruna.getBucketSources.mockResolvedValue(answer(false))
    const { sources, scope } = start()
    await vi.waitFor(() => expect(sources.state.value).toBe('ready'))

    expect(aruna.getBucketSources).toHaveBeenCalledWith('lab')
    expect(sources.sources.value).toHaveLength(1)
    expect(sources.complete.value).toBe(false)
    scope.stop()
  })

  it('reads a 404 as not listed and a failure as a failure', async () => {
    aruna.getBucketSources.mockRejectedValueOnce(new ApiError(404, 'not found'))
    const first = start()
    await vi.waitFor(() => expect(first.sources.state.value).toBe('missing'))
    first.scope.stop()

    aruna.getBucketSources.mockRejectedValueOnce(new ApiError(500, 'storage failed'))
    const second = start()
    await vi.waitFor(() => expect(second.sources.state.value).toBe('failed'))
    expect(second.sources.error.value).toBe('storage failed')
    second.scope.stop()
  })

  it('asks nothing for a bucket on another node', async () => {
    const { sources, scope } = start('lab', 'node-2')
    await nextTick()

    expect(sources.state.value).toBe('missing')
    expect(aruna.getBucketSources).not.toHaveBeenCalled()
    scope.stop()
  })
})
