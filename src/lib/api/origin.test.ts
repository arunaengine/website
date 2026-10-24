import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBucketSources, getFileOrigin } from './origin'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('file origin request', () => {
  it('asks the bucket route for one key and version', async () => {
    const urls: string[] = []
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ version_id: 'v1', projection: [] }), { status: 200 })
    }))

    await getFileOrigin('lab data', { key: 'raw/a b.fq', version_id: 'v1' }, { baseUrl: 'https://api.test/api/v1', token: 't' })

    const url = new URL(urls[0])
    expect(url.pathname).toBe('/api/v1/data/buckets/lab%20data/objects/origin')
    expect([url.searchParams.get('key'), url.searchParams.get('version_id')]).toEqual(['raw/a b.fq', 'v1'])
  })
})

describe('bucket sources request', () => {
  it('asks the bucket route for its incoming paths', async () => {
    const urls: string[] = []
    vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ sources: [], complete: true }), { status: 200 })
    }))

    await getBucketSources('lab data', { baseUrl: 'https://api.test/api/v1', token: 't' })

    expect(new URL(urls[0]).pathname).toBe('/api/v1/data/buckets/lab%20data/sources')
  })
})
