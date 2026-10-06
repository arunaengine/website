// KP-ABE work inside the key worker. Grants open with HPKE and import into the
// WASM build of aruna-kpabe; envelopes and holder issuance run there too. Byte
// layouts follow aruna core/src/structs/storage/abe.rs and abe_access.rs.
import { import_key, issue_key, type ScopedKey } from './kpabe/kpabe'
import { importPrivateKey, openSealed, sealTo, type SealedSecret, type X25519Pair } from './hpke'

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
  /** The grant associated data, which names the recipient key and the parameters. */
  aad: Uint8Array<ArrayBuffer>
  pair: X25519Pair
  parameters: ParameterBytes
}

export interface EnvelopeInput {
  envelope: Uint8Array
  /** The framed envelope context bytes. */
  context: Uint8Array
  parameters: ParameterBytes
  /** The object key the caller asked for. */
  objectKey: string
}

export interface IssueInput {
  /** The bucket private key; cleared here. */
  bucketKey: Uint8Array
  parameters: ParameterBytes
  scope: { kind: 'exact' | 'subtree'; value: string }
  epochs: number[]
  recipient: Uint8Array<ArrayBuffer>
  aad: Uint8Array<ArrayBuffer>
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

function same(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

/** WASM refusals arrive as strings. */
function refused(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('The encryption key or record was refused.')
}

function checkGrant(aad: Uint8Array, parameters: ParameterBytes, recipient: Uint8Array) {
  const fields = unframe(aad)
  if (
    fields.length !== 18 ||
    !same(fields[0], GRANT_PURPOSE) ||
    !same(fields[5], recipient) ||
    !same(fields[8], parameters.context) ||
    !same(fields[9], parameters.fingerprint)
  ) {
    throw new Error('The key grant does not belong to this key or bucket.')
  }
}

/** Opens a grant sealed to `pair` and imports its key; the opened bytes are cleared. */
export async function importGrant(input: GrantInput): Promise<ScopedKey> {
  const { parameters } = input
  checkGrant(input.aad, parameters, input.pair.publicKey)
  const plain = await openSealed(input.pair, input.sealed, GRANT_PURPOSE, input.aad)
  try {
    return import_key(parameters.parameters, parameters.context, parameters.fingerprint, plain)
  } catch (cause) {
    throw refused(cause)
  } finally {
    plain.fill(0)
  }
}

/** Opens the 32-byte object key after checking the context names this bucket and object. */
export async function openObject(key: ScopedKey, input: EnvelopeInput): Promise<Uint8Array<ArrayBuffer>> {
  const fields = unframe(input.context)
  const setup = unframe(input.parameters.context)
  if (
    fields.length !== 10 ||
    setup.length !== 5 ||
    !same(fields[0], ENVELOPE_PURPOSE) ||
    !same(setup[0], SETUP_PURPOSE) ||
    [1, 2, 3, 4].some((index) => !same(fields[index], setup[index])) ||
    !same(fields[5], input.parameters.fingerprint) ||
    !same(fields[7], ENCODER.encode(input.objectKey))
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
  const { parameters } = input
  try {
    checkGrant(input.aad, parameters, input.recipient)
  } catch (cause) {
    input.bucketKey.fill(0)
    throw cause
  }
  let plain: Uint8Array<ArrayBuffer>
  try {
    const epochs = BigUint64Array.from(input.epochs, (epoch) => BigInt(epoch))
    const { kind, value } = input.scope
    const { parameters: bytes, context, fingerprint } = parameters
    plain = issue_key(input.bucketKey, bytes, context, fingerprint, kind, value, epochs) as Uint8Array<ArrayBuffer>
  } catch (cause) {
    throw refused(cause)
  } finally {
    input.bucketKey.fill(0)
  }
  try {
    return await sealTo(input.recipient, GRANT_PURPOSE, input.aad, plain)
  } finally {
    plain.fill(0)
  }
}
