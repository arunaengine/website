import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import vectors from './__fixtures__/kpabe-vectors.json'
import fixture from './__fixtures__/kpabe-issue.json'
import grants from './__fixtures__/abe-grant.json'
import type { KeyIssuer, KeyRequestFields } from '@/lib/api'
import { GRANT_PURPOSE, grantAad, grantRecord, importGrant, issueGrant, openObject, unframe, type ParameterBytes } from './abe'
import { toBase64 } from './crypto'
import { fromBase64Url, importPrivateKey, sealTo, type X25519Pair } from './hpke'
import { import_key, initSync, issue_key, type InitOutput } from './kpabe/kpabe'

function hex(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  for (let at = haystack.indexOf(needle[0]); at >= 0; at = haystack.indexOf(needle[0], at + 1)) {
    if (needle.every((byte, index) => haystack[at + index] === byte)) return true
  }
  return false
}

const parameters: ParameterBytes = {
  parameters: hex(fixture.parameters),
  context: hex(fixture.setup_context),
  fingerprint: hex(fixture.fingerprint),
}

const REALM = toBase64(new Uint8Array(32).fill(1)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const HOLDER: KeyIssuer = { kind: 'user', id: `01ARZ3NDEKTSV4RRFFQ69G5FAV@${REALM}` }

/** A request for `pair` on the fixture bucket, framed into the grant associated data. */
function request(pair: X25519Pair, scope: KeyRequestFields['scope'], epochs = [1]): KeyRequestFields {
  return {
    request_id: '01BX5ZZKBKACTAV9WEVGEMMVRZ',
    requesting_user: `01BX5ZZKBKACTAV9WEVGEMMVS0@${REALM}`,
    recipient_user: `01BX5ZZKBKACTAV9WEVGEMMVS0@${REALM}`,
    recipient_record: '01BX5ZZKBKACTAV9WEVGEMMVS1',
    recipient_public: toBase64(pair.publicKey),
    recipient_fingerprint: toBase64(new Uint8Array(32).fill(7)),
    bucket: 'reef',
    parameters: {
      realm_id: REALM, node_id: '02'.repeat(32), bucket_id: '04', generation: 1, epoch: 1,
      fingerprint: toBase64(parameters.fingerprint), parameters: '', context: toBase64(parameters.context),
    },
    scope,
    epochs,
    credential_id: null,
    restrictions: null,
    revisions: [toBase64(new Uint8Array(32).fill(8))],
    created_at_ms: 1_700_000_000_000,
  }
}

/** Issues and imports a key for `scope`, the way a holder and the recipient do. */
async function issueAndImport(scope: KeyRequestFields['scope']) {
  const pair = await recipientPair()
  const fields = request(pair, scope)
  const aad = grantAad(fields, HOLDER)
  const issue = { request: fields, issuer: HOLDER, parameters, aad }
  const sealed = await issueGrant({ ...issue, bucketKey: hex(fixture.bucket_key), record: grantRecord(fields, HOLDER) })
  return importGrant({ ...issue, sealed, pair })
}

const pinned = {
  objectKey: fixture.object,
  epoch: 1,
  writeId: '09144GJ289144GJ289144GJ289',
  publicKey: hex(fixture.envelope_context).slice(-32),
}

const envelope = {
  envelope: hex(fixture.envelope),
  context: hex(fixture.envelope_context),
  parameters,
  expected: pinned,
}

async function recipientPair() {
  return importPrivateKey(crypto.getRandomValues(new Uint8Array(32)))
}

let wasm: InitOutput

beforeAll(() => {
  wasm = initSync({ module: readFileSync(new URL('./kpabe/kpabe_bg.wasm', import.meta.url)) })
})

describe('KP-ABE WASM build', () => {
  it('refuses crate vector keys whose policy is not the expected scope', () => {
    for (const vector of vectors.cases) {
      const plain = hex(vector.user_key)
      const epochs = BigUint64Array.from(vector.epochs, (epoch) => BigInt(epoch))
      const imported = () =>
        import_key(hex(vectors.parameters), hex(vectors.setup_context), hex(vectors.fingerprint), 'subtree', '', epochs, plain)
      expect(imported).toThrow()
      expect(plain.every((byte) => byte === 0)).toBe(true)
    }
  })

  it('issues a sealed grant that opens the object key', async () => {
    for (const [kind, value] of [['subtree', ''], ['subtree', 'foo/'], ['exact', 'foo/file']] as const) {
      const key = await issueAndImport({ kind, value })
      expect(await openObject(key, envelope)).toEqual(hex(fixture.object_key))
    }
  })

  it('issues an enumerated grant that opens only its listed write', async () => {
    const write = { key: 'foo/file', write_id: pinned.writeId }
    const key = await issueAndImport({ kind: 'writes', value: [write] })
    expect(await openObject(key, envelope)).toEqual(hex(fixture.object_key))
    const other = await issueAndImport({ kind: 'writes', value: [{ ...write, write_id: '01BX5ZZKBKACTAV9WEVGEMMVRZ' }] })
    await expect(openObject(other, envelope)).rejects.toThrow('refused')
  })

  it('leaves no secret output copy in WASM memory', async () => {
    const key = await issueAndImport({ kind: 'subtree', value: '' })
    const objectKey = key.open_object(envelope.envelope, envelope.context)
    expect(objectKey).toEqual(hex(fixture.object_key))
    expect(contains(new Uint8Array(wasm.memory.buffer), objectKey)).toBe(false)
    const bucketKey = hex(fixture.bucket_key)
    const { parameters: bytes, context, fingerprint } = parameters
    const plain = issue_key(bucketKey, bytes, context, fingerprint, 'subtree', '', BigUint64Array.of(1n))
    expect(bucketKey.every((byte) => byte === 0)).toBe(true)
    expect(contains(new Uint8Array(wasm.memory.buffer), plain.slice(-64))).toBe(false)
  })

  it('does not open an object outside the issued scope', async () => {
    const key = await issueAndImport({ kind: 'subtree', value: 'bar/' })
    await expect(openObject(key, envelope)).rejects.toThrow('refused')
  })

  it('refuses an envelope for another object or version before opening', async () => {
    const key = await issueAndImport({ kind: 'subtree', value: '' })
    for (const change of [
      { objectKey: 'foo/other' },
      { epoch: 2 },
      { writeId: '01BX5ZZKBKACTAV9WEVGEMMVRZ' },
      { publicKey: new Uint8Array(32) },
    ]) {
      await expect(openObject(key, { ...envelope, expected: { ...pinned, ...change } })).rejects.toThrow('does not belong')
    }
  })

  it('refuses a bucket key that does not derive the admitted parameters', async () => {
    const pair = await recipientPair()
    const fields = request(pair, { kind: 'subtree', value: '' })
    const issue = { request: fields, issuer: HOLDER, parameters, aad: grantAad(fields, HOLDER), record: grantRecord(fields, HOLDER) }
    await expect(issueGrant({ ...issue, bucketKey: new Uint8Array(32).fill(4) })).rejects.toThrow('refused')
  })

  it('refuses a proposal whose fields and associated data differ from its record', async () => {
    const pair = await recipientPair()
    const fields = request(pair, { kind: 'subtree', value: 'foo/' })
    const record = grantRecord(fields, HOLDER)
    for (const change of [{ scope: { kind: 'subtree' as const, value: '' } }, { epochs: [1, 2] }]) {
      const wide = { ...fields, ...change }
      const bucketKey = hex(fixture.bucket_key)
      const issue = { bucketKey, request: wide, issuer: HOLDER, parameters, aad: grantAad(wide, HOLDER), record }
      await expect(issueGrant(issue)).rejects.toThrow('does not match')
      expect(bucketKey.every((byte) => byte === 0)).toBe(true)
    }
  })

  it('refuses a proposal whose associated data names another scope, recipient or issuer', async () => {
    const pair = await recipientPair()
    const other = await recipientPair()
    const fields = request(pair, { kind: 'subtree', value: 'foo/' })
    for (const aad of [
      grantAad({ ...fields, scope: { kind: 'subtree', value: '' } }, HOLDER),
      grantAad({ ...fields, epochs: [1, 2] }, HOLDER),
      grantAad(request(other, fields.scope), HOLDER),
      grantAad(fields, { kind: 'user', id: fields.recipient_user }),
    ]) {
      const bucketKey = hex(fixture.bucket_key)
      const record = grantRecord(fields, HOLDER)
      await expect(issueGrant({ bucketKey, request: fields, issuer: HOLDER, parameters, aad, record })).rejects.toThrow(
        'does not belong',
      )
      expect(bucketKey.every((byte) => byte === 0)).toBe(true)
    }
  })

  it('refuses a grant for another request or another recipient key', async () => {
    const pair = await recipientPair()
    const other = await recipientPair()
    const fields = request(pair, { kind: 'subtree', value: 'foo/' })
    const aad = grantAad(fields, HOLDER)
    const record = grantRecord(fields, HOLDER)
    const sealed = await issueGrant({ bucketKey: hex(fixture.bucket_key), request: fields, issuer: HOLDER, parameters, aad, record })
    const cases: [KeyRequestFields, X25519Pair][] = [
      [{ ...fields, request_id: '01BX5ZZKBKACTAV9WEVGEMMVS2' }, pair],
      [{ ...fields, scope: { kind: 'subtree', value: '' } }, pair],
      [{ ...fields, revisions: [] }, pair],
      [fields, other],
    ]
    for (const [expected, opener] of cases) {
      await expect(importGrant({ sealed, aad, pair: opener, request: expected, issuer: HOLDER, parameters })).rejects.toThrow(
        'does not belong',
      )
    }
  })

  it('refuses a grant whose key policy differs from its request', async () => {
    const pair = await recipientPair()
    const fields = request(pair, { kind: 'subtree', value: 'foo/' })
    const aad = grantAad(fields, HOLDER)
    const { parameters: bytes, context, fingerprint } = parameters
    const wide = issue_key(hex(fixture.bucket_key), bytes, context, fingerprint, 'subtree', '', BigUint64Array.of(1n))
    const sealed = await sealTo(pair.publicKey, GRANT_PURPOSE, aad, wide as Uint8Array<ArrayBuffer>)
    await expect(importGrant({ sealed, aad, pair, request: fields, issuer: HOLDER, parameters })).rejects.toThrow('refused')
  })

  it('encodes grant records and associated data like the node', () => {
    for (const grant of grants) {
      const { issuer, ...fields } = grant.fields as KeyRequestFields & { issuer: KeyIssuer }
      expect(grantAad(fields, issuer)).toEqual(fromBase64Url(grant.aad))
      expect(grantRecord(fields, issuer)).toEqual(Uint8Array.from(fromBase64Url(grant.record)))
    }
  })

  it('frames user ids, epochs, scope and node issuer like the node', () => {
    const fields = request({ publicKey: new Uint8Array(32).fill(3) } as X25519Pair, { kind: 'exact', value: 'a' }, [1, 300])
    const framed = unframe(grantAad({ ...fields, requesting_user: HOLDER.id }, { kind: 'node', id: '02'.repeat(32) }))
    expect(framed).toHaveLength(18)
    expect(framed[2]).toEqual(Uint8Array.of(...new Uint8Array(32).fill(1), ...hex('01563e3ab5d3d6764c61efb99302bd5b')))
    expect(framed[10]).toEqual(hex('0201ac02'))
    expect(framed[11]).toEqual(Uint8Array.of(0, 1, 97))
    expect(framed[13]).toEqual(Uint8Array.of(0))
    expect(framed[15]).toEqual(hex('0000018bcfe56800'))
    expect(framed[16]).toEqual(new TextEncoder().encode('node'))
    expect(framed[17]).toEqual(new Uint8Array(32).fill(2))
  })
})
