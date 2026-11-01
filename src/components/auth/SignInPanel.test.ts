import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, flush, mountApp } from '@/test/clientRender'

const Stub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent((_, { slots }) => () => h('button', slots.default?.()))

async function render(compact: boolean): Promise<string> {
  const panel = compileClientComponent(new URL('./SignInPanel.vue', import.meta.url), {
    vue: VueRuntime,
    'vue-router': { useRouter: () => ({ push: () => undefined }) },
    '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
    '@/components/federation/RealmPicker.vue': { __esModule: true, default: Stub },
    '@/components/ui/Spinner.vue': { __esModule: true, default: Stub },
    '@/components/ui/Button.vue': { __esModule: true, default: ButtonStub },
    '@/components/ui/Input.vue': { __esModule: true, default: Stub },
    '@/components/ui/Notice.vue': { __esModule: true, default: Stub },
    '@/composables/useFederation': { loginWithRealm: async () => null },
    '@/composables/useAruna': {
      useAruna: () => ({
        realm: computed(() => ({ id: 'realm-id', name: 'Demo realm', description: 'A realm for tests' })),
        realmInfo: ref(null),
      }),
    },
    '@/composables/useAuth': { useAuth: () => ({ signIn: async () => undefined, stage: ref('idle'), stageError: ref(null) }) },
    '@/lib/config': { featureEnabled: () => false },
    '@/assets/brand/icon-mark.avif': { __esModule: true, default: 'icon.avif' },
  })
  const { root, app } = await mountApp(defineComponent({ setup: () => () => h(panel, { compact }) }))
  await flush()
  const text = content(root)
  app.unmount()
  return text
}

describe('sign-in panel', () => {
  it('keeps the realm frame and the first-admin path on the sign-in page', async () => {
    const text = await render(false)
    expect(text).toContain('Demo realm')
    expect(text).toContain('First user on a fresh realm?')
  })

  it('is a slim banner with both sign-in actions on the dashboard', async () => {
    const text = await render(true)
    expect(text).toContain('Sign in')
    expect(text).toContain('Log in with another realm')
    expect(text).not.toContain('Demo realm')
    expect(text).not.toContain('First user on a fresh realm?')
  })
})
