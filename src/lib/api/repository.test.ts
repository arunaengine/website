import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptRemoteLink,
  createRepositoryLink,
  listRepositoryConnectors,
  lookupPid,
  patchRepositoryLink,
  pullRepositoryLink,
  replaceRepositoryConnector,
  rotateLinkToken,
  searchRepositoryRecords,
  submitRepositoryExport,
  submitRepositoryImport,
} from './repository'

const CLIENT = { baseUrl: 'https://api.test/api/v1', token: 'bearer-1' }
const SECRET = 'pat-secret-value'

interface Call {
  url: string
  method: string
  body: unknown
}

function stubFetch(payload: unknown, status = 200) {
  const calls: Call[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    calls.push({
      url: String(input),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    if (status === 204) return new Response(null, { status })
    return new Response(JSON.stringify(payload), { status })
  }))
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('repository connector client', () => {
  it('lists the group repositories', async () => {
    const connector = { connector_id: 'c1', kind: 'invenio', endpoint: 'https://zenodo.org/api/' }
    const calls = stubFetch({ connectors: [connector] })

    expect(await listRepositoryConnectors('g 1', CLIENT)).toEqual([connector])
    expect(calls[0].url).toBe('https://api.test/api/v1/metadata/groups/g%201/repositories')
  })

  it('replaces a connector without a secret to keep the stored token', async () => {
    const calls = stubFetch({})
    await replaceRepositoryConnector('g1', 'c1', { name: 'Zenodo', kind: 'invenio', endpoint: 'https://zenodo.org/api/' }, CLIENT)

    expect(calls[0].method).toBe('PUT')
    expect(calls[0].url).toBe('https://api.test/api/v1/metadata/groups/g1/repositories/c1')
    expect(calls[0].body).not.toHaveProperty('secret_config')
  })
})

describe('invenio transfers', () => {
  it('sends the search as query parameters', async () => {
    const calls = stubFetch({ hits: { total: 0, hits: [] } })
    await searchRepositoryRecords({ group_id: 'g1', connector_id: 'c1', q: 'ocean data', page: 2, size: 10 }, CLIENT)

    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/api/v1/metadata/invenio/records')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      group_id: 'g1', connector_id: 'c1', q: 'ocean data', page: '2', size: '10',
    })
  })

  it('flattens the import options beside the target', async () => {
    const calls = stubFetch({ job_id: 'j1', status_url: '/compute/jobs/j1' })
    await submitRepositoryImport({
      group_id: 'g1', connector_id: 'c1', doi: '10.5281/zenodo.1', mode: 'reference', all_versions: false,
      keep_updated: true, target: { bucket: 'b', prefix: 'zenodo' },
      metadata: { group_id: 'g1', path: 'datasets/z', public: false }, idempotency_key: 'key-1',
    }, CLIENT)

    expect(calls[0].body).toMatchObject({ mode: 'reference', all_versions: false, doi: '10.5281/zenodo.1', keep_updated: true })
    expect(calls[0].body).not.toHaveProperty('record_id')
  })

  it('wraps a one-time export in the repository field', async () => {
    const calls = stubFetch({ job_id: 'j1', status_url: '/compute/jobs/j1' })
    await submitRepositoryExport('d1', {
      group_id: 'g1', connector_id: 'c1', access_token: SECRET, publish: false, public_files: false,
    }, 'key-1', CLIENT)

    expect(calls[0].url).toBe('https://api.test/api/v1/metadata/d1/invenio/exports')
    expect(calls[0].body).toEqual({
      repository: { group_id: 'g1', connector_id: 'c1', access_token: SECRET, publish: false, public_files: false },
      idempotency_key: 'key-1',
    })
  })
})

describe('invenio links', () => {
  it('keeps the token in the body only and never logs it', async () => {
    const log = vi.spyOn(console, 'log')
    const warn = vi.spyOn(console, 'warn')
    const calls = stubFetch({ link_id: 'l1' }, 201)
    await createRepositoryLink('d1', { group_id: 'g1', connector_id: 'c1', access_token: SECRET, parent_id: 'p1' }, CLIENT)

    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe('https://api.test/api/v1/metadata/d1/invenio/links')
    expect(calls[0].url).not.toContain(SECRET)
    expect(calls[0].body).toMatchObject({ access_token: SECRET, parent_id: 'p1' })
    expect([...log.mock.calls, ...warn.mock.calls].flat().join(' ')).not.toContain(SECRET)
  })

  it('rotates the token with a PUT on the token route', async () => {
    const calls = stubFetch(null, 204)
    await rotateLinkToken('d1', 'l1', SECRET, CLIENT)

    expect(calls[0].method).toBe('PUT')
    expect(calls[0].url).toBe('https://api.test/api/v1/metadata/d1/invenio/links/l1/token')
    expect(calls[0].body).toEqual({ access_token: SECRET })
  })

  it('accepts the remote state and pulls on their own routes', async () => {
    const calls = stubFetch({ link_id: 'l1' })
    await acceptRemoteLink('d1', 'l1', CLIENT)
    await pullRepositoryLink('d1', 'l1', CLIENT)

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ['POST', 'https://api.test/api/v1/metadata/d1/invenio/links/l1/accept-remote'],
      ['POST', 'https://api.test/api/v1/metadata/d1/invenio/links/l1/pull'],
    ])
  })

  it('pauses a link with a patch', async () => {
    const calls = stubFetch({ link_id: 'l1', status: 'paused' })
    await patchRepositoryLink('d1', 'l1', { paused: true }, CLIENT)

    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].body).toEqual({ paused: true })
  })
})

describe('pid lookup', () => {
  it('reads a miss as no dataset', async () => {
    stubFetch({ error: 'not found' }, 404)
    expect(await lookupPid('doi', '10.5281/zenodo.1', CLIENT)).toEqual([])
  })

  it('returns every holding dataset', async () => {
    const matches = [{ document_id: 'd1', origin: 'published' }, { document_id: 'd2', origin: 'imported' }]
    const calls = stubFetch({ matches })
    expect(await lookupPid('doi', '10.5281/zenodo.1', CLIENT)).toEqual(matches)
    expect(new URL(calls[0].url).searchParams.get('value')).toBe('10.5281/zenodo.1')
  })
})
