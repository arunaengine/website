import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  approveDatabaseRequest,
  dropDatabaseRequest,
  listDatabaseRequests,
  listDatabases,
  markDatabase,
  removeDatabase,
} from './databases'

const client = { baseUrl: 'https://api.test/api/v1', token: 'tok' }

function stubFetch(status: number, body: unknown) {
  const calls: { url: string; method?: string; body?: unknown }[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL, init: RequestInit) => {
      calls.push({ url: String(input), method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined })
      return new Response(status === 204 ? null : JSON.stringify(body), { status })
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('database requests', () => {
  it('lists a page and asks for the curator view on request', async () => {
    const calls = stubFetch(200, { databases: [] })

    await listDatabases({ limit: 100, curation: true, after: 'e1' }, client)

    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/api/v1/data/databases')
    expect([url.searchParams.get('limit'), url.searchParams.get('curation'), url.searchParams.get('after')]).toEqual(['100', 'true', 'e1'])
  })

  it('marks a bucket with the dataset and the target', async () => {
    const answer = { status: 'pending_consent', request_id: 'r1' }
    const calls = stubFetch(200, answer)
    const body = { dataset_id: 'd1', target: { kind: 'ordinary' as const, node_id: 'n1', bucket: 'lab' } }

    expect(await markDatabase(body, client)).toEqual(answer)
    expect(calls[0]).toMatchObject({ url: 'https://api.test/api/v1/system/realm/databases', method: 'POST', body })
  })

  it('removes an entry and reads the pending requests as a list', async () => {
    const calls = stubFetch(204, null)
    await removeDatabase('e 1', client)
    expect(calls[0]).toMatchObject({ url: 'https://api.test/api/v1/system/realm/databases/e%201', method: 'DELETE' })

    stubFetch(200, { requests: [{ request_id: 'r1' }] })
    expect(await listDatabaseRequests(client)).toEqual([{ request_id: 'r1' }])
  })

  it('approves and drops a request by its id', async () => {
    const calls = stubFetch(200, { entry_id: 'e1' })
    await approveDatabaseRequest('r1', client)
    expect(calls[0]).toMatchObject({ url: 'https://api.test/api/v1/system/realm/databases/requests/r1/approve', method: 'POST' })

    const dropped = stubFetch(204, null)
    await dropDatabaseRequest('r1', client)
    expect(dropped[0]).toMatchObject({ url: 'https://api.test/api/v1/system/realm/databases/requests/r1', method: 'DELETE' })
  })
})
