import * as VueRuntime from 'vue'
import { computed, defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import { button, compileClientComponent, flush, moduleDefault, mountApp } from '@/test/clientRender'

const realm = { realmId: 'A', name: 'Giessen Data', portalUrl: 'https://a.example/', saved: true }
const checkRealm = vi.fn()
const Empty = defineComponent(() => () => null)
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const RealmPicker = compileClientComponent(new URL('./RealmPicker.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Badge.vue': moduleDefault(Empty),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/Input.vue': moduleDefault(Empty),
  '@/components/ui/Notice.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/composables/aruna/format': { colorFor: () => '#336699', shortId: (id: string) => id.slice(0, 8) },
  '@/lib/config': { portalConfig: () => ({}) },
  '@/lib/federation/realms': {
    checkRealm,
    listRegistry: vi.fn(),
    matchesQuery: () => true,
    savedRealms: computed(() => [realm]),
    setRealmSaved: vi.fn(),
  },
  '@/lib/utils': Utils,
})

beforeEach(() => vi.clearAllMocks())

describe('RealmPicker', () => {
  it('passes a realm on only after its check by default', async () => {
    const onPick = vi.fn()
    checkRealm.mockResolvedValue({ status: 'ok', realm: { ...realm, issuedAt: 2 } })
    const { root, app } = await mountApp(RealmPicker, { props: { actionLabel: 'Choose', onPick } })
    void (button(root, 'Choose').props.onClick as () => unknown)()
    expect(onPick).not.toHaveBeenCalled()
    await flush()
    expect(checkRealm).toHaveBeenCalledOnce()
    expect(onPick).toHaveBeenCalledWith({ ...realm, issuedAt: 2 })
    app.unmount()
  })

  it('passes a realm on at the click when the consumer checks it', async () => {
    const onPick = vi.fn()
    const { root, app } = await mountApp(RealmPicker, { props: { actionLabel: 'Choose', checkPick: false, onPick } })
    void (button(root, 'Choose').props.onClick as () => unknown)()
    expect(onPick).toHaveBeenCalledWith(realm)
    expect(checkRealm).not.toHaveBeenCalled()
    app.unmount()
  })
})
