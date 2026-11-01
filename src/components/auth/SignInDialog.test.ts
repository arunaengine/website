import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import type { SignInOptions } from '@/composables/useAuth'
import { DEFAULT_PORTAL_CONFIG, type LoginOption, type PortalRuntimeConfig } from '@/lib/config'
import type { VerifiedRealm } from '@/lib/federation/descriptor'

const signInChoice = ref<SignInOptions | null>(null)
const signIn = vi.fn()
const push = vi.fn()
const loginWithRealm = vi.fn()
let config: PortalRuntimeConfig = DEFAULT_PORTAL_CONFIG
const HOME = { realmId: 'home', name: 'Home realm' } as VerifiedRealm
const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
// The stub shows its content only while open, like the real dialog.
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const PickerStub = defineComponent({
  emits: ['pick'],
  setup: (_, { emit }) => () => h('button', { onClick: () => emit('pick', HOME) }, 'Pick home realm'),
})
const dialog = compileClientComponent(new URL('./SignInDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push }) },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(Passthrough),
  '@/components/federation/RealmPicker.vue': moduleDefault(PickerStub),
  '@/components/auth/ProviderLogo.vue': moduleDefault(defineComponent(() => () => null)),
  '@/composables/signInChoice': { signInChoice },
  '@/composables/useAruna': { useAruna: () => ({ realm: ref({ id: 'here', name: 'Demo realm' }) }) },
  '@/composables/useAuth': { useAuth: () => ({ signIn }) },
  '@/composables/useFederation': { loginWithRealm },
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
  push.mockReset()
  loginWithRealm.mockReset()
  config = DEFAULT_PORTAL_CONFIG
  signInChoice.value = { redirectTo: '/app/data', onboardingSecret: 's1' }
})

describe('sign-in dialog', () => {
  it('offers the plain realm sign-in and another realm without config', async () => {
    const { root, app } = await render()
    const text = content(root)
    expect(text).toContain('Realm account')
    expect(text).toContain('Another Aruna realm')
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
    expect(text.indexOf('Aruna (legacy)')).toBeLessThan(text.indexOf('Another Aruna realm'))
    await click(button(root, 'NFDI AAI'))
    expect(signIn).toHaveBeenCalledWith({ redirectTo: '/app/data', onboardingSecret: 's1', params: { kc_idp_hint: 'iam4nfdi' } })
    expect(signInChoice.value).toBeNull()
    app.unmount()
  })

  it('logs in with another realm from the last row', async () => {
    loginWithRealm.mockResolvedValue(null)
    const { root, app } = await render()
    expect(content(root)).not.toContain('Pick home realm')
    await click(button(root, 'Another Aruna realm'))
    await click(button(root, 'Pick home realm'))
    await flush()
    expect(loginWithRealm).toHaveBeenCalledWith(HOME, 'Demo realm')
    expect(push).toHaveBeenCalledWith('/app/data')
    expect(signInChoice.value).toBeNull()
    expect(signIn).not.toHaveBeenCalled()
    app.unmount()
  })

  it('stays open with the reason when the other realm refuses', async () => {
    loginWithRealm.mockResolvedValue('Demo realm does not take logins from other realms.')
    const { root, app } = await render()
    await click(button(root, 'Another Aruna realm'))
    await click(button(root, 'Pick home realm'))
    await flush()
    expect(content(root)).toContain('Demo realm does not take logins from other realms.')
    expect(push).not.toHaveBeenCalled()
    expect(signInChoice.value).not.toBeNull()
    app.unmount()
  })
})
