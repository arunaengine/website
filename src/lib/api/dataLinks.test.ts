import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBucketLinks, getDataLinks } from './dataLinks'

const client = { baseUrl: 'https://api.test/api/v1', token: 'tok' }

function stubFetch(status: number, body: unknown) {
  const urls: string[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify(body), { status })
    }),
  )
  return urls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('data link requests', () => {
  it('asks for the linked parts that contain a file', async () => {
    const urls = stubFetch(200, { documents: [], complete: true })

    await getBucketLinks('lab data', { key: 'raw/a b.fq', parts_only: true }, client)

    const url = new URL(urls[0])
    expect(url.pathname).toBe('/api/v1/data/buckets/lab%20data/links')
    expect(url.searchParams.get('key')).toBe('raw/a b.fq')
    expect(url.searchParams.get('parts_only')).toBe('true')
    expect(url.searchParams.has('prefix')).toBe(false)
  })

  it('keeps an empty prefix, which names the bucket root', async () => {
    const urls = stubFetch(200, { documents: [], complete: true })

    await getBucketLinks('lab', { prefix: '' }, client)

    expect(new URL(urls[0]).searchParams.get('prefix')).toBe('')
  })

  it('asks for the datasets that name an identifier', async () => {
    const urls = stubFetch(200, { documents: [], complete: true })

    await getDataLinks('https://w3id.org/aruna/data/r/s/', { limit: 5 }, client)

    const url = new URL(urls[0])
    expect(url.pathname).toBe('/api/v1/metadata/links')
    expect(url.searchParams.get('id')).toBe('https://w3id.org/aruna/data/r/s/')
    expect(url.searchParams.get('limit')).toBe('5')
  })
})
