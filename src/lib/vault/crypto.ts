// The user vault: provider keys sealed in the browser so the node only ever
// holds ciphertext. A passphrase derives a wrapping key (PBKDF2-SHA256) that
// wraps the random master key; the master key seals the data. An optional
// recovery code wraps a second copy of the master key. The master key stays a
// WebCrypto handle: it is generated, wrapped and unwrapped, never exported.
// The `keys` slot holds the user's X25519 keypairs, the private key sealed with
// the master key; the newest pair that is not retired is the active one.
import { fromBase64Url, importPrivateKey, type X25519Pair } from './hpke'

export const VAULT_VERSION = 1 as const
export const VAULT_KDF_NAME = 'pbkdf2-sha256' as const
export const VAULT_KDF_ITERATIONS = 600_000
export const MIN_PASSPHRASE_LENGTH = 8
/** A key holder's vault opens bucket keys, so its passphrase must be longer. */
export const MIN_KEY_HOLDER_PASSPHRASE_LENGTH = 12
export const X25519_KIND = 'x25519'
/** Bound to every AES-GCM operation of this payload version. */
const ADDITIONAL_DATA = new TextEncoder().encode('aruna user vault v1')
const SALT_BYTES = 16
const NONCE_BYTES = 12
const RECOVERY_BYTES = 32
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export interface VaultKdf {
  name: typeof VAULT_KDF_NAME
  iterations: number
  salt: string
}

export interface VaultWrapped {
  nonce: string
  wrapped: string
}

export interface VaultRecovery extends VaultWrapped {
  salt: string
}

export interface VaultSealed {
  nonce: string
  sealed: string
}

/** One keypair in the `keys` slot; all binary fields are standard base64. */
export interface VaultKeyEntry {
  id: string
  kind: string
  public: string
  nonce: string
  wrapped_private: string
  created_at: string
  retired_at: string | null
}

export interface VaultPayload {
  version: typeof VAULT_VERSION
  kdf: VaultKdf
  master: VaultWrapped
  recovery?: VaultRecovery
  keys: VaultKeyEntry[]
  data: VaultSealed
}

export interface VaultData {
  providers: unknown[]
}

export type VaultSecret = { passphrase: string } | { recoveryCode: string }

export interface CreatedVault {
  payload: VaultPayload
  masterKey: CryptoKey
  /** Shown once; null when the user declined one. */
  recoveryCode: string | null
}

/** The passphrase or recovery code does not open this vault. */
export class VaultUnlockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultUnlockError'
  }
}

/** The payload is not one this portal can read. */
export class VaultFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultFormatError'
  }
}

