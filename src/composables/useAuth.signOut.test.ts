import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const DISCOVERY = {
  issuer: 'https://idp.test',
  authorization_endpoint: 'https://idp.test/authorize',
  token_endpoint: 'https://idp.test/token',
  end_session_endpoint: 'https://idp.test/logout',
}

const setAuthToken = vi.fn()
const refresh = vi.fn(async () => undefined)

vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({
    setAuthToken,
    refresh,
    apiBaseUrl: ref('/api/v1'),
    authToken: ref(''),
    bootstrapped: ref(true),
    currentUser: ref(null),
    realmInfo: ref({
      oidc_providers: [{ audience: 'portal', discovery_url: 'https://idp.test/config' }],
    }),
  }),
}))

// The runtime config, the discovery cache and the opener are module singletons,
// so every case builds a graph of its own.
async function load(desktop: boolean) {
  vi.resetModules()
  vi.clearAllMocks()
  const assign = vi.fn()
  const session = new Map<string, string>([['aruna.oidc.idToken', 'id-token']])
  vi.stubGlobal('window', {
    location: { origin: 'http://127.0.0.1:47713', assign },
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => void session.set(key, value),
      removeItem: (key: string) => void session.delete(key),
    },
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(DISCOVERY))))
  const config = await import('@/lib/config')
  config.applyPortalConfig({ features: { desktop, systemBrowserAuth: desktop } })
  return { auth: await import('./useAuth'), assign }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('signing out', () => {
  it('ends the sso session in the system browser', async () => {
    // The shell keeps its own window on the app; only the browser logs out.
    const { auth, assign } = await load(true)
    const opener = vi.fn()
    auth.setAuthOpener(opener)

    await auth.useAuth().signOut()

    expect(setAuthToken).toHaveBeenCalledWith('')
    expect(opener).toHaveBeenCalledWith(expect.stringContaining('https://idp.test/logout'))
    // The shell's own origin is no registered redirect target, so it names none.
    expect(opener).toHaveBeenCalledWith(expect.not.stringContaining('post_logout_redirect_uri'))
    expect(assign).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it('navigates the tab to the provider on the web', async () => {
    const { auth, assign } = await load(false)

    await auth.useAuth().signOut()

    expect(assign).toHaveBeenCalledWith(expect.stringContaining('post_logout_redirect_uri'))
    expect(refresh).not.toHaveBeenCalled()
  })
})
