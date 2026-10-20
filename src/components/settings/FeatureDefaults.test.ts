import * as VueRuntime from 'vue'
import { defineComponent, h, ref, type Component } from 'vue'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'
import * as Features from '@/lib/features'
import * as Utils from '@/lib/utils'

const aruna = {
  apiBaseUrl: ref('https://api.test/api/v1'),
  authToken: ref('bearer-1'),
  sessionEpoch: ref(0),
  isRealmAdmin: ref(true),
  userInfo: ref({ user: { user_id: 'admin', attributes: {} } }),
  updateUserProfile: vi.fn(),
}
const getPortalFeatures = vi.fn(async () => ({ features: { compute: false } }))
const setPortalFeatures = vi.fn(async (features: Record<string, boolean>) => ({ features }))

const IconStub = defineComponent(() => () => h('i'))
const Slotted = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs, slots }) => () => h(tag, { onClick: attrs.onClick }, slots.default?.()),
  })
const SwitchStub = defineComponent({
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { attrs, emit }) => () =>
    h('button', { onClick: () => emit('update:checked', !props.checked) }, `${attrs['aria-label']}:${props.checked}`),
})

let FeatureDefaults: Component

beforeAll(async () => {
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
  vi.doMock('@/composables/useGlobalErrors', () => ({ reportGlobalError: vi.fn() }))
  vi.doMock('@/lib/api', () => ({ getPortalFeatures, setPortalFeatures }))
  const composable = await import('@/composables/usePortalFeatures')
  FeatureDefaults = compileClientComponent(new URL('./FeatureDefaults.vue', import.meta.url), {
    vue: VueRuntime,
    '@lucide/vue': new Proxy({}, { get: () => IconStub }),
    '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
    '@/components/ui/Notice.vue': moduleDefault(Slotted('p')),
    '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
    '@/composables/usePortalFeatures': composable,
    '@/lib/features': Features,
    '@/lib/utils': Utils,
  })
})

describe('realm feature defaults', () => {
  it('starts from the stored defaults and saves the whole map', async () => {
    const { root } = await mountApp(FeatureDefaults)
    await vi.waitFor(() => expect(content(root)).toContain('Compute:false'))
    expect(content(root)).toContain('Watches:true')

    await click(button(root, 'Watches:true'))
    await click(button(root, 'Save'))

    expect(setPortalFeatures).toHaveBeenCalledTimes(1)
    const [features] = setPortalFeatures.mock.calls[0]!
    expect(features).toMatchObject({ compute: false, watches: false, profiles: true })
    expect(Object.keys(features)).toHaveLength(8)
    await vi.waitFor(() => expect(content(root)).toContain('Defaults saved.'))
  })
})
