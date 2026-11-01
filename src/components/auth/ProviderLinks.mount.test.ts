import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import type { ProviderLink } from '@/composables/useAuth'
import type { LoginConfig, LoginOption } from '@/lib/config'

const ACCOUNT_URL = 'https://idp.example.org/realms/aruna/account/account-security/linked-accounts'
const NFDI: LoginOption = {
  name: 'NFDI AAI',
  description: 'NFDI and German research institutions',
  logo: '/brand/providers/iam4nfdi.webp',
  params: { kc_idp_hint: 'iam4nfdi' },
  linkParams: { kc_action: 'idp_link:iam4nfdi' },
}
const CONFIGURED: LoginConfig = {
  options: [{ ...NFDI, name: 'GFBio SSO', linkParams: { kc_action: 'idp_link:gfbio' } }, NFDI, { ...NFDI, name: 'Aruna (legacy)', params: {}, linkParams: {} }],
  accountUrl: ACCOUNT_URL,
}
let login: LoginConfig = CONFIGURED
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
    }),
  },
  '@/composables/useAuth': { useAuth: () => ({ linkProvider, providerLink, stage: ref('idle') }) },
  // A user id of another realm is a session from that realm.
  '@/composables/useFederation': { homeRealmLabel: (id: string) => (id.endsWith('@R') ? null : 'Other realm') },
  '@/lib/config': { portalConfig: () => ({ login }) },
  '@/components/auth/ProviderLogo.vue': { __esModule: true, default: VueRuntime.defineComponent(() => () => null) },
  '@/components/auth/AccountMerge.vue': moduleDefault(defineComponent(() => () => h('p', 'Add another account'))),
})

async function render() {
  const mounted = await mountApp(defineComponent({ setup: () => () => h(ProviderLinks) }))
  await flush()
  return mounted
}

beforeEach(() => {
  login = CONFIGURED
  userId.value = 'u1@R'
  providerLink.value = null
  linkProvider.mockReset()
})

describe('linked logins in settings', () => {
  it('offers to link each linkable login and points to the account page for the list', async () => {
    const { root, app } = await render()
    const text = content(root)
    expect(text).toContain('Linked logins')
    for (const name of ['GFBio SSO', 'NFDI AAI']) expect(text).toContain(name)
    expect(text).not.toContain('Aruna (legacy)')
    expect(text).toContain('Logins you already linked are not shown here.')
    const account = element(root, (node) => node.tag === 'a')
    expect(account.props.href).toBe(ACCOUNT_URL)
    app.unmount()
  })

  it('hides the account page link without a configured URL', async () => {
    login = { ...CONFIGURED, accountUrl: '' }
    const { root, app } = await render()
    expect(content(root)).toContain('NFDI AAI')
    expect(() => element(root, (node) => node.tag === 'a')).toThrow()
    app.unmount()
  })

  it('starts the link for the chosen login', async () => {
    const { root, app } = await render()
    await click(element(root, (node) => node.tag === 'button' && node.props['aria-label'] === 'Link NFDI AAI'))
    expect(linkProvider).toHaveBeenCalledWith(NFDI)
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

  it('offers only another account without linkable logins', async () => {
    login = { options: [], accountUrl: '' }
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
