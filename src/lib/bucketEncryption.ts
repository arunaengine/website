// Words for the encryption state of a bucket. A value the node did not report
// reads as unknown, never as zero, empty, off or complete.
import {
  ApiError,
  apiErrorMessage,
  ENCRYPTION_CODES,
  type BlockCipher,
  type BlockKeys,
  type BucketCompressionResponse,
  type BucketEncryptionResponse,
  type EncryptionMode,
  type EncryptionTransition,
  type HolderOrigin,
  type HolderReadiness,
  type HolderState,
  type RecoveryStatus,
} from './api'
import type { RouteLocationRaw } from 'vue-router'
import { formatDuration } from './utils'

export const MODE_LABEL: Record<EncryptionMode, string> = {
  off: 'Off',
  node_managed: 'Node-managed',
  vault_locked: 'Vault-locked',
}

export const CIPHER_LABEL: Record<BlockCipher, string> = {
  chacha20_poly1305: 'ChaCha20-Poly1305',
  aes256_gcm: 'AES-256-GCM',
}

export const BLOCK_KEYS_LABEL: Record<BlockKeys, string> = {
  content_derived: 'Derived from block content',
  unique: 'A new key for every block',
}

export const ORIGIN_LABEL: Record<HolderOrigin, string> = {
  creator: 'Creator',
  admin: 'Group admin',
  explicit: 'Granted',
}

export const HOLDER_STATE_LABEL: Record<HolderState, string> = {
  ready: 'Ready',
  pending: 'Pending',
  missing_key: 'No usable key',
  unavailable: 'Directory unavailable',
}

const UNKNOWN = 'Unknown'

function known<T extends string>(labels: Record<T, string>, value: T | null | undefined): string {
  return (value && labels[value]) || UNKNOWN
}

export const modeLabel = (mode: EncryptionMode | null | undefined) => known(MODE_LABEL, mode)
export const cipherLabel = (cipher: BlockCipher | null | undefined) => known(CIPHER_LABEL, cipher)
export const blockKeysLabel = (keys: BlockKeys | null | undefined) => known(BLOCK_KEYS_LABEL, keys)

export interface LockView {
  /** Also the `stateBadge` key. */
  label: string
  detail: string
}

function at(ms: number): string {
  return new Date(ms).toLocaleString()
}

/** Locked, unlocked, timed unlock or locked since restart; unknown when the node gave no lock state. */
export function lockView(status: BucketEncryptionResponse): LockView {
  if (status.mode === 'off') return { label: 'Not encrypted', detail: 'Stored bytes are readable without a key.' }
  const unlock = status.unlock
  if (!unlock) return { label: UNKNOWN, detail: 'The node did not report whether the bucket is unlocked.' }
  if (unlock.state === 'unlocked') {
    return unlock.deadline_ms !== null
      ? { label: 'Timed unlock', detail: `Locks itself at ${at(unlock.deadline_ms)}.` }
      : { label: 'Unlocked', detail: 'Until a key holder locks it or the node restarts.' }
  }
  if (unlock.lock_reason === 'restart') {
    return { label: 'Locked since restart', detail: 'The node restarted. A key holder must unlock it again.' }
  }
  const since = unlock.locked_at_ms !== null ? ` since ${at(unlock.locked_at_ms)}` : ''
  const why = unlock.lock_reason === 'timed' ? 'The timed unlock ended' : 'Locked'
  return { label: 'Locked', detail: `${why}${since}.` }
}

function count(value: number | null | undefined, noun: string): string | null {
  if (value === null || value === undefined) return null
  return `${value} ${noun}`
}

/** "2 ready, 1 pending, 1 without a key"; unknown parts are said to be unknown. */
export function holderSummary(holders: HolderReadiness | null): string {
  if (!holders) return UNKNOWN
  const parts = [
    count(holders.ready, 'ready'),
    count(holders.pending, 'pending'),
    count(holders.missing_key, 'without a key'),
  ]
  if (parts.every((part) => part === null)) return UNKNOWN
  const shown = parts.filter((part): part is string => part !== null)
  return parts.includes(null) ? `${shown.join(', ')}, others unknown` : shown.join(', ')
}

