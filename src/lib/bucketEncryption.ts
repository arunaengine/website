// Words for the encryption state of a bucket. A value the node did not report
// reads as unknown, never as zero, empty, off or complete.
import type {
  BlockCipher,
  BlockKeys,
  BucketCompressionResponse,
  BucketEncryptionResponse,
  EncryptionMode,
  EncryptionTransition,
  HolderReadiness,
  RecoveryStatus,
} from './api'
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