export const WRONG_PASSPHRASE = 'Wrong passphrase.'
export const WRONG_RECOVERY_CODE = 'The recovery code is wrong.'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  let binary: string
  try {
    binary = atob(text)
  } catch {
    throw new VaultFormatError('The vault payload is not readable.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function gcm(nonce: Uint8Array<ArrayBuffer>): AesGcmParams {
  return { name: 'AES-GCM', iv: nonce, additionalData: ADDITIONAL_DATA }
}

const MASTER_ALGORITHM: AesKeyGenParams = { name: 'AES-GCM', length: 256 }
const MASTER_USAGES: KeyUsage[] = ['encrypt', 'decrypt']

async function wrappingKey(
  secret: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    MASTER_ALGORITHM,
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

function passphraseBytes(passphrase: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(passphrase)
}

/** 32 random bytes as Crockford base32 in groups of four, the form the user keeps. */
function formatRecoveryCode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += CROCKFORD[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += CROCKFORD[(value << (5 - bits)) & 31]
  return output.match(/.{1,4}/g)?.join('-') ?? output
}

/** Accepts the code as typed: any case, with or without separators, O and I read as 0 and 1. */
function recoveryBytes(code: string): Uint8Array<ArrayBuffer> {
  const normalized = code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  const expected = Math.ceil((RECOVERY_BYTES * 8) / 5)
  if (normalized.length !== expected) throw new VaultUnlockError(WRONG_RECOVERY_CODE)
  const bytes = new Uint8Array(RECOVERY_BYTES)
  let bits = 0
  let value = 0
  let at = 0
  for (const char of normalized) {
    const digit = CROCKFORD.indexOf(char)
    if (digit < 0) throw new VaultUnlockError(WRONG_RECOVERY_CODE)
    value = (value << 5) | digit
    bits += 5
    if (bits >= 8 && at < RECOVERY_BYTES) {
      bytes[at] = (value >>> (bits - 8)) & 255
      at += 1
      bits -= 8
    }
  }
  return bytes
}

async function wrapMaster(masterKey: CryptoKey, kek: CryptoKey): Promise<VaultWrapped> {
  const nonce = randomBytes(NONCE_BYTES)
  const wrapped = await crypto.subtle.wrapKey('raw', masterKey, kek, gcm(nonce))
  return { nonce: toBase64(nonce), wrapped: toBase64(new Uint8Array(wrapped)) }
}

async function unwrapMaster(
  block: VaultWrapped,
  kek: CryptoKey,
  extractable: boolean,
  failure: string,
): Promise<CryptoKey> {
  const nonce = fromBase64(block.nonce)
  const wrapped = fromBase64(block.wrapped)
  try {
    return await crypto.subtle.unwrapKey('raw', wrapped, kek, gcm(nonce), MASTER_ALGORITHM, extractable, MASTER_USAGES)
  } catch {
    throw new VaultUnlockError(failure)
  }
}

/** The KEK for a secret and the block it opens; the recovery block needs its own salt. */
async function keyFor(payload: VaultPayload, secret: VaultSecret): Promise<{ kek: CryptoKey; block: VaultWrapped; failure: string }> {
  if ('passphrase' in secret) {
    const kek = await wrappingKey(passphraseBytes(secret.passphrase), fromBase64(payload.kdf.salt), payload.kdf.iterations)
    return { kek, block: payload.master, failure: WRONG_PASSPHRASE }
  }
  if (!payload.recovery) throw new VaultUnlockError('This vault has no recovery code.')
  const kek = await wrappingKey(recoveryBytes(secret.recoveryCode), fromBase64(payload.recovery.salt), payload.kdf.iterations)
  return { kek, block: payload.recovery, failure: WRONG_RECOVERY_CODE }
}

export interface CreateVaultOptions {
  /** Lower only in tests; the default is the contract's 600 000. */
  iterations?: number
}

export async function createVault(
  passphrase: string,
  withRecovery: boolean,
  options: CreateVaultOptions = {},
): Promise<CreatedVault> {
  const iterations = options.iterations ?? VAULT_KDF_ITERATIONS
  // Extractable only so it can be wrapped here; the handle handed out below is not.
  const generated = await crypto.subtle.generateKey(MASTER_ALGORITHM, true, MASTER_USAGES)
  const salt = randomBytes(SALT_BYTES)
  const kek = await wrappingKey(passphraseBytes(passphrase), salt, iterations)
  const master = await wrapMaster(generated, kek)
  let recovery: VaultRecovery | undefined
  let recoveryCode: string | null = null
  if (withRecovery) {
    const code = randomBytes(RECOVERY_BYTES)
    const recoverySalt = randomBytes(SALT_BYTES)
    const recoveryKek = await wrappingKey(code, recoverySalt, iterations)
    recovery = { salt: toBase64(recoverySalt), ...(await wrapMaster(generated, recoveryKek)) }
    recoveryCode = formatRecoveryCode(code)
  }
  const masterKey = await unwrapMaster(master, kek, false, WRONG_PASSPHRASE)
  const data = await sealData(masterKey, { providers: [] })
  const payload: VaultPayload = {
    version: VAULT_VERSION,
    kdf: { name: VAULT_KDF_NAME, iterations, salt: toBase64(salt) },
    master,
    ...(recovery ? { recovery } : {}),
    keys: [],
    data,
  }
  return { payload, masterKey, recoveryCode }
}

/** The master key as a handle this page can use but not read. */
export async function unlockVault(payload: VaultPayload, passphrase: string): Promise<CryptoKey> {
  const { kek, block, failure } = await keyFor(payload, { passphrase })
  return unwrapMaster(block, kek, false, failure)
}

export async function unlockWithRecovery(payload: VaultPayload, recoveryCode: string): Promise<CryptoKey> {
  const { kek, block, failure } = await keyFor(payload, { recoveryCode })
  return unwrapMaster(block, kek, false, failure)
}

export function minPassphraseLength(keyHolder: boolean): number {
  return keyHolder ? MIN_KEY_HOLDER_PASSPHRASE_LENGTH : MIN_PASSPHRASE_LENGTH
}

export function passphraseLongEnough(passphrase: string, keyHolder: boolean): boolean {
  return passphrase.length >= minPassphraseLength(keyHolder)
}

/** Re-wraps the master key under the new passphrase; the recovery code and the data stay as they are. */
export async function changePassphrase(
  payload: VaultPayload,
  secret: VaultSecret,
  newPassphrase: string,
): Promise<VaultPayload> {
  const { kek, block, failure } = await keyFor(payload, secret)
  const masterKey = await unwrapMaster(block, kek, true, failure)
  const salt = randomBytes(SALT_BYTES)
  const nextKek = await wrappingKey(passphraseBytes(newPassphrase), salt, payload.kdf.iterations)
  return {
    ...payload,
    kdf: { ...payload.kdf, salt: toBase64(salt) },
    master: await wrapMaster(masterKey, nextKek),
  }
}

export async function sealData(masterKey: CryptoKey, data: VaultData): Promise<VaultSealed> {
  const nonce = randomBytes(NONCE_BYTES)
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const sealed = await crypto.subtle.encrypt(gcm(nonce), masterKey, plain)
  return { nonce: toBase64(nonce), sealed: toBase64(new Uint8Array(sealed)) }
}

/** Seals a raw X25519 private key into a `keys` entry; tests give a fixed nonce. */
export async function sealKeypair(
  masterKey: CryptoKey,
  id: string,
  privateKey: Uint8Array<ArrayBuffer>,
  createdAt: string,
  nonce: Uint8Array<ArrayBuffer> = randomBytes(NONCE_BYTES),
): Promise<VaultKeyEntry> {
  const { publicKey } = await importPrivateKey(privateKey)
  const wrapped = await crypto.subtle.encrypt(gcm(nonce), masterKey, privateKey)
  return {
    id,
    kind: X25519_KIND,
    public: toBase64(publicKey),
    nonce: toBase64(nonce),
    wrapped_private: toBase64(new Uint8Array(wrapped)),
    created_at: createdAt,
    retired_at: null,
  }
}

/** Retires the active keypairs and appends a fresh one; old pairs stay for reading. */
export async function rotateKeypair(masterKey: CryptoKey, keys: VaultKeyEntry[], now = new Date()): Promise<VaultKeyEntry[]> {
  const at = now.toISOString()
  const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const entry = await sealKeypair(masterKey, crypto.randomUUID(), fromBase64Url(jwk.d ?? ''), at)
  return [...keys.map((key) => (key.retired_at ? key : { ...key, retired_at: at })), entry]
}

/** The newest X25519 keypair that is not retired. */
export function activeKeypair(keys: VaultKeyEntry[]): VaultKeyEntry | null {
  const active = keys.filter((key) => key.kind === X25519_KIND && !key.retired_at)
  active.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  return active.at(-1) ?? null
}

/** Opens a `keys` entry and checks that its public key belongs to the private key. */
export async function openKeypair(masterKey: CryptoKey, entry: VaultKeyEntry): Promise<X25519Pair> {
  if (entry.kind !== X25519_KIND) throw new VaultFormatError('The vault key is not readable.')
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(gcm(fromBase64(entry.nonce)), masterKey, fromBase64(entry.wrapped_private))
  } catch {
    throw new VaultUnlockError('This key does not open the vault.')
  }
  const raw = new Uint8Array(plain)
  try {
    const pair = await importPrivateKey(raw)
    if (toBase64(pair.publicKey) !== entry.public) throw new VaultFormatError('The vault key is not readable.')
    return pair
  } finally {
    raw.fill(0)
  }
}

/** Lowercase hex SHA-256 of a raw public key, the fingerprint the key directory stores. */
export async function keyFingerprint(publicKey: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', publicKey))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function openData(masterKey: CryptoKey, payload: VaultPayload): Promise<VaultData> {
  const nonce = fromBase64(payload.data.nonce)
  const sealed = fromBase64(payload.data.sealed)
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(gcm(nonce), masterKey, sealed)
  } catch {
    throw new VaultUnlockError('This key does not open the vault.')
  }
  const data: unknown = JSON.parse(new TextDecoder().decode(plain))
  if (!data || typeof data !== 'object' || !Array.isArray((data as VaultData).providers)) {
    throw new VaultFormatError('The vault data is not readable.')
  }
  return data as VaultData
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VaultFormatError(message)
  return value as Record<string, unknown>
}

