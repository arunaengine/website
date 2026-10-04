// Unlocks an encrypted bucket from this browser: the caller's sealed copy is
// opened with a vault keypair and only the bucket private key goes to the node.
// The raw key lives in one local buffer that is cleared whatever happens.
import {
  ApiError,
  getMyCopies,
  unlockBucket,
  type ApiClientOptions,
  type BucketUnlockStatus,
  type SealedCopyEntry,
} from '@/lib/api'
import { BucketKeyMismatchError, openBucketCopy, type CopyContext } from './bucketCopy'
import { SealOpenError, fromBase64Url, type X25519Pair } from './hpke'

/** The vault operations the flow needs; `checkKey` waits for the directory check. */
export interface UnlockVault {
  checkKey(): Promise<string>
  openUserKey(keyId: string): Promise<X25519Pair | null>
  /** A check that stays true while the vault stays unlocked with the same key. */
  whileUnlocked(): () => boolean
}

export interface UnlockTarget {
  bucket: string
  /** The API base of the node that hosts the bucket. */
  client: ApiClientOptions
  context: Omit<CopyContext, 'keyRecord'>
  /** Standard base64 of the bucket public key the node reported. */
  publicKey: string
  durationMs?: number
}

export type UnlockOutcome =
  | { kind: 'unlocked'; status: BucketUnlockStatus; ownKey: string }
  /** The key was sent and no answer came back; read the status before trying again. */
  | { kind: 'unknown'; ownKey: string }

/** The bucket, node, account or key generation changed, so nothing was sent. */
export class UnlockStaleError extends Error {
  constructor() {
    super('The bucket changed while it was being unlocked. Nothing was sent.')
    this.name = 'UnlockStaleError'
  }
}

/** The vault was locked during the unlock, so the opened key was dropped unsent. */
export class VaultClosedError extends Error {
  constructor() {
    super('Your vault was locked, so the bucket key was not sent.')
    this.name = 'VaultClosedError'
  }
}

/** No copy of the caller opens with this vault. */
export class NoUsableCopyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoUsableCopyError'
  }
}

function bytes(text: string): Uint8Array<ArrayBuffer> {
  try {
    return fromBase64Url(text)
  } catch {
    throw new NoUsableCopyError('The node returned a copy that is not readable.')
  }
}

async function openFirst(
  copies: SealedCopyEntry[],
  target: UnlockTarget,
  vault: UnlockVault,
  guard: () => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const publicKey = bytes(target.publicKey)
  let held = false
  for (const copy of copies) {
    const pair = await vault.openUserKey(copy.key_id)
    guard()
    if (!pair) continue
    held = true
    try {
      const sealed = { enc: bytes(copy.enc), ciphertext: bytes(copy.ciphertext) }
      return await openBucketCopy(pair, sealed, { ...target.context, keyRecord: copy.key_record }, publicKey)
    } catch (cause) {
      if (!(cause instanceof SealOpenError || cause instanceof BucketKeyMismatchError)) throw cause
    }
  }
  if (!copies.length) {
    throw new NoUsableCopyError('You have no ready copy of this bucket key yet. Another key holder must unlock the bucket first.')
  }
  throw new NoUsableCopyError(
    held
      ? 'Your copy of the bucket key does not open. It may belong to another bucket or node.'
      : 'Your copy is sealed to a key this vault does not hold.',
  )
}

// `current` must stay true for the account, session, realm, API base, node, group,
// bucket id, key generation and request that started the unlock.
export async function unlockWithVault(
  target: UnlockTarget,
  vault: UnlockVault,
  current: () => boolean,
): Promise<UnlockOutcome> {
  const ownKey = await vault.checkKey()
  const vaultOpen = vault.whileUnlocked()
  const guard = () => {
    if (!current()) throw new UnlockStaleError()
    if (!vaultOpen()) throw new VaultClosedError()
  }
  guard()
  const { bucketId, generation } = target.context
  const response = await getMyCopies(target.bucket, generation, target.client)
  guard()
  const copies = response.copies
    .filter((copy) => copy.bucket_id === bucketId && copy.generation === generation)
    .sort((a, b) => b.created_at_ms - a.created_at_ms)
  const key = await openFirst(copies, target, vault, guard)
  try {
    guard()
    const request = { bucket_id: bucketId, generation, duration_ms: target.durationMs }
    const status = await unlockBucket(target.bucket, request, key, target.client)
    return { kind: 'unlocked', status, ownKey }
  } catch (cause) {
    // Only a 4xx says the key was not applied; a 5xx or a lost answer says nothing.
    const answered = cause instanceof ApiError && cause.status < 500
    if (answered || cause instanceof UnlockStaleError || cause instanceof VaultClosedError) throw cause
    return { kind: 'unknown', ownKey }
  } finally {
    key.fill(0)
  }
}
