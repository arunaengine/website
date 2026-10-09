import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import { ApiError } from '@/lib/api/client'

const getRealmFederation = vi.fn()
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
const unset = new ApiError(404, 'no federation settings', 'federation_unset')

function fieldset(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.tag === 'fieldset')
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionEpoch.value = 1
  setRealmFederation.mockImplementation(async (settings) => ({ settings, etag: '"next"' }))
})

describe('FederationSettings', () => {
  it('saves the loaded settings it did not change, naming their ETag', async () => {
    getRealmFederation.mockResolvedValue({ settings: stored, etag: '"v1"' })
    const mounted = await mountApp(Settings)
    await flush()
    expect(fieldset(mounted.root).props.disabled).toBe(false)
    await click(button(mounted.root, 'Save'))
    expect(setRealmFederation).toHaveBeenCalledWith(
      expect.objectContaining({ registry_url: 'https://registry.example/', registration: 'disabled', accepted_realms: stored.accepted_realms }),
      '"v1"',
      { baseUrl: '/api/v1', token: 'T' },
    )
    await click(button(mounted.root, 'Save'))
    expect(setRealmFederation.mock.calls[1][1]).toBe('"next"')
    mounted.app.unmount()
  })

  it('sets up a realm without settings as a first setup', async () => {
    getRealmFederation.mockRejectedValue(unset)
    const mounted = await mountApp(Settings)
    await flush()
    expect(fieldset(mounted.root).props.disabled).toBe(false)
    await click(button(mounted.root, 'Save'))
    expect(setRealmFederation.mock.calls[0][1]).toBeNull()
    mounted.app.unmount()
  })

  it.each([
    ['a node without realm configuration', new ApiError(503, 'no config', 'realm_config_missing'), 'no realm configuration'],
    ['a 404 without its code', new ApiError(404, 'Not found'), 'Not found'],
  ])('stays read-only for %s', async (_, error, note) => {
    getRealmFederation.mockRejectedValue(error)
    const mounted = await mountApp(Settings)
    await flush()
    expect(content(mounted.root)).toContain(note)
    expect(fieldset(mounted.root).props.disabled).toBe(true)
    expect(button(mounted.root, 'Save').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('stays read-only when the settings come without a version', async () => {
    getRealmFederation.mockResolvedValue({ settings: stored, etag: null })
    const mounted = await mountApp(Settings)
    await flush()
    expect(content(mounted.root)).toContain('no settings version')
    expect(fieldset(mounted.root).props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('shows the current settings after they changed elsewhere', async () => {
    getRealmFederation
      .mockResolvedValueOnce({ settings: stored, etag: '"v1"' })
      .mockResolvedValueOnce({ settings: { ...stored, name: 'Marburg Data' }, etag: '"v2"' })
    setRealmFederation.mockRejectedValueOnce(new ApiError(412, 'changed', 'settings_changed'))
    const mounted = await mountApp(Settings)
    await flush()
    await click(button(mounted.root, 'Save'))
    await flush()
    expect(content(mounted.root)).toContain('changed elsewhere')
    expect(element(mounted.root, (node) => node.props.id === 'federation-name').props.value).toBe('Marburg Data')
    await click(button(mounted.root, 'Save'))
    expect(setRealmFederation.mock.calls[1][1]).toBe('"v2"')
    mounted.app.unmount()
  })

  it('ignores a rejected save that arrives after the login changed', async () => {
    getRealmFederation.mockResolvedValue({ settings: stored, etag: '"v1"' })
    setRealmFederation.mockImplementationOnce(async () => {
      sessionEpoch.value++
      throw new ApiError(412, 'changed', 'settings_changed')
    })
    const mounted = await mountApp(Settings)
    await flush()
    await click(button(mounted.root, 'Save'))
    await flush()
    expect(getRealmFederation).toHaveBeenCalledTimes(1)
    expect(content(mounted.root)).not.toContain('changed elsewhere')
    mounted.app.unmount()
  })

  it('shows no notice when the login changed during the reload', async () => {
    getRealmFederation.mockResolvedValueOnce({ settings: stored, etag: '"v1"' }).mockImplementationOnce(async () => {
      sessionEpoch.value++
      return { settings: { ...stored, name: 'Other' }, etag: '"v9"' }
    })
    setRealmFederation.mockRejectedValueOnce(new ApiError(412, 'changed', 'settings_changed'))
    const mounted = await mountApp(Settings)
    await flush()
    await click(button(mounted.root, 'Save'))
    await flush()
    expect(content(mounted.root)).not.toContain('changed elsewhere')
    expect(element(mounted.root, (node) => node.props.id === 'federation-name').props.value).toBe('Marburg Archive')
    mounted.app.unmount()
  })
})
