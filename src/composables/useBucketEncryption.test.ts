import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import * as Api from '@/lib/api'
import { authToken, sessionEpoch, userInfo } from './aruna/state'
import { useBucketEncryption } from './useBucketEncryption'

const getBucketEncryption = vi.fn()
const getBucketCompression = vi.fn()
const lockBucket = vi.fn()
const extendUnlock = vi.fn()
const unlockWithVault = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  getBucketEncryption: (...args: unknown[]) => getBucketEncryption(...args),
  getBucketCompression: (...args: unknown[]) => getBucketCompression(...args),
  lockBucket: (...args: unknown[]) => lockBucket(...args),
  extendUnlock: (...args: unknown[]) => extendUnlock(...args),
}))
vi.mock('@/lib/vault/bucketUnlock', () => ({ unlockWithVault: (...args: unknown[]) => unlockWithVault(...args) }))
vi.mock('./useUserVault', () => ({ useUserVault: () => ({ name: 'vault' }) }))
vi.mock('./s3/endpoints', () => ({
  localNodeId: () => 'node-a',
  nodeApiBase: (id: string) => ({ 'node-a': 'https://a.test/api/v1', 'node-b': 'https://b.test/api/v1' })[id] ?? null,
}))

function status(overrides: Partial<Api.BucketEncryptionResponse> = {}): Api.BucketEncryptionResponse {
  return {
    bucket: 'reef',
    mode: 'vault_locked',
    bucket_id: 'B1',
    storage_generation: 1,
    key_generation: 2,
    public_key: 'PK',
    fingerprint: 'ff',
    cipher: 'chacha20_poly1305',
    block_keys: 'content_derived',
    max_unlock_ms: null,
    unlock: { state: 'locked', lock_reason: 'restart', locked_at_ms: 1, session_id: null, unlocked_at_ms: null, deadline_ms: null, max_deadline_ms: null },
    holders: { ready: 2, pending: 0, missing_key: 0 },
    recovery: { state: 'met', ready_holders: 2, ready_with_recovery: 1 },
    transition: null,
    caller: { holder: true, ready_copy: true, admin: false },
    ...overrides,
  }
}

const OPEN: Api.BucketUnlockStatus = {
  state: 'unlocked',
  lock_reason: null,
  locked_at_ms: null,
  session_id: 'S1',
  unlocked_at_ms: 1,
  deadline_ms: null,
  max_deadline_ms: null,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const scopes: EffectScope[] = []

function setup(node: string | null = 'node-b') {
  const bucket = ref('reef')
  const nodeId = ref<string | null>(node)
  const scope = effectScope()
  scopes.push(scope)
  const encryption = scope.run(() => useBucketEncryption(bucket, nodeId, ref('g-1')))!
  return { encryption, bucket, nodeId, scope }
}

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})

beforeEach(() => {
  getBucketEncryption.mockReset().mockResolvedValue(status())
  getBucketCompression.mockReset().mockResolvedValue({ bucket: 'reef', mode: 'zstd', level: 3, effective_level: 4 })
  lockBucket.mockReset()
  extendUnlock.mockReset()
  unlockWithVault.mockReset()
  authToken.value = 'bearer-1'
  userInfo.value = { user: { user_id: 'u-1' }, realm: { realm_id: 'r-1' } } as never
})

