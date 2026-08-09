import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithRetry, retryAfterMs } from './fetch'

function rateLimited(retryAfter?: string): Response {
  const headers = new Headers()
  if (retryAfter !== undefined) headers.set('Retry-After', retryAfter)
  return new Response('{"error":"too many requests"}', { status: 429, headers })
}

function stubFetch(responses: Response[]) {
  const calls: string[] = []
  const spy = vi.fn(async (_input: unknown, init: RequestInit = {}) => {
    calls.push((init.method ?? 'GET').toUpperCase())
    return responses.shift() ?? new Response(null, { status: 500 })
  })
  vi.stubGlobal('fetch', spy)
  return { calls, spy }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('retryAfterMs', () => {
  it('reads delay seconds', () => {
    expect(retryAfterMs(rateLimited('2'))).toBe(2000)
  })

  it('rejects waits beyond the cap', () => {
    // Parking a request for a minute would look like a hang.
    expect(retryAfterMs(rateLimited('60'))).toBeNull()
  })

  it('reads an http date', () => {
    const at = new Date(Date.now() + 3000).toUTCString()
    const wait = retryAfterMs(rateLimited(at))
    expect(wait).toBeGreaterThan(1000)
    expect(wait).toBeLessThanOrEqual(4000)
  })

  it('treats a past date as ready', () => {
    expect(retryAfterMs(rateLimited(new Date(Date.now() - 5000).toUTCString()))).toBe(0)
  })

  it('ignores a missing or unparseable header', () => {
    expect(retryAfterMs(rateLimited())).toBeNull()
    expect(retryAfterMs(rateLimited('soon'))).toBeNull()
  })
})

describe('fetchWithRetry', () => {
  it('retries a rate-limited get once', async () => {
    const { calls } = stubFetch([rateLimited('0'), new Response('{}', { status: 200 })])
    const response = await fetchWithRetry('https://example.test/x', {}, 1000)
    expect(response.status).toBe(200)
    expect(calls).toEqual(['GET', 'GET'])
  })

  it('gives up after one retry', async () => {
    const { calls } = stubFetch([rateLimited('0'), rateLimited('0')])
    const response = await fetchWithRetry('https://example.test/x', {}, 1000)
    expect(response.status).toBe(429)
    expect(calls).toHaveLength(2)
  })

  it('never replays a write', async () => {
    const { calls } = stubFetch([rateLimited('0')])
    const response = await fetchWithRetry('https://example.test/x', { method: 'PUT' }, 1000)
    expect(response.status).toBe(429)
    expect(calls).toEqual(['PUT'])
  })

  it('does not retry without a usable retry-after', async () => {
    const { calls } = stubFetch([rateLimited()])
    const response = await fetchWithRetry('https://example.test/x', {}, 1000)
    expect(response.status).toBe(429)
    expect(calls).toHaveLength(1)
  })

  it('passes other statuses straight through', async () => {
    const { calls } = stubFetch([new Response('{}', { status: 503 })])
    const response = await fetchWithRetry('https://example.test/x', {}, 1000)
    expect(response.status).toBe(503)
    expect(calls).toHaveLength(1)
  })
})
