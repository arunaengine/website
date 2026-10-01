import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { deleteVault, readVault, saveVault, vaultConflicted, vaultUnavailable, vaultUnsupported } from './userVault'

const CLIENT = { baseUrl: 'https://api.test/api/v1', token: 'bearer-1' }

interface Call {
  url: string
  method: string
  body: unknown
  authorization: string | null
}

function stubFetch(payload: unknown, status = 200) {
  const calls: Call[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    const headers = new Headers(init.headers)
    calls.push({
      url: String(input),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      authorization: headers.get('Authorization'),
    })
    if (status === 204) return new Response(null, { status })
    return new Response(JSON.stringify(payload), { status })
  }))
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('user vault client', () => {
  it('reads the vault with the bearer', async () => {
    const calls = stubFetch({ heads: [] })

    const response = await readVault(CLIENT)

    expect(response).toEqual({ heads: [] })
    expect(calls[0].url).toBe('https://api.test/api/v1/access/users/me/vault')
    expect(calls[0].method).toBe('GET')
    expect(calls[0].authorization).toBe('Bearer bearer-1')
  })

  it('saves the payload with the heads it replaces', async () => {
    const head = { revision: 'R3', predecessors: ['R1', 'R2'], payload: '{"version":1}', updated_at: '2026-09-06T00:00:00Z' }
    const calls = stubFetch({ heads: [head] })

    const response = await saveVault({ payload: '{"version":1}', predecessors: ['R1', 'R2'] }, CLIENT)

    expect(response.heads).toEqual([head])
    expect(calls[0].method).toBe('PUT')
    expect(calls[0].body).toEqual({ payload: '{"version":1}', predecessors: ['R1', 'R2'] })
  })

  it('deletes the vault', async () => {
    const calls = stubFetch(null, 204)

    await deleteVault(CLIENT)

    expect(calls[0].method).toBe('DELETE')
    expect(calls[0].url).toBe('https://api.test/api/v1/access/users/me/vault')
  })

  it('tells a node without the route from a retry and an unreachable holder', () => {
    expect(vaultUnsupported(new ApiError(404, 'not found'))).toBe(true)
    expect(vaultUnsupported(new ApiError(405, 'method not allowed'))).toBe(true)
    expect(vaultUnsupported(new ApiError(409, 'stale'))).toBe(false)
    expect(vaultConflicted(new ApiError(409, 'stale'))).toBe(true)
    expect(vaultConflicted(new ApiError(500, 'boom'))).toBe(false)
    expect(vaultConflicted(new Error('offline'))).toBe(false)
    expect(vaultUnavailable(new ApiError(503, 'vault_unavailable'))).toBe(true)
    expect(vaultUnavailable(new ApiError(500, 'boom'))).toBe(false)
  })
})
