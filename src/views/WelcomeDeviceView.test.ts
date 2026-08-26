import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const LOCAL = 'http://127.0.0.1:34116/api/v1'
const REALM = 'https://aruna.example'

// What the shell says about the node this machine runs; mutated per case.
const status = { state: 'running', enrolled: false, apiBaseUrl: LOCAL }
const nodeStatus = vi.fn(async () => status)
// What the realm node says it is; null until a realm token asked.
const nodeInfo = ref<{ node: { capabilities: string } } | null>(null)

vi.mock('@/lib/desktopBridge', () => ({ nodeStatus }))
vi.mock('@/composables/useAruna', () => ({
  useAruna: () => ({
    authToken: ref('token'),
    authRejected: ref(false),
    bootstrapped: ref(true),
    currentUser: ref({ id: 'u1' }),
    setApiBaseUrl: vi.fn(),
    setAuthToken: vi.fn(),
    refresh: vi.fn(async () => undefined),
  }),
}))
vi.mock('@/lib/desktopBoot', () => ({ probeRealm: vi.fn(), realmUnreachable: () => false }))

// The real composable answers the prompt for this realm before it leaves, so
// the stub does too: the guard reads that answer.
let welcome: typeof import('@/lib/desktopWelcome') | null = null

const setup = {
  applying: ref(false),
  error: ref<string | null>(null),
  watching: ref(false),
  joined: ref(false),
  stages: ref([]),
  state: ref({ lastError: null }),
  apply: vi.fn(async (_label: string) => {
    setup.watching.value = true
  }),
  done: vi.fn(() => {
    welcome?.skipSetup()
    welcome?.clearEnrolled()
  }),
}

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
const ClaimWatchStub = defineComponent((_, { slots }) => () => h('div', ['claim watch', slots.actions?.()]))
const GateStub = defineComponent(() => () => h('div', 'management gate'))
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const WelcomeDeviceView = compileClientComponent(new URL('./WelcomeDeviceView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/components/layout/AppLogo.vue': moduleDefault(EmptyStub),
  '@/components/onboarding/ClaimWatchStep.vue': moduleDefault(ClaimWatchStub),
  '@/components/onboarding/ManagementNodeGate.vue': moduleDefault(GateStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/composables/useAruna': {
    useAruna: () => ({
      realm: ref({ name: 'Test realm' }),
      nodeInfo,
      isManagementNode: computed(() => nodeInfo.value?.node.capabilities === 'management'),
      realmInfo: ref(null),
    }),
  },
  '@/composables/useDeviceSetup': { useDeviceSetup: () => setup },
  '@/lib/onboarding-config': { managementPortals: () => [] },
})

const entries = new Map<string, string>()

// The guard runs over the same routes the shell mounts, so the step is held
// and released by what the shell reports rather than by the view alone.
async function guarded(): Promise<Router> {
  vi.stubGlobal('window', {
    __ARUNA_DESKTOP__: { apiBaseUrl: LOCAL, realmUrl: REALM, bridge: { invoke: vi.fn(), version: 3 } },
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/welcome/device', name: 'welcome-device', component: EmptyStub },
      { path: '/app', name: 'dashboard', component: EmptyStub },
      { path: '/app/device', name: 'device', component: EmptyStub },
    ],
  })
  welcome = await import('@/lib/desktopWelcome')
  welcome.installDesktopGuard(router)
  await router.push('/welcome/device')
  await router.isReady()
  return router
}

function lands(router: Router, name: string) {
  return vi.waitFor(() => expect(router.currentRoute.value.name).toBe(name))
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  entries.clear()
  status.enrolled = false
  nodeInfo.value = null
  setup.watching.value = false
  setup.joined.value = false
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('setting up this device', () => {
  it('applies the name the owner typed', async () => {
    const router = await guarded()
    const mounted = await mountApp(WelcomeDeviceView, { router })

    await typeValue(input(mounted.root, 'id', 'setup-device-name'), ' work-laptop ')
    await click(button(mounted.root, 'Set up this device'))

    expect(setup.apply).toHaveBeenCalledWith('work-laptop')
    expect(content(mounted.root)).toContain('Joining the realm')
    mounted.app.unmount()
  })

  it('keeps watching while the shell switches context', async () => {
    // The node restarts with its new identity and this window moves onto it;
    // the step holds its own watch, with nothing on record to resume from.
    const router = await guarded()
    const mounted = await mountApp(WelcomeDeviceView, { router })
    await click(button(mounted.root, 'Set up this device'))

    const { applyShellContext } = await import('@/lib/desktop')
    await applyShellContext({ apiBaseUrl: LOCAL, realmUrl: REALM, features: { desktop: true } })

    expect(router.currentRoute.value.name).toBe('welcome-device')
    expect(setup.watching.value).toBe(true)
    expect(content(mounted.root)).toContain('Joining the realm')
    mounted.app.unmount()
  })

  it('opens the app once the device joined', async () => {
    const router = await guarded()
    const mounted = await mountApp(WelcomeDeviceView, { router })
    await click(button(mounted.root, 'Set up this device'))

    status.enrolled = true
    setup.joined.value = true

    await lands(router, 'dashboard')
    expect(setup.done).toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('holds a server node at the gate', async () => {
    // Only a management node mints; the step says so instead of letting the
    // owner run into the 403, and the skip stays open.
    nodeInfo.value = { node: { capabilities: 'server' } }
    const router = await guarded()
    const mounted = await mountApp(WelcomeDeviceView, { router })

    const rendered = content(mounted.root)
    expect(rendered).toContain('management gate')
    expect(rendered).not.toContain('Set up this device')
    expect(rendered).toContain('Skip for now')
    mounted.app.unmount()
  })

  it('skips the step without enrolling', async () => {
    status.enrolled = true
    const router = await guarded()
    const mounted = await mountApp(WelcomeDeviceView, { router })

    await click(button(mounted.root, 'Skip for now'))

    expect(setup.apply).not.toHaveBeenCalled()
    await lands(router, 'dashboard')
    mounted.app.unmount()
  })
})