export function recoverySummary(recovery: RecoveryStatus | null): LockView {
  if (!recovery || recovery.state === 'unknown') {
    return { label: UNKNOWN, detail: 'The key directory did not answer, so the recovery rule could not be checked.' }
  }
  if (recovery.state === 'met') {
    return { label: 'Met', detail: 'Two ready key holders, or one with a recovery code.' }
  }
  return {
    label: 'Not met',
    detail: 'Recovery needs a usable recovery code or another ready key holder. Losing the last key loses the data.',
  }
}

export function compressionSummary(
  compression: BucketCompressionResponse | null,
  encrypted: boolean,
): string {
  if (!compression) return UNKNOWN
  if (compression.mode === 'off') return 'Off'
  const requested = compression.level === undefined ? 'zstd' : `zstd level ${compression.level}`
  if (!encrypted) return requested
  return compression.effective_level === undefined
    ? `${requested}; the level Pithos applies is not reported`
    : `${requested}, applied as level ${compression.effective_level} in Pithos`
}

export function maxUnlockLabel(ms: number | null): string {
  return ms === null ? 'Until lock or restart' : formatDuration(ms)
}

const KIND_LABEL: Record<EncryptionTransition['kind'], string> = {
  encrypt: 'Encrypting stored versions',
  decrypt: 'Decrypting stored versions',
  reencode: 'Writing stored versions in the new format',
  rotate: 'Granting stored versions to the new key',
}

const STATE_LABEL: Record<EncryptionTransition['state'], string> = {
  running: 'Running',
  awaiting_key: 'Waiting for an unlock',
  cleanup: 'Removing old copies',
  blocked: 'Blocked',
  finished: 'Finished',
}

export interface TransitionView {
  title: string
  state: string
  detail: string
  /** Every version rewritten and every old copy removed. */
  complete: boolean
}

export function transitionView(transition: EncryptionTransition): TransitionView {
  const remaining = transition.remaining === null ? 'an unknown number' : String(transition.remaining)
  const cleanup =
    transition.cleanup_remaining === null
      ? 'old copies still to count'
      : `${transition.cleanup_remaining} old ${transition.cleanup_remaining === 1 ? 'copy' : 'copies'} to remove`
  const failed = transition.failed ? `, ${transition.failed} failed` : ''
  const complete =
    transition.state === 'finished' && transition.remaining === 0 && transition.cleanup_remaining === 0
  return {
    title: known(KIND_LABEL, transition.kind),
    state: complete ? 'Finished' : transition.state === 'finished' ? 'Cleanup open' : known(STATE_LABEL, transition.state),
    detail: `${transition.done} done, ${remaining} left${failed}, ${cleanup}.`,
    complete,
  }
}

const HOUR = 3_600_000
const DURATIONS: [number, string][] = [
  [HOUR / 4, '15 minutes'],
  [HOUR, '1 hour'],
  [8 * HOUR, '8 hours'],
  [24 * HOUR, '24 hours'],
]

/** Unlock lengths within the bucket maximum; '' leaves it to the node: the maximum, or until lock. */
export function durationOptions(maxMs: number | null): { value: string; label: string }[] {
  const fallback = maxMs === null ? 'Until lock or restart' : `The bucket maximum (${formatDuration(maxMs)})`
  const shorter = DURATIONS.filter(([ms]) => maxMs === null || ms < maxMs)
  return [{ value: '', label: fallback }, ...shorter.map(([ms, label]) => ({ value: String(ms), label }))]
}

