import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginAuthRedirect, callbackUri, cancelSignIn, setAuthOpener, useAuth } from './useAuth'
import { loadPortalConfig } from '@/lib/config'
import { shellContext } from '@/lib/desktop'

const PAGE_ORIGIN = 'https://portal.test'
const AUTH_URL = 'https://idp.test/authorize?client_id=portal'

let assign: ReturnType<typeof vi.fn>

// The runtime config is a module singleton, so every case loads the served
// document it needs instead of reaching into it.
async function configure(served: Record<string, unknown>): Promise<void> {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(served), { status: 200 })))
  await loadPortalConfig()
  vi.stubGlobal('window', { location: { origin: PAGE_ORIGIN, assign } })
}

beforeEach(() => {
  assign = vi.fn()
  vi.stubGlobal('window', { location: { origin: PAGE_ORIGIN, assign } })
})

afterEach(() => {
  setAuthOpener(null)
  shellContext.value = null
  vi.unstubAllGlobals()
})

describe('callbackUri', () => {
  it('builds the redirect uri from the page origin', async () => {
    await configure({})
    expect(callbackUri()).toBe(`${PAGE_ORIGIN}/auth/callback`)
  })

  it('prefers a configured callback origin', async () => {
    await configure({ authCallbackOrigin: 'http://127.0.0.1:47713/' })
    expect(callbackUri()).toBe('http://127.0.0.1:47713/auth/callback')
  })

  it('takes the aruna scheme in desktop mode', async () => {
    await configure({ features: { desktop: true } })
    expect(callbackUri()).toBe('aruna://auth/callback')
  })

  it('keeps a callback origin the shell asked for', async () => {
    await configure({ features: { desktop: true }, authCallbackOrigin: 'http://127.0.0.1:47713' })
    expect(callbackUri()).toBe('http://127.0.0.1:47713/auth/callback')
  })
})

