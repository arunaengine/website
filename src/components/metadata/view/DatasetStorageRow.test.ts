import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as DataIdentity from '@/lib/crate/dataIdentity'

const sessionEpoch = ref(0)
const getStorageLocation = vi.fn()
const setStorageLocation = vi.fn()
const getGroup = vi.fn()
const Slot = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => (props.open ? h('div', slots.default?.()) : null),
})
const LinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()),
})
const FieldsStub = defineComponent({
  props: { modelValue: { type: Object, required: true } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('div', [
    h('p', `Choice ${JSON.stringify(props.modelValue)}`),
    h('button', { onClick: () => emit('update:modelValue', { bucket: 'raw', prefix: 'reads/' }) }, 'Pick raw'),
    h('button', { onClick: () => emit('update:modelValue', { bucket: '', prefix: '' }) }, 'Pick default'),
  ]),
})

const DatasetStorageRow = compileClientComponent(new URL('./DatasetStorageRow.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/metadata/StorageLocationFields.vue': moduleDefault(FieldsStub),
  '@/composables/useAruna': {
    useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('bearer'), sessionEpoch, getGroup }),
  },
  '@/lib/api': { ...Api, getStorageLocation, setStorageLocation },
  '@/lib/crate/dataIdentity': DataIdentity,
})

const CLIENT = { baseUrl: 'https://api.test', token: 'bearer' }
const DEFAULT = { bucket: 'datasets-g1', prefix: 'd1/', default: true }

async function render(canWrite = true, onChanged = vi.fn()) {
  const mounted = await mountApp(DatasetStorageRow, { props: { documentId: 'd1', groupId: 'G1', canWrite, onChanged } })
  await flush()
  return mounted
}

beforeEach(() => {
  getStorageLocation.mockReset()
  setStorageLocation.mockReset()
  getGroup.mockReset().mockResolvedValue({ group_id: 'G1', realm_id: 'r', display_name: 'G', roles: [], dataset_location: null })
})

describe('DatasetStorageRow', () => {
  it('shows the default location with a link to the folder', async () => {
    getStorageLocation.mockResolvedValue(DEFAULT)
    const mounted = await render()
    const text = content(mounted.root)

    expect(getStorageLocation).toHaveBeenCalledWith('d1', CLIENT)
    expect(text).toContain('Storage location Default')
    expect(text).toContain('datasets-g1/d1/')
    expect(element(mounted.root, (node) => node.tag === 'a').props.to).toEqual({
      name: 'bucket',
      params: { bucketId: 'datasets-g1' },
      query: { prefix: 'd1', group: 'G1' },
    })
    mounted.app.unmount()
  })

  it('shows a chosen location without the default badge and no change for readers', async () => {
    getStorageLocation.mockResolvedValue({ bucket: 'raw', prefix: 'reads/', default: false })
    const mounted = await render(false)
    const text = content(mounted.root)

    expect(text).toContain('raw/reads/')
    expect(text).not.toContain('Default')
    expect(text).not.toContain('Change')
    mounted.app.unmount()
  })

  it.each([404, 403, 503])('stays hidden when the node answers %i', async (status) => {
    getStorageLocation.mockRejectedValue(new Api.ApiError(status, 'no'))
    const mounted = await render()

    expect(content(mounted.root)).toBe('')
    mounted.app.unmount()
  })

  it('saves a new location', async () => {
    getStorageLocation.mockResolvedValue(DEFAULT)
    const saved = { bucket: 'raw', prefix: 'reads/', default: false }
    setStorageLocation.mockResolvedValue(saved)
    const onChanged = vi.fn()
    const mounted = await render(true, onChanged)

    await click(button(mounted.root, 'Change'))
    expect(content(mounted.root)).toContain('Choice {"bucket":"datasets-g1","prefix":"d1/"}')
    await click(button(mounted.root, 'Pick raw'))
    await click(button(mounted.root, 'Save'))

    expect(setStorageLocation).toHaveBeenCalledWith('d1', { bucket: 'raw', prefix: 'reads/' }, CLIENT)
    expect(onChanged).toHaveBeenCalledWith(saved)
    expect(content(mounted.root)).toContain('raw/reads/')
    expect(content(mounted.root)).not.toContain('Choice')
    mounted.app.unmount()
  })

  it('writes the default location out when the default is picked', async () => {
    getStorageLocation.mockResolvedValue({ bucket: 'raw', prefix: 'reads/', default: false })
    setStorageLocation.mockResolvedValue(DEFAULT)
    const mounted = await render()

    await click(button(mounted.root, 'Change'))
    await click(button(mounted.root, 'Pick default'))
    await click(button(mounted.root, 'Save'))

    expect(setStorageLocation).toHaveBeenCalledWith('d1', { bucket: 'datasets-g1', prefix: 'd1/' }, CLIENT)
    mounted.app.unmount()
  })

  it('marks the group default plus the dataset folder as the default', async () => {
    getGroup.mockResolvedValue({ group_id: 'G1', realm_id: 'r', display_name: 'G', roles: [], dataset_location: { bucket: 'lab', prefix: 'p/' } })
    getStorageLocation.mockResolvedValue({ bucket: 'lab', prefix: 'p/d1/', default: false })
    const mounted = await render()

    expect(content(mounted.root)).toContain('Storage location Default')
    mounted.app.unmount()
  })

  it('does not trust the default flag when the group default moved', async () => {
    getGroup.mockResolvedValue({ group_id: 'G1', realm_id: 'r', display_name: 'G', roles: [], dataset_location: { bucket: 'lab', prefix: 'p/' } })
    getStorageLocation.mockResolvedValue(DEFAULT)
    setStorageLocation.mockResolvedValue({ bucket: 'lab', prefix: 'p/d1/', default: false })
    const mounted = await render()

    expect(content(mounted.root)).not.toContain('Default')
    await click(button(mounted.root, 'Change'))
    expect(content(mounted.root)).toContain('Default: lab/p/d1/')
    await click(button(mounted.root, 'Use the group default'))
    await click(button(mounted.root, 'Save'))
    expect(setStorageLocation).toHaveBeenCalledWith('d1', { bucket: 'lab', prefix: 'p/d1/' }, CLIENT)
    mounted.app.unmount()
  })

  it('keeps the dialog open with the refusal', async () => {
    getStorageLocation.mockResolvedValue(DEFAULT)
    setStorageLocation.mockRejectedValue(new Api.ApiError(403, 'You may not write to that bucket'))
    const mounted = await render()

    await click(button(mounted.root, 'Change'))
    await click(button(mounted.root, 'Save'))

    expect(content(mounted.root)).toContain('Choice')
    expect(content(mounted.root)).toContain('You may not write to that bucket')
    mounted.app.unmount()
  })

  it('drops an answer that arrives after the session changed', async () => {
    let answer!: (value: typeof DEFAULT) => void
    getStorageLocation
      .mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
      .mockRejectedValueOnce(new Api.ApiError(403, 'no'))
    const mounted = await render()
    sessionEpoch.value++
    await flush()
    answer(DEFAULT)
    await flush()

    expect(content(mounted.root)).toBe('')
    mounted.app.unmount()
  })
})
