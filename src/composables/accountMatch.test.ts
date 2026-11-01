import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const popupSignIn = vi.fn()
const authToken = ref('')
const currentUser = ref<{ id: string } | null>(null)
const setAuthToken = vi.fn((token: string) => {
  authToken.value = token
})
const refresh = vi.fn(async () => {
  currentUser.value = authToken.value ? { id: 'a1@R' } : null
})

vi.mock('./popupSignIn', () => ({ popupSignIn: () => popupSignIn(), SignInCancelled: class extends Error {} }))
vi.mock('./useAruna', () => ({
  useAruna: () => ({
    apiBaseUrl: ref('https://api.test'),
    realmInfo: ref(null),
    authToken,
    authError: ref(null),
    currentUser,
    setAuthToken,
    refresh,
  }),
}))

const { loadPortalConfig } = await import('@/lib/config')
const { accountMatch, useAuth } = await import('./useAuth')
const { createNewAccount, joinExistingAccount, matchFailure, matchStale } = await import('./accountMatch')

const ISSUER = 'https://idp.test'

function jwt(claims: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000)
  return `h.${btoa(JSON.stringify({ iat: now, exp: now + 300, ...claims })).replace(/=+$/, '')}.s`
}

const NEW_SIGN_IN = jwt({ sub: 'kc-new', auth_time: Math.floor(Date.now() / 1000) - 10 })
const EXISTING_SIGN_IN = jwt({ sub: 'kc-old', auth_time: Math.floor(Date.now() / 1000) - 1 })

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface Call {
  method: string
  path: string
  bearer: string
  body: unknown
}

let storage: Map<string, string>
let calls: Call[]
let register: (call: Call) => Response
let attach: (call: Call) => Response

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({})))
  await loadPortalConfig()
  storage = new Map([['aruna.oidc.state', 's1'], ['aruna.oidc.verifier', 'v1'], ['aruna.oidc.redirect', '/app/data']])
  vi.stubGlobal('window', {
    location: { origin: 'https://portal.test', assign: vi.fn() },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })
  calls = []
  authToken.value = ''
  currentUser.value = null
  setAuthToken.mockClear()
  popupSignIn.mockReset()
  popupSignIn.mockResolvedValue({ access_token: 'x', id_token: EXISTING_SIGN_IN, token_type: 'Bearer' })
  register = ({ body }) =>
    (body as { create_new?: boolean }).create_new
      ? json({ id: 'n1@R', name: 'New' }, 201)
      : json({ error: 'an account matches', code: 'account_match' }, 409)
  attach = () => json({ user_id: 'a1@R', name: 'Alice', subject_ids: [], attributes: {} })
  const discoveryUrl = `${ISSUER}/${Math.random()}/.well-known/openid-configuration`
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    if (url.pathname.endsWith('/system/realm')) {
      return json({ oidc_providers: [{ audience: 'portal', issuer: ISSUER, discovery_url: discoveryUrl }] })
    }
    if (String(input) === discoveryUrl) {
      return json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/auth`, token_endpoint: `${ISSUER}/token` })
    }
    if (String(input) === `${ISSUER}/token`) return json({ access_token: 'x', id_token: NEW_SIGN_IN, token_type: 'Bearer' })
    const bearer = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '') ?? ''
    const call = { method, path: url.pathname, bearer, body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    if (call.path === '/access/users/register') return register(call)
    if (call.path === '/access/users/me/subjects') return attach(call)
    if (call.path === '/access/token') return json({ token: `realm-of-${bearer === NEW_SIGN_IN ? 'new' : 'existing'}` })
    return json({ error: 'unexpected' }, 500)
  }))
})

afterEach(() => {
  accountMatch.value = null
  vi.unstubAllGlobals()
})

async function matched() {
  const auth = useAuth()
  const target = await auth.completeSignIn(new URLSearchParams({ state: 's1', code: 'c1' }))
  expect(target).toBeNull()
  expect(auth.stage.value).toBe('match')
  return auth
}

describe('a first sign-in that matches an account', () => {
  it('stops before any session and keeps the new sign-in in memory', async () => {
    await matched()
    expect(accountMatch.value).toEqual({ oidcToken: NEW_SIGN_IN, redirectTo: '/app/data' })
    expect(setAuthToken).not.toHaveBeenCalled()
    expect(calls.map((call) => call.path)).toEqual(['/access/users/register'])
    expect(storage.has('aruna.oidc.verifier')).toBe(false)
  })

  it('adds the new sign-in to the existing account the person signs in with', async () => {
    await matched()

    await expect(joinExistingAccount()).resolves.toBe('/app/data')

    const [attached] = calls.filter((call) => call.path === '/access/users/me/subjects')
    expect(attached.bearer).toBe('realm-of-existing')
    expect(attached.body).toEqual({ token: NEW_SIGN_IN })
    expect(authToken.value).toBe('realm-of-existing')
    expect(storage.get('aruna.oidc.idToken')).toBe(EXISTING_SIGN_IN)
    expect(accountMatch.value).toBeNull()
  })

  it('asks for a new sign-in when the server finds it too old', async () => {
    attach = () => json({ error: 'both accounts need a portal login', code: 'merge_refused' }, 403)
    await matched()

    await expect(joinExistingAccount()).resolves.toBeNull()

    expect(matchStale.value).toBe(true)
    expect(matchFailure.value).toBe('Your new sign-in is older than 5 minutes. Sign in again.')
    expect(authToken.value).toBe('')
  })

  it('creates a new account on request', async () => {
    await matched()

    await expect(createNewAccount()).resolves.toBe('/app/data')

    const registered = calls.filter((call) => call.path === '/access/users/register')
    expect(registered.map((call) => call.body)).toEqual([{}, { create_new: true }])
    expect(registered[1].bearer).toBe(NEW_SIGN_IN)
    expect(authToken.value).toBe('realm-of-new')
    expect(popupSignIn).not.toHaveBeenCalled()
  })

  it('registers directly when nothing matches', async () => {
    register = () => json({ id: 'n1@R', name: 'New' }, 201)
    const auth = useAuth()
    await expect(auth.completeSignIn(new URLSearchParams({ state: 's1', code: 'c1' }))).resolves.toBe('/app/data')
    expect(auth.stage.value).toBe('done')
    expect(accountMatch.value).toBeNull()
  })
})
