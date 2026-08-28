import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileClientComponent, moduleDefault, mountApp } from '@/test/clientRender'

const stage = ref('idle')
const stageError = ref<string | null>(null)
const completeSignIn = vi.fn(async (_params: URLSearchParams) => '/app')
const signIn = vi.fn()

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
  '@/composables/useAuth': { useAuth: () => ({ completeSignIn, signIn, stage, stageError }) },
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
