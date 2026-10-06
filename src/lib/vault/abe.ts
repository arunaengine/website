// KP-ABE work inside the key worker. Grants open with HPKE and import into the
// WASM build of aruna-kpabe; envelopes and holder issuance run there too. Byte
// layouts follow aruna core/src/structs/storage/abe.rs and abe_access.rs.
import type { KeyIssuer, KeyRequestFields } from '@/lib/api'
import { import_key, issue_key, type ScopedKey } from './kpabe/kpabe'
import { fromBase64Url, importPrivateKey, openSealed, sealTo, type SealedSecret, type X25519Pair } from './hpke'

const ENCODER = new TextEncoder()
export const GRANT_PURPOSE = ENCODER.encode('aruna ABE grant v1')
const SETUP_PURPOSE = ENCODER.encode('aruna bucket ABE v1')
const ENVELOPE_PURPOSE = ENCODER.encode('aruna object envelope v1')

/** The admitted public parameters of a bucket key generation. */
export interface ParameterBytes {
  parameters: Uint8Array
  context: Uint8Array
  fingerprint: Uint8Array
}

export interface GrantInput {
  sealed: SealedSecret
  /** The grant associated data; it must frame exactly `request` and `issuer`. */
  aad: Uint8Array<ArrayBuffer>
  pair: X25519Pair
  /** The caller's own request, with the admitted parameters. */
  request: KeyRequestFields
  issuer: KeyIssuer
  parameters: ParameterBytes
}

/** The pinned version metadata an envelope context must name. */
export interface EnvelopeExpected {
  objectKey: string
  epoch: number
  writeId: string
  publicKey: Uint8Array
}

export interface EnvelopeInput {
  envelope: Uint8Array
  /** The framed envelope context bytes. */
  context: Uint8Array
  /** The parameters admitted when the key was imported. */
  parameters: ParameterBytes
  expected: EnvelopeExpected
}

export interface IssueInput {
  /** The bucket private key; cleared here. */
  bucketKey: Uint8Array
  /** The holder proposal; the key is issued for exactly its scope and epochs. */
  request: KeyRequestFields
  issuer: KeyIssuer
  parameters: ParameterBytes
  aad: Uint8Array<ArrayBuffer>
  /** The postcard grant context echoed on submission; it must encode exactly `request` and `issuer`. */
  record: Uint8Array
}

/** Splits framed context fields: a field count, then big-endian u32 lengths and bytes. */
export function unframe(bytes: Uint8Array): Uint8Array[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 4) throw new Error('The encryption context is not readable.')
  const fields: Uint8Array[] = []
  let at = 4
  for (let count = view.getUint32(0); count > 0; count -= 1) {
    const length = at + 4 <= bytes.length ? view.getUint32(at) : bytes.length
    at += 4
    if (at + length > bytes.length) throw new Error('The encryption context is not readable.')
    fields.push(bytes.subarray(at, at + length))
    at += length
  }
  if (at !== bytes.length) throw new Error('The encryption context is not readable.')
  return fields
}

/** Frames context fields like aruna_kpabe::frame_context. */
function frame(fields: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(4 + fields.reduce((sum, field) => sum + 4 + field.length, 0))
  const view = new DataView(out.buffer)
  view.setUint32(0, fields.length)
  let at = 4
  for (const field of fields) {
    view.setUint32(at, field.length)
    out.set(field, at + 4)
    at += 4 + field.length
  }
  return out
}

