import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, moduleDefault, mountApp } from '@/test/clientRender'

const LOCAL = 'http://127.0.0.1:34116/api/v1'
const REALM = 'https://aruna.example/api/v1'

type Status = Record<string, unknown>

// What the dashboard reads to tell a session apart: no token at all, a token
// still being checked, and a token the realm accepted.
interface Session {
  token?: string
  bootstrapped?: boolean
  user?: boolean
  // The realm answered 401/403, as opposed to not answering at all.
  rejected?: boolean
}

const Blank = defineComponent(() => () => h('div'))

const setApiBaseUrl = vi.fn()
const setAuthToken = vi.fn()
const refresh = vi.fn(async () => undefined)
const authToken = ref('token')
const bootstrapped = ref(true)
const currentUser = ref<{ id: string } | null>({ id: 'u1' })
const authRejected = ref(false)
const restoring = ref(false)
const useAruna = vi.fn(() => ({
  authToken,
  authRejected,
  bootstrapped,
  currentUser,
  setApiBaseUrl,
  setAuthToken,
  refresh,
}))

function store(): Storage {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  } as unknown as Storage
}

// Shared across module graphs, so a second realm sees what the first stored.
let storage = store()

// What the shell pushes at the window, by event name.
const listeners = new Map<string, (message: { payload: unknown }) => void>()

// The desktop context and the runtime config are both read once per module
// graph, so every case builds a graph of its own.
async function load(status: Status | null | 'stall', apiBaseUrl = LOCAL, realmUrl?: string, session: Session = {}) {
  vi.resetModules()
  const invoke = vi.fn(async (command: string) => {
    if (command !== 'node_status' || !status) throw new Error('unknown command: node_status')
    if (status === 'stall') return new Promise<never>(() => {})
    return status
  })
  vi.stubGlobal('window', {
    __ARUNA_DESKTOP__: { apiBaseUrl, realmUrl, bridge: { invoke, version: 1 } },
    localStorage: storage,
  })
  authToken.value = session.token ?? 'token'
  bootstrapped.value = session.bootstrapped ?? true
  currentUser.value = session.user === false ? null : { id: 'u1' }
  authRejected.value = session.rejected === true
  restoring.value = false
  listeners.clear()
  vi.doMock('@tauri-apps/api/event', () => ({
    listen: async (event: string, handler: (message: { payload: unknown }) => void) => {
      listeners.set(event, handler)
      return () => listeners.delete(event)
    },
  }))
  vi.doMock('@/composables/useAruna', () => ({
    useAruna,
  }))
  vi.doMock('@/composables/aruna/state', () => ({ restoring }))
  const config = await import('./config')
  config.applyPortalConfig({ apiBaseUrl })
  return await import('./desktopWelcome')
}

function blankRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/welcome', name: 'welcome', component: Blank },
      { path: '/welcome/sign-in', name: 'welcome-sign-in', component: Blank },
      { path: '/welcome/device', name: 'welcome-device', component: Blank },
      { path: '/app', name: 'dashboard', component: Blank },
      { path: '/app/device', name: 'device', component: Blank },
      { path: '/auth/callback', name: 'auth-callback', component: Blank },
      { path: '/app/settings', name: 'settings', component: Blank },
    ],
  })
}

async function routerWith(welcome: typeof import('./desktopWelcome'), start = '/app'): Promise<Router> {
  const router = blankRouter()
  welcome.installDesktopGuard(router)
  await router.push(start)
  await router.isReady()
  return router
}

// Lets pending guard work settle without advancing the clock.
async function turns(count = 20): Promise<void> {
  for (let i = 0; i < count; i++) await Promise.resolve()
}

// A context change re-runs the navigation through dynamic imports, so the wait
// is for where it lands rather than for a number of turns.
function lands(router: Router, name: string) {
  return vi.waitFor(() => expect(router.currentRoute.value.name).toBe(name))
}

// The listener installs itself through a dynamic import, so the push waits.
async function emit(event: string, payload: unknown): Promise<void> {
  await vi.waitFor(() => expect(listeners.has(event)).toBe(true))
  listeners.get(event)?.({ payload })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  storage = store()
})

