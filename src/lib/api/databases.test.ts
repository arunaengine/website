import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBucketMetadata, publishRelease, putBucketMetadata, releasePreparation } from './databases'

const client = { baseUrl: 'https://api.test/api/v1', token: 'tok' }

function stubFetch(body: unknown) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
      return new Response(JSON.stringify(body), { status: 200 })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

// Every source file of the portal, to check that no removed route is still called.
const sources = import.meta.glob(['/src/**/*.ts', '/src/**/*.vue', '!/src/**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('bucket metadata requests', () => {
  it('reads and writes the metadata of a bucket', async () => {
    const calls = stubFetch({ bucket: 'bakta db', metadata: null })

    expect(await getBucketMetadata('bakta db', client)).toBeNull()
    await putBucketMetadata('bakta db', { database: true, identifiers: [] }, client)

    expect(calls.map((call) => [call.method, new URL(call.url).pathname])).toEqual([
      ['GET', '/api/v1/data/buckets/bakta%20db/metadata'],
      ['PUT', '/api/v1/data/buckets/bakta%20db/metadata'],
    ])
    expect(calls[1].body).toEqual({ metadata: { database: true, identifiers: [] } })
  })

  it('publishes a release of a folder', async () => {
    const calls = stubFetch({ bucket: 'db', key: 'r.json', version_id: 'v1', files: 3, replayed: false })
    const body = { key: 'r.json', label: '6.0', prefix: 'db/', upstream: [], preparation: [] }

    expect((await publishRelease('db', body, client)).files).toBe(3)
    expect(calls[0]).toMatchObject({ method: 'POST', body })
  })

  it('leaves no call to a removed database route in the portal', () => {
    const removed = [/\/data\/databases/, /\/system\/realm\/databases/, /\/data\/buckets\/\$\{[^}]+\}\/links/]
    const files = Object.entries(sources).filter(([, text]) => removed.some((route) => route.test(text)))

    expect(Object.keys(sources).length).toBeGreaterThan(100)
    expect(files.map(([path]) => path)).toEqual([])
  })
})

describe('release preparation', () => {
  it('reads the runs a release crate names from its exact version on the bucket node', async () => {
    const calls = stubFetch({
      '@graph': [
        { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
        { '@id': './', '@type': 'Dataset', name: 'Release 6.0 light', mentions: [{ '@id': '#run-01M62WBHNH01030EV17BJGWGCB' }] },
        { '@id': '#run-01M62WBHNH01030EV17BJGWGCB', '@type': 'CreateAction', name: 'Preparation run 01M62WBHNH01030EV17BJGWGCB', identifier: '01M62WBHNH01030EV17BJGWGCB' },
        { '@id': '#other', '@type': 'CreateAction', identifier: 'not-mentioned' },
      ],
    })
    const objectId = 'https://w3id.org/aruna/data/arn:aruna:r:n2:s3/bakta-database/release-6.0-light.crate.json@01M62WYK3PB0QGWDD1B1W39MPE'

    expect(await releasePreparation(objectId, client)).toEqual(['01M62WBHNH01030EV17BJGWGCB'])
    const url = new URL(calls[0]!.url)
    expect(url.pathname).toBe('/api/v1/ga4gh/drs/v1/download')
    expect([url.searchParams.get('object_id'), url.searchParams.get('here')]).toEqual([objectId, 'true'])
  })
})
