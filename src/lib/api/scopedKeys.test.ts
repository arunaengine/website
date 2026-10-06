import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import {
  downloadWithKey,
  getObjectEnvelope,
  listKeyGrants,
  listKeyRequests,
  requestScopedKey,
  submitKeyGrant,
} from './scopedKeys'

const NODE = { baseUrl: 'https://node-b.test/api/v1', token: 'bearer-1' }

interface Call {
  url: URL
  method: string
  headers: Headers
  body: unknown
}

function stubFetch(response: () => Response) {
  const calls: Call[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    calls.push({ url: new URL(String(input)), method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body })
    return response()
  }))
  return calls
}

function json(payload: unknown, status = 200) {
  return () => new Response(JSON.stringify(payload), { status })
}

function path(call: Call) {
  return call.url.origin + call.url.pathname
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const RECORD = { fields: { request_id: 'Q1' }, record: 'AA==', aad: null }

describe('scoped key client', () => {
  it('posts the scope and tells an open request from a grant by its associated data', async () => {
    const calls = stubFetch(json(RECORD, 202))
    const pending = await requestScopedKey('reef/a', { kind: 'subtree', value: 'foo/' }, NODE)
    expect(pending).toEqual({ kind: 'pending', request: RECORD })
    expect(path(calls[0])).toBe('https://node-b.test/api/v1/data/buckets/reef%2Fa/abe/requests')
    expect(calls[0].method).toBe('POST')
    expect(JSON.parse(calls[0].body as string)).toEqual({ scope: { kind: 'subtree', value: 'foo/' } })

    stubFetch(json({ ...RECORD, aad: 'AQ==' }))
    const granted = await requestScopedKey('reef', { kind: 'exact', value: 'foo/file' }, NODE)
    expect(granted.kind).toBe('grant')
  })

  it('pages requests and grants with the cursor', async () => {
    const calls = stubFetch(json({ records: [], next_cursor: null }))
    await listKeyRequests('reef', 'Y3Vy', NODE)
    await listKeyGrants('reef', null, NODE)
    expect(path(calls[0])).toBe('https://node-b.test/api/v1/data/buckets/reef/abe/requests')
    expect(calls[0].url.searchParams.get('cursor')).toBe('Y3Vy')
    expect(path(calls[1])).toBe('https://node-b.test/api/v1/data/buckets/reef/abe/grants')
    expect(calls[1].url.searchParams.has('cursor')).toBe(false)
  })

  it('submits a grant for one request', async () => {
    const calls = stubFetch(json(RECORD))
    const grant = { context: 'AA==', enc: 'AQ==', ciphertext: 'Ag==' }
    await submitKeyGrant('reef', '01J', grant, NODE)
    expect(path(calls[0])).toBe('https://node-b.test/api/v1/data/buckets/reef/abe/requests/01J/grant')
    expect(calls[0].method).toBe('POST')
    expect(JSON.parse(calls[0].body as string)).toEqual(grant)
  })

  it('reads one pinned envelope', async () => {
    const calls = stubFetch(json({ version_id: 'V' }))
    await getObjectEnvelope('reef', 'foo/file', 'V', NODE)
    expect(path(calls[0])).toBe('https://node-b.test/api/v1/data/blobs/envelope')
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ bucket: 'reef', key: 'foo/file', version_id: 'V' })
  })

  it('downloads with the object key in a header, never in the URL', async () => {
    const calls = stubFetch(() => new Response('data', { status: 206 }))
    const objectKey = new Uint8Array(32).fill(255)
    const blob = await downloadWithKey({ bucket: 'reef', key: 'foo/file', versionId: 'V', objectKey, range: 'bytes=0-3' }, NODE)
    expect(await blob.text()).toBe('data')
    const [call] = calls
    expect(path(call)).toBe('https://node-b.test/api/v1/data/blobs/content')
    expect(Object.fromEntries(call.url.searchParams)).toEqual({ bucket: 'reef', key: 'foo/file', version_id: 'V' })
    expect(call.headers.get('x-aruna-object-key')).toBe(btoa('\xff'.repeat(32)))
    expect(call.headers.get('Authorization')).toBe('Bearer bearer-1')
    expect(call.headers.get('Range')).toBe('bytes=0-3')
  })

  it('maps a refused download to its code and refuses a short key unsent', async () => {
    stubFetch(json({ error: 'the object key does not match this version', code: 'wrong_object_key' }, 403))
    const request = { bucket: 'reef', key: 'k', versionId: 'V', objectKey: new Uint8Array(32) }
    const refused = await downloadWithKey(request, NODE).catch((cause: unknown) => cause)
    expect(refused).toBeInstanceOf(ApiError)
    expect(refused).toMatchObject({ status: 403, code: 'wrong_object_key' })

    const calls = stubFetch(json({}))
    await expect(downloadWithKey({ ...request, objectKey: new Uint8Array(31) }, NODE)).rejects.toThrow('32 bytes')
    expect(calls).toHaveLength(0)
  })
})