describe('bucket encryption state', () => {
  it('asks the node that hosts the bucket, the connected one only for its own buckets', async () => {
    const remote = setup('node-b')
    await vi.waitFor(() => expect(remote.encryption.state.value).toBe('ready'))
    const local = setup(null)
    await vi.waitFor(() => expect(local.encryption.state.value).toBe('ready'))

    expect(getBucketEncryption.mock.calls[0]).toEqual(['reef', { baseUrl: 'https://b.test/api/v1', token: 'bearer-1' }])
    expect(getBucketEncryption.mock.calls[1]).toEqual(['reef', { baseUrl: 'https://a.test/api/v1', token: 'bearer-1' }])
    expect(remote.encryption.compression.value?.effective_level).toBe(4)
  })

  it('drops an answer for a bucket that is no longer shown', async () => {
    const first = deferred<Api.BucketEncryptionResponse>()
    getBucketEncryption.mockReturnValueOnce(first.promise)
    const { encryption, bucket } = setup()

    bucket.value = 'other'
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    first.resolve(status({ bucket_id: 'STALE' }))
    await first.promise

    expect(encryption.status.value?.bucket_id).toBe('B1')
  })

  it('tells a node without the report and a refusal apart from encryption off', async () => {
    getBucketEncryption.mockRejectedValueOnce(new Api.ApiError(404, 'Not found'))
    const missing = setup()
    await vi.waitFor(() => expect(missing.encryption.state.value).toBe('missing'))
    getBucketEncryption.mockRejectedValueOnce(new Api.ApiError(403, 'Forbidden'))
    const refused = setup()
    await vi.waitFor(() => expect(refused.encryption.state.value).toBe('refused'))

    expect(missing.encryption.status.value).toBeNull()
    expect(refused.encryption.status.value).toBeNull()
  })

  it('keeps the last answer marked out of date after a passing failure and holds back changes', async () => {
    const { encryption } = setup()
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    getBucketEncryption.mockRejectedValueOnce(new TypeError('network down'))

    await encryption.load()

    expect(encryption.state.value).toBe('stale')
    expect(encryption.status.value?.bucket_id).toBe('B1')
    await expect(encryption.lock()).rejects.toThrow('not known right now')
    expect(lockBucket).not.toHaveBeenCalled()
    getBucketEncryption.mockRejectedValueOnce(new Api.ApiError(404, 'Not found'))
    await encryption.load()
    expect(encryption.state.value).toBe('missing')
    expect(encryption.status.value).toBeNull()
  })

  it('unlocks with the context of the shown key and reads the status before answering', async () => {
    const { encryption } = setup()
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    unlockWithVault.mockResolvedValue({ kind: 'unlocked', status: { state: 'unlocked' }, ownKey: 'matches' })
    getBucketEncryption.mockResolvedValue(status({ unlock: { ...status().unlock!, state: 'unlocked', session_id: 'S2' } }))

    const outcome = await encryption.unlock(2, 60_000)

    expect(outcome?.kind).toBe('unlocked')
    const [target, vault, live] = unlockWithVault.mock.calls[0]
    expect(target).toEqual({
      bucket: 'reef',
      client: { baseUrl: 'https://b.test/api/v1', token: 'bearer-1' },
      context: { realmId: 'r-1', nodeId: 'node-b', bucketId: 'B1', generation: 2, userId: 'u-1' },
      publicKey: 'PK',
      durationMs: 60_000,
    })
    expect(vault).toEqual({ name: 'vault' })
    expect(live()).toBe(true)
    expect(encryption.status.value?.unlock?.session_id).toBe('S2')
    expect(encryption.revision.value).toBe(2)
    expect(encryption.busy.value).toBeNull()
  })

  it('keeps an unconfirmed unlock blocked until the node reports the status again', async () => {
    const { encryption } = setup()
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    unlockWithVault.mockResolvedValue({ kind: 'unknown', ownKey: 'matches' })
    getBucketEncryption.mockRejectedValueOnce(new TypeError('network down'))

    await encryption.unlock(2)

    expect(encryption.outcomeUnknown.value).toBe(true)
    await expect(encryption.unlock(2)).rejects.toThrow('not confirmed')
    expect(unlockWithVault).toHaveBeenCalledTimes(1)
    await encryption.load()
    expect(encryption.outcomeUnknown.value).toBe(false)
  })

  it('forgets an unlock that ends after the session changed', async () => {
    const { encryption } = setup()
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    const pending = deferred<unknown>()
    unlockWithVault.mockReturnValue(pending.promise)

    const answer = encryption.unlock(2)
    await vi.waitFor(() => expect(unlockWithVault).toHaveBeenCalled())
    const live = unlockWithVault.mock.calls[0][2] as () => boolean
    sessionEpoch.value += 1
    pending.resolve({ kind: 'unlocked', status: {}, ownKey: 'matches' })

    expect(await answer).toBeNull()
    expect(live()).toBe(false)
  })

  it('keeps an unlock dead after the page left the bucket and came back', async () => {
    const { encryption, bucket } = setup()
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    const pending = deferred<unknown>()
    unlockWithVault.mockReturnValue(pending.promise)

    const answer = encryption.unlock(2)
    await vi.waitFor(() => expect(unlockWithVault).toHaveBeenCalled())
    const live = unlockWithVault.mock.calls[0][2] as () => boolean
    bucket.value = 'other'
    bucket.value = 'reef'
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    pending.resolve({ kind: 'unlocked', status: {}, ownKey: 'matches' })

    expect(live()).toBe(false)
    expect(await answer).toBeNull()
  })

  it('drops the answer and the failure of a request whose state was disposed', async () => {
    const { encryption, scope } = setup()
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    const pending = deferred<unknown>()
    unlockWithVault.mockReturnValue(pending.promise)
    const loadsBefore = getBucketEncryption.mock.calls.length

    const answer = encryption.unlock(2)
    await vi.waitFor(() => expect(unlockWithVault).toHaveBeenCalled())
    const live = unlockWithVault.mock.calls[0][2] as () => boolean
    scope.stop()
    pending.reject(new Api.ApiError(400, 'refused', 'wrong_key'))

    expect(live()).toBe(false)
    expect(await answer).toBeNull()
    expect(getBucketEncryption.mock.calls.length).toBe(loadsBefore)
  })

  it('unlocks and extends a source key of a bucket whose new writes are not encrypted', async () => {
    const locked = status().unlock!
    const source = { generation: 1, role: 'source' as const, public_key: 'PK1', fingerprint: 'f1', unlock: locked }
    getBucketEncryption.mockResolvedValue(
      status({ mode: 'off', public_key: null, fingerprint: null, unlock: null, key_generation: 2, generations: [source] }),
    )
    const { encryption } = setup()
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    unlockWithVault.mockResolvedValue({ kind: 'unlocked', status: {}, ownKey: 'matches' })

    await encryption.unlock(1)
    await expect(encryption.unlock(2)).rejects.toThrow('no such key')

    const [target] = unlockWithVault.mock.calls[0]
    expect(target.publicKey).toBe('PK1')
    expect(target.context).toMatchObject({ bucketId: 'B1', generation: 1 })
    await expect(encryption.extend(1)).rejects.toThrow('not unlocked')
    getBucketEncryption.mockResolvedValue(
      status({ mode: 'off', public_key: null, fingerprint: null, unlock: null, generations: [{ ...source, unlock: OPEN }] }),
    )
    await encryption.load()
    extendUnlock.mockResolvedValue(OPEN)
    await encryption.extend(1, 60_000)
    expect(extendUnlock.mock.calls[0].slice(0, 2)).toEqual(['reef', { generation: 1, session_id: 'S1', duration_ms: 60_000 }])
  })

  it('leaves the busy flag and result of a newer context alone when an old refresh ends', async () => {
    const { encryption, bucket } = setup()
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    const refresh = deferred<Api.BucketEncryptionResponse>()
    lockBucket.mockResolvedValueOnce(OPEN)
    getBucketEncryption.mockReturnValueOnce(refresh.promise)

    const first = encryption.lock()
    await vi.waitFor(() => expect(getBucketEncryption).toHaveBeenCalledTimes(2))
    bucket.value = 'other'
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    const second = deferred<unknown>()
    lockBucket.mockReturnValueOnce(second.promise)
    const next = encryption.lock()
    expect(encryption.busy.value).toBe('lock')
    refresh.resolve(status())

    expect(await first).toBeNull()
    expect(encryption.busy.value).toBe('lock')
    second.resolve(OPEN)
    expect(await next).toEqual(OPEN)
    expect(encryption.busy.value).toBeNull()
  })

  it('stops the unlock when the bucket key changes under it', async () => {
    const { encryption } = setup()
    await vi.waitFor(() => expect(encryption.state.value).toBe('ready'))
    unlockWithVault.mockImplementation(async (_target, _vault, live: () => boolean) => {
      getBucketEncryption.mockResolvedValue(status({ public_key: 'PK-new' }))
      await encryption.load()
      return { kind: live() ? 'unlocked' : 'stale' }
    })

    expect((await encryption.unlock(2))?.kind).toBe('stale')
  })
})