// Drives the boot probe of this module graph against a realm that never answers.
async function killRealm(): Promise<void> {
  const boot = await import('./desktopBoot')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }),
  )
  const probe = boot.probeRealm()
  await vi.advanceTimersByTimeAsync(4_000)
  await probe
}

describe('realm knowledge', () => {
  it('reads an unenrolled local node as first run', async () => {
    const welcome = await load({ state: 'running', enrolled: false, apiBaseUrl: LOCAL })
    await expect(welcome.realmKnown()).resolves.toBe(false)
  })

  it('takes an enrolled node and a named realm as known', async () => {
    const enrolled = await load({ state: 'running', enrolled: true, apiBaseUrl: LOCAL })
    await expect(enrolled.realmKnown()).resolves.toBe(true)

    const remote = await load(
      { state: 'stopped', enrolled: false, apiBaseUrl: null },
      REALM,
      'https://aruna.example',
    )
    await expect(remote.realmKnown()).resolves.toBe(true)
  })

  it('trusts a loopback realm', async () => {
    // A realm on 127.0.0.1 is still a realm; only the shell's memory decides.
    const welcome = await load(
      { state: 'stopped', enrolled: false, apiBaseUrl: null },
      'http://127.0.0.1:43021/api/v1',
      'http://127.0.0.1:43025',
    )
    await expect(welcome.realmKnown()).resolves.toBe(true)
  })

  it('answers known when the shell cannot say', async () => {
    const welcome = await load(null)
    await expect(welcome.realmKnown()).resolves.toBe(true)
  })

  it('gives up on a shell that never answers', async () => {
    // A hanging command must not hold navigation for the rest of the run.
    vi.useFakeTimers()
    const welcome = await load('stall')
    const known = welcome.realmKnown()
    await vi.advanceTimersByTimeAsync(6_000)
    await expect(known).resolves.toBe(true)
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

  it('holds the sign in step until a realm is known', async () => {
    const welcome = await load({ state: 'running', enrolled: false, apiBaseUrl: LOCAL })
    const router = await routerWith(welcome)

    await router.push({ name: 'welcome-sign-in' })
    expect(router.currentRoute.value.name).toBe('welcome')
    await router.push({ name: 'welcome-device' })
    expect(router.currentRoute.value.name).toBe('welcome')
  })

  it('leaves the welcome view once a realm answers', async () => {
    const welcome = await load({ state: 'stopped', enrolled: true, apiBaseUrl: null }, REALM)
    const router = await routerWith(welcome, '/app/settings')

    await router.push({ name: 'welcome' })
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('opens the welcome view for a dead realm', async () => {
    // The realm is remembered, so only its failed boot may reopen the form.
    vi.useFakeTimers()
    const welcome = await load({ state: 'stopped', enrolled: true, apiBaseUrl: null }, REALM)
    await killRealm()
    const router = await routerWith(welcome, '/app')

    await router.push({ name: 'welcome' })
    expect(router.currentRoute.value.name).toBe('welcome')
  })

  it('follows a realm the shell reports later', async () => {
    // Nothing reopens the window, so a context alone must move the first run on.
    const welcome = await load({ state: 'running', enrolled: false, apiBaseUrl: LOCAL }, LOCAL, undefined, {
      token: '',
    })
    const router = await routerWith(welcome, '/welcome')
    expect(router.currentRoute.value.name).toBe('welcome')

    const desktop = await import('./desktop')
    await desktop.applyShellContext({ apiBaseUrl: LOCAL, realmUrl: 'https://aruna.example' })

    await lands(router, 'welcome-sign-in')
  })

  it('asks for the device again after a wipe', async () => {
    // A wipe destroys the local identity, not the realm: the window moves back
    // to the realm's own base and the setup step comes back with it.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    const status = { state: 'running', enrolled: true, apiBaseUrl: LOCAL }
    const welcome = await load(status, LOCAL, 'https://aruna.example')
    const router = await routerWith(welcome, '/app/settings')
    expect(router.currentRoute.value.name).toBe('settings')

    status.enrolled = false
    const desktop = await import('./desktop')
    await desktop.applyShellContext({ apiBaseUrl: REALM, realmUrl: 'https://aruna.example' })

    await lands(router, 'welcome-device')
    expect(setApiBaseUrl).toHaveBeenCalledWith(REALM, { keepToken: true })
  })

  it('keeps the navigation on its way through a context change', async () => {
    // The shell switches context while a deep link is still resolving; the
    // link must land, query and all, rather than the window standing still.
    const welcome = await load({ state: 'running', enrolled: true, apiBaseUrl: LOCAL }, LOCAL, 'https://aruna.example')
    const router = await routerWith(welcome, '/app')

    bootstrapped.value = false
    const trip = router.push('/app/device?tab=enroll')
    await turns()

    const desktop = await import('./desktop')
    await desktop.applyShellContext({
      apiBaseUrl: LOCAL,
      realmUrl: 'https://aruna.example',
      features: { compute: true },
    })
    bootstrapped.value = true
    await trip

    await lands(router, 'device')
    expect(router.currentRoute.value.query.tab).toBe('enroll')
  })

  it('keeps the first navigation on its way', async () => {
    // At boot nothing has landed yet, so the only target is the one in flight.
    const welcome = await load({ state: 'running', enrolled: true, apiBaseUrl: LOCAL }, LOCAL, 'https://aruna.example')
    const router = blankRouter()
    welcome.installDesktopGuard(router)

    bootstrapped.value = false
    const trip = router.push('/app/device?tab=enroll')
    await turns()

    const desktop = await import('./desktop')
    await desktop.applyShellContext({
      apiBaseUrl: LOCAL,
      realmUrl: 'https://aruna.example',
      features: { compute: true },
    })
    bootstrapped.value = true
    await trip

    await lands(router, 'device')
    expect(router.currentRoute.value.query.tab).toBe('enroll')
  })

  it('routes a deep link the shell followed', async () => {
    const welcome = await load({ state: 'running', enrolled: true, apiBaseUrl: LOCAL }, LOCAL, 'https://aruna.example')
    const router = await routerWith(welcome, '/app')

    await emit('navigate', { path: '/app/device?tab=enroll' })

    await lands(router, 'device')
    expect(router.currentRoute.value.query.tab).toBe('enroll')
  })

  it('refuses a destination outside this window', async () => {
    // Nothing the shell pushes may send the window at a foreign origin.
    const welcome = await load({ state: 'running', enrolled: true, apiBaseUrl: LOCAL }, LOCAL, 'https://aruna.example')
    const router = await routerWith(welcome, '/app')

    await emit('navigate', { path: 'https://evil.test/app/device' })
    await turns()

    expect(router.currentRoute.value.name).toBe('dashboard')
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

describe('sign in gate', () => {
  it('sends a signed out owner to the sign in step', async () => {
    const welcome = await load({ state: 'stopped', enrolled: true, apiBaseUrl: null }, REALM, undefined, {
      token: '',
    })
    const router = await routerWith(welcome)
    expect(router.currentRoute.value.name).toBe('welcome-sign-in')

    // No guest surface in the shell: the app pages stay closed.
    await router.push({ name: 'settings' })
    expect(router.currentRoute.value.name).toBe('welcome-sign-in')
    await router.push({ name: 'device' })
    expect(router.currentRoute.value.name).toBe('welcome-sign-in')
  })

  it('keeps the realm form and the callback reachable', async () => {
    // Landing on /welcome with a realm on record must show sign-in, not the form.
    const welcome = await load({ state: 'stopped', enrolled: true, apiBaseUrl: null }, REALM, undefined, {
      token: '',
    })
    const router = await routerWith(welcome)

    await router.push({ name: 'welcome' })
    expect(router.currentRoute.value.name).toBe('welcome-sign-in')
    await router.push({ name: 'welcome', query: { change: '1' } })
    expect(router.currentRoute.value.name).toBe('welcome')
    await router.push({ name: 'auth-callback' })
    expect(router.currentRoute.value.name).toBe('auth-callback')
  })

  it('reads a refused token as signed out', async () => {
    const welcome = await load({ state: 'stopped', enrolled: true, apiBaseUrl: null }, REALM, undefined, {
      user: false,
      rejected: true,
    })
    const router = await routerWith(welcome)
    expect(router.currentRoute.value.name).toBe('welcome-sign-in')
  })

  it('keeps a session the realm never answered for', async () => {
    // A base that is not answering yet is no refusal, and must never sign the
    // owner out; the realm probe is what names a base that is not there.
    const welcome = await load(
      { state: 'running', enrolled: true, apiBaseUrl: LOCAL },
      REALM,
      'https://aruna.example',
      { user: false },
    )
    const router = await routerWith(welcome, '/app/settings')

    expect(router.currentRoute.value.name).toBe('settings')
  })

  it('waits out a restoring session', async () => {
    // A stored token that has not been checked must never flash the sign-in page.
    const welcome = await load({ state: 'stopped', enrolled: true, apiBaseUrl: null }, REALM, undefined, {
      bootstrapped: false,
    })
    const router = blankRouter()
    welcome.installDesktopGuard(router)

    let arrived = false
    const trip = router.push('/app/settings').then(() => void (arrived = true))
    await turns()
    expect(arrived).toBe(false)

    bootstrapped.value = true
    await trip
    expect(router.currentRoute.value.name).toBe('settings')
  })
})

describe('session carried to a new base', () => {
  it('keeps the owner signed in while the device node restores the session', async () => {
    const welcome = await load({ state: 'running', enrolled: true, apiBaseUrl: LOCAL }, REALM, 'https://aruna.example')
    const router = await routerWith(welcome, '/app/settings')
    // Like the session: the switch empties the token until the device named the realm.
    setApiBaseUrl.mockImplementationOnce(() => {
      authToken.value = ''
      bootstrapped.value = false
    })
    let release = () => {}
    refresh.mockImplementationOnce(() => {
      restoring.value = true
      return new Promise<undefined>((done) => {
        release = () => {
          authToken.value = 'token'
          restoring.value = false
          bootstrapped.value = true
          done(undefined)
        }
      })
    })

    const landed: string[] = []
    router.afterEach((to) => void landed.push(String(to.name)))
    const reads = useAruna.mock.calls.length

    const desktop = await import('./desktop')
    await desktop.applyShellContext({ apiBaseUrl: LOCAL, realmUrl: 'https://aruna.example' })
    // The switch reads the session once and the guard once more, before the restore ends.
    await vi.waitFor(() => expect(useAruna.mock.calls.length).toBeGreaterThanOrEqual(reads + 2))
    release()

    await vi.waitFor(() => expect(landed).not.toHaveLength(0))
    expect(landed).toEqual(['settings'])
  })

  it('keeps a stored session that is still restoring at start', async () => {
    // At start the token stays empty until the realm named itself, as on a base switch.
    const welcome = await load({ state: 'running', enrolled: true, apiBaseUrl: LOCAL }, REALM, 'https://aruna.example', {
      token: '',
      bootstrapped: false,
    })
    restoring.value = true
    let release = () => {}
    refresh.mockImplementationOnce(
      () =>
        new Promise<undefined>((done) => {
          release = () => {
            authToken.value = 'token'
            restoring.value = false
            bootstrapped.value = true
            done(undefined)
          }
        }),
    )
    const router = blankRouter()
    welcome.installDesktopGuard(router)
    const landed: string[] = []
    router.afterEach((to) => void landed.push(String(to.name)))
    const reads = useAruna.mock.calls.length

    const trip = router.push('/app/settings')
    await vi.waitFor(() => expect(useAruna.mock.calls.length).toBeGreaterThan(reads))
    release()
    await trip

    expect(landed).toEqual(['settings'])
  })

  // A restore that outlasts the guard's wait, after the window entered settings.
  async function outlastWait() {
    vi.useFakeTimers()
    const welcome = await load({ state: 'running', enrolled: true, apiBaseUrl: LOCAL }, REALM, 'https://aruna.example', {
      token: '',
      bootstrapped: false,
      user: false,
    })
    restoring.value = true
    refresh.mockImplementationOnce(() => new Promise<undefined>(() => {}))
    const router = blankRouter()
    welcome.installDesktopGuard(router)
    const landed: string[] = []
    router.afterEach((to) => void landed.push(String(to.name)))
    const reads = useAruna.mock.calls.length

    void router.push('/app/settings')
    await vi.waitFor(() => expect(useAruna.mock.calls.length).toBeGreaterThan(reads))
    await vi.advanceTimersByTimeAsync(10_000)

    await vi.waitFor(() => expect(landed).not.toHaveLength(0))
    return { router, landed }
  }

  it('never signs out a restore that outlasts the wait', async () => {
    const { landed } = await outlastWait()
    expect(landed).toEqual(['settings'])
  })

  it('signs out a slow restore the realm refused later', async () => {
    const { router, landed } = await outlastWait()
    // Like the session: a 401 cleared the restored token and left `restoring` set.
    bootstrapped.value = true

    await lands(router, 'welcome-sign-in')
    expect(landed).toEqual(['settings', 'welcome-sign-in'])
  })

  it('keeps a slow restore that succeeds later', async () => {
    const { router, landed } = await outlastWait()
    const replace = vi.spyOn(router, 'replace')
    authToken.value = 'token'
    restoring.value = false
    bootstrapped.value = true
    await turns()

    expect(replace).not.toHaveBeenCalled()
    expect(landed).toEqual(['settings'])
  })

  it('signs out a stored session the realm refused at start', async () => {
    const welcome = await load({ state: 'running', enrolled: true, apiBaseUrl: LOCAL }, REALM, 'https://aruna.example', {
      token: '',
      bootstrapped: false,
    })
    restoring.value = true
    let release = () => {}
    refresh.mockImplementationOnce(
      () =>
        new Promise<undefined>((done) => {
          // Like the session: a 401 cleared the restored token and left `restoring` set.
          release = () => {
            authToken.value = ''
            bootstrapped.value = true
            done(undefined)
          }
        }),
    )
    const router = blankRouter()
    welcome.installDesktopGuard(router)
    const landed: string[] = []
    router.afterEach((to) => void landed.push(String(to.name)))
    const reads = useAruna.mock.calls.length

    const trip = router.push('/app/settings')
    await vi.waitFor(() => expect(useAruna.mock.calls.length).toBeGreaterThan(reads))
    release()
    await trip

    expect(landed).toEqual(['welcome-sign-in'])
  })
})

describe('device setup gate', () => {
  it('prompts an unenrolled device once signed in', async () => {
    const welcome = await load(
      { state: 'running', enrolled: false, apiBaseUrl: LOCAL },
      REALM,
      'https://aruna.example',
    )
    const router = await routerWith(welcome)
    expect(router.currentRoute.value.name).toBe('welcome-device')

    // The device page enrolls from a pasted code, so it stays open.
    await router.push({ name: 'device' })
    expect(router.currentRoute.value.name).toBe('device')
  })

  it('opens the dashboard for an enrolled device', async () => {
    const welcome = await load(
      { state: 'running', enrolled: true, apiBaseUrl: LOCAL },
      REALM,
      'https://aruna.example',
    )
    const router = await routerWith(welcome, '/app/settings')

    await router.push({ name: 'welcome-device' })
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('opens the realm form for a signed in owner who asks to change', async () => {
    const welcome = await load(
      { state: 'running', enrolled: true, apiBaseUrl: LOCAL },
      REALM,
      'https://aruna.example',
    )
    const router = await routerWith(welcome, '/app/settings')

    // Only the explicit request reopens the form; the device stays enrolled.
    await router.push({ name: 'welcome' })
    expect(router.currentRoute.value.name).toBe('dashboard')
    await router.push({ name: 'welcome', query: { change: '1' } })
    expect(router.currentRoute.value.name).toBe('welcome')
    expect(await welcome.deviceEnrolled()).toBe(true)
  })

  it.each([true, false])('returns a signed in owner Home on cancel (enrolled: %s)', async (enrolled) => {
    const welcome = await load({ state: 'running', enrolled, apiBaseUrl: LOCAL }, REALM, 'https://aruna.example')
    if (!enrolled) welcome.skipSetup()
    const router = await routerWith(welcome, '/app/settings')
    await router.push({ name: 'welcome', query: { change: '1' } })
    const validateRealm = vi.fn()
    const Button = defineComponent({
      inheritAttrs: false,
      setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
    })
    const WelcomeView = compileClientComponent(new URL('../views/WelcomeView.vue', import.meta.url), {
      vue: VueRuntime,
      'vue-router': RouterRuntime,
      '@lucide/vue': new Proxy({}, { get: () => Blank }),
      '@/assets/brand/icon-mark.avif': '/icon-mark.avif',
      '@/components/layout/AppLogo.vue': moduleDefault(Blank),
      '@/components/ui/Button.vue': moduleDefault(Button),
      '@/components/ui/Input.vue': moduleDefault(Blank),
      '@/components/ui/Notice.vue': moduleDefault(Blank),
      '@/lib/utils': { errorMessage: String },
      '@/lib/desktopBridge': { validateRealm },
      '@/lib/desktopBoot': { realmOrigin: () => 'https://aruna.example' },
      '@/lib/desktopWelcome': welcome,
    })
    const mounted = await mountApp(WelcomeView, { router })

    await click(button(mounted.root, 'Cancel'))
    await lands(router, 'dashboard')
    expect(validateRealm).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('asks no more once the prompt was answered', async () => {
    const welcome = await load(
      { state: 'running', enrolled: false, apiBaseUrl: LOCAL },
      REALM,
      'https://aruna.example',
    )
    welcome.skipSetup()
    const router = await routerWith(welcome)
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('opens the app once the device joined', async () => {
    // Enrollment restarts the node and moves this window onto it; the guard
    // must ask the shell again instead of holding the setup step.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    const status = { state: 'running', enrolled: false, apiBaseUrl: LOCAL }
    const welcome = await load(status, REALM, 'https://aruna.example')
    const router = await routerWith(welcome, '/app')
    expect(router.currentRoute.value.name).toBe('welcome-device')

    status.enrolled = true
    const desktop = await import('./desktop')
    await desktop.applyShellContext({ apiBaseUrl: LOCAL, realmUrl: 'https://aruna.example' })

    await lands(router, 'dashboard')
  })

  it('asks again for another realm', async () => {
    // The skip belongs to the realm the device would have joined.
    const first = await load({ state: 'running', enrolled: false, apiBaseUrl: LOCAL }, REALM, 'https://one.example')
    first.skipSetup()
    expect(first.setupSkipped()).toBe(true)

    const second = await load({ state: 'running', enrolled: false, apiBaseUrl: LOCAL }, REALM, 'https://two.example')
    expect(second.setupSkipped()).toBe(false)
    const router = await routerWith(second)
    expect(router.currentRoute.value.name).toBe('welcome-device')
  })
})

describe('awaiting a realm', () => {
  it('answers as soon as the context names it', async () => {
    const welcome = await load(null, LOCAL)
    const desktop = await import('./desktop')
    const arrived = welcome.awaitRealm('https://aruna.example')

    await desktop.applyShellContext({ apiBaseUrl: LOCAL, realmUrl: 'https://aruna.example/' })

    await expect(arrived).resolves.toBe(true)
  })

  it('takes the realm the shell already names', async () => {
    const welcome = await load(null, LOCAL, 'https://aruna.example')
    await expect(welcome.awaitRealm('https://aruna.example')).resolves.toBe(true)
  })

  it('gives up on a shell that never switches', async () => {
    // A stalled shell must leave the form usable rather than hold it open.
    vi.useFakeTimers()
    const welcome = await load(null, LOCAL)
    const arrived = welcome.awaitRealm('https://aruna.example', 5_000)

    await vi.advanceTimersByTimeAsync(5_000)
    await expect(arrived).resolves.toBe(false)
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
