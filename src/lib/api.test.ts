import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiOrigin, apiRequest } from './api'
import { computeAdminErrorMessage } from './computeAdmin'
import { placementPoliciesErrorMessage } from './placementPolicies'

const PAGE_ORIGIN = 'https://portal.test'

function stubBrowser() {
  const urls: string[] = []
  vi.stubGlobal('window', { location: { origin: PAGE_ORIGIN } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      urls.push(String(input))
      return new Response('{}', { status: 200 })
    }),
  )
  return urls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiRequest url building', () => {
  it('keeps the path segment of an absolute base', async () => {
    // new URL('/info', base) would drop '/api/v1' — the split serves an
    // absolute base, so the join must concatenate instead.
    const urls = stubBrowser()
    await apiRequest('/info', {}, { baseUrl: 'https://api.test/api/v1' })
    expect(urls).toEqual(['https://api.test/api/v1/info'])
  })

  it('does not double the slash on a trailing-slash base', async () => {
    const urls = stubBrowser()
    await apiRequest('/info', {}, { baseUrl: 'https://api.test/api/v1/' })
    expect(urls).toEqual(['https://api.test/api/v1/info'])
  })

  it('appends query to an absolute base', async () => {
    const urls = stubBrowser()
    await apiRequest('/metadata', { query: { limit: 10, empty: '' } }, { baseUrl: 'https://api.test/api/v1' })
    expect(urls).toEqual(['https://api.test/api/v1/metadata?limit=10'])
  })

  it('resolves a relative base against the page origin', async () => {
    const urls = stubBrowser()
    await apiRequest('/info', {}, { baseUrl: '/api/v1' })
    expect(urls).toEqual([`${PAGE_ORIGIN}/api/v1/info`])
  })

  it('preserves structured quota errors for surface-specific messages', async () => {
    stubBrowser()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      message: 'quota denied',
      quota: { scope: 'group', dimension: 'cpu_cores', observed: 6, requested: 2, limit: 7 },
    }), { status: 409, statusText: 'Conflict' })))

    const error = await apiRequest('/compute', {}, { baseUrl: '/api/v1' }).catch((caught) => caught)

    expect(computeAdminErrorMessage(error)).toBe(
      'Compute quota denied for group CPU cores: observed 6, requested 2, limit 7.',
    )
    expect(placementPoliciesErrorMessage(error)).toBe(
      'Quota denied for group CPU cores: observed 6, requested 2, limit 7.',
    )
  })
})

describe('apiOrigin', () => {
  it('reads the origin out of an absolute base', () => {
    stubBrowser()
    expect(apiOrigin('https://api.test:8080/api/v1')).toBe('https://api.test:8080')
  })

  it('falls back to the page origin for a relative base', () => {
    stubBrowser()
    expect(apiOrigin('/api/v1')).toBe(PAGE_ORIGIN)
    expect(apiOrigin('')).toBe(PAGE_ORIGIN)
  })
})
