import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '@/lib/api'

vi.mock('@/lib/api', async (original) => ({ ...(await original<typeof import('@/lib/api')>()), apiRequest: vi.fn() }))

const A = 'https://api.a.example'
const B = 'https://api.b.example'

// Like the browser's storage: entries are own keys, the methods are not.
function memoryStorage(entries: Record<string, string>) {
  const storage = { ...entries }
  Object.defineProperties(storage, {
    getItem: { value: (key: string) => (key in storage ? storage[key] : null) },
    setItem: { value: (key: string, value: string) => void (storage[key] = value) },
    removeItem: { value: (key: string) => void delete storage[key] },
  })
  return storage as Record<string, string>
}

function serveRealm(realmId: string) {
  vi.mocked(apiRequest).mockImplementation(async (path) =>
    path === '/system/realm' ? { realm_id: realmId, nodes: [], oidc_providers: [] } : {},
  )
}

const state = await import('./state')
const { refresh, setApiBaseUrl, setAuthToken } = await import('./session')

let storage: Record<string, string>

beforeEach(() => {
  vi.mocked(apiRequest).mockReset()
  storage = memoryStorage({
    [`aruna.authToken:REALM-A@${A}`]: 'TOKEN-A',
    [`aruna.authToken:REALM-OLD@${A}`]: 'TOKEN-OLD',
  })
  vi.stubGlobal('window', { location: { origin: 'https://portal.example' }, localStorage: storage })
  state.sessionEpoch.value++
  state.apiBaseUrl.value = `${A}/api/v1`
  state.authToken.value = ''
  state.realmInfo.value = null
})

afterEach(() => vi.unstubAllGlobals())

describe('token restore', () => {
  it('asks for the realm first and restores only its token', async () => {
    serveRealm('REALM-A')
    await refresh()
    const calls = vi.mocked(apiRequest).mock.calls
    expect(calls[0]).toEqual(['/system/realm', {}, { baseUrl: `${A}/api/v1` }])
    expect(state.authToken.value).toBe('TOKEN-A')
    const tokens = calls.map(([, , client]) => client?.token).filter(Boolean)
    expect(new Set(tokens)).toEqual(new Set(['TOKEN-A']))
  })

  it('restores nothing when the API base serves another realm now', async () => {
    serveRealm('REALM-NEW')
    await refresh()
    expect(state.authToken.value).toBe('')
    expect(vi.mocked(apiRequest).mock.calls.every(([, , client]) => !client?.token)).toBe(true)
  })

  it('sends no stored token to another API origin', async () => {
    state.apiBaseUrl.value = `${B}/api/v1`
    serveRealm('REALM-A')
    await refresh()
    expect(state.authToken.value).toBe('')
    expect(vi.mocked(apiRequest).mock.calls.every(([, , client]) => !client?.token)).toBe(true)
  })

  it('stores a login under its realm and API origin and keeps it when the base changes', () => {
    state.realmInfo.value = { realm_id: 'REALM-A' } as never
    setAuthToken('TOKEN-NEW')
    expect(storage[`aruna.authToken:REALM-A@${A}`]).toBe('TOKEN-NEW')
    setApiBaseUrl(`${B}/api/v1`)
    expect(state.authToken.value).toBe('')
    expect(storage[`aruna.authToken:REALM-A@${A}`]).toBe('TOKEN-NEW')
  })

  it('forgets only this realm token on sign out', () => {
    state.realmInfo.value = { realm_id: 'REALM-A' } as never
    state.authToken.value = 'TOKEN-A'
    setAuthToken('')
    expect(storage[`aruna.authToken:REALM-A@${A}`]).toBeUndefined()
    expect(storage[`aruna.authToken:REALM-OLD@${A}`]).toBe('TOKEN-OLD')
  })
})