const REFUSALS: Record<string, string> = {
  [ENCRYPTION_CODES.wrongKey]: 'The node says this key does not belong to the bucket.',
  [ENCRYPTION_CODES.invalidDuration]: 'The node refused this unlock length.',
  [ENCRYPTION_CODES.staleGeneration]: 'The bucket key changed meanwhile. Read the state again and retry.',
  [ENCRYPTION_CODES.sessionMismatch]: 'The bucket was locked or unlocked again meanwhile. Read the state again.',
  [ENCRYPTION_CODES.capacity]: 'The node holds as many unlocked buckets as it can. Lock another one first.',
  [ENCRYPTION_CODES.openUploads]: 'Uploads to this bucket are still open. Finish or abort them first.',
  [ENCRYPTION_CODES.locked]: 'The bucket is locked. A key holder must unlock it first.',
  [ENCRYPTION_CODES.recoveryUnmet]:
    'Vault-locked needs two ready key holders, or one with a recovery code.',
}

/** A node refusal in plain words, by its code; anything else keeps the node's message. */
export function encryptionError(error: unknown): string {
  const code = error instanceof ApiError ? (error.code ?? '') : ''
  return REFUSALS[code] ?? apiErrorMessage(error)
}

/** The settings an admin may change with PUT; the key generation is the one shown. */
export interface EncryptionDraft {
  mode: EncryptionMode
  cipher: BlockCipher
  block_keys: BlockKeys
  max_unlock_ms: number | null
}

function formatChanged(from: BucketEncryptionResponse, to: EncryptionDraft): boolean {
  return from.cipher !== to.cipher || from.block_keys !== to.block_keys
}

/** Changes that read stored data or the private key need the bucket unlocked first. */
export function changeNeedsUnlock(from: BucketEncryptionResponse, to: EncryptionDraft): boolean {
  if (from.mode === 'off') return false
  return to.mode !== from.mode || formatChanged(from, to)
}

/** Short notes on what a change does, shown before it is saved. */
export function changeNotes(from: BucketEncryptionResponse, to: EncryptionDraft): string[] {
  const notes: string[] = []
  if (from.mode === 'off' && to.mode !== 'off') {
    notes.push('Stored versions are encrypted in the background with the public key; no unlock is needed.')
    notes.push('Old plaintext copies are removed where the storage backend allows it; old backups keep them.')
  } else if (from.mode !== 'off' && to.mode === 'off') {
    notes.push('Stored versions are decrypted in the background; the keys stay until every version is rewritten.')
  } else if (from.mode === 'vault_locked' && to.mode === 'node_managed') {
    notes.push('The node keeps its own copy of the key and unlocks the bucket at startup.')
    notes.push('This protects only against the storage provider, not against this node.')
  } else if (from.mode === 'node_managed' && to.mode === 'vault_locked') {
    notes.push('A new key is made, stored versions are granted to it, and the node copy is removed.')
    notes.push('An old backup of the node still holds the old key.')
  }
  if (to.mode !== 'off' && from.mode !== 'off' && formatChanged(from, to)) {
    notes.push('Stored versions are written again in the new format.')
  }
  if (to.mode === 'vault_locked') {
    notes.push('A node restart locks the bucket. Recovery needs a usable recovery code or another ready key holder.')
  }
  return notes
}

export const ROTATION_NOTES = [
  'A new key is made and every stored version is granted to it; the data itself is not rewritten.',
  'Rotation does not invalidate an old backup that still holds the old key.',
]

export function maxUnlockOptions(current: number | null): { value: string; label: string }[] {
  const options = [
    { value: '', label: 'No limit: until lock or restart' },
    ...[HOUR, 8 * HOUR, 24 * HOUR, 7 * 24 * HOUR].map((ms) => ({ value: String(ms), label: formatDuration(ms) })),
  ]
  if (current !== null && !options.some((option) => option.value === String(current))) {
    options.push({ value: String(current), label: formatDuration(current) })
  }
  return options
}

/** The Encryption tab of a bucket on the node that hosts it, where a key holder unlocks it. */
export function bucketUnlockLink(bucket: string, nodeId?: string | null, groupId?: string | null): RouteLocationRaw {
  return {
    name: 'bucket-storage',
    params: { bucketId: bucket },
    query: { tab: 'encryption', ...(nodeId ? { node: nodeId } : {}), ...(groupId ? { group: groupId } : {}) },
  }
}
