import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginAuthRedirect, callbackUri, cancelSignIn, setAuthOpener, useAuth } from './useAuth'
import { loadPortalConfig } from '@/lib/config'

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

  it('marks a desktop state that returns through the realm website', async () => {
    const url = await redirectFor({}, { features: { desktop: true }, authCallbackOrigin: 'https://realm.test' })
    expect(url.searchParams.get('redirect_uri')).toBe('https://realm.test/auth/callback')
    expect(url.searchParams.get('state')).toMatch(/^desktop\.[\w-]{22}$/)
  })

  it.each([
    ['on the web', {}],
    ['on the web with a callback origin', { authCallbackOrigin: 'https://realm.test' }],
    ['for the desktop scheme', { features: { desktop: true } }],
    ['for a desktop callback on its own origin', { features: { desktop: true }, authCallbackOrigin: PAGE_ORIGIN }],
  ])('leaves the state unmarked %s', async (_, served) => {
    const url = await redirectFor({}, served)
    expect(url.searchParams.get('state')).toMatch(/^[\w-]{22}$/)
  })
})
