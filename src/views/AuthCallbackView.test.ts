import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, moduleDefault, mountApp } from '@/test/clientRender'

const stage = ref('idle')
const stageError = ref<string | null>(null)
const completeSignIn = vi.fn(async (_params: URLSearchParams) => '/app')
const signIn = vi.fn()
let desktop = true

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const AuthCallbackView = compileClientComponent(new URL('./AuthCallbackView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/components/layout/AppLogo.vue': moduleDefault(EmptyStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/composables/useAuth': {
    DESKTOP_CALLBACK_URI: 'aruna://auth/callback',
    DESKTOP_STATE_PREFIX: 'desktop.',
    useAuth: () => ({ completeSignIn, signIn, stage, stageError }),
  },
  '@/lib/desktop': { isDesktop: () => desktop },
})

async function routed(start: string): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auth/callback', name: 'auth-callback', component: EmptyStub },
      { path: '/app', name: 'dashboard', component: EmptyStub },
      { path: '/welcome', name: 'welcome', component: EmptyStub },
    ],
  })
  await router.push(start)
  await router.isReady()
  return router
}

function codes(): string[] {
  return completeSignIn.mock.calls.map(([params]) => params.get('code') ?? '')
}

beforeEach(() => {
  vi.clearAllMocks()
  stage.value = 'idle'
  stageError.value = null
  desktop = true
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('completing a sign in', () => {
  it('exchanges the code the route carries', async () => {
    const router = await routed('/auth/callback?code=first&state=s1')
    const mounted = await mountApp(AuthCallbackView, { router })

    expect(codes()).toEqual(['first'])
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('dashboard'))
    mounted.app.unmount()
  })

  it('exchanges a second return on the same route', async () => {
    // The shell routes the next callback into this window instead of reloading
    // it, so the view is reused and must not sit on the spent code.
    completeSignIn.mockRejectedValueOnce(new Error('Sign-in was rejected.'))
    const router = await routed('/auth/callback?code=first&state=s1')
    const mounted = await mountApp(AuthCallbackView, { router })
    stage.value = 'error'
    stageError.value = 'Sign-in was rejected.'

    await router.push('/auth/callback?code=second&state=s2')
    await vi.waitFor(() => expect(codes()).toEqual(['first', 'second']))

    expect(stageError.value).toBeNull()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('dashboard'))
    mounted.app.unmount()
  })

  it('exchanges nothing on the way out', async () => {
    const router = await routed('/auth/callback?code=first&state=s1')
    const mounted = await mountApp(AuthCallbackView, { router })
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('dashboard'))

    expect(codes()).toEqual(['first'])
    mounted.app.unmount()
  })
})

describe('a desktop sign in on the realm website', () => {
  // The website is not the window that started the sign-in, so it must not
  // touch the sign-in storage at all.
  function website(search: string, hash = '') {
    desktop = false
    const replace = vi.fn()
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
    vi.stubGlobal('window', { location: { search, hash, replace }, sessionStorage: storage, localStorage: storage })
    return { replace, storage }
  }

  it('hands the exact callback on to the app', async () => {
    const search = '?state=desktop.s1&session_state=x&iss=https%3A%2F%2Fidp.test%2Frealms%2Fv3&code=a.b%2Bc'
    const { replace, storage } = website(search, '#kept')
    const router = await routed(`/auth/callback${search}`)
    const mounted = await mountApp(AuthCallbackView, { router })

    const target = `aruna://auth/callback${search}#kept`
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(target)
    expect(completeSignIn).not.toHaveBeenCalled()
    for (const access of Object.values(storage)) expect(access).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('Continue in Aruna Desktop')
    expect(element(mounted.root, (node) => node.tag === 'a').props.href).toBe(target)
    expect(router.currentRoute.value.name).toBe('auth-callback')
    mounted.app.unmount()
  })

  it('hands a refusal on to the app as well', async () => {
    const search = '?error=access_denied&error_description=User%20cancelled&state=desktop.s1'
    const { replace } = website(search)
    const mounted = await mountApp(AuthCallbackView, { router: await routed(`/auth/callback${search}`) })

    expect(replace).toHaveBeenCalledWith(`aruna://auth/callback${search}`)
    expect(completeSignIn).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('completes an unmarked web sign in', async () => {
    const { replace } = website('?code=first&state=s1')
    const router = await routed('/auth/callback?code=first&state=s1')
    const mounted = await mountApp(AuthCallbackView, { router })

    expect(codes()).toEqual(['first'])
    expect(replace).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('dashboard'))
    mounted.app.unmount()
  })

  it('completes a marked state inside the app', async () => {
    const router = await routed('/auth/callback?code=first&state=desktop.s1')
    const mounted = await mountApp(AuthCallbackView, { router })

    expect(codes()).toEqual(['first'])
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('dashboard'))
    mounted.app.unmount()
  })
})
