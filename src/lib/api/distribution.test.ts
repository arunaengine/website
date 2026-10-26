import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  changeSettings,
  createDistributedBucket,
  deleteSet,
  getBucketDistribution,
  joinMember,
  leaveMember,
  retryAdmission,
  transferRange,
} from './distribution'

const client = { baseUrl: 'https://api.test/api/v1', token: 'tok' }

function stubFetch(status: number, body: unknown) {
  const calls: { url: string; method?: string; body?: unknown; auth: string | null }[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL, init: RequestInit) => {
      const headers = new Headers(init.headers)
      calls.push({
        url: String(input),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        auth: headers.get('Authorization'),
      })
      return new Response(JSON.stringify(body), { status })
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('distributed bucket requests', () => {
  it('creates a bucket on the group route with the bearer token', async () => {
    const calls = stubFetch(201, { set_id: 's1', active: false, members: [] })
    const body = { bucket: 'spire', layout: 'replica' as const, nodes: ['n1', 'n2'] }

    expect(await createDistributedBucket('g 1', body, client)).toEqual({ set_id: 's1', active: false, members: [] })
    expect(calls).toEqual([
      { url: 'https://api.test/api/v1/data/groups/g%201/distributed-buckets', method: 'POST', body, auth: 'Bearer tok' },
    ])
  })

  it('retries the admission of one set', async () => {
    const calls = stubFetch(200, { set_id: 's1', active: true, members: [] })

    await retryAdmission('g1', 's1', client)

    expect(calls[0].url).toBe('https://api.test/api/v1/data/groups/g1/distributed-buckets/s1/admission')
    expect(calls[0].method).toBe('POST')
  })

  it('reads the set of a bucket and keeps the 404 of an ordinary bucket', async () => {
    const calls = stubFetch(404, { message: 'not found' })

    await expect(getBucketDistribution('lab data', client)).rejects.toMatchObject({ status: 404 })
    expect(calls[0].url).toBe('https://api.test/api/v1/data/buckets/lab%20data/distribution')
  })
})

describe('set change requests', () => {
  const base = 'https://api.test/api/v1/data/groups/g1/distributed-buckets/s1'

  it('adds a member with its coverage, strategy and ranges', async () => {
    const calls = stubFetch(201, { set_id: 's1', active: true, members: [] })
    const body = { node_id: 'n3', coverage: 'assigned' as const, strategy: 'copy' as const, ranges: ['r1'] }

    await joinMember('g1', 's1', body, client)

    expect(calls[0]).toMatchObject({ url: `${base}/members`, method: 'POST', body })
  })

  it('removes a member by its id', async () => {
    const calls = stubFetch(200, { set_id: 's1', revision: 7 })

    expect(await leaveMember('g1', 's1', 'm 1', client)).toEqual({ set_id: 's1', revision: 7 })
    expect(calls[0]).toMatchObject({ url: `${base}/members/m%201`, method: 'DELETE' })
  })

  it('opens a transfer of one range', async () => {
    const calls = stubFetch(202, { set_id: 's1', revision: 8 })
    const body = { range_id: 'r1', to: 'm2', role: 'leave' as const }

    await transferRange('g1', 's1', body, client)

    expect(calls[0]).toMatchObject({ url: `${base}/transfers`, method: 'POST', body })
  })

  it('replaces the settings and deletes the set', async () => {
    const calls = stubFetch(200, { set_id: 's1', revision: 9 })

    await changeSettings('g1', 's1', { refresh_secs: 3600, split_objects: 250_000 }, client)
    await deleteSet('g1', 's1', client)

    expect(calls[0]).toMatchObject({ url: `${base}/settings`, method: 'PUT', body: { refresh_secs: 3600, split_objects: 250_000 } })
    expect(calls[1]).toMatchObject({ url: base, method: 'DELETE' })
  })
})
