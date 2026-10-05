// A bucket private key sealed with HPKE to one user key. The info binds the copy
// to its realm, node, bucket, key generation, user and user key record, byte for
// byte as Aruna's `copy_info`; the associated data is empty.
import { fromBase64Url, importPrivateKey, openSealed, type SealedSecret, type X25519Pair } from './hpke'

export const COPY_PURPOSE = 'aruna bucket key copy v1'
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ID_BYTES = 32
const ULID_BYTES = 16
const KEY_BYTES = 32

export interface CopyContext {
  /** Unpadded base64url of the 32-byte realm id. */
  realmId: string
  /** Lowercase hex of the 32-byte node id. */
  nodeId: string
  bucketId: string
  generation: number
  /** `<ULID>@<realm id>`, as the node prints a user id. */
  userId: string
  /** The key directory record the copy is sealed to. */
  keyRecord: string
}

/** An id in the context is not in the form the node uses. */
export class CopyContextError extends Error {
  constructor(part: string) {
    super(`The ${part} of the bucket key copy is not readable.`)
    this.name = 'CopyContextError'
  }
}

/** The copy opened, but the key in it is not this bucket's key. */
export class BucketKeyMismatchError extends Error {
  constructor() {
    super('The opened key does not belong to this bucket.')
    this.name = 'BucketKeyMismatchError'
  }
}

function ulidBytes(text: string, part: string): Uint8Array {
  if (text.length !== 26) throw new CopyContextError(part)
  let value = 0n
  for (const char of text.toUpperCase()) {
    const digit = CROCKFORD.indexOf(char)
    if (digit < 0) throw new CopyContextError(part)
    value = (value << 5n) | BigInt(digit)
  }
  if (value >> 128n) throw new CopyContextError(part)
  const bytes = new Uint8Array(ULID_BYTES)
  for (let at = ULID_BYTES - 1; at >= 0; at -= 1) {
    bytes[at] = Number(value & 255n)
    value >>= 8n
  }
  return bytes
}

function realmBytes(text: string): Uint8Array {
  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(text)
  } catch {
    throw new CopyContextError('realm id')
  }
  if (bytes.length !== ID_BYTES || /[^A-Za-z0-9_-]/.test(text)) throw new CopyContextError('realm id')
  return bytes
}

function nodeBytes(text: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(text)) throw new CopyContextError('node id')
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

function generationBytes(generation: number): Uint8Array {
  if (!Number.isSafeInteger(generation) || generation < 0) throw new CopyContextError('key generation')
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(generation))
  return bytes
}

/** The node's user storage key: realm id, then the user ULID. */
function userBytes(userId: string): Uint8Array[] {
  const [user, realm, extra] = userId.split('@')
  if (!user || !realm || extra !== undefined) throw new CopyContextError('user id')
  return [realmBytes(realm), ulidBytes(user, 'user id')]
}

/** The HPKE info of a copy: purpose label, a zero byte, then every id at its fixed length. */
export function copyInfo(context: CopyContext): Uint8Array<ArrayBuffer> {
  const parts = [
    new TextEncoder().encode(COPY_PURPOSE),
    Uint8Array.of(0),
    realmBytes(context.realmId),
    nodeBytes(context.nodeId),
    ulidBytes(context.bucketId, 'bucket id'),
    generationBytes(context.generation),
    ...userBytes(context.userId),
    ulidBytes(context.keyRecord, 'key record'),
  ]
  const info = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    info.set(part, at)
    at += part.length
  }
  return info
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index])
}

// Opens a copy and checks that the key in it belongs to `bucketPublic`. The
// caller owns the returned raw key and must clear it.
export async function openBucketCopy(
  recipient: X25519Pair,
  sealed: SealedSecret,
  context: CopyContext,
  bucketPublic: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const plain = await openSealed(recipient, sealed, copyInfo(context), new Uint8Array(0))
  try {
    if (plain.length !== KEY_BYTES) throw new BucketKeyMismatchError()
    const { publicKey } = await importPrivateKey(plain)
    if (!sameBytes(publicKey, bucketPublic)) throw new BucketKeyMismatchError()
    return plain
  } catch (cause) {
    plain.fill(0)
    throw cause
  }
}
