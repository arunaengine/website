import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGroupUsage, updateGroup } from './groups'
import * as state from './state'

const desktop = vi.hoisted(() => ({ on: false }))
vi.mock('@/lib/desktop', async (original) => ({
  ...(await original<typeof import('@/lib/desktop')>()),
  isDesktop: () => desktop.on,
}))

interface Call {
  url: string
  method: string
  body: unknown
}

function stubFetch(): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    calls.push({
      url: String(input),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    return new Response(
      JSON.stringify({ display_name: 'Genomics lab 2', group_id: 'g1', realm_id: 'r1', roles: [] }),
      { status: 200 },
    )
  }))
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  desktop.on = false
})

describe('group rename request', () => {
  it('patches the group and reloads the session', async () => {
    const calls = stubFetch()

    const updated = await updateGroup('g1', { display_name: 'Genomics lab 2' })

    expect(updated.display_name).toBe('Genomics lab 2')
    expect(calls[0].url).toBe('https://portal.test/api/v1/access/groups/g1')
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].body).toEqual({ display_name: 'Genomics lab 2' })
    // Every screen reads the name from /access/users/me and the group list.
    expect(calls.map((call) => call.url)).toContain('https://portal.test/api/v1/access/users/me')
  })
})

describe('group usage on the desktop', () => {
  const REALM = 'realm-1'

  function stubNodes(realmNodeUp: boolean): string[] {
    const urls: string[] = []
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:34116' } })
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
      const url = String(input)
      urls.push(url)
      if (url.startsWith('https://mgmt.test') && !realmNodeUp) throw new TypeError('Failed to fetch')
      if (url.endsWith('/system/realm')) return Response.json({ realm_id: REALM, nodes: [{ node_id: 'server', kind: 'server' }] })
      if (url.endsWith('/system/info')) return Response.json({})
      const local = url.startsWith('https://mgmt.test') ? 0 : 5
      return Response.json({ buckets: 1, objects: 1, logical_bytes: 0, referenced_bytes: local, realm: { buckets: 1, objects: 1, logical_bytes: 9, referenced_bytes: local } })
    }))
    return urls
  }

  function enterDesktop() {
    desktop.on = true
    state.sessionEpoch.value++
    state.realmInfo.value = { realm_id: REALM, management_urls: ['https://mgmt.test/'], nodes: [] } as never
  }

  it('reads the realm node, not the device', async () => {
    const urls = stubNodes(true)
    enterDesktop()

    const usage = await getGroupUsage('g1')

    expect(usage.realm?.logical_bytes).toBe(9)
    expect(usage.realm?.referenced_bytes).toBe(0)
    expect(urls).toContain('https://mgmt.test/api/v1/access/groups/g1/usage')
    expect(urls.some((url) => url.startsWith('http://127.0.0.1'))).toBe(false)
  })

  it('falls back to the device without a realm node', async () => {
    const urls = stubNodes(false)
    enterDesktop()

    const usage = await getGroupUsage('g1')

    expect(usage.realm?.referenced_bytes).toBe(5)
    expect(urls.at(-1)).toBe('http://127.0.0.1:34116/api/v1/access/groups/g1/usage')
  })
})
