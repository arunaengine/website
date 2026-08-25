import { afterEach, describe, expect, it, vi } from 'vitest'

const LOCAL = 'http://127.0.0.1:47713/api/v1'
const REALM = 'https://aruna.example/api/v1'

type Emit = (payload: unknown) => void

let emit: Emit = () => {}
const unlisten = vi.fn()
const setApiBaseUrl = vi.fn()
const refresh = vi.fn(async () => undefined)
const resetDeviceQueries = vi.fn()
const probeRealm = vi.fn(async () => undefined)
const authToken = { value: 'realm-token' }

// The shell's own answer to `shell_context`, swapped per case.
let held: unknown = null

function listen() {
  return vi.fn(async (_event: string, handler: (message: { payload: unknown }) => void) => {
    emit = (payload: unknown) => handler({ payload })
    return unlisten
  })
}

// The context, the runtime config and the session are module singletons, so
// every case boots a graph of its own around the shell it wants.
async function boot(shell: Record<string, unknown>, channel = listen()) {
  vi.resetModules()
  vi.clearAllMocks()
  authToken.value = 'realm-token'
  const invoke = vi.fn(async (command: string) => {
    if (command !== 'shell_context') throw new Error(`unknown command: ${command}`)
    if (!held) throw new Error('unknown command: shell_context')
    return held
  })
  vi.stubGlobal('window', {
    __ARUNA_DESKTOP__: { bridge: { invoke, version: 3 }, ...shell },
    location: { origin: 'http://127.0.0.1:47713' },
  })
  vi.doMock('@/composables/useAruna', () => ({
    useAruna: () => ({ setApiBaseUrl, refresh, authToken }),
  }))
  vi.doMock('@/composables/useDeviceQuery', () => ({ resetDeviceQueries }))
  vi.doMock('./desktopBoot', () => ({ probeRealm }))
  vi.doMock('@tauri-apps/api/event', () => ({ listen: channel }))
  return { desktop: await import('./desktop'), invoke, channel }
}

// The event handler applies the context through dynamic imports, so the wait
// is for the answer rather than a fixed number of turns.
function applied(base: () => string | undefined, expected: string) {
  return vi.waitFor(() => expect(base()).toBe(expected))
}

afterEach(() => {
  held = null
  vi.unstubAllGlobals()
  vi.doUnmock('@tauri-apps/api/event')
})