describe('beginAuthRedirect', () => {
  it('navigates this window by default', async () => {
    await configure({})
    const opener = vi.fn()
    setAuthOpener(opener)
    beginAuthRedirect(AUTH_URL)
    expect(assign).toHaveBeenCalledWith(AUTH_URL)
    expect(opener).not.toHaveBeenCalled()
  })

  it('hands the url to the opener in system-browser mode', async () => {
    await configure({ features: { systemBrowserAuth: true } })
    const opener = vi.fn()
    setAuthOpener(opener)
    beginAuthRedirect(AUTH_URL)
    expect(opener).toHaveBeenCalledWith(AUTH_URL)
    expect(assign).not.toHaveBeenCalled()
  })

  it('navigates when system-browser mode has no opener', async () => {
    await configure({ features: { systemBrowserAuth: true } })
    beginAuthRedirect(AUTH_URL)
    expect(assign).toHaveBeenCalledWith(AUTH_URL)
  })

  it('hands the url to the opener in embedded mode', async () => {
    await configure({ features: { embeddedAuth: true } })
    const opener = vi.fn()
    setAuthOpener(opener)
    beginAuthRedirect(AUTH_URL)
    expect(opener).toHaveBeenCalledWith(AUTH_URL)
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('cancelSignIn', () => {
  it('only drops a sign-in still waiting on the provider', async () => {
    await configure({})
    const { stage } = useAuth()
    stage.value = 'redirecting'
    cancelSignIn()
    expect(stage.value).toBe('idle')
    stage.value = 'exchanging'
    cancelSignIn()
    expect(stage.value).toBe('exchanging')
  })
})

describe('signIn', () => {
  // The realm names its provider; the provider's discovery names the login page.
  async function redirectFor(options: { freshLogin?: boolean }, served: Record<string, unknown> = {}): Promise<URL> {
    await configure(served)
    const storage = new Map<string, string>()
    vi.stubGlobal('window', {
      location: { origin: PAGE_ORIGIN, assign },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    })
    const discoveryUrl = `https://idp.test/${Math.random()}/.well-known/openid-configuration`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.endsWith('/system/realm')
        ? { oidc_providers: [{ audience: 'portal', discovery_url: discoveryUrl }] }
        : { issuer: 'https://idp.test', authorization_endpoint: 'https://idp.test/authorize', token_endpoint: 'https://idp.test/token' }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    await useAuth().signIn(options)
    expect(assign).toHaveBeenCalledTimes(1)
    return new URL(assign.mock.calls[0][0] as string)
  }

  it('asks the provider for a new login when fresh', async () => {
    const url = await redirectFor({ freshLogin: true })
    expect(url.searchParams.get('prompt')).toBe('login')
    expect(url.searchParams.get('max_age')).toBe('0')
  })

  it('keeps the provider session by default', async () => {
    const url = await redirectFor({})
    expect(url.searchParams.has('prompt')).toBe(false)
    expect(url.searchParams.has('max_age')).toBe(false)
  })

  it.each([
    ['through the realm website', 'https://realm.test'],
    ['through a website on its own origin', PAGE_ORIGIN],
  ])('marks a desktop state that returns %s', async (_, origin) => {
    const url = await redirectFor({}, { features: { desktop: true }, authCallbackOrigin: origin })
    expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/auth/callback`)
    expect(url.searchParams.get('state')).toMatch(/^desktop\.[\w-]{22}$/)
  })

  it.each([
    ['on the web', {}],
    ['on the web with a callback origin', { authCallbackOrigin: 'https://realm.test' }],
    ['for the desktop scheme', { features: { desktop: true } }],
  ])('leaves the state unmarked %s', async (_, served) => {
    const url = await redirectFor({}, served)
    expect(url.searchParams.get('state')).toMatch(/^[\w-]{22}$/)
  })
})

describe('completeSignIn in the desktop', () => {
  const TOKEN_ENDPOINT = 'https://idp.test/token'
  const DISCOVERY = { issuer: 'https://idp.test', authorization_endpoint: 'https://idp.test/authorize', token_endpoint: TOKEN_ENDPOINT }
  const FORM = {
    grant_type: 'authorization_code',
    client_id: 'portal',
    redirect_uri: 'https://realm.test/auth/callback',
    code: 'c1',
    code_verifier: 'v1',
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  // Aruna refuses the registration, so the flow ends right after the provider
  // requests, which are what these cases are about.
  async function complete(version: number, answer: (command: string) => Promise<unknown>) {
    await configure({ features: { desktop: true }, authCallbackOrigin: 'https://realm.test' })
    const storage = new Map([['aruna.oidc.state', 'desktop.s1'], ['aruna.oidc.verifier', 'v1']])
    vi.stubGlobal('window', {
      location: { origin: 'tauri://localhost', assign },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    })
    const discoveryUrl = `https://idp.test/${Math.random()}/.well-known/openid-configuration`
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/system/realm')) return json({ oidc_providers: [{ audience: 'portal', discovery_url: discoveryUrl }] })
      if (url === discoveryUrl) return json(DISCOVERY)
      if (url === TOKEN_ENDPOINT) return json({ error: 'invalid_grant', error_description: 'Code not valid' }, 400)
      return json({ error: 'refused' }, 403)
    })
    vi.stubGlobal('fetch', fetch)
    const invoke = vi.fn(async (command: string, _args?: Record<string, unknown>) => answer(command))
    shellContext.value = { apiBaseUrl: '/api', bridge: { invoke, version } }
    const auth = useAuth()
    await expect(auth.completeSignIn(new URLSearchParams({ code: 'c1', state: 'desktop.s1' }))).rejects.toThrow()
    const requested = fetch.mock.calls.map(([input]) => String(input))
    return { discoveryUrl, invoke, requested, stageError: auth.stageError.value }
  }

  it('asks the shell for discovery and the token when its bridge offers them', async () => {
    const run = await complete(8, async (command) =>
      command === 'oidc_discovery' ? DISCOVERY : { access_token: 'a1', id_token: 'i1', token_type: 'Bearer' },
    )
    expect(run.invoke.mock.calls).toEqual([
      ['oidc_discovery', { url: run.discoveryUrl }],
      ['oidc_token', { endpoint: TOKEN_ENDPOINT, form: FORM }],
    ])
    expect(run.requested).not.toContain(run.discoveryUrl)
    expect(run.requested).not.toContain(TOKEN_ENDPOINT)
    expect(run.requested.some((url) => url.endsWith('/access/users/register'))).toBe(true)
  })

  it('fetches from the provider on an older bridge', async () => {
    const run = await complete(7, async () => null)
    expect(run.invoke).not.toHaveBeenCalled()
    expect(run.requested).toContain(run.discoveryUrl)
    expect(run.requested).toContain(TOKEN_ENDPOINT)
    expect(run.stageError).toBe('Token exchange failed: Code not valid')
  })

  it('shows the reason the provider gave the shell', async () => {
    // Tauri rejects with the command's error string.
    const run = await complete(8, async (command) => {
      if (command === 'oidc_discovery') return DISCOVERY
      throw 'Code not valid'
    })
    expect(run.stageError).toBe('Token exchange failed: Code not valid')
    expect(run.requested).not.toContain(TOKEN_ENDPOINT)
  })
})
