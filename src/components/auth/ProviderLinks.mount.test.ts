import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as loginProviders from '@/lib/loginProviders'
import type { ProviderLink } from '@/composables/useAuth'

const ISSUER = 'https://keycloak.v3.aruna-engine.org/realms/aruna'
const issuer = ref(ISSUER)
const userId = ref('u1@R')
const providerLink = ref<ProviderLink | null>(null)
const linkProvider = vi.fn()
const Empty = defineComponent(() => () => null)
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const Link = defineComponent({
  props: { href: String },
  setup: (props, { slots }) => () => h('a', { href: props.href }, slots.default?.()),
})
const ProviderLinks = compileClientComponent(new URL('./ProviderLinks.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/ExternalLink.vue': moduleDefault(Link),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/SectionHeading.vue': moduleDefault(
    defineComponent({ props: { title: String }, setup: (props) => () => h('h2', props.title) }),
  ),
  '@/composables/useAruna': {
    useAruna: () => ({
      currentUser: VueRuntime.computed(() => ({ id: userId.value })),
      realm: ref({ id: 'R' }),
      realmInfo: VueRuntime.computed(() => ({ oidc_providers: [{ issuer: issuer.value }] })),
    }),
  },
  '@/composables/useAuth': { useAuth: () => ({ linkProvider, providerLink, stage: ref('idle') }) },
  // A user id of another realm is a session from that realm.
  '@/composables/useFederation': { homeRealmLabel: (id: string) => (id.endsWith('@R') ? null : 'Other realm') },
  '@/lib/loginProviders': loginProviders,
  '@/components/auth/ProviderLogo.vue': { __esModule: true, default: VueRuntime.defineComponent(() => () => null) },
  '@/components/auth/AccountMerge.vue': moduleDefault(defineComponent(() => () => h('p', 'Add another account'))),
})

async function render() {
  const mounted = await mountApp(defineComponent({ setup: () => () => h(ProviderLinks) }))
  await flush()
  return mounted
}

beforeEach(() => {
  issuer.value = ISSUER
  userId.value = 'u1@R'
  providerLink.value = null
  linkProvider.mockReset()
})

describe('linked logins in settings', () => {
  it('offers to link each login and points to the account page for the list', async () => {
    const { root, app } = await render()
    const text = content(root)
    expect(text).toContain('Linked logins')
    for (const name of ['LifeScience RI', 'GFBio SSO', 'NFDI AAI']) expect(text).toContain(name)
    expect(text).toContain('Logins you already linked are not shown here.')
    const account = element(root, (node) => node.tag === 'a')
    expect(account.props.href).toBe(`${ISSUER}/account/account-security/linked-accounts`)
    app.unmount()
  })

  it('starts the Keycloak link for the chosen login', async () => {
    const { root, app } = await render()
    await click(element(root, (node) => node.tag === 'button' && node.props['aria-label'] === 'Link NFDI AAI'))
    expect(linkProvider).toHaveBeenCalledWith('iam4nfdi')
    app.unmount()
  })

  it('reports the outcome of the last link', async () => {
    providerLink.value = { name: 'LS Login', linked: true }
    const { root, app } = await render()
    expect(content(root)).toContain('LS Login is linked.')
    providerLink.value = { name: 'GFBio', linked: false, message: 'Already linked to another user' }
    await flush()
    expect(content(root)).toContain('GFBio was not linked. Already linked to another user')
    app.unmount()
  })

  it('offers only another account for realms on another identity provider', async () => {
    issuer.value = 'https://login.example.org/realms/aruna'
    const { root, app } = await render()
    expect(content(root)).toContain('Add another account')
    expect(content(root)).not.toContain('NFDI AAI')
    expect(() => button(root, 'Link')).toThrow()
    app.unmount()
  })

  it('stays hidden for a session from another realm', async () => {
    userId.value = 'u1@Other'
    const { root, app } = await render()
    expect(content(root)).toBe('')
    expect(() => button(root, 'Link')).toThrow()
    app.unmount()
  })
})