function text(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value) throw new VaultFormatError(message)
  return value
}

function wrappedBlock(value: unknown, message: string): VaultWrapped {
  const input = record(value, message)
  return { nonce: text(input.nonce, message), wrapped: text(input.wrapped, message) }
}

function keyEntry(value: unknown, message: string): VaultKeyEntry {
  const input = record(value, message)
  const retired = input.retired_at ?? null
  if (retired !== null && typeof retired !== 'string') throw new VaultFormatError(message)
  return {
    id: text(input.id, message),
    kind: text(input.kind, message),
    public: text(input.public, message),
    nonce: text(input.nonce, message),
    wrapped_private: text(input.wrapped_private, message),
    created_at: text(input.created_at, message),
    retired_at: retired,
  }
}

/** Reads the payload text the node returned; a version this portal does not know is refused. */
export function parseVaultPayload(serialized: string): VaultPayload {
  const unreadable = 'The vault payload is not readable.'
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new VaultFormatError(unreadable)
  }
  const input = record(value, unreadable)
  if (input.version !== VAULT_VERSION) {
    throw new VaultFormatError('This vault was written by a newer portal. Update the portal to open it.')
  }
  const kdf = record(input.kdf, unreadable)
  if (kdf.name !== VAULT_KDF_NAME) throw new VaultFormatError(unreadable)
  const iterations = kdf.iterations
  if (typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < 1) {
    throw new VaultFormatError(unreadable)
  }
  const data = record(input.data, unreadable)
  const recovery = input.recovery === undefined ? undefined : record(input.recovery, unreadable)
  if (!Array.isArray(input.keys)) throw new VaultFormatError(unreadable)
  return {
    version: VAULT_VERSION,
    kdf: { name: VAULT_KDF_NAME, iterations, salt: text(kdf.salt, unreadable) },
    master: wrappedBlock(input.master, unreadable),
    ...(recovery
      ? { recovery: { salt: text(recovery.salt, unreadable), ...wrappedBlock(recovery, unreadable) } }
      : {}),
    keys: input.keys.map((entry) => keyEntry(entry, unreadable)),
    data: { nonce: text(data.nonce, unreadable), sealed: text(data.sealed, unreadable) },
  }
}
