import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { ApiError, apiRequest, revokeSession } from '@/lib/api'
import { refresh } from './session'

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(),
  revokeSession: vi.fn(),
}))
vi.mock('./session', async (original) => ({ ...(await original<typeof import('./session')>()), refresh: vi.fn() }))

const BASE = 'https://api.a.example/api/v1'
const KEY = 'aruna.authToken:REALM-A@https://api.a.example'
const HOUR = 60 * 60_000

const state = await import('./state')
const { startRenewal } = await import('./renewal')

function jwt(claims: Record<string, unknown>) {
  const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '')
  return `${part({ alg: 'EdDSA' })}.${part(claims)}.signature`
}

let issued = 0
function mint(sub = 'USER@REALM', extra: Record<string, unknown> = {}) {
  const iat = Math.floor(Date.now() / 1000)
  return jwt({ sub, iat, exp: iat + 24 * 3600, sid: `SID-${++issued}`, ...extra })
}

function sid(token: string) {
  return JSON.parse(atob(token.split('.')[1])).sid as string
}

let storage: Record<string, string>
let stop: () => void = () => undefined

async function settle() {
  for (let turn = 0; turn < 5; turn++) await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.mocked(apiRequest).mockReset().mockImplementation(async (path) => (path === '/access/token' ? { token: mint() } : {}))
  vi.mocked(revokeSession).mockReset().mockResolvedValue(undefined)
  vi.mocked(refresh).mockReset().mockResolvedValue(undefined)
  storage = {}
  const listeners = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('window', {
    ...listeners,
    location: { origin: 'https://portal.example' },
    localStorage: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => void (storage[key] = value),
      removeItem: (key: string) => void delete storage[key],
    },
  })
  vi.stubGlobal('document', listeners)
  state.apiBaseUrl.value = BASE
  state.realmInfo.value = { realm_id: 'REALM-A' } as never
  state.authToken.value = ''
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function signIn(token: string) {
  state.authToken.value = token
  storage[KEY] = token
  stop = startRenewal()
}

const renewals = () => vi.mocked(apiRequest).mock.calls.filter(([path]) => path === '/access/token')

describe('token renewal', () => {
  it('keeps a signed-in user past the token lifetime and revokes each replaced session', async () => {
    const first = mint()
    signIn(first)
    const held: string[] = [first]
    for (let hour = 0; hour < 30; hour++) {
      await vi.advanceTimersByTimeAsync(HOUR)
      await settle()
      if (state.authToken.value !== held.at(-1)) held.push(state.authToken.value)
    }
    expect(refresh).not.toHaveBeenCalled()
    expect(renewals()).toHaveLength(7)
    expect(held).toHaveLength(8)
    expect(renewals()[0][2]).toEqual({ baseUrl: BASE, token: first })
    expect(storage[KEY]).toBe(state.authToken.value)
    // Every replaced session is revoked with its successor; only the live one remains.
    const revoked = vi.mocked(revokeSession).mock.calls
    expect(revoked.map(([id]) => id)).toEqual(held.slice(0, -1).map(sid))
    expect(revoked.every(([, client], index) => client?.token === held[index + 1])).toBe(true)
  })

  it('revokes the new session when the user signs out while it is issued', async () => {
    let answer: (value: { token: string }) => void = () => undefined
    vi.mocked(apiRequest).mockImplementation(() => new Promise((resolve) => (answer = resolve as never)))
    signIn(mint())
    await vi.advanceTimersByTimeAsync(4 * HOUR)
    state.authToken.value = ''
    const next = mint()
    answer({ token: next })
    await settle()
    expect(state.authToken.value).toBe('')
    expect(revokeSession).toHaveBeenCalledWith(sid(next), { baseUrl: BASE, token: next })
  })

  it('takes over a token another tab renewed instead of issuing one more', async () => {
    signIn(mint())
    await vi.advanceTimersByTimeAsync(3 * HOUR)
    const other = mint()
    storage[KEY] = other
    await vi.advanceTimersByTimeAsync(HOUR)
    await settle()
    expect(renewals()).toHaveLength(0)
    expect(state.authToken.value).toBe(other)
  })

  it('signs out once the realm refuses the token and never renews another realm session', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(401, 'Unauthorized'))
    signIn(mint())
    await vi.advanceTimersByTimeAsync(4 * HOUR)
    await settle()
    expect(refresh).toHaveBeenCalledTimes(1)

    stop()
    vi.mocked(apiRequest).mockClear()
    signIn(mint('GUEST@OTHER', { session_kind: 'federated' }))
    await vi.advanceTimersByTimeAsync(12 * HOUR)
    expect(renewals()).toHaveLength(0)
  })
})
