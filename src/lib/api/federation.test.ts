import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromBase64Url } from '@/lib/vault/hpke'
import { GRANT_HEADER, INTENT_HEADER, uploadTransfer } from './federation'

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
