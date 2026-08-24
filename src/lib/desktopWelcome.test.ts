import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const LOCAL = 'http://127.0.0.1:34116/api/v1'
const REALM = 'https://aruna.example/api/v1'

type Status = Record<string, unknown>

const Blank = defineComponent(() => () => h('div'))

function store(): Storage {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  } as unknown as Storage
}

// The desktop context and the runtime config are both read once per module
// graph, so every case builds a graph of its own.
async function load(status: Status | null, apiBaseUrl = LOCAL) {
  vi.resetModules()
  const invoke = vi.fn(async (command: string) => {
    if (command !== 'node_status' || !status) throw new Error('unknown command: node_status')
    return status
  })
  vi.stubGlobal('window', {
    __ARUNA_DESKTOP__: { apiBaseUrl, bridge: { invoke, version: 1 } },
    localStorage: store(),
  })
  const config = await import('./config')
  config.applyPortalConfig({ apiBaseUrl })
  return await import('./desktopWelcome')
}

async function routerWith(welcome: typeof import('./desktopWelcome'), start = '/app'): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/welcome', name: 'welcome', component: Blank },
      { path: '/app', name: 'dashboard', component: Blank },
      { path: '/app/device', name: 'device', component: Blank },
      { path: '/auth/callback', name: 'auth-callback', component: Blank },
      { path: '/app/settings', name: 'settings', component: Blank },
    ],
  })
  welcome.installWelcomeGuard(router)
  await router.push(start)
  await router.isReady()
  return router
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('realm knowledge', () => {
  it('reads an unenrolled local node as first run', async () => {
    const welcome = await load({ state: 'running', enrolled: false, apiBaseUrl: LOCAL })
    await expect(welcome.realmKnown()).resolves.toBe(false)
  })

  it('takes an enrolled node and a remote base as known', async () => {
    const enrolled = await load({ state: 'running', enrolled: true, apiBaseUrl: LOCAL })
    await expect(enrolled.realmKnown()).resolves.toBe(true)

    const remote = await load({ state: 'stopped', enrolled: false, apiBaseUrl: null }, REALM)
    await expect(remote.realmKnown()).resolves.toBe(true)
  })

  it('reads a stopped node on loopback as first run', async () => {
    // Nothing to compare the base against, so the loopback address decides.
    const welcome = await load({ state: 'stopped', enrolled: false, apiBaseUrl: null })
    await expect(welcome.realmKnown()).resolves.toBe(false)
  })

  it('answers known when the shell cannot say', async () => {
    const welcome = await load(null)
    await expect(welcome.realmKnown()).resolves.toBe(true)
  })
})

describe('welcome guard', () => {
  it('holds navigation at the welcome view', async () => {
    const welcome = await load({ state: 'running', enrolled: false, apiBaseUrl: LOCAL })
    const router = await routerWith(welcome)
    expect(router.currentRoute.value.name).toBe('welcome')

    await router.push({ name: 'settings' })
    expect(router.currentRoute.value.name).toBe('welcome')
  })

  it('keeps the device and callback routes reachable', async () => {
    // Both are shell landing routes: an enroll link and a sign-in return.
    const welcome = await load({ state: 'running', enrolled: false, apiBaseUrl: LOCAL })
    const router = await routerWith(welcome)

    await router.push({ name: 'device' })
    expect(router.currentRoute.value.name).toBe('device')
    await router.push({ name: 'auth-callback' })
    expect(router.currentRoute.value.name).toBe('auth-callback')
  })

  it('leaves the welcome view once a realm answers', async () => {
    // The shell reopens the window on the same path, so /welcome must move on.
    const welcome = await load({ state: 'stopped', enrolled: true, apiBaseUrl: null }, REALM)
    const router = await routerWith(welcome, '/app/settings')
    welcome.setPendingRealm('https://aruna.example')

    await router.push({ name: 'welcome' })
    expect(router.currentRoute.value.name).toBe('dashboard')
    expect(welcome.pendingRealm()).toBeNull()
  })

  it('installs nothing outside the shell', async () => {
    vi.resetModules()
    vi.stubGlobal('window', { localStorage: store() })
    const welcome = await import('./desktopWelcome')
    const router = await routerWith(welcome)

    await router.push({ name: 'settings' })
    expect(router.currentRoute.value.name).toBe('settings')
  })
})

describe('pending realm', () => {
  it('survives until it is cleared', async () => {
    const welcome = await load(null)
    expect(welcome.pendingRealm()).toBeNull()
    welcome.setPendingRealm('https://aruna.example')
    expect(welcome.pendingRealm()).toBe('https://aruna.example')
    welcome.setPendingRealm(null)
    expect(welcome.pendingRealm()).toBeNull()
  })
})

describe('insecure realm', () => {
  it('flags plain http on a remote host', async () => {
    const welcome = await load(null)
    expect(welcome.insecureRealm('http://aruna.example.org')).toBe(true)
    expect(welcome.insecureRealm(' http://aruna.example.org:8080/portal ')).toBe(true)
    expect(welcome.insecureRealm('http://localhost.example.org')).toBe(true)
  })

  it('trusts https and loopback addresses', async () => {
    // Schemeless input is out too: the shell assumes https for it.
    const welcome = await load(null)
    expect(welcome.insecureRealm('https://aruna.example.org')).toBe(false)
    expect(welcome.insecureRealm('aruna.example.org')).toBe(false)
    expect(welcome.insecureRealm('http://localhost:5173')).toBe(false)
    expect(welcome.insecureRealm('http://node.localhost')).toBe(false)
    expect(welcome.insecureRealm('http://127.0.0.1:34116')).toBe(false)
    expect(welcome.insecureRealm('http://[::1]:8080')).toBe(false)
    expect(welcome.insecureRealm('http://')).toBe(false)
  })
})