describe('applying a context', () => {
  it('switches the api base in place', async () => {
    const { desktop } = await boot({ apiBaseUrl: LOCAL })
    const { portalConfig } = await import('./config')

    await desktop.applyShellContext({
      apiBaseUrl: REALM,
      realmUrl: 'https://aruna.example',
      features: { systemBrowserAuth: false },
    })

    expect(portalConfig().apiBaseUrl).toBe(REALM)
    expect(setApiBaseUrl).toHaveBeenCalledWith(REALM, { keepToken: true })
    expect(resetDeviceQueries).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
    expect(probeRealm).toHaveBeenCalled()
    expect(desktop.desktopContext()?.realmUrl).toBe('https://aruna.example')
  })

  it('keeps the session and the bridge across the switch', async () => {
    // The realm issued the token, and the local node accepts it; the shell
    // hands back no bridge, so the injected one must survive.
    const { desktop } = await boot({ apiBaseUrl: REALM })

    await desktop.applyShellContext({ apiBaseUrl: LOCAL })

    expect(authToken.value).toBe('realm-token')
    expect(desktop.desktopBridge()).not.toBeNull()
  })

  it('takes a new realm without re-bootstrapping', async () => {
    const { desktop } = await boot({ apiBaseUrl: LOCAL })

    await desktop.applyShellContext({ apiBaseUrl: LOCAL, realmUrl: 'https://aruna.example' })

    expect(desktop.desktopContext()?.realmUrl).toBe('https://aruna.example')
    expect(setApiBaseUrl).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('ignores a context that changed nothing', async () => {
    const { desktop } = await boot({ apiBaseUrl: LOCAL, realmUrl: 'https://aruna.example' })
    const before = desktop.shellContext.value

    await desktop.applyShellContext({ apiBaseUrl: LOCAL, realmUrl: 'https://aruna.example' })

    expect(desktop.shellContext.value).toBe(before)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('ignores a malformed context', async () => {
    const { desktop } = await boot({ apiBaseUrl: LOCAL })

    for (const payload of ['switched', 42, [], null]) await desktop.applyShellContext(payload)

    expect(desktop.desktopContext()?.apiBaseUrl).toBe(LOCAL)
  })
})

describe('ordering contexts', () => {
  it('ends on the one the shell reported last', async () => {
    // A blip through another base must not leave the window on it.
    const { desktop } = await boot({ apiBaseUrl: LOCAL, revision: 1 })

    void desktop.applyShellContext({ apiBaseUrl: REALM, revision: 2 })
    void desktop.applyShellContext({ apiBaseUrl: LOCAL, revision: 3 })
    await desktop.applyShellContext({ apiBaseUrl: REALM, revision: 4 })

    expect(desktop.desktopContext()?.apiBaseUrl).toBe(REALM)
    expect(desktop.desktopContext()?.revision).toBe(4)
  })

  it('ignores an answer the shell already replaced', async () => {
    // shell_context can answer with what an event has since superseded.
    const { desktop } = await boot({ apiBaseUrl: LOCAL, revision: 1 })

    await desktop.applyShellContext({ apiBaseUrl: REALM, realmUrl: 'https://aruna.example', revision: 3 })
    await desktop.applyShellContext({ apiBaseUrl: LOCAL, revision: 2 })

    expect(desktop.desktopContext()?.apiBaseUrl).toBe(REALM)
    expect(desktop.desktopContext()?.revision).toBe(3)
  })

  it('re-reports a context without applying it twice', async () => {
    const { desktop } = await boot({ apiBaseUrl: LOCAL, revision: 1 })

    await desktop.applyShellContext({ apiBaseUrl: REALM, revision: 2 })
    await desktop.applyShellContext({ apiBaseUrl: REALM, revision: 3 })

    expect(setApiBaseUrl).toHaveBeenCalledTimes(1)
  })

  it('follows a shell that numbers nothing', async () => {
    // BRIDGE_VERSION 2 sends no revision; what the context says decides.
    const { desktop } = await boot({ apiBaseUrl: LOCAL })

    await desktop.applyShellContext({ apiBaseUrl: REALM })

    expect(desktop.desktopContext()?.apiBaseUrl).toBe(REALM)
  })
})

describe('following the shell', () => {
  it('applies what the event carries and lets go', async () => {
    const { desktop, channel } = await boot({ apiBaseUrl: LOCAL })

    const off = await desktop.followShellContext()
    expect(channel).toHaveBeenCalledWith('context-changed', expect.any(Function))

    emit({ apiBaseUrl: REALM, realmUrl: 'https://aruna.example' })
    await applied(() => desktop.desktopContext()?.apiBaseUrl, REALM)

    off?.()
    expect(unlisten).toHaveBeenCalled()
  })

  it('asks the shell for what it missed', async () => {
    // A context that changed before the listener existed is still followed.
    held = { apiBaseUrl: REALM, realmUrl: 'https://aruna.example' }
    const { desktop, invoke } = await boot({ apiBaseUrl: LOCAL })

    await desktop.followShellContext()

    expect(invoke).toHaveBeenCalledWith('shell_context', undefined)
    expect(desktop.desktopContext()?.apiBaseUrl).toBe(REALM)
  })

  it('degrades when the shell answers no context', async () => {
    // BRIDGE_VERSION 2: the command is missing, and the event still works.
    const { desktop } = await boot({ apiBaseUrl: LOCAL })

    await desktop.followShellContext()
    expect(desktop.desktopContext()?.apiBaseUrl).toBe(LOCAL)

    emit({ apiBaseUrl: REALM })
    await applied(() => desktop.desktopContext()?.apiBaseUrl, REALM)
  })

  it('boots on the context the shell holds now', async () => {
    // The injected object can already be stale, so the app must not mount on it.
    held = { apiBaseUrl: REALM, realmUrl: 'https://aruna.example' }
    const { desktop } = await boot({ apiBaseUrl: LOCAL })
    const { portalConfig } = await import('./config')

    await desktop.bootRuntimeConfig()

    expect(portalConfig().apiBaseUrl).toBe(REALM)
  })

  it('follows nothing outside the shell', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    const desktop = await import('./desktop')

    await expect(desktop.followShellContext()).resolves.toBeNull()
    await desktop.applyShellContext({ apiBaseUrl: REALM })
    expect(desktop.desktopContext()).toBeNull()
  })
})
