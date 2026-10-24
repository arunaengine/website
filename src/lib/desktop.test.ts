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

describe('realm website', () => {
  it.each([
    ['the callback origin', { authCallbackOrigin: 'https://v3.test', realmUrl: 'https://api.node.test' }, 'https://v3.test'],
    ['the realm address without one', { realmUrl: 'https://v3.test/app' }, 'https://v3.test'],
    ['the realm address past a custom scheme', { authCallbackOrigin: 'aruna://auth', realmUrl: 'https://v3.test' }, 'https://v3.test'],
    ['nothing without a web address', { authCallbackOrigin: 'tauri://localhost', realmUrl: 'v3.test' }, null],
  ])('names %s', async (_, over, expected) => {
    const desktop = await boot(shell(over))
    expect(desktop.realmWebsite()).toBe(expected)
  })

  it('names nothing on the web', async () => {
    const desktop = await boot()
    expect(desktop.realmWebsite()).toBeNull()
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

  it('flags a shell whose bridge is older than the portal expects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invoke = vi.fn(async () => null)
    const old = await boot(shell({ bridge: { invoke, version: 1 } }))
    const { errors } = (await import('@/composables/useGlobalErrors')).useGlobalErrors()
    expect(old.bridgeOutdated.value).toBe(true)
    expect(warn).toHaveBeenCalledWith('aruna-desktop: outdated app', { have: 1, need: old.BRIDGE_VERSION })
    expect(errors.value.map((entry) => entry.message)).toEqual([
      'This Aruna Desktop is out of date. Please install the latest version.',
    ])

    warn.mockClear()
    const current = await boot(shell({ bridge: { invoke, version: old.BRIDGE_VERSION } }))
    const next = (await import('@/composables/useGlobalErrors')).useGlobalErrors()
    expect(current.bridgeOutdated.value).toBe(false)
    expect(warn).not.toHaveBeenCalled()
    expect(next.errors.value).toEqual([])
    warn.mockRestore()
  })

  it('does not flag a shell newer than the portal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const newer = await boot(shell({ bridge: { invoke: vi.fn(async () => null), version: 7 } }))
    const { errors } = (await import('@/composables/useGlobalErrors')).useGlobalErrors()

    expect(newer.bridgeOutdated.value).toBe(false)
    expect(errors.value).toEqual([])
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
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

  it('sends the sign-in url to the login window', async () => {
    // A shell that offers embedded sign-in gets the URL for its own window.
    const invoke = vi.fn(async () => null)
    await boot(shell({ bridge: { invoke, version: 4 }, features: { embeddedAuth: true, systemBrowserAuth: false } }))
    const { beginAuthRedirect } = await import('@/composables/useAuth')

    beginAuthRedirect(AUTH_URL)
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledWith('auth_open', { url: AUTH_URL })
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
