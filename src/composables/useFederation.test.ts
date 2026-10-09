import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { DescriptorError } from '@/lib/federation/descriptor'

const ask = vi.fn()
const close = vi.fn()
const createFederatedSession = vi.fn()
const getRealmDescriptor = vi.fn()
const setAuthToken = vi.fn()
const refresh = vi.fn(async () => undefined)
const openPopup = vi.fn(() => ({ ask, close }))
const recheckRealm = vi.fn()

vi.mock('@/lib/federation/popup', async (original) => ({
  ...(await original<typeof import('@/lib/federation/popup')>()),
  openPopup: (...args: unknown[]) => openPopup(...(args as [])),
  checkHandoff: vi.fn(),
}))
vi.mock('@/lib/federation/realms', async (original) => ({
  ...(await original<typeof import('@/lib/federation/realms')>()),
  recheckRealm: (...args: unknown[]) => recheckRealm(...args),
}))
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  createFederatedSession: (...args: unknown[]) => createFederatedSession(...args),
  getRealmDescriptor: (...args: unknown[]) => getRealmDescriptor(...args),
}))
vi.mock('./aruna/session', () => ({ setAuthToken: (token: string) => setAuthToken(token), refresh: () => refresh() }))

const { apiBaseUrl, authToken } = await import('./aruna/state')
const { federatedLogin, homeRealmLabel, loginWithRealm } = await import('./useFederation')

const home = {
  realmId: 'HOME',
  name: 'Giessen Data',
  description: '',
  apiUrl: 'https://api.giessen.example/api/v1',
  portalUrl: 'https://data.giessen.example/',
  portalOrigin: 'https://data.giessen.example',
  issuedAt: 1,
  descriptor: { payload: {}, signer: 'Realm', signature: '' },
} as never

beforeEach(() => {
  vi.stubGlobal('window', {})
  for (const mock of [ask, close, createFederatedSession, getRealmDescriptor, setAuthToken, openPopup, recheckRealm]) {
    mock.mockReset()
  }
  openPopup.mockImplementation(() => ({ ask, close }))
  recheckRealm.mockImplementation(async (realm: unknown) => realm)
  getRealmDescriptor.mockResolvedValue({ payload: { name: 'Marburg Archive' } })
  ask.mockResolvedValue({ payload: { issuer: [] } })
  apiBaseUrl.value = '/api/v1'
  authToken.value = ''
  federatedLogin.value = null
})

describe('loginWithRealm', () => {
  it('opens a session here with the popup handoff and the kept secret', async () => {
    createFederatedSession.mockResolvedValue({ token: 'T', linked: false, account_hint: true })
    expect(await loginWithRealm(home, 'Marburg Archive')).toBeNull()
    const [handoff, secret] = createFederatedSession.mock.calls[0]
    expect(handoff).toEqual({ payload: { issuer: [] } })
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    // The popup got only the nonce, never the secret.
    expect(JSON.stringify(ask.mock.calls[0][0])).not.toContain(secret)
    expect(setAuthToken).toHaveBeenCalledWith('T')
    expect(federatedLogin.value).toMatchObject({ homeRealmId: 'HOME', accountHint: true, dismissed: false })
    expect(close).toHaveBeenCalled()
  })

  it('drops a session that arrives after the API base changed', async () => {
    createFederatedSession.mockImplementation(async () => {
      apiBaseUrl.value = 'https://other.example/api/v1'
      return { token: 'T', linked: false, account_hint: false }
    })
    expect(await loginWithRealm(home, 'Marburg Archive')).toBe('The session changed during the login.')
    expect(setAuthToken).not.toHaveBeenCalled()
  })

  it('names a realm that is not admitted', async () => {
    createFederatedSession.mockRejectedValue(
      new ApiError(403, 'the issuing realm is not accepted here', 'handoff_rejected'),
    )
    expect(await loginWithRealm(home, 'Marburg Archive')).toBe('Marburg Archive does not allow logins from Giessen Data.')
  })

  it('opens the popup only after the home realm checks out again', async () => {
    recheckRealm.mockRejectedValue(new DescriptorError('mismatch', 'Giessen Data sent older details.'))
    expect(await loginWithRealm(home, 'Marburg Archive')).toBe('Giessen Data sent older details.')
    expect(openPopup).not.toHaveBeenCalled()
    const moved = { ...(home as object), portalUrl: 'https://new.giessen.example/', issuedAt: 2 }
    recheckRealm.mockResolvedValue(moved)
    createFederatedSession.mockResolvedValue({ token: 'T', linked: false, account_hint: false })
    expect(await loginWithRealm(home, 'Marburg Archive')).toBeNull()
    expect(openPopup).toHaveBeenCalledWith({}, moved)
  })

  it('says when this realm takes no logins from other realms', async () => {
    getRealmDescriptor.mockRejectedValue(new ApiError(404, 'Not found'))
    expect(await loginWithRealm(home, 'Marburg Archive')).toBe('This realm does not take logins from other realms.')
    expect(ask).not.toHaveBeenCalled()
  })
})

describe('homeRealmLabel', () => {
  it('names only users of other realms', () => {
    expect(homeRealmLabel('01J@OWN', 'OWN')).toBeNull()
    expect(homeRealmLabel('01J@abcdefghijklmnop', 'OWN')).toBe('Realm abcdefgh')
  })
})
