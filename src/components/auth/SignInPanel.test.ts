import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, mountApp } from '@/test/clientRender'

const Stub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const requestSignIn = vi.fn()

async function mount(compact: boolean) {
  const panel = compileClientComponent(new URL('./SignInPanel.vue', import.meta.url), {
    vue: VueRuntime,
    '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
    '@/components/ui/Button.vue': { __esModule: true, default: ButtonStub },
    '@/components/ui/Input.vue': { __esModule: true, default: Stub },
    '@/components/ui/Notice.vue': { __esModule: true, default: Stub },
    '@/composables/useAruna': {
      useAruna: () => ({
        realm: computed(() => ({ id: 'realm-id', name: 'Demo realm', description: 'A realm for tests' })),
        realmInfo: ref(null),
      }),
    },
    '@/composables/useAuth': { useAuth: () => ({ requestSignIn, stage: ref('idle'), stageError: ref(null) }) },
    '@/lib/config': { featureEnabled: () => false },
    '@/assets/brand/icon-mark.avif': { __esModule: true, default: 'icon.avif' },
  })
  const mounted = await mountApp(defineComponent({ setup: () => () => h(panel, { compact }) }))
  await flush()
  return mounted
}

async function render(compact: boolean): Promise<string> {
  const { root, app } = await mount(compact)
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

  it.each([false, true])('leaves logins with another realm to the chooser (compact %s)', async (compact) => {
    expect(await render(compact)).not.toContain('another realm')
  })

  it('is a slim banner with the sign-in action on the dashboard', async () => {
    const text = await render(true)
    expect(text).toContain('Sign in')
    expect(text).not.toContain('Demo realm')
    expect(text).not.toContain('First user on a fresh realm?')
  })

  it.each([false, true])('opens the login chooser from the sign-in button (compact %s)', async (compact) => {
    requestSignIn.mockReset()
    const { root, app } = await mount(compact)
    await click(button(root, 'Sign in'))
    expect(requestSignIn).toHaveBeenCalledWith({ onboardingSecret: '', redirectTo: '/app' })
    app.unmount()
  })
})
