import { describe, expect, it } from 'vitest'
import { ApiError, type BucketEncryptionResponse, type BucketUnlockStatus, type EncryptionTransition } from './api'
import {
  actionError,
  encryptionError,
  keyGenerations,
  changeNeedsUnlock,
  changeNotes,
  compressionSummary,
  holderSummary,
  lockView,
  modeLabel,
  recoverySummary,
  spanLabel,
  transitionView,
} from './bucketEncryption'
import { stateTone } from './stateBadge'

const LOCKED: BucketUnlockStatus = {
  state: 'locked',
  lock_reason: 'manual',
  locked_at_ms: null,
  session_id: null,
  unlocked_at_ms: null,
  deadline_ms: null,
  max_deadline_ms: null,
}

function bucket(unlock: BucketUnlockStatus | null, mode: BucketEncryptionResponse['mode'] = 'vault_locked') {
  return { mode, unlock } as BucketEncryptionResponse
}

const TRANSITION: EncryptionTransition = {
  kind: 'encrypt',
  state: 'running',
  source_generation: null,
  target_generation: 1,
  done: 40,
  remaining: 10,
  failed: 0,
  cleanup_remaining: 50,
  started_at_ms: 1,
  finished_at_ms: null,
  blocked_reason: null,
}

describe('bucket encryption wording', () => {
  it('words every refusal code of the encryption routes and a refused key change', () => {
    const refusal = (status: number, code: string) => encryptionError(new ApiError(status, 'node text', code))

    expect(refusal(409, 'transition_running')).toContain('still moving to the new encryption')
    expect(refusal(409, 'bucket_locked')).toContain('A key holder must unlock it first')
    expect(refusal(409, 'no_copy')).toContain('You have no copy of this bucket key yet')
    expect(refusal(403, 'not_holder')).toBe('You do not hold a key of this bucket.')
    expect(refusal(409, 'not_encrypted')).toContain('not encrypted')
    expect(refusal(409, 'unchanged')).toBe('The bucket already uses these settings.')
    expect(refusal(501, 'not_supported')).toContain('does not support')
    const limit = 'an object is larger than the 1099511627776 byte (1.00 TiB) limit of encrypted objects'
    expect(encryptionError(new ApiError(409, limit, 'object_too_large'))).toBe(
      'This bucket holds an object larger than encrypted buckets support, so encryption cannot be enabled. ' +
        'An object is larger than the 1099511627776 byte (1.00 TiB) limit of encrypted objects.',
    )
    expect(refusal(403, 'Forbidden')).toContain('need group admin rights')
    expect(refusal(409, 'something_new')).toBe('node text')
  })

  it('reads a 501 not_supported as a refusal and other server errors as unconfirmed', () => {
    expect(actionError(new ApiError(501, 'node text', 'not_supported'))).toContain('does not support')
    expect(actionError(new ApiError(503, 'node text', 'unlock_capacity'))).toContain('did not confirm this change')
    expect(actionError(new ApiError(500, 'node text', 'Internal error'))).toContain('did not confirm this change')
    expect(actionError(new TypeError('network down'))).toContain('did not confirm this change')
  })

  it('names the four lock states and an unreported one', () => {
    expect(lockView(bucket(LOCKED)).label).toBe('Locked')
    expect(lockView(bucket({ ...LOCKED, lock_reason: 'restart' })).label).toBe('Locked since restart')
    expect(lockView(bucket({ ...LOCKED, state: 'unlocked', lock_reason: null })).label).toBe('Unlocked')
    expect(lockView(bucket({ ...LOCKED, state: 'unlocked' }, 'node_managed')).detail).toContain('again after a restart')
    expect(lockView(bucket({ ...LOCKED, state: 'unlocked', deadline_ms: 5_000 })).label).toBe('Timed unlock')
    expect(lockView(bucket(null)).label).toBe('Unknown')
    expect(lockView({ ...bucket(null, 'off'), generations: [] }).label).toBe('Not encrypted')
    expect(lockView(bucket(null, 'off')).label).toBe('Not encrypted for new writes')
    expect(stateTone('Locked since restart')).toBe('attention')
  })

  it('never turns an unknown count into zero', () => {
    expect(holderSummary(null)).toBe('Unknown')
    expect(holderSummary({ ready: null, pending: null, missing_key: null })).toBe('Unknown')
    expect(holderSummary({ ready: 2, pending: null, missing_key: 0 })).toBe('2 ready, 0 without a key, others unknown')
    expect(holderSummary({ ready: 2, pending: 1, missing_key: 0 })).toBe('2 ready, 1 pending, 0 without a key')
    expect(recoverySummary(null).label).toBe('Unknown')
    expect(recoverySummary({ state: 'degraded', ready_holders: 1, ready_with_recovery: 0 }).label).toBe('Not met')
    expect(modeLabel(undefined)).toBe('Unknown')
  })

  it('reports the effective Pithos level only for an encrypted bucket that names it', () => {
    expect(compressionSummary(null, true)).toBe('Unknown')
    expect(compressionSummary({ bucket: 'b', mode: 'off' }, true)).toBe('Off')
    expect(compressionSummary({ bucket: 'b', mode: 'zstd', level: 3, effective_level: 4 }, true)).toBe(
      'zstd level 3, applied as level 4 in Pithos',
    )
    expect(compressionSummary({ bucket: 'b', mode: 'zstd', level: 3 }, true)).toContain('not reported')
    expect(compressionSummary({ bucket: 'b', mode: 'zstd', level: 3, effective_level: 4 }, false)).toBe('zstd level 3')
  })

  it('calls a transition complete only after cleanup finished', () => {
    expect(transitionView(TRANSITION)).toMatchObject({ state: 'Running', complete: false })
    expect(transitionView(TRANSITION).detail).toBe('40 done, 10 left, 50 old copies to remove.')
    const visited = { ...TRANSITION, state: 'finished' as const, remaining: 0 }
    expect(transitionView(visited)).toMatchObject({ state: 'Cleanup open', complete: false })
    expect(transitionView({ ...visited, cleanup_remaining: null }).complete).toBe(false)
    expect(transitionView({ ...visited, cleanup_remaining: 0 })).toMatchObject({ state: 'Finished', complete: true })
    expect(transitionView({ ...visited, cleanup_remaining: 0, failed: 2 })).toMatchObject({
      state: 'Some versions failed',
      complete: false,
    })
    expect(transitionView({ ...TRANSITION, remaining: null }).detail).toContain('an unknown number left')
  })

  it('says which mode changes need an unlock and what they do', () => {
    const plain = { mode: 'off', cipher: 'chacha20_poly1305', block_keys: 'content_derived' } as BucketEncryptionResponse
    const managed = { ...plain, mode: 'node_managed' } as BucketEncryptionResponse
    const draft = { mode: 'vault_locked' as const, cipher: plain.cipher, block_keys: plain.block_keys, max_unlock_ms: null }

    expect(changeNeedsUnlock(plain, draft)).toBe(false)
    expect(changeNotes(plain, draft).join(' ')).toContain('no unlock is needed')
    expect(changeNeedsUnlock(managed, draft)).toBe(true)
    expect(changeNotes(managed, draft).join(' ')).toContain('An old backup of the node still holds the old key.')
    expect(changeNeedsUnlock(managed, { ...draft, mode: 'node_managed', max_unlock_ms: 5 })).toBe(false)
    expect(changeNeedsUnlock(managed, { ...draft, mode: 'node_managed', cipher: 'aes256_gcm' })).toBe(true)
    expect(changeNeedsUnlock(managed, { ...draft, mode: 'off' })).toBe(true)
  })

  it('names unlock lengths in whole units', () => {
    expect(spanLabel(15 * 60_000)).toBe('15 minutes')
    expect(spanLabel(3_600_000)).toBe('1 hour')
    expect(spanLabel(7 * 86_400_000)).toBe('7 days')
    expect(spanLabel(90_500)).toBe('1m 31s')
  })

  it('keeps a bucket with an encrypted source generation from reading as plain', () => {
    const source = { generation: 3, role: 'source' as const, public_key: 'PK3', fingerprint: 'f3', unlock: LOCKED }
    const off = { ...bucket(null, 'off'), generations: [source] }

    expect(lockView(off)).toMatchObject({ label: 'Decrypting' })
    expect(lockView(off).detail).toContain('reading them needs an unlock')
    expect(keyGenerations(off)).toEqual({ list: [source], reported: true })
    const older = { ...bucket(LOCKED), key_generation: 4, public_key: 'PK4', fingerprint: 'f4' }
    expect(keyGenerations(older)).toEqual({
      list: [{ generation: 4, role: 'active', public_key: 'PK4', fingerprint: 'f4', unlock: LOCKED }],
      reported: false,
    })
  })
})
