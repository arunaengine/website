import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthOpener, useAuth } from './useAuth'
import { signInChoice } from './signInChoice'
import { loadPortalConfig } from '@/lib/config'
import { authToken } from './aruna/state'

const PAGE_ORIGIN = 'https://portal.test'
const ARUNA_ISSUER = 'https://keycloak.v3.aruna-engine.org/realms/aruna'

let assign: ReturnType<typeof vi.fn>
let storage: Map<string, string>
let fetchMock: ReturnType<typeof vi.fn>
let tokenAnswer: unknown = {}
// The Aruna account of each Keycloak user; null when it has none.
let accounts: Record<string, string | null> = {}

// An unsigned ID token; the portal reads only its claims.
const idToken = (sub: string) => `h.${btoa(JSON.stringify({ sub, iat: 1, exp: 2 }))}.s`
const realmToken = (sub: string) => `h.${btoa(JSON.stringify({ sub, iat: 1, exp: 2, sid: `sid-${sub}` }))}.s`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// A fresh discovery url per case, so no cached discovery leaks between cases.
async function setup(issuer: string, stored: Record<string, string> = {}, served: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => json(served)))
  await loadPortalConfig()
  storage = new Map(Object.entries(stored))
  assign = vi.fn()
  vi.stubGlobal('window', {
    location: { origin: PAGE_ORIGIN, assign },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })
  const discoveryUrl = `${issuer}/${Math.random()}/.well-known/openid-configuration`
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const bearer = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '') ?? ''
    if (url.includes('/access/token')) {
      const account = accounts[JSON.parse(atob(bearer.split('.')[1] ?? '')).sub]
      if (account === null) return json({ error: 'no account', code: 'account_missing' }, 401)
      return account ? json({ token: realmToken(account) }) : json({ error: 'unexpected' }, 500)
    }
    if (url.includes('/access/sessions/') && init?.method === 'DELETE') return new Response(null, { status: 204 })
    if (url.endsWith('/system/realm')) return json({ oidc_providers: [{ audience: 'portal', issuer, discovery_url: discoveryUrl }] })
    if (url === discoveryUrl) return json({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token` })
    if (url === `${issuer}/token`) return json(tokenAnswer)
    return json({ error: 'unexpected' }, 500)
  })
  vi.stubGlobal('fetch', fetchMock)
}

function redirected(): URL {
  expect(assign).toHaveBeenCalledTimes(1)
  return new URL(assign.mock.calls[0][0] as string)
}

beforeEach(() => {
  signInChoice.value = null
  useAuth().providerLink.value = null
})

afterEach(() => {
  setAuthOpener(null)
  authToken.value = ''
  vi.unstubAllGlobals()
})

describe('sign-in with login option params', () => {
  it('sends the params of the chosen login', async () => {
    await setup(ARUNA_ISSUER)
    await useAuth().signIn({ params: { kc_idp_hint: 'lifescience' } })
    const url = redirected()
    expect(url.searchParams.get('kc_idp_hint')).toBe('lifescience')
    expect(url.searchParams.has('kc_action')).toBe(false)
  })

  it('never lets the params replace the request own parameters', async () => {
    await setup(ARUNA_ISSUER)
    await useAuth().signIn({ params: { redirect_uri: 'https://evil.example', kc_idp_hint: 'sso' } })
    const url = redirected()
    expect(url.searchParams.get('redirect_uri')).not.toBe('https://evil.example')
    expect(url.searchParams.get('kc_idp_hint')).toBe('sso')
  })

  it('hands the params to the desktop sign-in window', async () => {
    await setup(ARUNA_ISSUER, {}, { features: { embeddedAuth: true } })
    const opener = vi.fn()
    setAuthOpener(opener)
    await useAuth().signIn({ params: { kc_idp_hint: 'orcid' } })
    expect(assign).not.toHaveBeenCalled()
    expect(new URL(opener.mock.calls[0][0] as string).searchParams.get('kc_idp_hint')).toBe('orcid')
  })

  it('sends no params for the plain sign-in', async () => {
    await setup(ARUNA_ISSUER)
    await useAuth().signIn({})
    expect(redirected().searchParams.has('kc_idp_hint')).toBe(false)
  })
})

describe('requestSignIn', () => {
  it('opens the chooser at any realm, which offers another Aruna realm', async () => {
    await setup('https://login.example.org/realms/aruna')
    await useAuth().requestSignIn({ redirectTo: '/app/data' })
    expect(signInChoice.value).toEqual({ redirectTo: '/app/data' })
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('linkProvider', () => {
  it('sends the link params of the login and keeps the current session token', async () => {
    await setup(ARUNA_ISSUER, { 'aruna.oidc.idToken': 'id-1' })
    await useAuth().linkProvider({
      name: 'ORCID',
      description: '',
      logo: '',
      params: { kc_idp_hint: 'orcid' },
      linkParams: { kc_action: 'idp_link:orcid' },
    })
    const url = redirected()
    expect(url.searchParams.get('kc_action')).toBe('idp_link:orcid')
    expect(url.searchParams.has('kc_idp_hint')).toBe(false)
    expect(storage.get('aruna.oidc.idToken')).toBe('id-1')
    expect(storage.get('aruna.oidc.link')).toBe('ORCID')
  })

  it('drops a stale link mark on a normal sign-in', async () => {
    await setup(ARUNA_ISSUER, { 'aruna.oidc.link': 'orcid', 'aruna.oidc.idToken': 'id-1' })
    await useAuth().signIn({})
    expect(storage.has('aruna.oidc.link')).toBe(false)
    expect(storage.has('aruna.oidc.idToken')).toBe(false)
  })
})

describe('completeSignIn after linking', () => {
  const LINKING = {
    'aruna.oidc.state': 's1',
    'aruna.oidc.verifier': 'v1',
    'aruna.oidc.redirect': '/app/settings',
    'aruna.oidc.link': 'LifeScience RI',
    'aruna.oidc.idToken': idToken('kc-a'),
  }

  async function finish(query: Record<string, string>, linkedSub = 'kc-a', active = 'aruna-a') {
    tokenAnswer = { id_token: idToken(linkedSub), access_token: 'a' }
    accounts = { 'kc-a': 'aruna-a', 'kc-b': 'aruna-b', 'kc-new': null }
    authToken.value = active ? realmToken(active) : ''
    await setup(ARUNA_ISSUER, LINKING)
    const auth = useAuth()
    const target = await auth.completeSignIn(new URLSearchParams({ state: 's1', code: 'c1', ...query }))
    return { target, link: auth.providerLink.value }
  }

  it('reports the linked login without a new Aruna session', async () => {
    const { target, link } = await finish({ kc_action_status: 'success' })
    expect(target).toBe('/app/settings')
    expect(link).toEqual({ name: 'LifeScience RI', linked: true })
    // The token that named the account is revoked and never adopted.
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/access/sessions/sid-aruna-a') && init?.method === 'DELETE')).toBe(true)
    expect(authToken.value).toBe(realmToken('aruna-a'))
    expect(storage.get('aruna.oidc.idToken')).toBe(idToken('kc-a'))
    expect(storage.has('aruna.oidc.link')).toBe(false)
    expect(storage.has('aruna.oidc.state')).toBe(false)
  })

  it('reports no success when the provider linked another Keycloak account', async () => {
    const { link } = await finish({ kc_action_status: 'success' }, 'kc-b')
    expect(link?.linked).toBe(false)
    expect(link?.message).toContain('signed in as another account')
  })

  it('reports no success when the active token is another account than the stored sign-in', async () => {
    const { link } = await finish({ kc_action_status: 'success' }, 'kc-a', 'aruna-b')
    expect(link?.linked).toBe(false)
    expect(link?.message).toContain('signed in as another account')
  })

  it('reports no success when the linked identity has no account', async () => {
    const { link } = await finish({ kc_action_status: 'success' }, 'kc-new')
    expect(link?.linked).toBe(false)
    expect(link?.message).toContain('signed in as another account')
  })

  it('reports no success when the signed-in account is unknown', async () => {
    const { link } = await finish({ kc_action_status: 'success' }, 'kc-a', '')
    expect(link?.linked).toBe(false)
    expect(link?.message).toContain('could not be confirmed')
  })

  it('says nothing when the person cancelled', async () => {
    const { link } = await finish({ kc_action_status: 'cancelled' })
    expect(link).toBeNull()
  })

  it('reports a refused link with the reason', async () => {
    const { link } = await finish({ kc_action_status: 'error', error_description: 'Already linked to another user' })
    expect(link).toEqual({ name: 'LifeScience RI', linked: false, message: 'Already linked to another user' })
    expect(storage.get('aruna.oidc.idToken')).toBe(idToken('kc-a'))
  })

  it('still refuses a return with another state', async () => {
    await setup(ARUNA_ISSUER, LINKING)
    const auth = useAuth()
    await expect(
      auth.completeSignIn(new URLSearchParams({ state: 'other', kc_action_status: 'success' })),
    ).rejects.toThrow('State mismatch')
    expect(auth.providerLink.value).toBeNull()
  })
})
