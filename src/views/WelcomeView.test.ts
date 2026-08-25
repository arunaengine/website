import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  input,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'

const ORIGIN = 'https://aruna.example'

const validateRealm = vi.fn(async (_input: string) => ({
  origin: ORIGIN,
  realm: 'R1',
  apiVersion: 'v1',
  portal: true,
}))
const awaitRealm = vi.fn(async (_origin: string) => true)

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, id: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        id: props.id,
        value: props.modelValue,
        onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
      })
  },
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const WelcomeView = compileClientComponent(new URL('./WelcomeView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/components/layout/AppLogo.vue': moduleDefault(EmptyStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/lib/desktopBridge': { validateRealm },
  '@/lib/desktopWelcome': { awaitRealm, insecureRealm: () => false },
})

function routed(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/welcome', name: 'welcome', component: EmptyStub },
      { path: '/welcome/sign-in', name: 'welcome-sign-in', component: EmptyStub },
      { path: '/app/device', name: 'device', component: EmptyStub },
    ],
  })
  return router.push('/welcome').then(() => router.isReady().then(() => router))
}

async function connect(router: Router, address = 'aruna.example') {
  const mounted = await mountApp(WelcomeView, { router })
  await typeValue(input(mounted.root, 'id', 'realm-address'), address)
  await click(button(mounted.root, 'Connect'))
  return mounted
}

beforeEach(() => {
  vi.clearAllMocks()
  awaitRealm.mockResolvedValue(true)
})

describe('connecting to a realm', () => {
  it('moves on once the shell switched', async () => {
    const router = await routed()
    const mounted = await connect(router)

    expect(validateRealm).toHaveBeenCalledWith('aruna.example')
    expect(awaitRealm).toHaveBeenCalledWith(ORIGIN)
    expect(router.currentRoute.value.name).toBe('welcome-sign-in')
    mounted.app.unmount()
  })

  it('keeps the form when the shell never switches', async () => {
    // Nothing reopens this window, so a stalled shell leaves the form usable.
    awaitRealm.mockResolvedValue(false)
    const router = await routed()
    const mounted = await connect(router)

    expect(router.currentRoute.value.name).toBe('welcome')
    expect(content(mounted.root)).toContain('has not switched to it')
    mounted.app.unmount()
  })

  it('names the refusal the shell answered with', async () => {
    validateRealm.mockRejectedValue(new Error('That address serves no Aruna realm.'))
    const router = await routed()
    const mounted = await connect(router)

    expect(router.currentRoute.value.name).toBe('welcome')
    expect(content(mounted.root)).toContain('serves no Aruna realm')
    mounted.app.unmount()
  })
})
