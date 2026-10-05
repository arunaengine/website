import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import {
  bucketLocked,
  extendUnlock,
  getMyCopies,
  listBucketTokens,
  lockBucket,
  removeBucketHolder,
  unlockBucket,
} from './bucketEncryption'

const NODE = { baseUrl: 'https://node-b.test/api/v1', token: 'bearer-1' }

interface Call {
  url: URL
  method: string
  contentType: string | null
  body: unknown
}

function stubFetch(payload: unknown, status = 200, code?: string) {
  const calls: Call[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    calls.push({
      url: new URL(String(input)),
      method: init.method ?? 'GET',
      contentType: new Headers(init.headers).get('Content-Type'),
      body: init.body,
    })
    if (status === 204) return new Response(null, { status })
    return new Response(JSON.stringify(code ? { error: 'refused', code } : payload), { status })
  }))
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const UNLOCKED = { state: 'unlocked', session_id: 'S1', deadline_ms: 2_000 }

describe('bucket encryption client', () => {
  it('sends the key as 32 binary bytes and the other fields in the query', async () => {
    const calls = stubFetch(UNLOCKED)
    const key = new Uint8Array(32).fill(7)

    const status = await unlockBucket('reef', { bucket_id: 'B1', generation: 3, duration_ms: 60_000 }, key, NODE)

    expect(status).toEqual(UNLOCKED)
    expect(calls[0].url.origin + calls[0].url.pathname).toBe(
      'https://node-b.test/api/v1/data/buckets/reef/storage/encryption/unlock',
    )
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ bucket_id: 'B1', generation: '3', duration_ms: '60000' })
    expect(calls[0].method).toBe('POST')
    expect(calls[0].contentType).toBe('application/octet-stream')
    expect(calls[0].body).toBe(key)
  })

  it('refuses a key of another length before sending anything', async () => {
    const calls = stubFetch(UNLOCKED)

    await expect(unlockBucket('reef', { bucket_id: 'B1', generation: 3 }, new Uint8Array(31), NODE)).rejects.toThrow(
      '32 bytes',
    )
    expect(calls).toHaveLength(0)
  })

  it('names the session to extend and locks without a body', async () => {
    const calls = stubFetch(UNLOCKED)

    await extendUnlock('reef', { generation: 2, session_id: 'S1', duration_ms: 5_000 }, NODE)
    await lockBucket('reef', NODE)

    expect(calls[0].url.pathname).toBe('/api/v1/data/buckets/reef/storage/encryption/extend')
    expect(JSON.parse(String(calls[0].body))).toEqual({ generation: 2, session_id: 'S1', duration_ms: 5_000 })
    expect(calls[1].url.pathname).toBe('/api/v1/data/buckets/reef/storage/encryption/lock')
    expect(calls[1].body).toBeUndefined()
  })

  it('asks for the copies of one generation and removes a holder with the observed revision', async () => {
    const calls = stubFetch({ copies: [] })

    await getMyCopies('reef', 4, NODE)
    const removal = stubFetch(null, 204)
    await removeBucketHolder('reef', 'U1@realm', 'rev-2', true, NODE)
    await removeBucketHolder('reef', 'U1@realm', 'rev-2', false, NODE)

    expect(calls[0].url.searchParams.get('generation')).toBe('4')
    expect(removal[0].url.pathname).toBe('/api/v1/data/buckets/reef/storage/encryption/holders/U1%40realm')
    expect(Object.fromEntries(removal[0].url.searchParams)).toEqual({ revision: 'rev-2', confirm_recovery: 'true' })
    expect(Object.fromEntries(removal[1].url.searchParams)).toEqual({ revision: 'rev-2' })
  })

  it('tells a locked bucket from other conflicts', async () => {
    stubFetch(null, 409, 'bucket_locked')
    const locked = await getMyCopies('reef', 1, NODE).catch((error: unknown) => error)
    stubFetch(null, 409, 'stale_generation')
    const stale = await getMyCopies('reef', 1, NODE).catch((error: unknown) => error)

    expect(locked).toBeInstanceOf(ApiError)
    expect(bucketLocked(locked)).toBe(true)
    expect(bucketLocked(stale)).toBe(false)
  })

  it('lists the session tokens of a bucket on its node and passes a refusal on', async () => {
    const token = { access_key_id: 'AK1', user_id: 'U1', created_at: '2026-10-05T10:00:00Z', generation: 2, stale: true }
    const calls = stubFetch({ tokens: [token] })

    const listed = await listBucketTokens('reef survey', NODE)
    stubFetch(null, 403, 'forbidden')
    const refused = await listBucketTokens('reef', NODE).catch((error: unknown) => error)

    expect(listed.tokens).toEqual([token])
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url.pathname).toBe('/api/v1/data/buckets/reef%20survey/storage/encryption/tokens')
    expect(refused).toBeInstanceOf(ApiError)
    expect((refused as ApiError).status).toBe(403)
  })
})
