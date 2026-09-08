import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useJoinRequests } from './useJoinRequests'
import { apiBaseUrl, authToken, sessionEpoch } from './aruna/state'
import { applyPortalConfig } from '@/lib/config'

const entry = (id: string) => ({ request_id: id, group_id: 'group-1', user_id: 'member', status: 'pending', created_at: '2026-09-08T00:00:00Z' })
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  sessionEpoch.value += 1
  apiBaseUrl.value = 'https://portal.test/api/v1'
  authToken.value = 'test-token'
  applyPortalConfig({ features: { joinRequests: true } })
})
afterEach(() => vi.unstubAllGlobals())

describe('membership requests', () => {
  it('submits a request and follows every page of the own-request list', async () => {
    const calls: Array<{ url: URL; body?: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: URL, init: RequestInit) => {
      calls.push({ url, body: init.body as string | undefined })
      if (init.method === 'POST') return json(entry('new'))
      if (url.searchParams.has('start_after')) return json({ requests: [entry('new')], next_start_after: null })
      return json({ requests: [entry('old')], next_start_after: 'next' })
    }))
    const api = useJoinRequests()
    await api.requestJoin('group-1', '  Please admit me  ')
    expect(JSON.parse(calls[0]!.body!)).toEqual({ message: 'Please admit me' })
    expect(calls[0]!.url.pathname).toBe('/api/v1/access/groups/group-1/join-requests')
    expect(calls[2]!.url.searchParams.get('start_after')).toBe('next')
    expect(api.ownRequests.value.map((request) => request.request_id)).toEqual(['old', 'new'])
    expect(api.ownRequestsLoaded.value).toBe(true)
  })

  it('discards an old account response after a session switch', async () => {
    let reply!: (response: Response) => void
    const gate = new Promise<Response>((resolve) => { reply = resolve })
    vi.stubGlobal('fetch', vi.fn(() => gate))
    const api = useJoinRequests()
    const loading = api.loadOwnRequests()
    sessionEpoch.value += 1
    reply(json({ requests: [entry('private-old-account')], next_start_after: null }))
    await loading
    expect(api.ownRequests.value).toEqual([])
    expect(api.ownRequestsLoaded.value).toBe(false)
    expect(api.ownRequestsError.value).toBeNull()
  })

  it('keeps failed pagination incomplete and reports the failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ requests: [entry('one')], next_start_after: 'repeated' })))
    const api = useJoinRequests()
    await api.loadOwnRequests()
    expect(api.ownRequestsLoaded.value).toBe(false)
    expect(api.ownRequests.value).toEqual([])
    expect(api.ownRequestsError.value).toContain('pagination did not advance')
  })

  it('sends approvals to the selected group and request', async () => {
    const fetch = vi.fn(async (_url: URL, _init: RequestInit) => json({ request: { ...entry('one'), status: 'approved' } }))
    vi.stubGlobal('fetch', fetch)
    await useJoinRequests().decideJoinRequest('group-1', 'one', { approve: true, role_ids: ['user-role'] })
    const [url, init] = fetch.mock.calls[0]!
    expect(url.pathname).toBe('/api/v1/access/groups/group-1/join-requests/one/decide')
    expect(JSON.parse(init.body as string)).toEqual({ approve: true, role_ids: ['user-role'] })
  })

  it('does not call a disabled request API', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    applyPortalConfig({ features: { joinRequests: false } })
    await useJoinRequests().ensureOwnRequestsLoaded()
    await expect(useJoinRequests().requestJoin('group-1')).rejects.toThrow('not enabled')
    expect(fetch).not.toHaveBeenCalled()
  })
})
