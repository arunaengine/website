import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPortalConfig } from '@/lib/config'
import { POPUP_CHANNEL } from '@/lib/popupHandoff'
import { SignInCancelled, cancelPopup, popupSignIn, receiveCallback } from './popupSignIn'
import { setAuthOpener } from './useAuth'

const PAGE_ORIGIN = 'https://portal.test'
const TOKEN_ENDPOINT = 'https://idp.test/token'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// A fresh discovery url per case, since the portal caches discovery documents.
async function setup(served: Record<string, unknown> = {}, opened: unknown = undefined) {
  vi.stubGlobal('fetch', vi.fn(async () => json(served)))
  await loadPortalConfig()
  const discoveryUrl = `https://idp.test/${Math.random()}/.well-known/openid-configuration`
  const tokenForms: Record<string, string>[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/system/realm')) return json({ oidc_providers: [{ audience: 'portal', discovery_url: discoveryUrl }] })
    if (url === discoveryUrl) {
      return json({ issuer: 'https://idp.test', authorization_endpoint: 'https://idp.test/authorize', token_endpoint: TOKEN_ENDPOINT })
    }
    if (url === TOKEN_ENDPOINT) {
      tokenForms.push(Object.fromEntries(new URLSearchParams(String(init?.body))))
      return json({ access_token: 'a2', id_token: 'i2', token_type: 'Bearer' })
    }
    return json({ error: 'unexpected' }, 404)
  }))
  const replace = vi.fn()
  const close = vi.fn()
  const popup = opened === undefined ? { location: { replace }, close } : opened
  const open = vi.fn(() => popup)
  const assign = vi.fn()
  vi.stubGlobal('window', { location: { origin: PAGE_ORIGIN, assign }, open })
  return { open, replace, close, assign, tokenForms }
}

async function navigated(replace: ReturnType<typeof vi.fn>): Promise<URL> {
  await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
  return new URL(replace.mock.calls[0][0] as string)
}

afterEach(() => {
  cancelPopup()
  setAuthOpener(null)
  vi.unstubAllGlobals()
})

describe('popupSignIn', () => {
  it('opens the popup at once and asks the provider for a new login', async () => {
    const { open, replace, close, tokenForms } = await setup()
    const result = popupSignIn()
    // Opened in the click handler's turn, before any await.
    expect(open).toHaveBeenCalledTimes(1)
    const url = await navigated(replace)
    expect(url.searchParams.get('prompt')).toBe('login')
    expect(url.searchParams.get('redirect_uri')).toBe(`${PAGE_ORIGIN}/auth/callback`)
    const state = url.searchParams.get('state')!
    expect(state).toMatch(/^popup\.[\w-]{22}$/)

    const channel = new BroadcastChannel(POPUP_CHANNEL)
    channel.postMessage({ search: `?code=c2&state=other` })
    channel.postMessage({ search: `?code=c2&state=${state}` })
    channel.close()

    await expect(result).resolves.toMatchObject({ id_token: 'i2' })
    expect(tokenForms).toHaveLength(1)
    expect(tokenForms[0].code).toBe('c2')
    expect(close).toHaveBeenCalled()
    // Answered once: a late copy of the callback finds nobody waiting.
    expect(receiveCallback(new URLSearchParams({ code: 'c2', state }))).toBe(false)
  })

  it('reports a blocked popup', async () => {
    await setup({}, null)
    await expect(popupSignIn()).rejects.toThrow('The browser blocked the sign-in window')
  })

  it('ends when the person cancels', async () => {
    const { replace, close, tokenForms } = await setup()
    const result = popupSignIn()
    await navigated(replace)
    cancelPopup()
    await expect(result).rejects.toBeInstanceOf(SignInCancelled)
    expect(tokenForms).toEqual([])
    expect(close).toHaveBeenCalled()
  })

  it('shows the reason the provider refused', async () => {
    const { replace } = await setup()
    const result = popupSignIn()
    const state = (await navigated(replace)).searchParams.get('state')!
    receiveCallback(new URLSearchParams({ error: 'access_denied', error_description: 'User cancelled', state }))
    await expect(result).rejects.toThrow('User cancelled')
  })

  it('uses the sign-in window of the desktop and keeps this page', async () => {
    const { open, assign, tokenForms } = await setup({ features: { desktop: true, embeddedAuth: true } })
    const opener = vi.fn()
    setAuthOpener(opener)
    const result = popupSignIn()
    await vi.waitFor(() => expect(opener).toHaveBeenCalledTimes(1))
    const url = new URL(opener.mock.calls[0][0] as string)
    expect(url.searchParams.get('redirect_uri')).toBe('aruna://auth/callback')
    expect(open).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
    receiveCallback(new URLSearchParams({ code: 'c3', state: url.searchParams.get('state')! }))
    await expect(result).resolves.toMatchObject({ id_token: 'i2' })
    expect(tokenForms[0].redirect_uri).toBe('aruna://auth/callback')
  })
})
