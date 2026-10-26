import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { resolveVersion } from './resolve'

afterEach(() => {
  vi.unstubAllGlobals()
})

const client = { baseUrl: 'https://api.test/api/v1', token: 'secret' }

describe('resolve a version request', () => {
  it('sends the token in a header and never in the URL', async () => {
    const calls: Array<{ url: string; auth: string | null }> = []
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
      calls.push({ url: String(input), auth: new Headers(init.headers).get('Authorization') })
      return new Response('bytes', { status: 200 })
    }))

    const blob = await resolveVersion('k3V9xQ2m', '01K8Y2B6D8F0H2K4M6P8R0T2V4', client)

    expect(await blob.text()).toBe('bytes')
    expect(calls[0].url).toBe('https://api.test/api/v1/resolve/k3V9xQ2m/01K8Y2B6D8F0H2K4M6P8R0T2V4')
    expect(calls[0].url).not.toContain('secret')
    expect(calls[0].auth).toBe('Bearer secret')
  })

  it('reports a refusal with its status and message', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'No holder answered' }), { status: 503 })))

    const failure = await resolveVersion('k3V9xQ2m', '01K8Y2B6D8F0H2K4M6P8R0T2V4', client).catch((cause) => cause)

    expect(failure).toBeInstanceOf(ApiError)
    expect([failure.status, failure.message]).toEqual([503, 'No holder answered'])
  })
})
