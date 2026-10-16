import { effectScope, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderBucketCheck } from '@/lib/api'

const { checkProviderBucket } = vi.hoisted(() => ({ checkProviderBucket: vi.fn() }))
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), checkProviderBucket }))
vi.mock('@/composables/useAruna', async () => {
  const { ref } = await import('vue')
  return { useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('t') }) }
})

const { useBucketCheck } = await import('./useBucketCheck')

function deferred() {
  let resolve!: (value: ProviderBucketCheck) => void
  const promise = new Promise<ProviderBucketCheck>((done) => (resolve = done))
  return { promise, resolve }
}

function start() {
  const backendId = ref('s1')
  const bucket = ref('')
  const scope = effectScope()
  const note = scope.run(() => useBucketCheck(() => ({ groupId: 'g1', backendId: backendId.value, bucket: bucket.value })))!
  return { backendId, bucket, note, scope }
}

beforeEach(() => {
  vi.useFakeTimers()
  checkProviderBucket.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('provider bucket check', () => {
  it('asks once for the last name typed', async () => {
    checkProviderBucket.mockResolvedValue({ bucket: 'lab', exists: true, writable: true })
    const { bucket, note } = start()

    for (const name of ['l', 'la', 'lab']) {
      bucket.value = name
      await vi.advanceTimersByTimeAsync(200)
    }
    await vi.advanceTimersByTimeAsync(400)

    expect(checkProviderBucket).toHaveBeenCalledTimes(1)
    expect(checkProviderBucket).toHaveBeenCalledWith('g1', 's1', 'lab', expect.anything())
    expect(note.value?.text).toBe('Existing bucket. Aruna can write here.')
  })

  it('shows only the answer for the current name when an older one comes late', async () => {
    const first = deferred()
    checkProviderBucket
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ bucket: 'lab-new', exists: false, writable: null })
    const { bucket, note } = start()

    bucket.value = 'lab-old'
    await vi.advanceTimersByTimeAsync(400)
    bucket.value = 'lab-new'
    await vi.advanceTimersByTimeAsync(400)
    first.resolve({ bucket: 'lab-old', exists: true, writable: false })
    await vi.advanceTimersByTimeAsync(0)

    expect(note.value?.text).toBe('New bucket. Aruna creates it.')
  })

  it('drops a pending answer when the storage changes', async () => {
    const pending = deferred()
    checkProviderBucket.mockReturnValueOnce(pending.promise).mockReturnValueOnce(new Promise(() => {}))
    const { backendId, bucket, note } = start()

    bucket.value = 'lab'
    await vi.advanceTimersByTimeAsync(400)
    backendId.value = 's2'
    pending.resolve({ bucket: 'lab', exists: true, writable: true })
    await vi.advanceTimersByTimeAsync(400)

    expect(checkProviderBucket).toHaveBeenLastCalledWith('g1', 's2', 'lab', expect.anything())
    expect(note.value).toBeNull()
  })

  it('does nothing after the dialog closes', async () => {
    const pending = deferred()
    checkProviderBucket.mockReturnValueOnce(pending.promise)
    const { bucket, note, scope } = start()

    // A request on its way when the dialog closes.
    bucket.value = 'lab'
    await vi.advanceTimersByTimeAsync(400)
    scope.stop()
    pending.resolve({ bucket: 'lab', exists: true, writable: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(note.value).toBeNull()

    // A timer still waiting when the dialog closes.
    const second = start()
    second.bucket.value = 'lab-two'
    await vi.advanceTimersByTimeAsync(100)
    second.scope.stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(checkProviderBucket).toHaveBeenCalledTimes(1)
    expect(second.note.value).toBeNull()
  })
})
