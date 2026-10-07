// Words for the encryption state of a bucket. A value the node did not report
// reads as unknown, never as zero, empty, off or complete.
import {
  ApiError,
  apiErrorMessage,
  ENCRYPTION_CODES,
  encryptionRefusal,
  type BlockCipher,
  type BlockKeys,
  type BucketCompressionResponse,
  type BucketEncryptionResponse,
  type BucketKeyGeneration,
  type BucketUnlockStatus,
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

export const ROLE_LABEL: Record<BucketKeyGeneration['role'], string> = {
  active: 'Active key',
  source: 'Previous key',
}

export interface KeyGenerations {
  list: BucketKeyGeneration[]
  /** False for a node that did not list its generations: only the active key is known. */
  reported: boolean
}

export function keyGenerations(status: BucketEncryptionResponse): KeyGenerations {
  if (status.generations) return { list: status.generations, reported: true }
  const { public_key: publicKey, fingerprint, unlock } = status
  if (status.mode === 'off' || !publicKey || !fingerprint || !unlock) return { list: [], reported: false }
  const active = { generation: status.key_generation, role: 'active' as const, public_key: publicKey, fingerprint, unlock }
  return { list: [active], reported: false }
}

/** Stored versions may be encrypted: the mode is on, or a decryption still keeps its keys. */
export function holdsEncrypted(status: BucketEncryptionResponse): boolean {
  return status.mode !== 'off' || keyGenerations(status).list.length > 0
}

/** An S3 key may get a session token for any encrypted bucket; key holders issue its keys. */
export function tokenEligible(status: BucketEncryptionResponse): boolean {
  return status.mode !== 'off'
}

/** Locked, unlocked, timed unlock or locked since restart; unknown when the node gave no lock state. */
export function lockView(status: BucketEncryptionResponse): LockView {
  if (status.mode === 'off') {
    const { list, reported } = keyGenerations(status)
    if (list.length) {
      return {
        label: 'Decrypting',
        detail: 'New writes are not encrypted. Older versions stay encrypted until the rewrite ends, and reading them needs an unlock.',
      }
    }
    if (!reported) {
      return { label: 'Not encrypted for new writes', detail: 'The node did not say whether older versions are still encrypted.' }
    }
    return { label: 'Not encrypted', detail: 'Stored bytes are readable without a key.' }
  }
  if (!status.unlock) return { label: UNKNOWN, detail: 'The node did not report whether the bucket is unlocked.' }
  return unlockView(status.unlock, status.mode === 'node_managed')
}

/** The lock state of one key generation. */
export function unlockView(unlock: BucketUnlockStatus, nodeManaged: boolean): LockView {
  if (unlock.state === 'unlocked') {
    return unlock.deadline_ms !== null
      ? { label: 'Timed unlock', detail: `Locks itself at ${at(unlock.deadline_ms)}.` }
      : {
          label: 'Unlocked',
          detail: nodeManaged
            ? 'The node holds its own key copy and unlocks the bucket again after a restart.'
            : 'Until a key holder locks it or the node restarts.',
        }
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

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "15 minutes", "8 hours", "7 days"; an uneven length keeps the compact form. */
export function spanLabel(ms: number): string {
  for (const [size, unit] of [[DAY, 'day'], [HOUR, 'hour'], [MINUTE, 'minute']] as const) {
    if (ms >= size && ms % size === 0) return `${ms / size} ${unit}${ms === size ? '' : 's'}`
  }
  return formatDuration(ms)
}

export function maxUnlockLabel(ms: number | null): string {
  return ms === null ? 'Until lock or restart' : spanLabel(ms)
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
  const settled = transition.remaining === 0 && transition.failed === 0 && transition.cleanup_remaining === 0
  const complete = transition.state === 'finished' && settled
  // A node that says finished with work left is not believed.
  const unsettled = transition.failed ? 'Some versions failed' : 'Cleanup open'
  return {
    title: known(KIND_LABEL, transition.kind),
    state: complete ? 'Finished' : transition.state === 'finished' ? unsettled : known(STATE_LABEL, transition.state),
    detail: `${transition.done} done, ${remaining} left${failed}, ${cleanup}.`,
    complete,
  }
}

const DURATIONS = [15 * MINUTE, HOUR, 8 * HOUR, DAY]

/** Unlock lengths within the bucket maximum; '' leaves it to the node: the maximum, or until lock. */
export function durationOptions(maxMs: number | null): { value: string; label: string }[] {
  const fallback = maxMs === null ? 'Until lock or restart' : `The bucket maximum (${spanLabel(maxMs)})`
  const shorter = DURATIONS.filter((ms) => maxMs === null || ms < maxMs)
  return [{ value: '', label: fallback }, ...shorter.map((ms) => ({ value: String(ms), label: spanLabel(ms) }))]
}

const REFUSALS: Record<string, string> = {
  [ENCRYPTION_CODES.wrongKey]: 'The node says this key does not belong to the bucket.',
  [ENCRYPTION_CODES.invalidDuration]: 'The node refused this unlock length.',
  [ENCRYPTION_CODES.staleGeneration]: 'The bucket settings or key changed meanwhile. Read the state again and retry.',
  [ENCRYPTION_CODES.sessionMismatch]: 'The bucket was locked or unlocked again meanwhile. Read the state again.',
  [ENCRYPTION_CODES.capacity]: 'The node holds as many unlocked buckets as it can. Lock another one first.',
  [ENCRYPTION_CODES.openUploads]: 'Uploads to this bucket are still open. Finish or abort them first.',
  [ENCRYPTION_CODES.locked]: 'The bucket is locked. A key holder must unlock it first.',
  [ENCRYPTION_CODES.recoveryUnmet]:
    'Vault-locked needs two ready key holders, or one with a recovery code.',
  [ENCRYPTION_CODES.transitionRunning]:
    'Stored versions are still moving to the new encryption. Try again when that has finished.',
  [ENCRYPTION_CODES.noCopy]: 'You have no copy of this bucket key yet. Another key holder must unlock the bucket first.',
  [ENCRYPTION_CODES.notHolder]: 'You do not hold a key of this bucket.',
  [ENCRYPTION_CODES.notEncrypted]: 'This bucket is not encrypted, so it has no keys.',
  [ENCRYPTION_CODES.unchanged]: 'The bucket already uses these settings.',
  [ENCRYPTION_CODES.notSupported]: 'This node does not support this for the bucket.',
  [ENCRYPTION_CODES.objectTooLarge]:
    'This bucket holds an object larger than encrypted buckets support, so encryption cannot be enabled.',
}

const NO_RIGHTS = 'You may not make this change. Settings, key holders and rotation need group admin rights.'

/** A node refusal in plain words, by its code; anything else keeps the node's message. */
export function encryptionError(error: unknown): string {
  const code = error instanceof ApiError ? (error.code ?? '') : ''
  if (code === ENCRYPTION_CODES.objectTooLarge) {
    // The node's own message names the size limit, so it follows as a sentence.
    const limit = apiErrorMessage(error).replace(/^./, (first) => first.toUpperCase()).replace(/[^.]$/, '$&.')
    return `${REFUSALS[code]} ${limit}`
  }
  const refused = error instanceof ApiError && error.status === 403
  return REFUSALS[code] ?? (refused ? NO_RIGHTS : apiErrorMessage(error))
}

/** Only a 4xx or a 501 `not_supported` says a change was not applied; another 5xx or a lost answer leaves it open. */
export function actionError(error: unknown): string {
  const unsupported =
    error instanceof ApiError && error.status === 501 && error.code === ENCRYPTION_CODES.notSupported
  const uncertain = !(error instanceof ApiError) || (error.status >= 500 && !unsupported)
  return uncertain
    ? 'The node did not confirm this change. The state shown is what it reports now; check it before you retry.'
    : encryptionError(error)
}

/** A refused copy of an encrypted source bucket, by its code; null for any other refusal. */
export function copyRefusal(error: unknown): string | null {
  if (encryptionRefusal(error, 403, ENCRYPTION_CODES.notHolder)) {
    return 'Only key holders of the source bucket may store a copy unencrypted.'
  }
  if (encryptionRefusal(error, 403, ENCRYPTION_CODES.plaintextRequired)) {
    return 'The source bucket is encrypted and the target bucket is not, so the copy was refused. A key holder of the source bucket may store it unencrypted instead.'
  }
  return null
}

/** The settings an admin may change with PUT; the storage generation is the one shown. */
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
    ...[HOUR, 8 * HOUR, DAY, 7 * DAY].map((ms) => ({ value: String(ms), label: spanLabel(ms) })),
  ]
  if (current !== null && !options.some((option) => option.value === String(current))) {
    options.push({ value: String(current), label: spanLabel(current) })
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
