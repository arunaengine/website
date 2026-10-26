import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type FileSourcesResponse } from '@/lib/api'

const aruna = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { sessionEpoch: ref(1), getBucketSources: vi.fn() }
})
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { useBucketSources } = await import('@/composables/useBucketSources')

const answer = (complete = true): FileSourcesResponse => ({
  sources: [{ kind: 'sync', relationship_id: 's1', source: 'arn:aruna:r:n:s3/a', mode: 'once' }],
  complete,
})

function start(name = 'lab', asked: (string | null)[] | null = [null]) {
  const bucket = ref(name)
  const nodes = ref(asked)
  const scope = effectScope()
  return { bucket, nodes, sources: scope.run(() => useBucketSources(bucket, nodes))!, scope }
}

describe('bucket sources', () => {
  beforeEach(() => aruna.getBucketSources.mockReset())

  it('lists the incoming paths and says when there are more', async () => {
    aruna.getBucketSources.mockResolvedValue(answer(false))
    const { sources, scope } = start()
    await vi.waitFor(() => expect(sources.state.value).toBe('ready'))

    expect(aruna.getBucketSources).toHaveBeenCalledWith('lab', undefined, null)
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

  it('asks nothing while the owning nodes are not known', async () => {
    const { sources, scope } = start('lab', null)
    await nextTick()

    expect(sources.state.value).toBe('loading')
    expect(aruna.getBucketSources).not.toHaveBeenCalled()
    scope.stop()
  })

  it('combines the sources of every node of a distributed bucket and lists a shared one once', async () => {
    aruna.getBucketSources
      .mockResolvedValueOnce(answer())
      .mockResolvedValueOnce({ sources: [...answer().sources, { kind: 'storage', import_id: 'i1', backend_id: 'b1', backend_prefix: 'p/', key_prefix: '' }], complete: true })
    const { sources, scope } = start('bakrep', [null, 'node-2'])
    await vi.waitFor(() => expect(sources.state.value).toBe('ready'))

    expect(aruna.getBucketSources).toHaveBeenCalledWith('bakrep', undefined, 'node-2')
    expect(sources.sources.value.map((source) => source.kind)).toEqual(['sync', 'storage'])
    expect(sources.complete.value).toBe(true)
    scope.stop()
  })

  it('keeps the answered sources but says a node failed, and never claims the list is whole', async () => {
    aruna.getBucketSources.mockResolvedValueOnce(answer()).mockRejectedValueOnce(new ApiError(503, 'node busy'))
    const { sources, scope } = start('bakrep', [null, 'node-3'])
    await vi.waitFor(() => expect(sources.state.value).toBe('failed'))

    expect(sources.sources.value).toHaveLength(1)
    expect(sources.complete.value).toBe(false)
    expect(sources.error.value).toBe('node busy')
    scope.stop()
  })

  it('reads the sources again for a new session', async () => {
    aruna.getBucketSources.mockResolvedValueOnce(answer())
    const { sources, scope } = start()
    await vi.waitFor(() => expect(sources.sources.value).toHaveLength(1))

    aruna.getBucketSources.mockRejectedValueOnce(new ApiError(403, 'no access'))
    aruna.sessionEpoch.value += 1
    await vi.waitFor(() => expect(sources.state.value).toBe('failed'))
    expect(sources.sources.value).toEqual([])
    scope.stop()
  })
})
