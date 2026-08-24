import { afterEach, describe, expect, it, vi } from 'vitest'

const PAGE_ORIGIN = 'https://portal.test'
const AUTH_URL = 'https://idp.test/authorize?client_id=portal'
const SERVED = { apiBaseUrl: 'https://web.test/api/v1' }

let served: ReturnType<typeof vi.fn>
let assign: ReturnType<typeof vi.fn>

// useAruna refreshes itself as soon as it is imported, so count only the calls
// that ask for the served config document.
function configFetches(): number {
  return served.mock.calls.filter((call) => call[0] === '/portal-config.json').length
}

// Both the desktop context and the runtime config are module singletons read
// once at boot, so every case boots a fresh module graph of its own.
async function boot(injected?: unknown) {
  vi.resetModules()
  assign = vi.fn()
  served = vi.fn(async () => new Response(JSON.stringify(SERVED), { status: 200 }))
  vi.stubGlobal('fetch', served)
  vi.stubGlobal('window', { __ARUNA_DESKTOP__: injected, location: { origin: PAGE_ORIGIN, assign } })
  const desktop = await import('./desktop')
  await desktop.bootRuntimeConfig()
  return desktop
}

function shell(over: Record<string, unknown> = {}) {
  return { apiBaseUrl: 'http://127.0.0.1:47713/api/v1', ...over }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('web mode', () => {
  it('loads the served config when no shell injects one', async () => {
    const desktop = await boot()
    const { featureEnabled, portalConfig } = await import('./config')

    expect(desktop.isDesktop()).toBe(false)
    expect(desktop.desktopBridge()).toBeNull()
    expect(configFetches()).toBe(1)
    expect(portalConfig().apiBaseUrl).toBe(SERVED.apiBaseUrl)
    expect(featureEnabled('desktop')).toBe(false)
    expect(featureEnabled('systemBrowserAuth')).toBe(false)
  })

  it('treats a malformed global as absent', async () => {
    // Half-entering desktop mode would hide the landing page on the web.
    for (const injected of ['yes', 42, [], null]) {
      const desktop = await boot(injected)
      expect(desktop.isDesktop()).toBe(false)
      expect(configFetches()).toBe(1)
    }
  })

  it('navigates this window for sign-in', async () => {
    await boot()
    const { beginAuthRedirect } = await import('@/composables/useAuth')
    beginAuthRedirect(AUTH_URL)
    expect(assign).toHaveBeenCalledWith(AUTH_URL)
  })
})

describe('desktop mode', () => {
  it('skips the served config and takes the injected base', async () => {
    // /portal-config.json does not exist on the shell's app origin.
    const desktop = await boot(shell())
    const { featureEnabled, portalConfig } = await import('./config')

    expect(desktop.isDesktop()).toBe(true)
    expect(configFetches()).toBe(0)
    expect(portalConfig().apiBaseUrl).toBe('http://127.0.0.1:47713/api/v1')
    expect(featureEnabled('desktop')).toBe(true)
    expect(featureEnabled('systemBrowserAuth')).toBe(true)
  })

  it('falls back to the same-origin api base', async () => {
    await boot({ features: { desktop: true } })
    const { portalConfig } = await import('./config')
    expect(portalConfig().apiBaseUrl).toBe('/api/v1')
  })

  it('defaults the callback to the aruna scheme', async () => {
    // The shell's own origin is tauri://localhost, which no IdP accepts.
    await boot(shell())
    const { callbackUri } = await import('@/composables/useAuth')
    expect(callbackUri()).toBe('aruna://auth/callback')
  })

  it('registers the callback origin the shell listens on', async () => {
    await boot(shell({ authCallbackOrigin: 'http://127.0.0.1:47713/' }))
    const { callbackUri } = await import('@/composables/useAuth')
    expect(callbackUri()).toBe('http://127.0.0.1:47713/auth/callback')
  })

  it('lets the shell drop system-browser auth but not desktop mode', async () => {
    const desktop = await boot(shell({ features: { systemBrowserAuth: false, desktop: false } }))
    const { featureEnabled } = await import('./config')
    expect(desktop.isDesktop()).toBe(true)
    expect(featureEnabled('desktop')).toBe(true)
    expect(featureEnabled('systemBrowserAuth')).toBe(false)
  })

  it('ignores a bridge that carries no invoke', async () => {
    const desktop = await boot(shell({ bridge: { version: 1 } }))
    expect(desktop.isDesktop()).toBe(true)
    expect(desktop.desktopBridge()).toBeNull()
  })

  it('sends the sign-in url to the system browser', async () => {
    const invoke = vi.fn(async () => null)
    await boot(shell({ bridge: { invoke, version: 1 } }))
    const { beginAuthRedirect } = await import('@/composables/useAuth')

    beginAuthRedirect(AUTH_URL)
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledWith('open_external', { url: AUTH_URL })
    expect(assign).not.toHaveBeenCalled()
  })

  it('navigates this window when the shell injects no bridge', async () => {
    // Better a webview login than a dead sign-in button.
    await boot(shell())
    const { beginAuthRedirect } = await import('@/composables/useAuth')
    beginAuthRedirect(AUTH_URL)
    expect(assign).toHaveBeenCalledWith(AUTH_URL)
  })
})
