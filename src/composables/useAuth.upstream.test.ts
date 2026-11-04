import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountMatch, useAuth } from './useAuth'
import { loadPortalConfig } from '@/lib/config'
import { pkceChallengeS256 } from '@/lib/oidc'

const PAGE_ORIGIN = 'https://realm.aruna-engine.org'
const BRIDGE = 'https://bridge.test/v3-bridge/lifescience'
const UPSTREAM = { provider: 'lifescience', bridge: BRIDGE }
const KEYCLOAK = 'https://keycloak.test/realms/aruna'

let assign: ReturnType<typeof vi.fn>
let storage: Map<string, string>
let fetchMock: ReturnType<typeof vi.fn>

// An unsigned ID token; the portal reads only its claims.
const idToken = (sub: string) => `h.${btoa(JSON.stringify({ sub, iat: 1, exp: 2 }))}.s`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// The realm lists Keycloak first; the node answers the registration with an account match,
// so the flow ends right after the node got the ID token.
async function setup(stored: Record<string, string> = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => json({})))
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
  const discoveryUrl = `${KEYCLOAK}/${Math.random()}/.well-known/openid-configuration`
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/system/realm')) {
      return json({
        oidc_providers: [
          { id: 'keycloak', audience: 'portal', issuer: KEYCLOAK, discovery_url: discoveryUrl },
          { id: 'lifescience', audience: 'ls-client', issuer: 'https://ls.test/oidc/', discovery_url: 'https://ls.test/discovery' },
        ],
      })
    }
    if (url === discoveryUrl) return json({ issuer: KEYCLOAK, authorization_endpoint: `${KEYCLOAK}/auth`, token_endpoint: `${KEYCLOAK}/token` })
    if (url === `${BRIDGE}/token`) return json({ id_token: idToken('ls-user'), token_type: 'Bearer', expires_in: 300 })
    if (url === `${KEYCLOAK}/token`) return json({ id_token: idToken('kc-user'), access_token: 'a1', token_type: 'Bearer' })
    if (url.endsWith('/access/users/register')) return json({ error: 'matches', code: 'account_match' }, 409)
    return json({ error: 'unexpected' }, 500)
  })
  vi.stubGlobal('fetch', fetchMock)
}

function redirected(): URL {
  expect(assign).toHaveBeenCalledTimes(1)
  return new URL(assign.mock.calls[0][0] as string)
}

function callsTo(url: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === url)
}

function callsEnding(suffix: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input).endsWith(suffix))
}

afterEach(() => {
  accountMatch.value = null
  vi.unstubAllGlobals()
})

describe('sign-in with an upstream login', () => {
  it('sends the browser to the bridge with the provider audience and PKCE', async () => {
    await setup()
    await useAuth().signIn({ upstream: UPSTREAM })
    const url = redirected()
    expect(`${url.origin}${url.pathname}`).toBe(`${BRIDGE}/authorize`)
    expect(url.searchParams.get('client_id')).toBe('ls-client')
    expect(url.searchParams.get('redirect_uri')).toBe(`${PAGE_ORIGIN}/auth/callback`)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid profile email')
    expect(url.searchParams.get('state')).toBe(storage.get('aruna.oidc.state'))
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(await pkceChallengeS256(storage.get('aruna.oidc.verifier')!))
    expect(JSON.parse(storage.get('aruna.oidc.upstream')!)).toEqual(UPSTREAM)
    // The bridge needs no discovery, so the realm's Keycloak is not asked.
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes(KEYCLOAK))).toBe(false)
  })

  it('fails without a redirect when the realm lacks the provider', async () => {
    await setup()
    const auth = useAuth()
    await auth.signIn({ upstream: { provider: 'missing', bridge: BRIDGE } })
    expect(assign).not.toHaveBeenCalled()
    expect(auth.stage.value).toBe('error')
    expect(auth.stageError.value).toContain('"missing"')
  })

  it('redeems the code at the bridge and hands the ID token to the node', async () => {
    await setup({
      'aruna.oidc.state': 's1',
      'aruna.oidc.verifier': 'v1',
      'aruna.oidc.upstream': JSON.stringify(UPSTREAM),
    })
    const target = await useAuth().completeSignIn(new URLSearchParams({ state: 's1', code: 'c1' }))
    expect(target).toBeNull()
    const [token] = callsTo(`${BRIDGE}/token`)
    expect(token[1]?.method).toBe('POST')
    expect(Object.fromEntries(new URLSearchParams(String(token[1]?.body)))).toEqual({
      grant_type: 'authorization_code',
      client_id: 'ls-client',
      redirect_uri: `${PAGE_ORIGIN}/auth/callback`,
      code: 'c1',
      code_verifier: 'v1',
    })
    expect(callsTo(`${KEYCLOAK}/token`)).toHaveLength(0)
    const [register] = callsEnding('/access/users/register')
    expect(new Headers(register[1]?.headers).get('Authorization')).toBe(`Bearer ${idToken('ls-user')}`)
    // No Keycloak session to end later; the sign-in record is gone.
    expect(accountMatch.value?.oidcToken).toBe(idToken('ls-user'))
    expect(accountMatch.value?.idToken).toBeUndefined()
    expect(storage.has('aruna.oidc.upstream')).toBe(false)
  })
})

describe('sign-in with a legacy login', () => {
  it('keeps the Keycloak endpoints and drops a stale upstream record', async () => {
    await setup({ 'aruna.oidc.upstream': JSON.stringify(UPSTREAM) })
    await useAuth().signIn({ params: { kc_idp_hint: 'lifescience' } })
    const url = redirected()
    expect(`${url.origin}${url.pathname}`).toBe(`${KEYCLOAK}/auth`)
    expect(url.searchParams.get('client_id')).toBe('portal')
    expect(url.searchParams.get('kc_idp_hint')).toBe('lifescience')
    expect(storage.has('aruna.oidc.upstream')).toBe(false)
  })

  it('redeems the code at Keycloak and keeps its ID token for sign-out', async () => {
    await setup({ 'aruna.oidc.state': 's1', 'aruna.oidc.verifier': 'v1' })
    await useAuth().completeSignIn(new URLSearchParams({ state: 's1', code: 'c1' }))
    expect(callsTo(`${KEYCLOAK}/token`)).toHaveLength(1)
    expect(callsTo(`${BRIDGE}/token`)).toHaveLength(0)
    expect(accountMatch.value?.idToken).toBe(idToken('kc-user'))
  })
})