function same(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function ulidBytes(text: string): Uint8Array {
  let value = 0n
  for (const char of text.toUpperCase()) {
    const digit = CROCKFORD.indexOf(char)
    if (digit < 0) throw new Error('The key grant is not readable.')
    value = value * 32n + BigInt(digit)
  }
  if (text.length !== 26 || value >> 128n) throw new Error('The key grant is not readable.')
  return Uint8Array.from({ length: 16 }, (_, index) => Number((value >> BigInt(120 - 8 * index)) & 0xffn))
}

function ulidText(bytes: Uint8Array): string {
  let value = bytes.reduce((sum, byte) => (sum << 8n) | BigInt(byte), 0n)
  let text = ''
  for (let index = 0; index < 26; index += 1, value >>= 5n) text = CROCKFORD[Number(value & 31n)] + text
  return text
}

/** A user storage key: the realm bytes, then the user ULID bytes. */
function userBytes(text: string): Uint8Array {
  const [user, realm, ...rest] = text.split('@')
  if (rest.length || realm === undefined) throw new Error('The key grant is not readable.')
  return Uint8Array.of(...fromBase64Url(realm), ...ulidBytes(user))
}

function hexBytes(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

/** A postcard unsigned varint. */
function varint(value: number | bigint): number[] {
  const out: number[] = []
  let rest = BigInt(value)
  do {
    const byte = Number(rest & 0x7fn)
    rest >>= 7n
    out.push(rest ? byte | 0x80 : byte)
  } while (rest)
  return out
}

/** Frames the grant associated data from named fields like aruna GrantContext::bytes. */
export function grantAad(request: KeyRequestFields, issuer: KeyIssuer): Uint8Array<ArrayBuffer> {
  const { recipient_record: record, recipient_public: recipient, recipient_fingerprint: fingerprint } = request
  if (!record || !recipient || !fingerprint || request.restrictions !== null) {
    throw new Error('This key grant cannot be opened in the browser.')
  }
  const scope = ENCODER.encode(request.scope.value)
  const created = new Uint8Array(8)
  new DataView(created.buffer).setBigUint64(0, BigInt(request.created_at_ms))
  return frame([
    GRANT_PURPOSE,
    ulidBytes(request.request_id),
    userBytes(request.requesting_user),
    userBytes(request.recipient_user),
    ulidBytes(record),
    fromBase64Url(recipient),
    fromBase64Url(fingerprint),
    ENCODER.encode(request.bucket),
    fromBase64Url(request.parameters.context),
    fromBase64Url(request.parameters.fingerprint),
    Uint8Array.from([...varint(request.epochs.length), ...request.epochs.flatMap(varint)]),
    Uint8Array.of(request.scope.kind === 'exact' ? 0 : 1, ...varint(scope.length), ...scope),
    ENCODER.encode(request.credential_id ?? ''),
    Uint8Array.of(0),
    Uint8Array.from(request.revisions.flatMap((revision) => [...fromBase64Url(revision)])),
    created,
    ENCODER.encode(issuer.kind),
    issuer.kind === 'user' ? userBytes(issuer.id) : hexBytes(issuer.id),
  ])
}

/** A postcard string. */
function text(value: string): number[] {
  const bytes = ENCODER.encode(value)
  return [...varint(bytes.length), ...bytes]
}

/** A canonical postcard ULID. */
function ulid(value: string): number[] {
  return text(ulidText(ulidBytes(value)))
}

/** A postcard UserId: the ULID text, then the realm bytes. */
function user(value: string): number[] {
  const bytes = userBytes(value)
  return [...text(ulidText(bytes.subarray(-16))), ...bytes.subarray(0, -16)]
}

/** Encodes the postcard grant context record from named fields like aruna GrantContext. */
export function grantRecord(request: KeyRequestFields, issuer: KeyIssuer): Uint8Array {
  const { recipient_record: record, recipient_public: recipient, recipient_fingerprint: fingerprint } = request
  const setup = unframe(fromBase64Url(request.parameters.context))
  if (!record || !recipient || !fingerprint || request.restrictions !== null || setup.length !== 5) {
    throw new Error('This key grant cannot be opened in the browser.')
  }
  const generation = new DataView(setup[4].buffer, setup[4].byteOffset, setup[4].byteLength).getBigUint64(0)
  const parameters = fromBase64Url(request.parameters.parameters)
  const credential = request.credential_id === null ? [0] : [1, ...text(request.credential_id)]
  return Uint8Array.from([
    ...ulid(request.request_id),
    ...user(request.requesting_user),
    ...user(request.recipient_user),
    1,
    ...ulid(record),
    1,
    ...fromBase64Url(recipient),
    1,
    ...fromBase64Url(fingerprint),
    ...text(request.bucket),
    ...setup[1],
    ...setup[2],
    ...text(ulidText(setup[3])),
    ...varint(generation),
    ...fromBase64Url(request.parameters.fingerprint),
    ...varint(parameters.length),
    ...parameters,
    request.scope.kind === 'exact' ? 0 : 1,
    ...text(request.scope.value),
    ...varint(request.epochs.length),
    ...request.epochs.flatMap(varint),
    ...credential,
    0,
    ...varint(request.revisions.length),
    ...request.revisions.flatMap((revision) => [...fromBase64Url(revision)]),
    ...varint(request.created_at_ms),
    ...(issuer.kind === 'user' ? [0, ...user(issuer.id)] : [1, ...hexBytes(issuer.id)]),
  ])
}

/** WASM refusals arrive as strings. */
function refused(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('The encryption key or record was refused.')
}

/** Checks that the associated data frames exactly the named fields and admitted parameters. */
function checkGrant(aad: Uint8Array, input: { request: KeyRequestFields; issuer: KeyIssuer; parameters: ParameterBytes }) {
  const { request, parameters } = input
  if (
    !same(aad, grantAad(request, input.issuer)) ||
    !same(fromBase64Url(request.parameters.context), parameters.context) ||
    !same(fromBase64Url(request.parameters.fingerprint), parameters.fingerprint)
  ) {
    throw new Error('The key grant does not belong to this key or bucket.')
  }
}

/** Opens a grant sealed to `pair` and imports its key; the opened bytes are cleared. */
export async function importGrant(input: GrantInput): Promise<ScopedKey> {
  const { parameters, request } = input
  checkGrant(input.aad, input)
  if (!same(fromBase64Url(request.recipient_public ?? ''), input.pair.publicKey)) {
    throw new Error('The key grant does not belong to this key or bucket.')
  }
  const plain = await openSealed(input.pair, input.sealed, GRANT_PURPOSE, input.aad)
  try {
    const epochs = BigUint64Array.from(request.epochs, (epoch) => BigInt(epoch))
    const { kind, value } = request.scope
    const { parameters: bytes, context, fingerprint } = parameters
    return import_key(bytes, context, fingerprint, kind, value, epochs, plain)
  } catch (cause) {
    throw refused(cause)
  } finally {
    plain.fill(0)
  }
}

/** Opens the 32-byte object key after checking the context names this bucket and pinned version. */
export async function openObject(key: ScopedKey, input: EnvelopeInput): Promise<Uint8Array<ArrayBuffer>> {
  const { expected } = input
  const fields = unframe(input.context)
  const setup = unframe(input.parameters.context)
  const epoch = new Uint8Array(8)
  new DataView(epoch.buffer).setBigUint64(0, BigInt(expected.epoch))
  if (
    fields.length !== 10 ||
    setup.length !== 5 ||
    !same(fields[0], ENVELOPE_PURPOSE) ||
    !same(setup[0], SETUP_PURPOSE) ||
    [1, 2, 3, 4].some((index) => !same(fields[index], setup[index])) ||
    !same(fields[5], input.parameters.fingerprint) ||
    !same(fields[6], epoch) ||
    !same(fields[7], ENCODER.encode(expected.objectKey)) ||
    !same(fields[8], ulidBytes(expected.writeId)) ||
    !same(fields[9], expected.publicKey)
  ) {
    throw new Error('The envelope does not belong to this object.')
  }
  let objectKey: Uint8Array<ArrayBuffer>
  try {
    objectKey = key.open_object(input.envelope, input.context) as Uint8Array<ArrayBuffer>
  } catch (cause) {
    throw refused(cause)
  }
  try {
    const { publicKey } = await importPrivateKey(objectKey)
    if (!same(publicKey, fields[9])) throw new Error('The opened key does not match the envelope.')
    return objectKey
  } catch (cause) {
    objectKey.fill(0)
    throw cause
  }
}

/** Issues the scope's key from the bucket key and seals it to the recipient. */
export async function issueGrant(input: IssueInput): Promise<SealedSecret> {
  const { parameters, request } = input
  let recipient: Uint8Array<ArrayBuffer>
  try {
    checkGrant(input.aad, input)
    if (!same(input.record, grantRecord(request, input.issuer))) {
      throw new Error('The key request record does not match its fields.')
    }
    recipient = fromBase64Url(request.recipient_public ?? '')
  } catch (cause) {
    input.bucketKey.fill(0)
    throw cause
  }
  let plain: Uint8Array<ArrayBuffer>
  try {
    const epochs = BigUint64Array.from(request.epochs, (epoch) => BigInt(epoch))
    const { kind, value } = request.scope
    const { parameters: bytes, context, fingerprint } = parameters
    plain = issue_key(input.bucketKey, bytes, context, fingerprint, kind, value, epochs) as Uint8Array<ArrayBuffer>
  } catch (cause) {
    throw refused(cause)
  } finally {
    input.bucketKey.fill(0)
  }
  try {
    return await sealTo(recipient, GRANT_PURPOSE, input.aad, plain)
  } finally {
    plain.fill(0)
  }
}
