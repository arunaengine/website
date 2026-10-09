import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

const createLoginHandoff = vi.fn()
const Empty = defineComponent(() => () => null)
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Passthrough = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const LoginConsent = defineComponent({
  props: { busy: Boolean },
  emits: ['allow', 'cancel'],
  setup: (_, { emit }) => () => h('button', { onClick: () => emit('allow') }, 'Allow'),
})

class FakeLink {
  hasOpener = true
  active = true
  onEnd: ((error: Error) => void) | null = null
  reply = vi.fn()
  announce = () => undefined
  lock = () => undefined
  dispose = () => undefined
  next = vi.fn().mockResolvedValueOnce({ id: 1, origin: 'https://s.example', body: {} }).mockReturnValue(new Promise(() => undefined))
}
let fake = new FakeLink()

const user = { id: 'u@HOME', name: 'Una' }
const View = compileClientComponent(new URL('./FederationPopupView.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/federation/LoginConsent.vue': moduleDefault(LoginConsent),
  '@/components/federation/ExportChoice.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    useAruna: () => ({
      currentUser: ref(user),
      realm: ref({ id: 'HOME', name: 'Home', color: '#336699' }),
      setAuthToken: vi.fn(),
      refresh: async () => undefined,
      bootstrapped: ref(true),
      sessionEpoch: ref(1),
      apiBaseUrl: ref('/api/v1'),
      authToken: ref('T'),
    }),
  },
  '@/composables/aruna/state': { currentTokenKey: () => 'token' },
  '@/lib/api': {
    ApiError: class extends Error {},
    apiErrorMessage: (error: Error) => error.message,
    createLoginHandoff,
    getRealmDescriptor: async () => {
      throw new Error('none')
    },
  },
  '@/lib/federation/descriptor': { realmIdText: (id: string) => id },
  '@/lib/federation/handshake': { OpenerLink: function () { return fake } },
  '@/lib/federation/popup': {
    IMPORT_TIMEOUT_MS: 1,
    RequestError: class extends Error {},
    acceptOpener: async () => ({
      realm: { realmId: 'SERVING', name: 'Archive', portalUrl: 'https://s.example/' },
      body: { kind: 'login', descriptor: {}, nonce: 'n' },
    }),
  },
  '@/composables/useSourceExport': {
    ExportStop: class extends Error {},
    SESSION_CHANGED: 'The login here changed. Start again.',
    exportFailure: (error: Error) => error.message,
    exportForIntent: vi.fn(),
    serveFollowUps: vi.fn(),
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  fake = new FakeLink()
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(), open: vi.fn() })
})
afterEach(() => vi.unstubAllGlobals())

describe('FederationPopupView', () => {
  it('replaces the consent controls with the reason once the opener link ended', async () => {
    const mounted = await mountApp(View)
    await flush()
    expect(button(mounted.root, 'Allow')).toBeTruthy()
    fake.onEnd?.(new Error('The other window was closed.'))
    await flush()
    expect(content(mounted.root)).toContain('The other window was closed.')
    expect(() => button(mounted.root, 'Allow')).toThrow()
    mounted.app.unmount()
  })

  it('creates no login handoff when the link ended before the click', async () => {
    const mounted = await mountApp(View)
    await flush()
    fake.active = false
    await click(button(mounted.root, 'Allow'))
    expect(createLoginHandoff).not.toHaveBeenCalled()
    expect(fake.reply).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('The other window was closed.')
    mounted.app.unmount()
  })
})
