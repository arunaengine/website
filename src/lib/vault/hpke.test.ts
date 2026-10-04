import { afterEach, describe, expect, it, vi } from 'vitest'
import vectors from './__fixtures__/vault.json'
import { SealOpenError, deriveKeyPair, importPrivateKey, openSealed, sealTo } from './hpke'

function hex(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const vector = vectors.hpke
const info = hex(vector.info)
const aad = hex(vector.aad)

afterEach(() => {
  vi.restoreAllMocks()
})

/** Records the raw HMAC and AES keys, the signed inputs and the X25519 results WebCrypto sees. */
function recordSecrets() {
  const seen: Uint8Array[] = []
  const subtle = crypto.subtle as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
  const wrap = (name: string, pick: (args: unknown[], result: unknown) => Uint8Array | null) => {
    const original = subtle[name].bind(crypto.subtle)
    vi.spyOn(subtle, name).mockImplementation(async (...args: unknown[]) => {
      const result = await original(...args)
      const secret = pick(args, result)
      if (secret) seen.push(secret)
      return result
    })
  }
  const algorithm = (value: unknown) => (typeof value === 'string' ? value : (value as { name: string }).name)
  wrap('importKey', (args) =>
    args[0] === 'raw' && ['HMAC', 'AES-GCM'].includes(algorithm(args[2])) ? (args[1] as Uint8Array) : null)
  wrap('sign', (args) => args[2] as Uint8Array)
  wrap('deriveBits', (_args, result) => new Uint8Array(result as ArrayBuffer))
  return seen
}

describe('hpke', () => {
  it('derives the vector ephemeral key from its input', async () => {
    const ephemeral = await deriveKeyPair(hex(vector.ephemeral_ikm))

    expect(toHex(ephemeral)).toBe(vector.ephemeral_private)
    expect(toHex((await importPrivateKey(ephemeral)).publicKey)).toBe(vector.enc)
  })

  it('reproduces the vector seal with the fixed ephemeral key', async () => {
    const ephemeral = await importPrivateKey(hex(vector.ephemeral_private))

    const sealed = await sealTo(hex(vector.recipient_public), info, aad, hex(vector.plaintext), ephemeral)

    expect(toHex(sealed.enc)).toBe(vector.enc)
    expect(toHex(sealed.ciphertext)).toBe(vector.ciphertext)
  })

  it('opens the vector secret', async () => {
    const recipient = await importPrivateKey(hex(vector.recipient_private))
    expect(toHex(recipient.publicKey)).toBe(vector.recipient_public)

    const plain = await openSealed(recipient, { enc: hex(vector.enc), ciphertext: hex(vector.ciphertext) }, info, aad)

    expect(toHex(plain)).toBe(vector.plaintext)
  })

  it('binds info and associated data', async () => {
    const recipient = await importPrivateKey(hex(vector.recipient_private))
    const encoder = new TextEncoder()
    const sealed = await sealTo(recipient.publicKey, encoder.encode('purpose a'), encoder.encode('object a'), encoder.encode('secret'))

    const plain = await openSealed(recipient, sealed, encoder.encode('purpose a'), encoder.encode('object a'))
    expect(new TextDecoder().decode(plain)).toBe('secret')
    await expect(openSealed(recipient, sealed, encoder.encode('purpose b'), encoder.encode('object a'))).rejects.toThrow(SealOpenError)
    await expect(openSealed(recipient, sealed, encoder.encode('purpose a'), encoder.encode('object b'))).rejects.toThrow(SealOpenError)
    const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice() }
    tampered.ciphertext[0] ^= 1
    await expect(openSealed(recipient, tampered, encoder.encode('purpose a'), encoder.encode('object a'))).rejects.toThrow(SealOpenError)
  })

  it('clears every secret it derives once a seal or an open is done', async () => {
    const recipient = await importPrivateKey(hex(vector.recipient_private))
    const ephemeral = await importPrivateKey(hex(vector.ephemeral_private))
    const seen = recordSecrets()

    await sealTo(recipient.publicKey, info, aad, hex(vector.plaintext), ephemeral)
    const plain = await openSealed(recipient, { enc: hex(vector.enc), ciphertext: hex(vector.ciphertext) }, info, aad)

    expect(toHex(plain)).toBe(vector.plaintext)
    expect(seen.length).toBeGreaterThan(10)
    expect(seen.filter((secret) => secret.some((byte) => byte !== 0))).toEqual([])
  })
})
