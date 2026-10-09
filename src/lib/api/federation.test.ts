import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromBase64Url } from '@/lib/vault/hpke'
import { GRANT_HEADER, INTENT_HEADER, getRealmFederation, setRealmFederation, uploadTransfer } from './federation'

afterEach(() => vi.unstubAllGlobals())

function decoded(value: string | null) {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(value ?? '')))
}

describe('uploadTransfer', () => {
  it('sends the intent and grant instead of a bearer', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    const fetch = vi.fn(async (_url: URL, _init: RequestInit) =>
      new Response(JSON.stringify({ upload_id: 'U' }), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetch)
    const intent = { payload: { intent_id: 'I' }, signer: 'Realm', signature: 'aa' } as never
    const grant = { payload: { export_job_id: 'J' }, signer: 'Realm', signature: 'bb' } as never
    const artifact = new ArrayBuffer(3)
    const answer = await uploadTransfer(artifact, { intent, grant }, { baseUrl: 'https://b.example/api/v1', token: 'B' })
    expect(answer).toEqual({ upload_id: 'U' })
    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toBe('https://b.example/api/v1/metadata/rocrate/uploads')
    const headers = new Headers(init.headers)
    expect(headers.has('Authorization')).toBe(false)
    expect(headers.get('Content-Type')).toBe('application/zip')
    expect(headers.get(INTENT_HEADER)).not.toMatch(/[=+/]/)
    expect(decoded(headers.get(INTENT_HEADER))).toEqual(intent)
    expect(decoded(headers.get(GRANT_HEADER))).toEqual(grant)
    expect(init.body).toBe(artifact)
  })
})

describe('realm federation settings', () => {
  function answer(etag: string) {
    const fetch = vi.fn(async (_url: URL, _init: RequestInit) =>
      new Response(JSON.stringify({ name: 'B' }), { status: 200, headers: { ETag: etag } }),
    )
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('keeps the ETag and sends it back as the precondition', async () => {
    const fetch = answer('"v1"')
    const loaded = await getRealmFederation({ baseUrl: '/api/v1', token: 'T' })
    expect(loaded).toEqual({ settings: { name: 'B' }, etag: '"v1"' })
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ name: 'C' }), { headers: { ETag: '"v2"' } }))
    const saved = await setRealmFederation({ name: 'C' } as never, loaded.etag, { baseUrl: '/api/v1', token: 'T' })
    expect(saved.etag).toBe('"v2"')
    const headers = new Headers(fetch.mock.calls[1][1].headers)
    expect(headers.get('If-Match')).toBe('"v1"')
    expect(headers.has('If-None-Match')).toBe(false)
  })

  it('asks for a first setup without an ETag', async () => {
    const fetch = answer('"v1"')
    await setRealmFederation({ name: 'B' } as never, null, { baseUrl: '/api/v1', token: 'T' })
    const headers = new Headers(fetch.mock.calls[0][1].headers)
    expect(headers.get('If-None-Match')).toBe('*')
    expect(headers.has('If-Match')).toBe(false)
  })
})
