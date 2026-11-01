import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserDirectory } from './useUserDirectory'
import { apiBaseUrl, sessionEpoch } from './aruna/state'

beforeEach(() => {
  sessionEpoch.value += 1
  apiBaseUrl.value = 'https://portal.test/api/v1'
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('profile directory cache', () => {
  it('clears private profile fields when the API session changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      user_id: 'user-1', name: 'Ada', attributes: { email: 'private@example.test' }, subject_ids: [],
    }), { status: 200 })))
    const directory = useUserDirectory()
    await directory.resolveUser('user-1')
    expect(directory.cachedUser('user-1')?.attributes.email).toBe('private@example.test')
    sessionEpoch.value += 1
    expect(directory.cachedUser('user-1')).toBeNull()
  })

  it('does not cache an old session response after switching accounts', async () => {
    let reply!: (response: Response) => void
    const gate = new Promise<Response>((resolve) => { reply = resolve })
    vi.stubGlobal('fetch', vi.fn(() => gate))
    const directory = useUserDirectory()
    const pending = directory.resolveUser('user-1')
    sessionEpoch.value += 1
    reply(new Response(JSON.stringify({ user_id: 'user-1', name: 'Ada', attributes: { email: 'private@example.test' }, subject_ids: [] }), { status: 200 }))
    expect(await pending).toBeNull()
    expect(directory.cachedUser('user-1')).toBeNull()
  })

  it('shows the account a merged account belongs to over its own old name', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const resolved = String(input).endsWith('/access/users/resolve')
      const body = resolved
        ? [{ user_id: 'b1', name: 'Alice', attributes: {}, merged_into: 'a1' }]
        : { user_id: 'b1', name: 'Bob', attributes: {}, subject_ids: [] }
      return new Response(JSON.stringify(body), { status: 200 })
    }))
    const directory = useUserDirectory()
    await directory.resolveUsers(['b1', 'b2'])
    await directory.resolveUser('b1')
    expect(directory.cachedUser('b1')).toMatchObject({ name: 'Alice', merged_into: 'a1' })
  })
})
