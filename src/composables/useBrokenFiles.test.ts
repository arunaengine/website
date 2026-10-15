import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { ApiError } from '@/lib/api'
import { authToken } from './aruna/state'
import { useBrokenFiles } from './useBrokenFiles'

const getBucketCheck = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getBucketCheck: (...args: unknown[]) => getBucketCheck(...args),
}))
vi.mock('./s3/endpoints', () => ({ nodeApiBase: () => 'https://b.test/api/v1' }))

const file = (key: string, reason: string) => ({ key, version_id: 'v', reason, found_at_ms: 1 })
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await nextTick()
}

beforeEach(() => {
  getBucketCheck.mockReset()
  authToken.value = 'token'
})

describe('useBrokenFiles', () => {
  it('reads every page and names the reason in plain words', async () => {
    getBucketCheck
      .mockResolvedValueOnce({ bucket: 'reef', broken: [file('a.txt', 'missing_blob')], next: 'a.txt' })
      .mockResolvedValueOnce({ bucket: 'reef', broken: [file('b.txt', 'storage_removed')] })
    const scope = effectScope()
    const broken = scope.run(() => useBrokenFiles(ref('reef'), ref('node-b')))!
    await settle()
    expect(getBucketCheck).toHaveBeenLastCalledWith('reef', { after: 'a.txt', limit: 500 }, expect.anything())
    expect(broken.reasonOf('a.txt')).toBe('File missing on storage')
    expect(broken.reasonOf('b.txt')).toBe('Storage removed')
    expect(broken.reasonOf('c.txt')).toBeNull()
    scope.stop()
  })

  it('marks nothing when the node has no check', async () => {
    getBucketCheck.mockRejectedValue(new ApiError(404, 'not found'))
    const scope = effectScope()
    const broken = scope.run(() => useBrokenFiles(ref('reef'), ref(null)))!
    await settle()
    expect(broken.reasonOf('a.txt')).toBeNull()
    scope.stop()
  })
})
