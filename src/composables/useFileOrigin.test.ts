import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type OriginResponse } from '@/lib/api'

const aruna = vi.hoisted(() => ({ sessionEpoch: { value: 1 }, getFileOrigin: vi.fn() }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { useFileOrigin } = await import('@/composables/useFileOrigin')
type Target = import('@/composables/useFileOrigin').OriginTarget

const target: Target = { bucket: 'lab', key: 'raw/a.fq', versionId: null }
const answer = (version: string): OriginResponse => ({ version_id: version, created_by: 'u', created_at: '2026-10-20T00:00:00Z', projection: [] })

function start(initial: Target | null = target) {
  const asked = ref(initial)
  const scope = effectScope()
  return { asked, found: scope.run(() => useFileOrigin(asked))!, scope }
}

describe('file origin', () => {
  beforeEach(() => aruna.getFileOrigin.mockReset())

  it('asks for the current version, or for the version that was chosen', async () => {
    aruna.getFileOrigin.mockResolvedValue(answer('v1'))
    const { asked, found, scope } = start()
    await vi.waitFor(() => expect(found.state.value).toBe('ready'))
    expect(aruna.getFileOrigin).toHaveBeenLastCalledWith('lab', { key: 'raw/a.fq' })

    asked.value = { ...target, versionId: 'v0' }
    await vi.waitFor(() => expect(aruna.getFileOrigin).toHaveBeenLastCalledWith('lab', { key: 'raw/a.fq', version_id: 'v0' }))
    scope.stop()
  })

  it('reads a 404 as not recorded and a failure as a failure', async () => {
    aruna.getFileOrigin.mockRejectedValueOnce(new ApiError(404, 'not found'))
    const first = start()
    await vi.waitFor(() => expect(first.found.state.value).toBe('missing'))
    first.scope.stop()

    aruna.getFileOrigin.mockRejectedValueOnce(new ApiError(503, 'node busy'))
    const second = start()
    await vi.waitFor(() => expect(second.found.state.value).toBe('failed'))
    expect(second.found.error.value).toBe('node busy')
    second.scope.stop()
  })

  it('drops a late answer for the version asked before', async () => {
    let late: (value: OriginResponse) => void = () => {}
    aruna.getFileOrigin.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)))
    aruna.getFileOrigin.mockResolvedValueOnce(answer('v2'))
    const { asked, found, scope } = start()
    asked.value = { ...target, versionId: 'v2' }
    await vi.waitFor(() => expect(found.origin.value?.version_id).toBe('v2'))
    late(answer('stale'))
    await nextTick()

    expect(found.origin.value?.version_id).toBe('v2')
    scope.stop()
  })
})
