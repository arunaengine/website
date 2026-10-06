import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import vectors from './__fixtures__/kpabe-vectors.json'
import fixture from './__fixtures__/kpabe-issue.json'
import { GRANT_PURPOSE, importGrant, issueGrant, openObject, type ParameterBytes } from './abe'
import { importPrivateKey } from './hpke'
import { import_key, initSync } from './kpabe/kpabe'

function hex(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

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

const parameters: ParameterBytes = {
  parameters: hex(fixture.parameters),
  context: hex(fixture.setup_context),
  fingerprint: hex(fixture.fingerprint),
}

/** Grant associated data with the fields the browser checks; the rest are placeholders. */
function grantAad(recipient: Uint8Array): Uint8Array<ArrayBuffer> {
  const fields: Uint8Array[] = Array.from({ length: 18 }, () => new Uint8Array(1))
  fields[0] = GRANT_PURPOSE
  fields[5] = recipient
  fields[8] = parameters.context
  fields[9] = parameters.fingerprint
  return frame(fields)
}

const envelope = {
  envelope: hex(fixture.envelope),
  context: hex(fixture.envelope_context),
  parameters,
  objectKey: fixture.object,
}

async function recipientPair() {
  return importPrivateKey(crypto.getRandomValues(new Uint8Array(32)))
}

beforeAll(() => {
  initSync({ module: readFileSync(new URL('./kpabe/kpabe_bg.wasm', import.meta.url)) })
})

describe('KP-ABE WASM build', () => {
  it('opens every crate vector envelope with its user key', () => {
    for (const vector of vectors.cases) {
      const plain = hex(vector.user_key)
      const key = import_key(hex(vectors.parameters), hex(vectors.setup_context), hex(vectors.fingerprint), plain)
      expect(plain.every((byte) => byte === 0)).toBe(true)
      expect(key.open_object(hex(vector.envelope), hex(vector.context))).toEqual(hex(vectors.object_key))
      expect(() => key.open_object(hex(vector.envelope), hex('00'))).toThrow()
    }
  })

  it('issues a sealed grant that opens the object key, and clears the bucket key', async () => {
    const pair = await recipientPair()
    const aad = grantAad(pair.publicKey)
    for (const [kind, value] of [['subtree', ''], ['subtree', 'foo/'], ['exact', 'foo/file']] as const) {
      const bucketKey = hex(fixture.bucket_key)
      const scope = { kind, value }
      const sealed = await issueGrant({ bucketKey, parameters, scope, epochs: [1], recipient: pair.publicKey, aad })
      expect(bucketKey.every((byte) => byte === 0)).toBe(true)
      const key = await importGrant({ sealed, aad, pair, parameters })
      expect(await openObject(key, envelope)).toEqual(hex(fixture.object_key))
    }
  })

  it('does not open an object outside the issued scope', async () => {
    const pair = await recipientPair()
    const aad = grantAad(pair.publicKey)
    const scope = { kind: 'subtree' as const, value: 'bar/' }
    const sealed = await issueGrant({ bucketKey: hex(fixture.bucket_key), parameters, scope, epochs: [1], recipient: pair.publicKey, aad })
    const key = await importGrant({ sealed, aad, pair, parameters })
    await expect(openObject(key, envelope)).rejects.toThrow('refused')
  })

  it('refuses an envelope context for another object before opening', async () => {
    const pair = await recipientPair()
    const aad = grantAad(pair.publicKey)
    const scope = { kind: 'subtree' as const, value: '' }
    const sealed = await issueGrant({ bucketKey: hex(fixture.bucket_key), parameters, scope, epochs: [1], recipient: pair.publicKey, aad })
    const key = await importGrant({ sealed, aad, pair, parameters })
    await expect(openObject(key, { ...envelope, objectKey: 'foo/other' })).rejects.toThrow('does not belong')
  })

  it('refuses a bucket key that does not derive the admitted parameters', async () => {
    const pair = await recipientPair()
    const scope = { kind: 'subtree' as const, value: '' }
    const issue = { parameters, scope, epochs: [1], recipient: pair.publicKey, aad: grantAad(pair.publicKey) }
    await expect(issueGrant({ ...issue, bucketKey: new Uint8Array(32).fill(4) })).rejects.toThrow('refused')
  })

  it('refuses a grant whose associated data names another recipient', async () => {
    const pair = await recipientPair()
    const other = await recipientPair()
    const scope = { kind: 'subtree' as const, value: '' }
    const bucketKey = hex(fixture.bucket_key)
    const aad = grantAad(other.publicKey)
    await expect(issueGrant({ bucketKey, parameters, scope, epochs: [1], recipient: pair.publicKey, aad })).rejects.toThrow(
      'does not belong',
    )
    expect(bucketKey.every((byte) => byte === 0)).toBe(true)
    const sealed = await issueGrant({ bucketKey: hex(fixture.bucket_key), parameters, scope, epochs: [1], recipient: other.publicKey, aad })
    await expect(importGrant({ sealed, aad, pair, parameters })).rejects.toThrow('does not belong')
  })
})
