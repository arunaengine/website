import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

const Empty = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const LinkedLogins = compileClientComponent(new URL('./LinkedLogins.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/SectionHeading.vue': moduleDefault(
    defineComponent({ props: { title: String }, setup: (props) => () => h('h2', props.title) }),
  ),
  '@/components/federation/RealmTag.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    useAruna: () => ({
      currentUser: ref({ id: 'u1@R' }),
      userInfo: ref({ linked_logins: [] }),
      realm: ref({ id: 'R' }),
      apiBaseUrl: ref('/api'),
    }),
  },
  '@/composables/useAuth': { useAuth: () => ({ signIn: vi.fn() }) },
  '@/composables/useFederation': { homeRealmLabel: () => null },
  '@/composables/useLinking': { linkFailure: vi.fn(), removeLogin: vi.fn(), setPendingLink: vi.fn() },
  '@/lib/federation/realms': { knownRealm: () => undefined },
})

describe('logins from other realms', () => {
  // Kept apart by name from "Linked logins", which are login providers like ORCID.
  it('names realm logins so they are not taken for login providers', async () => {
    const { root, app } = await mountApp(defineComponent({ setup: () => () => h(LinkedLogins) }))
    await flush()
    const text = content(root)
    expect(text).toContain('Logins from other realms')
    expect(text).toContain('No logins from other realms.')
    expect(text).not.toContain('Linked logins')
    app.unmount()
  })
})
