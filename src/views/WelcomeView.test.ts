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
  element,
  input,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
} from '@/test/clientRender'

const ORIGIN = 'https://aruna.example'

const validateRealm = vi.fn(async (_input: string) => ({
  origin: ORIGIN,
  realm: 'R1',
  apiVersion: 'v1',
  portal: true,
  redirectedFrom: null as string | null,
}))
const awaitRealm = vi.fn(async (_origin: string) => true)
const deviceEnrolled = vi.fn(async () => false)

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
const NoticeStub = defineComponent({
  props: { title: String, lines: { type: Array, default: () => [] } },
  setup: (props, { slots }) => () =>
    h('div', [props.title ?? '', slots.default?.() ?? [], (props.lines as string[]).join(' ')]),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const WelcomeView = compileClientComponent(new URL('./WelcomeView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/assets/brand/icon-mark.avif': '/icon-mark.avif',
  '@/components/layout/AppLogo.vue': moduleDefault(EmptyStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/lib/utils': { errorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)) },
  '@/lib/desktopBridge': { validateRealm },
  '@/lib/desktopBoot': { realmOrigin: () => ORIGIN },
  '@/lib/desktopWelcome': { awaitRealm, deviceEnrolled, insecureRealm: () => false },
})

function routed(start = '/welcome'): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/welcome', name: 'welcome', component: EmptyStub },
      { path: '/welcome/sign-in', name: 'welcome-sign-in', component: EmptyStub },
      { path: '/app/device', name: 'device', component: EmptyStub },
    ],
  })
  return router.push(start).then(() => router.isReady().then(() => router))
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
  deviceEnrolled.mockResolvedValue(false)
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

  it('names the address the shell followed', async () => {
    // A typed node address is followed to a management node; the sign-in
    // step is told which address the owner actually typed.
    validateRealm.mockResolvedValueOnce({
      origin: ORIGIN,
      realm: 'R1',
      apiVersion: 'v1',
      portal: false,
      redirectedFrom: 'https://server.example',
    })
    const router = await routed()
    const mounted = await connect(router)

    expect(router.currentRoute.value.name).toBe('welcome-sign-in')
    expect(router.currentRoute.value.query.from).toBe('https://server.example')
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

describe('changing realms', () => {
  it('asks an enrolled computer to leave its realm first', async () => {
    // The shell refuses another realm for an enrolled computer, so no form is offered.
    deviceEnrolled.mockResolvedValue(true)
    const router = await routed('/welcome?change=1')
    const mounted = await mountApp(WelcomeView, { router })

    expect(content(mounted.root)).toContain(`This computer belongs to ${ORIGIN}.`)
    const remove = element(mounted.root, (node) => node.tag === 'a' && content(node) === 'Remove this computer')
    expect(remove.props.href).toBe('/app/device#wipe')
    expect(nodes(mounted.root).some((node) => node.tag === 'input')).toBe(false)
    expect(content(mounted.root)).not.toContain('Connect')
    expect(validateRealm).not.toHaveBeenCalled()
    mounted.app.unmount()
  })
})
