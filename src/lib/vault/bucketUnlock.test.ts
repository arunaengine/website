import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import vector from './__fixtures__/bucket-copy.json'
import { importPrivateKey } from './hpke'
import { NoUsableCopyError, UnlockStaleError, unlockWithVault, type UnlockTarget } from './bucketUnlock'

function hex(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

const COPY = {
  bucket_id: vector.bucket_id,
  generation: vector.generation,
  key_record: vector.key_record,
  key_id: vector.key_id,
  enc: base64(hex(vector.enc)),
  ciphertext: base64(hex(vector.ciphertext)),
  created_at_ms: 10,
}

const TARGET: UnlockTarget = {
  bucket: 'reef',
  client: { baseUrl: 'https://node-b.test/api/v1', token: 'bearer-1' },
  context: {
    realmId: vector.realm_id,
    nodeId: vector.node_id,
    bucketId: vector.bucket_id,
    generation: vector.generation,
    userId: vector.user_id,
  },
  publicKey: base64(hex(vector.bucket_public)),
  durationMs: 3_600_000,
}

interface Sent {
  url: URL
  method: string
  body: Uint8Array | undefined
  copy: string
}

function node(copies: unknown[], unlock: () => Response | Promise<Response>) {
  const sent: Sent[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    const url = new URL(String(input))
    const body = init.body instanceof Uint8Array ? init.body : undefined
    sent.push({ url, method: init.method ?? 'GET', body, copy: body ? Array.from(body, (b) => b.toString(16).padStart(2, '0')).join('') : '' })
    if (url.pathname.endsWith('/copies/me')) return new Response(JSON.stringify({ copies }))
    return unlock()
  }))
  return sent
}

function vault(keyIds = [vector.key_id]) {
  const order: string[] = []
  return {
    order,
    checkKey: vi.fn(async () => {
      order.push('check')
      return 'matches'
    }),
    openUserKey: vi.fn(async (keyId: string) => {
      order.push(`open ${keyId}`)
      return keyIds.includes(keyId) ? importPrivateKey(hex(vector.recipient_private)) : null
    }),
  }
}

const UNLOCKED = () => new Response(JSON.stringify({ state: 'unlocked', session_id: 'S1' }))
const always = () => true

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bucket unlock from the browser', () => {
  it('sends only the opened bucket key to the bucket node and clears it', async () => {
    const sent = node([COPY], UNLOCKED)
    const keys = vault()

    const outcome = await unlockWithVault(TARGET, keys, always)

    expect(outcome).toEqual({ kind: 'unlocked', status: { state: 'unlocked', session_id: 'S1' }, ownKey: 'matches' })
    expect(keys.order[0]).toBe('check')
    const unlock = sent[1]
    expect(unlock.url.origin).toBe('https://node-b.test')
    expect(unlock.url.pathname).toBe('/api/v1/data/buckets/reef/storage/encryption/unlock')
    expect(Object.fromEntries(unlock.url.searchParams)).toEqual({
      bucket_id: vector.bucket_id,
      generation: String(vector.generation),
      duration_ms: '3600000',
    })
    expect(unlock.copy).toBe(vector.bucket_private)
    expect(unlock.body?.every((byte) => byte === 0)).toBe(true)
  })

  it('uses the copy whose key this vault holds, an older key included', async () => {
    const foreign = { ...COPY, key_id: 'KEY-OTHER-VAULT', created_at_ms: 20 }
    const otherBucket = { ...COPY, bucket_id: '01JB2S7YQ4M8N3V6K9R1T5W0Y0', created_at_ms: 30 }
    const sent = node([COPY, foreign, otherBucket], UNLOCKED)
    const keys = vault()

    expect((await unlockWithVault(TARGET, keys, always)).kind).toBe('unlocked')
    expect(keys.order).toEqual(['check', 'open KEY-OTHER-VAULT', `open ${vector.key_id}`])
    expect(sent[0].url.searchParams.get('generation')).toBe(String(vector.generation))
  })

  it('sends nothing when the bucket changes before the key leaves the browser', async () => {
    const sent = node([COPY], UNLOCKED)
    let checks = 0

    await expect(unlockWithVault(TARGET, vault(), () => ++checks < 4)).rejects.toThrow(UnlockStaleError)

    expect(checks).toBe(4)
    expect(sent.map((call) => call.method)).toEqual(['GET'])
  })

  it('reports an unknown outcome once and does not send the key again', async () => {
    const sent = node([COPY], () => Promise.reject(new TypeError('network down')))

    const outcome = await unlockWithVault(TARGET, vault(), always)

    expect(outcome).toEqual({ kind: 'unknown', ownKey: 'matches' })
    expect(sent.filter((call) => call.method === 'POST')).toHaveLength(1)
    expect(sent[1].body?.every((byte) => byte === 0)).toBe(true)
  })

  it('passes on a refusal from the node and still clears the key', async () => {
    const sent = node([COPY], () => new Response(JSON.stringify({ error: 'no', code: 'wrong_key' }), { status: 400 }))

    const failure = await unlockWithVault(TARGET, vault(), always).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).code).toBe('wrong_key')
    expect(sent[1].body?.every((byte) => byte === 0)).toBe(true)
  })

  it('explains a missing, foreign or unopenable copy without sending anything', async () => {
    node([], UNLOCKED)
    await expect(unlockWithVault(TARGET, vault(), always)).rejects.toThrow('no ready copy')

    node([COPY], UNLOCKED)
    await expect(unlockWithVault(TARGET, vault([]), always)).rejects.toThrow('this vault does not hold')

    const sent = node([COPY], UNLOCKED)
    const wrongBucket = { ...TARGET, publicKey: base64(hex(vector.recipient_public)) }
    await expect(unlockWithVault(wrongBucket, vault(), always)).rejects.toThrow(NoUsableCopyError)
    expect(sent.filter((call) => call.method === 'POST')).toHaveLength(0)
  })
})
