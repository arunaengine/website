// HPKE (RFC 9180) base mode from WebCrypto parts, matching the node's Rust
// crate byte for byte. Suite: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256 and
// AES-256-GCM. Single-shot seal and open only, so the sequence number is 0.

const X25519: Algorithm = { name: 'X25519' }
const ENCODER = new TextEncoder()
const VERSION_LABEL = ENCODER.encode('HPKE-v1')
const KEM_SUITE = Uint8Array.of(0x4b, 0x45, 0x4d, 0x00, 0x20)
const HPKE_SUITE = Uint8Array.of(0x48, 0x50, 0x4b, 0x45, 0x00, 0x20, 0x00, 0x01, 0x00, 0x02)
// PKCS #8 header of a raw X25519 private key (RFC 8410).
const PKCS8_PREFIX = Uint8Array.of(
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
)
const HASH_BYTES = 32
const KEY_BYTES = 32
const NONCE_BYTES = 12

export interface X25519Pair {
  privateKey: CryptoKey
  /** Raw 32-byte public key. */
  publicKey: Uint8Array<ArrayBuffer>
}

export interface SealedSecret {
  /** The encapsulated ephemeral public key. */
  enc: Uint8Array<ArrayBuffer>
  ciphertext: Uint8Array<ArrayBuffer>
}

/** The secret does not open: wrong key, info, associated data or a changed ciphertext. */
export class SealOpenError extends Error {
  constructor() {
    super('The sealed secret does not open.')
    this.name = 'SealOpenError'
  }
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
  // An empty HKDF salt is HashLen zero bytes; WebCrypto refuses an empty HMAC key.
  const raw = key.length ? key : new Uint8Array(HASH_BYTES)
  const handle = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', handle, data))
}

function labeledExtract(suite: Uint8Array, salt: Uint8Array<ArrayBuffer>, label: string, ikm: Uint8Array) {
  return hmac(salt, concat(VERSION_LABEL, suite, ENCODER.encode(label), ikm))
}

async function labeledExpand(
  suite: Uint8Array,
  prk: Uint8Array<ArrayBuffer>,
  label: string,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const labeled = concat(Uint8Array.of(length >> 8, length & 255), VERSION_LABEL, suite, ENCODER.encode(label), info)
  let block = new Uint8Array(0)
  const out = new Uint8Array(length)
  for (let at = 0, counter = 1; at < length; counter += 1) {
    block = await hmac(prk, concat(block, labeled, Uint8Array.of(counter)))
    out.set(block.subarray(0, length - at), at)
    at += block.length
  }
  return out
}

/** Imports a raw X25519 private key and computes its public key. */
export async function importPrivateKey(raw: Uint8Array): Promise<X25519Pair> {
  const pkcs8 = concat(PKCS8_PREFIX, raw)
  const probe = await crypto.subtle.importKey('pkcs8', pkcs8, X25519, true, ['deriveBits'])
  const jwk = await crypto.subtle.exportKey('jwk', probe)
  const privateKey = await crypto.subtle.importKey('jwk', jwk, X25519, false, ['deriveBits'])
  return { privateKey, publicKey: fromBase64Url(jwk.x ?? '') }
}

/** DeriveKeyPair of RFC 9180, which the test vectors use for the ephemeral key. */
export async function deriveKeyPair(ikm: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const prk = await labeledExtract(KEM_SUITE, new Uint8Array(0), 'dkp_prk', ikm)
  return labeledExpand(KEM_SUITE, prk, 'sk', new Uint8Array(0), KEY_BYTES)
}

async function sharedSecret(privateKey: CryptoKey, peer: Uint8Array<ArrayBuffer>, context: Uint8Array) {
  const peerKey = await crypto.subtle.importKey('raw', peer, X25519, false, [])
  const dh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: peerKey }, privateKey, 256))
  const prk = await labeledExtract(KEM_SUITE, new Uint8Array(0), 'eae_prk', dh)
  return labeledExpand(KEM_SUITE, prk, 'shared_secret', context, HASH_BYTES)
}

async function keySchedule(shared: Uint8Array<ArrayBuffer>, info: Uint8Array) {
  const empty = new Uint8Array(0)
  const pskIdHash = await labeledExtract(HPKE_SUITE, empty, 'psk_id_hash', empty)
  const infoHash = await labeledExtract(HPKE_SUITE, empty, 'info_hash', info)
  const context = concat(Uint8Array.of(0), pskIdHash, infoHash)
  const secret = await labeledExtract(HPKE_SUITE, shared, 'secret', empty)
  const raw = await labeledExpand(HPKE_SUITE, secret, 'key', context, KEY_BYTES)
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  const nonce = await labeledExpand(HPKE_SUITE, secret, 'base_nonce', context, NONCE_BYTES)
  return { key, nonce }
}

async function ephemeralPair(): Promise<X25519Pair> {
  const pair = (await crypto.subtle.generateKey(X25519, false, ['deriveBits'])) as CryptoKeyPair
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { privateKey: pair.privateKey, publicKey }
}

/** Seals `plain` to a raw X25519 public key. The ephemeral key is fresh unless a test gives one. */
export async function sealTo(
  recipient: Uint8Array<ArrayBuffer>,
  info: Uint8Array,
  aad: Uint8Array<ArrayBuffer>,
  plain: Uint8Array<ArrayBuffer>,
  ephemeral?: X25519Pair,
): Promise<SealedSecret> {
  const { privateKey, publicKey: enc } = ephemeral ?? await ephemeralPair()
  const shared = await sharedSecret(privateKey, recipient, concat(enc, recipient))
  const { key, nonce } = await keySchedule(shared, info)
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, plain)
  return { enc, ciphertext: new Uint8Array(sealed) }
}

/** Opens a sealed secret with the recipient's keypair. */
export async function openSealed(
  recipient: X25519Pair,
  sealed: SealedSecret,
  info: Uint8Array,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const context = concat(sealed.enc, recipient.publicKey)
    const shared = await sharedSecret(recipient.privateKey, sealed.enc, context)
    const { key, nonce } = await keySchedule(shared, info)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, sealed.ciphertext)
    return new Uint8Array(plain)
  } catch {
    throw new SealOpenError()
  }
}
