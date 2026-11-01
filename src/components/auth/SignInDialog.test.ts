import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import type { SignInOptions } from '@/composables/useAuth'
import { DEFAULT_PORTAL_CONFIG, type LoginOption, type PortalRuntimeConfig } from '@/lib/config'

const signInChoice = ref<SignInOptions | null>(null)
const signIn = vi.fn()
let config: PortalRuntimeConfig = DEFAULT_PORTAL_CONFIG
const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
// The stub shows its content only while open, like the real dialog.
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const dialog = compileClientComponent(new URL('./SignInDialog.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/auth/ProviderLogo.vue': moduleDefault(defineComponent(() => () => null)),
  '@/composables/signInChoice': { signInChoice },
  '@/composables/useAuth': { useAuth: () => ({ signIn }) },
  '@/lib/config': { portalConfig: () => config },
})

function option(name: string, params: Record<string, string> = {}): LoginOption {
  return { name, description: '', logo: '', params, linkParams: {} }
}

async function render() {
  const mounted = await mountApp(defineComponent({ setup: () => () => h(dialog) }))
  await flush()
  return mounted
}

beforeEach(() => {
  signIn.mockReset()
  config = DEFAULT_PORTAL_CONFIG
  signInChoice.value = { redirectTo: '/app/data', onboardingSecret: 's1' }
})

describe('sign-in dialog', () => {
  it('offers the plain realm sign-in without config', async () => {
    const { root, app } = await render()
    const text = content(root)
    expect(text).toContain('Realm account')
    expect(text).toContain('You sign in once with that account to link both.')
    await click(button(root, 'Realm account'))
    expect(signIn).toHaveBeenCalledWith({ redirectTo: '/app/data', onboardingSecret: 's1' })
    app.unmount()
  })

  it('lists the configured logins and signs in with their params', async () => {
    config = {
      ...DEFAULT_PORTAL_CONFIG,
      login: { options: [option('NFDI AAI', { kc_idp_hint: 'iam4nfdi' }), option('Aruna (legacy)')], accountUrl: '' },
    }
    const { root, app } = await render()
    const text = content(root)
    expect(text).not.toContain('Realm account')
    expect(text).toContain('Aruna (legacy)')
    await click(button(root, 'NFDI AAI'))
    expect(signIn).toHaveBeenCalledWith({ redirectTo: '/app/data', onboardingSecret: 's1', params: { kc_idp_hint: 'iam4nfdi' } })
    expect(signInChoice.value).toBeNull()
    app.unmount()
  })
})
