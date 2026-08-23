import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginAuthRedirect, callbackUri, setAuthOpener } from './useAuth'
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
})
