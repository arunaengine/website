import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'

const stage = ref('idle')
const stageError = ref<string | null>(null)
const completeSignIn = vi.fn(async (_params: URLSearchParams): Promise<string | null> => '/app')
const signIn = vi.fn()
const requestSignIn = vi.fn()
const joinExistingAccount = vi.fn(async (): Promise<string | null> => '/app')
const createNewAccount = vi.fn(async (): Promise<string | null> => '/app')
const matchBusy = ref(false)
const matchFailure = ref<string | null>(null)
const matchStale = ref(false)

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
  '@/components/ui/Notice.vue': moduleDefault(defineComponent((_, { slots }) => () => h('p', slots.default?.()))),
  '@/components/ui/Spinner.vue': moduleDefault(EmptyStub),
  '@/composables/accountMatch': { createNewAccount, joinExistingAccount, matchBusy, matchFailure, matchStale },
  '@/composables/useAuth': { useAuth: () => ({ completeSignIn, signIn, requestSignIn, stage, stageError }) },
  '@/lib/desktop': { isDesktop: () => true },
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
  matchFailure.value = null
  matchStale.value = false
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

  it('offers the existing account or a new one when the sign-in matches one', async () => {
    completeSignIn.mockImplementationOnce(async () => {
      stage.value = 'match'
      return null
    })
    const router = await routed('/auth/callback?code=first&state=s1')
    const mounted = await mountApp(AuthCallbackView, { router })
    await vi.waitFor(() => expect(content(mounted.root)).toContain('An account with this email or name already exists'))
    expect(router.currentRoute.value.name).toBe('auth-callback')

    joinExistingAccount.mockResolvedValueOnce(null)
    matchFailure.value = 'That sign-in has no account either.'
    await click(button(mounted.root, 'This is me'))
    expect(joinExistingAccount).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('auth-callback')
    expect(content(mounted.root)).toContain('That sign-in has no account either.')

    await click(button(mounted.root, 'Create a new account'))
    expect(createNewAccount).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('dashboard'))
    mounted.app.unmount()
  })

  it('asks for a new sign-in when the matched one got too old', async () => {
    completeSignIn.mockImplementationOnce(async () => {
      stage.value = 'match'
      return null
    })
    matchStale.value = true
    const router = await routed('/auth/callback?code=first&state=s1')
    const mounted = await mountApp(AuthCallbackView, { router })
    await vi.waitFor(() => expect(content(mounted.root)).toContain('Sign in again'))
    expect(() => button(mounted.root, 'This is me')).toThrow()
    await click(button(mounted.root, 'Sign in again'))
    expect(requestSignIn).toHaveBeenCalledWith({ redirectTo: '/app' })
    mounted.app.unmount()
  })
})
