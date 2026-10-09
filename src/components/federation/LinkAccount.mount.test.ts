import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import { ApiError } from '@/lib/api/client'

const sessionEpoch = ref(1)
const home = { realmId: 'A', name: 'Giessen Data' }
const confirmLink = vi.fn()
const finishLink = vi.fn()
const signIn = vi.fn()
const Empty = defineComponent(() => () => null)
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Passthrough = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const LinkAccount = compileClientComponent(new URL('./LinkAccount.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Avatar.vue': moduleDefault(Empty),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/federation/RealmTag.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    useAruna: () => ({
      currentUser: ref({ id: 'u@B', name: 'Anna' }),
      realm: ref({ id: 'B', name: 'Marburg Archive' }),
      apiBaseUrl: ref('/api/v1'),
      sessionEpoch,
    }),
  },
  '@/composables/useAuth': { useAuth: () => ({ signIn }) },
  '@/composables/useFederation': { homeRealmLabel: () => null },
  '@/composables/useLinking': {
    confirmLink,
    finishLink,
    linkFailure: (error: Error) => (error instanceof ApiError ? 'Linking was refused.' : error.message),
    pendingLink: ref({ apiBaseUrl: '/api/v1', homeRealmId: 'A' }),
    setPendingLink: vi.fn(),
  },
  '@/lib/api': { ApiError },
  '@/lib/federation/descriptor': { userIdText: () => 'f@A' },
  '@/lib/federation/realms': { knownRealm: () => home },
})

beforeEach(() => {
  vi.clearAllMocks()
  confirmLink.mockResolvedValue({ confirmation: { payload: {} }, name: 'Anna at Giessen' })
})

describe('LinkAccount', () => {
  it('drops a confirmation when the login here changes', async () => {
    const mounted = await mountApp(LinkAccount)
    await click(button(mounted.root, 'Continue at Giessen Data'))
    await flush()
    expect(content(mounted.root)).toContain('Link Anna at Giessen to your account here?')
    sessionEpoch.value++
    await flush()
    expect(content(mounted.root)).not.toContain('Link Anna at Giessen')
    expect(() => button(mounted.root, 'Link')).toThrow()
    expect(finishLink).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('offers a fresh login after a refused link', async () => {
    confirmLink.mockRejectedValue(new ApiError(403, 'the local login is too old', 'link_refused'))
    const mounted = await mountApp(LinkAccount)
    await click(button(mounted.root, 'Continue at Giessen Data'))
    await flush()
    await click(button(mounted.root, 'Log in again'))
    expect(signIn).toHaveBeenCalledWith({ redirectTo: '/app/settings', freshLogin: true })
    mounted.app.unmount()
  })
})
