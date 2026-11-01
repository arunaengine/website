import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import type { SignInOptions } from '@/composables/useAuth'
import * as loginProviders from '@/lib/loginProviders'

const signInChoice = ref<SignInOptions | null>(null)
const signIn = vi.fn()
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
  '@/composables/signInChoice': { signInChoice },
  '@/composables/useAuth': { useAuth: () => ({ signIn }) },
  '@/lib/loginProviders': loginProviders,
  '@/components/auth/ProviderLogo.vue': { __esModule: true, default: VueRuntime.defineComponent(() => () => null) },
  '@/assets/brand/icon-mark.avif': { __esModule: true, default: 'icon.avif' },
})

async function render() {
  const mounted = await mountApp(defineComponent({ setup: () => () => h(dialog) }))
  await flush()
  return mounted
}

beforeEach(() => {
  signIn.mockReset()
  signInChoice.value = { redirectTo: '/app/data', onboardingSecret: 's1' }
})

describe('sign-in dialog', () => {
  it('lists every login and explains linking by email', async () => {
    const { root, app } = await render()
    const text = content(root)
    for (const name of ['LifeScience RI', 'GFBio SSO', 'NFDI AAI', 'Aruna (legacy)']) expect(text).toContain(name)
    expect(text).toContain('You sign in once with that account to link both.')
    app.unmount()
  })

  it('signs in at the chosen login and keeps the pending options', async () => {
    const { root, app } = await render()
    await click(button(root, 'NFDI AAI'))
    expect(signIn).toHaveBeenCalledWith({ redirectTo: '/app/data', onboardingSecret: 's1', idpHint: 'iam4nfdi' })
    expect(signInChoice.value).toBeNull()
    app.unmount()
  })

  it('signs in without a hint for the Aruna account', async () => {
    const { root, app } = await render()
    await click(button(root, 'Aruna (legacy)'))
    expect(signIn).toHaveBeenCalledWith({ redirectTo: '/app/data', onboardingSecret: 's1' })
    app.unmount()
  })
})
