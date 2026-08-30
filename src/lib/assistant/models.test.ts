import { describe, expect, it, vi } from 'vitest'
import { proxyFetch } from './models'

describe('assistant proxy fetch', () => {
  it('sends only the browser-to-node headers the REST CORS policy accepts', async () => {
    let captured: RequestInit | undefined
    const fetcher: typeof globalThis.fetch = vi.fn(async (_input, init) => {
      captured = init
      return new Response(null, { status: 204 })
    })
    const request = proxyFetch({ apiBaseUrl: '/api/v1', token: 'aruna-token', fetch: fetcher })

    await request('http://127.0.0.1:43001/proxy/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer proxied',
        'Content-Type': 'application/json',
        'User-Agent': 'ai-sdk/openai/test',
      },
    })

    const headers = new Headers(captured?.headers)
    expect(headers.get('authorization')).toBe('Bearer aruna-token')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('user-agent')).toBeNull()
  })

  it('names an unreachable node proxy without masking cancellation', async () => {
    const unreachable = proxyFetch({
      apiBaseUrl: '/api/v1',
      token: 'aruna-token',
      fetch: vi.fn(async () => { throw new TypeError('NetworkError when attempting to fetch resource.') }),
    })
    await expect(unreachable('http://127.0.0.1:43001/proxy/responses')).rejects.toThrow(
      'The Aruna assistant proxy could not be reached.',
    )

    const canceled = proxyFetch({
      apiBaseUrl: '/api/v1',
      token: 'aruna-token',
      fetch: vi.fn(async () => { throw new DOMException('aborted', 'AbortError') }),
    })
    await expect(canceled('http://127.0.0.1:43001/proxy/responses')).rejects.toMatchObject({ name: 'AbortError' })
  })
})
