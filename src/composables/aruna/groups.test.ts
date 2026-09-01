import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateGroup } from './groups'

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
