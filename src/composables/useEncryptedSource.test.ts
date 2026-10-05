import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import * as Api from '@/lib/api'
import { authToken } from './aruna/state'
import { useEncryptedSource } from './useEncryptedSource'

const getBucketEncryption = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  getBucketEncryption: (...args: unknown[]) => getBucketEncryption(...args),
}))

const SOURCE_KEY: Api.BucketKeyGeneration = {
  generation: 1,
  role: 'source',
  public_key: 'PK1',
  fingerprint: 'f1',
  unlock: {
    state: 'locked',
    lock_reason: 'manual',
    locked_at_ms: 1,
    session_id: null,
    unlocked_at_ms: null,
    deadline_ms: null,
    max_deadline_ms: null,
  },
}

function status(mode: Api.EncryptionMode, generations: Api.BucketKeyGeneration[] = []): Api.BucketEncryptionResponse {
  return { mode, generations, public_key: null, fingerprint: null, unlock: null } as unknown as Api.BucketEncryptionResponse
}

const ANSWERS: Record<string, Api.BucketEncryptionResponse> = {
  sealed: status('vault_locked', [{ ...SOURCE_KEY, role: 'active' }]),
  decrypting: status('off', [SOURCE_KEY]),
  plain: status('off'),
}

async function settle() {
  for (let round = 0; round < 4; round += 1) await nextTick()
}

let scope = effectScope()

beforeEach(() => {
  authToken.value = 'bearer-a'
  getBucketEncryption.mockReset().mockImplementation(async (name: string) => {
    if (!ANSWERS[name]) throw new Api.ApiError(404, 'not found')
    return ANSWERS[name]
  })
})

afterEach(() => {
  scope.stop()
  scope = effectScope()
})

describe('encrypted copy source', () => {
  it('reads the source on its node and counts a decrypting bucket as encrypted', async () => {
    const bucket = ref('sealed')
    const encrypted = scope.run(() => useEncryptedSource(bucket, ref('https://b.test/api/v1'), ref(true)))!
    await settle()
    expect(getBucketEncryption).toHaveBeenCalledWith('sealed', { baseUrl: 'https://b.test/api/v1', token: 'bearer-a' })
    expect(encrypted.value).toBe(true)

    bucket.value = 'decrypting'
    await settle()
    expect(encrypted.value).toBe(true)

    bucket.value = 'plain'
    await settle()
    expect(encrypted.value).toBe(false)
  })

  it('keeps an unreported state unknown, never plain', async () => {
    const encrypted = scope.run(() => useEncryptedSource(ref('older'), ref('https://b.test/api/v1'), ref(true)))!
    await settle()

    expect(encrypted.value).toBeNull()
  })

  it('asks nothing while closed or without a node address', async () => {
    const closed = scope.run(() => useEncryptedSource(ref('sealed'), ref('https://b.test/api/v1'), ref(false)))!
    const unaddressed = scope.run(() => useEncryptedSource(ref('sealed'), ref(null), ref(true)))!
    await settle()

    expect(getBucketEncryption).not.toHaveBeenCalled()
    expect(closed.value).toBeNull()
    expect(unaddressed.value).toBeNull()
  })

  it('drops the answer for a bucket that is no longer the source', async () => {
    let answer: (value: unknown) => void = () => undefined
    getBucketEncryption.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const bucket = ref('sealed')
    const encrypted = scope.run(() => useEncryptedSource(bucket, ref('https://b.test/api/v1'), ref(true)))!

    bucket.value = 'plain'
    await settle()
    answer(ANSWERS.sealed)
    await settle()

    expect(encrypted.value).toBe(false)
  })
})
