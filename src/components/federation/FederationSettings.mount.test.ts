import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import { ApiError } from '@/lib/api/client'

const getRealmFederation = vi.fn()
const getRealmDescriptor = vi.fn()
const setRealmFederation = vi.fn()
const sessionEpoch = ref(1)
const Empty = defineComponent(() => () => null)
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Passthrough = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const Input = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  setup: (props, { attrs }) => () => h('input', { ...attrs, value: props.modelValue }),
})
const Settings = compileClientComponent(new URL('./FederationSettings.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/Input.vue': moduleDefault(Input),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/ui/Switch.vue': moduleDefault(Empty),
  '@/components/federation/RealmTag.vue': moduleDefault(Empty),
  '@/composables/useAruna': { useAruna: () => ({ realm: ref({ id: 'OWN' }) }) },
  '@/composables/aruna/state': {
    assertCurrentSession: () => undefined,
    refreshContext: () => ({ epoch: sessionEpoch.value, client: { baseUrl: '/api/v1', token: 'T' } }),
    sessionEpoch,
  },
  '@/lib/api': {
    ApiError,
    apiErrorMessage: (error: Error) => error.message,
    getRealmDescriptor,
    getRealmFederation,
    setRealmFederation,
  },
  '@/lib/federation/realms': { checkRealm: vi.fn(), knownRealm: () => undefined },
})

const stored = {
  name: 'Marburg Archive',
  api_url: 'https://api.marburg.example/api/v1',
  portal_url: 'https://archive.marburg.example/',
  registry_url: 'https://registry.example/',
  registration: 'disabled',
  accepted_realms: { mode: 'only', realms: ['GIESSEN'] },
}
const notFound = new ApiError(404, 'Not found')

function fieldset(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.tag === 'fieldset')
}

beforeEach(() => {
  vi.clearAllMocks()
  setRealmFederation.mockImplementation(async (settings) => settings)
})

describe('FederationSettings', () => {
  it('saves the loaded settings it did not change', async () => {
    getRealmFederation.mockResolvedValue(stored)
    const mounted = await mountApp(Settings)
    await flush()
    expect(fieldset(mounted.root).props.disabled).toBe(false)
    await click(button(mounted.root, 'Save'))
    expect(setRealmFederation).toHaveBeenCalledWith(
      expect.objectContaining({ registry_url: 'https://registry.example/', registration: 'disabled', accepted_realms: stored.accepted_realms }),
      { baseUrl: '/api/v1', token: 'T' },
    )
    mounted.app.unmount()
  })

  it('stays read-only when this node cannot read the stored settings', async () => {
    getRealmFederation.mockRejectedValue(notFound)
    getRealmDescriptor.mockResolvedValue({ payload: { name: 'Marburg Archive' } })
    const mounted = await mountApp(Settings)
    await flush()
    expect(content(mounted.root)).toContain('This node cannot read the current settings')
    expect(fieldset(mounted.root).props.disabled).toBe(true)
    expect(button(mounted.root, 'Save').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('lets a realm without settings set them up', async () => {
    getRealmFederation.mockRejectedValue(notFound)
    getRealmDescriptor.mockRejectedValue(notFound)
    const mounted = await mountApp(Settings)
    await flush()
    expect(fieldset(mounted.root).props.disabled).toBe(false)
    expect(content(mounted.root)).not.toContain('cannot read')
    mounted.app.unmount()
  })
})
