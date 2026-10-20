import * as VueRuntime from 'vue'
import { defineComponent, h, ref, type Component } from 'vue'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Features from '@/lib/features'

type Patch = { set_attributes?: Record<string, string>; remove_attributes?: string[] }

const userInfo = ref({ user: { user_id: 'u1', attributes: {} as Record<string, string> } })
const updateUserProfile = vi.fn(async (patch: Patch) => {
  const attributes = { ...userInfo.value.user.attributes, ...patch.set_attributes }
  for (const key of patch.remove_attributes ?? []) delete attributes[key]
  userInfo.value = { user: { user_id: 'u1', attributes } }
})
const aruna = {
  apiBaseUrl: ref('https://api.test/api/v1'),
  authToken: ref('bearer-1'),
  sessionEpoch: ref(0),
  isRealmAdmin: ref(false),
  userInfo,
  updateUserProfile,
}
const getPortalFeatures = vi.fn(async () => ({ features: { watches: false } }))

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', { onClick: attrs.onClick }, slots.default?.()),
})
const SwitchStub = defineComponent({
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { attrs, emit }) => () =>
    h('button', { onClick: () => emit('update:checked', !props.checked) }, `${attrs['aria-label']}:${props.checked}`),
})

let FeatureSettings: Component

beforeAll(async () => {
  vi.doMock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
  vi.doMock('@/composables/useGlobalErrors', () => ({ reportGlobalError: vi.fn() }))
  vi.doMock('@/lib/api', () => ({ getPortalFeatures, setPortalFeatures: vi.fn() }))
  const composable = await import('@/composables/usePortalFeatures')
  FeatureSettings = compileClientComponent(new URL('./FeatureSettings.vue', import.meta.url), {
    vue: VueRuntime,
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
    '@/composables/useAruna': { useAruna: () => aruna },
    '@/composables/usePortalFeatures': composable,
    '@/lib/features': Features,
  })
})

beforeEach(() => {
  userInfo.value = { user: { user_id: 'u1', attributes: {} } }
  updateUserProfile.mockClear()
})

describe('settings features section', () => {
  it('follows the realm default until the user picks a value', async () => {
    const { root } = await mountApp(FeatureSettings)
    await vi.waitFor(() => expect(content(root)).toContain('Watches:false'))
    expect(content(root)).toContain('Realm default')

    await click(button(root, 'Watches:false'))

    expect(updateUserProfile).toHaveBeenCalledWith({ set_attributes: { 'ui.feature.watches': 'on' } })
    expect(content(root)).toContain('Watches:true')
    expect(content(root)).toContain('Use realm default')
  })

  it('removes the own choice to use the realm default again', async () => {
    userInfo.value = { user: { user_id: 'u1', attributes: { 'ui.feature.watches': 'on' } } }
    const { root } = await mountApp(FeatureSettings)
    await flush()

    await click(button(root, 'Use realm default'))

    expect(updateUserProfile).toHaveBeenCalledWith({ remove_attributes: ['ui.feature.watches'] })
    await vi.waitFor(() => expect(content(root)).toContain('Watches:false'))
  })

  it('keeps the newest choice while an older save finishes', async () => {
    const finish: Array<() => void> = []
    const apply = updateUserProfile.getMockImplementation()!
    updateUserProfile.mockImplementation(
      (patch: Patch) => new Promise<void>((resolve) => finish.push(() => void apply(patch).then(resolve))),
    )
    try {
      const { root } = await mountApp(FeatureSettings)
      await vi.waitFor(() => expect(content(root)).toContain('Watches:false'))

      await click(button(root, 'Watches:false'))
      await click(button(root, 'Watches:true'))
      expect(content(root)).toContain('Watches:false')

      finish.shift()!()
      await flush()
      expect(content(root)).toContain('Watches:false')

      await vi.waitFor(() => expect(finish).toHaveLength(1))
      finish.shift()!()
      await vi.waitFor(() => expect(userInfo.value.user.attributes['ui.feature.watches']).toBe('off'))
      expect(content(root)).toContain('Watches:false')
      expect(updateUserProfile.mock.calls.map(([patch]) => patch)).toEqual([
        { set_attributes: { 'ui.feature.watches': 'on' } },
        { set_attributes: { 'ui.feature.watches': 'off' } },
      ])
    } finally {
      updateUserProfile.mockImplementation(apply)
    }
  })

  it('drops a queued choice once the session changed', async () => {
    const finish: Array<() => void> = []
    const apply = updateUserProfile.getMockImplementation()!
    updateUserProfile.mockImplementation(
      (patch: Patch) => new Promise<void>((resolve) => finish.push(() => void apply(patch).then(resolve))),
    )
    try {
      const { root } = await mountApp(FeatureSettings)
      await vi.waitFor(() => expect(content(root)).toContain('Watches:'))
      await click(button(root, 'Watches:'))
      await click(button(root, 'Watches:'))
      expect(updateUserProfile).toHaveBeenCalledTimes(1)

      aruna.sessionEpoch.value += 1
      finish.shift()!()
      await flush()
      await flush()

      expect(updateUserProfile).toHaveBeenCalledTimes(1)
    } finally {
      updateUserProfile.mockImplementation(apply)
    }
  })
})
