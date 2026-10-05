import { describe, expect, it } from 'vitest'
import vector from './__fixtures__/bucket-copy.json'
import vault from './__fixtures__/vault.json'
import {
  BucketKeyMismatchError,
  COPY_PURPOSE,
  CopyContextError,
  copyInfo,
  openBucketCopy,
  type CopyContext,
} from './bucketCopy'
import { openKeypair, parseVaultPayload, unlockVault } from './crypto'
import { SealOpenError, importPrivateKey, sealTo } from './hpke'

function hex(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const context: CopyContext = {
  realmId: vector.realm_id,
  nodeId: vector.node_id,
  bucketId: vector.bucket_id,
  generation: vector.generation,
  userId: vector.user_id,
  keyRecord: vector.key_record,
}
const sealed = { enc: hex(vector.enc), ciphertext: hex(vector.ciphertext) }
const bucketPublic = hex(vector.bucket_public)

describe('bucket key copies', () => {
  it('encodes the copy context exactly as the shared vector', () => {
    expect(vector.purpose).toBe(COPY_PURPOSE)
    expect(toHex(copyInfo(context))).toBe(vector.info)
  })

  it('reproduces the vector seal with the fixed ephemeral key', async () => {
    const ephemeral = await importPrivateKey(hex(vector.ephemeral_private))

    const again = await sealTo(hex(vector.recipient_public), copyInfo(context), new Uint8Array(0), hex(vector.bucket_private), ephemeral)

    expect(toHex(again.enc)).toBe(vector.enc)
    expect(toHex(again.ciphertext)).toBe(vector.ciphertext)
  })

  it('opens the copy with the vault keypair the copy names', async () => {
    const payload = parseVaultPayload(vault.vault.payload)
    const master = await unlockVault(payload, vault.vault.passphrase)
    const entry = payload.keys.find((key) => key.id === vector.key_id)
    const recipient = await openKeypair(master, entry!)

    const key = await openBucketCopy(recipient, sealed, context, bucketPublic)

    expect(toHex(key)).toBe(vector.bucket_private)
  })

  it('refuses a copy opened under any other context', async () => {
    const recipient = await importPrivateKey(hex(vector.recipient_private))
    const otherRealm = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'
    const changed: CopyContext[] = [
      { ...context, realmId: otherRealm },
      { ...context, nodeId: vector.node_id.replace(/^81/, '82') },
      { ...context, bucketId: '01JB2S7YQ4M8N3V6K9R1T5W0Y0' },
      { ...context, generation: vector.generation + 1 },
      { ...context, userId: vector.user_id.replace(/^01J9/, '01JA') },
      { ...context, userId: `${vector.user_id.split('@')[0]}@${otherRealm}` },
      { ...context, keyRecord: '01JB2S8A0C3E5G7J9M1P3R5T7W' },
    ]

    for (const other of changed) {
      await expect(openBucketCopy(recipient, sealed, other, bucketPublic)).rejects.toThrow(SealOpenError)
    }
    const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice() }
    tampered.ciphertext[0] ^= 1
    await expect(openBucketCopy(recipient, tampered, context, bucketPublic)).rejects.toThrow(SealOpenError)
  })

  it('refuses a copy that holds another bucket key', async () => {
    const recipient = await importPrivateKey(hex(vector.recipient_private))
    const otherPublic = bucketPublic.slice()
    otherPublic[0] ^= 1

    await expect(openBucketCopy(recipient, sealed, context, otherPublic)).rejects.toThrow(BucketKeyMismatchError)
  })

  it('refuses ids that are not in the node form', () => {
    expect(() => copyInfo({ ...context, realmId: 'not base64url!' })).toThrow(CopyContextError)
    expect(() => copyInfo({ ...context, nodeId: vector.node_id.toUpperCase() })).toThrow(CopyContextError)
    expect(() => copyInfo({ ...context, bucketId: '01JB2S7YQ4M8N3V6K9R1T5W0XU' })).toThrow(CopyContextError)
    expect(() => copyInfo({ ...context, bucketId: '81JB2S7YQ4M8N3V6K9R1T5W0XZ' })).toThrow(CopyContextError)
    expect(() => copyInfo({ ...context, generation: -1 })).toThrow(CopyContextError)
    expect(() => copyInfo({ ...context, userId: vector.user_id.split('@')[0] })).toThrow(CopyContextError)
  })
})
