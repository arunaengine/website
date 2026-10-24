import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as DataIdentity from '@/lib/crate/dataIdentity'

const setGroupLocation = vi.fn()
const getBucketRouting = vi.fn()
const getGroupRouting = vi.fn()
const listGroupBackends = vi.fn()
const Slot = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const Empty = defineComponent(() => () => null)
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
  setup: (_, { slots }) => () => h('a', slots.default?.()),
})
const FieldsStub = defineComponent({
  props: { modelValue: { type: Object, required: true } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('div', [
    h('p', `Choice ${JSON.stringify(props.modelValue)}`),
    h('button', { onClick: () => emit('update:modelValue', { bucket: 'raw', prefix: ' cruise/ ' }) }, 'Pick raw'),
  ]),
})

const GroupLocationSection = compileClientComponent(new URL('./GroupLocationSection.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Badge.vue': moduleDefault(Slot),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Slot),
  '@/components/ui/DialogDescription.vue': moduleDefault(Slot),
  '@/components/ui/DialogFooter.vue': moduleDefault(Slot),
  '@/components/ui/DialogHeader.vue': moduleDefault(Slot),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slot),
  '@/components/ui/DocsLink.vue': moduleDefault(Empty),
  '@/components/ui/Notice.vue': moduleDefault(Slot),
  '@/components/metadata/StorageLocationFields.vue': moduleDefault(FieldsStub),
  '@/composables/useAruna': { useAruna: () => ({ setGroupLocation, getBucketRouting, getGroupRouting, listGroupBackends }) },
  '@/lib/api': Api,
  '@/lib/crate/dataIdentity': DataIdentity,
  })

function group(location: { bucket: string; prefix: string } | null) {
  return { group_id: 'G1', realm_id: 'r', display_name: 'Reef lab', roles: [], dataset_location: location }
}

async function render(location: { bucket: string; prefix: string } | null, canAdmin = true, onChanged = vi.fn()) {
  const mounted = await mountApp(GroupLocationSection, { props: { group: group(location), canAdmin, onChanged } })
  await flush()
  return mounted
}

beforeEach(() => {
  setGroupLocation.mockReset()
  getBucketRouting.mockReset().mockResolvedValue({ bucket: 'b', rules: [], warnings: [] })
  getGroupRouting.mockReset().mockResolvedValue({ group_id: 'G1', default_target: null, warnings: [] })
  listGroupBackends.mockReset().mockResolvedValue({
    backends: [{ backend_id: 's1', name: 'de.NBI-spire', kind: 's3', public_config: { default_bucket: 'aruna-spire-default' } }],
  })
})

describe('GroupLocationSection', () => {
  it('shows nothing without a location', async () => {
    const mounted = await render(null)

    expect(content(mounted.root)).toBe('')
    mounted.app.unmount()
  })

  it('shows members the location without an edit button', async () => {
    const mounted = await render({ bucket: 'datasets-g1', prefix: '' }, false)
    const text = content(mounted.root)

    expect(text).toContain('New datasets go to: datasets-g1/')
    expect(text).toContain('Generated group bucket')
    expect(text).not.toContain('Edit')
    mounted.app.unmount()
  })

  it('saves a new location for admins', async () => {
    const updated = group({ bucket: 'raw', prefix: 'cruise/' })
    setGroupLocation.mockResolvedValue(updated)
    const onChanged = vi.fn()
    const mounted = await render({ bucket: 'lab', prefix: 'projects/' }, true, onChanged)

    expect(content(mounted.root)).toContain('Changing it does not move existing datasets')
    await click(button(mounted.root, 'Edit'))
    expect(content(mounted.root)).toContain('Choice {"bucket":"lab","prefix":"projects/"}')
    await click(button(mounted.root, 'Pick raw'))
    await click(button(mounted.root, 'Save'))

    expect(setGroupLocation).toHaveBeenCalledWith('G1', { bucket: 'raw', prefix: 'cruise/' })
    expect(onChanged).toHaveBeenCalledWith(updated)
    expect(content(mounted.root)).not.toContain('Choice')
    mounted.app.unmount()
  })

  it('restores the generated group bucket', async () => {
    setGroupLocation.mockResolvedValue(group({ bucket: 'datasets-g1', prefix: '' }))
    const mounted = await render({ bucket: 'lab', prefix: 'projects/' })

    await click(button(mounted.root, 'Edit'))
    await click(button(mounted.root, 'Use the generated group bucket'))

    expect(setGroupLocation).toHaveBeenCalledWith('G1', null)
    mounted.app.unmount()
  })

  it('keeps the dialog open with the reason of a refusal', async () => {
    setGroupLocation.mockRejectedValue(new Api.ApiError(400, 'bucket reef-raw belongs to another group'))
    const mounted = await render({ bucket: 'lab', prefix: '' })

    await click(button(mounted.root, 'Edit'))
    await click(button(mounted.root, 'Save'))

    expect(content(mounted.root)).toContain('Choice')
    expect(content(mounted.root)).toContain('bucket reef-raw belongs to another group')
    mounted.app.unmount()
  })

  it('says where the files are stored', async () => {
    let mounted = await render({ bucket: 'datasets-g1', prefix: '' })
    expect(content(mounted.root)).toContain('Files are stored on this node.')
    mounted.app.unmount()

    getGroupRouting.mockResolvedValue({ group_id: 'G1', default_target: { backend_id: 's1' }, warnings: [] })
    mounted = await render({ bucket: 'datasets-g1', prefix: '' })
    expect(content(mounted.root)).toContain('Files are stored in de.NBI-spire.')
    mounted.app.unmount()

    getBucketRouting.mockResolvedValue({
      bucket: 'datasets-g1', warnings: [],
      rules: [{ key_prefix: '', exact: false, target: { class: 'cold' } }],
    })
    mounted = await render({ bucket: 'datasets-g1', prefix: '' })
    expect(content(mounted.root)).not.toContain('Files are stored')
    mounted.app.unmount()
  })

  it('follows the longest rule that covers the dataset prefix', async () => {
    getGroupRouting.mockResolvedValue({ group_id: 'G1', default_target: { backend_id: 's1' }, warnings: [] })
    listGroupBackends.mockResolvedValue({
      backends: [
        { backend_id: 's1', name: 'Alpha', kind: 's3', public_config: {} },
        { backend_id: 's2', name: 'Beta', kind: 's3', public_config: {} },
      ],
    })
    getBucketRouting.mockResolvedValue({
      bucket: 'lab', warnings: [],
      rules: [
        { key_prefix: 'projects/', exact: false, target: { backend_id: 's2' } },
        { key_prefix: 'projects/', exact: true, target: { backend_id: 's1' } },
        { key_prefix: 'other/', exact: false, target: { backend_id: 's1' } },
      ],
    })
    const covered = await render({ bucket: 'lab', prefix: 'projects/' })
    expect(content(covered.root)).toContain('Files are stored in Beta.')
    covered.app.unmount()
    const plain = await render({ bucket: 'lab', prefix: '' })
    expect(content(plain.root)).toContain('Files are stored in Alpha.')
    plain.app.unmount()
  })

  it('keeps the line shown while a reload reads, and starts empty for another location', async () => {
    getGroupRouting.mockResolvedValue({ group_id: 'G1', default_target: { backend_id: 's1' }, warnings: [] })
    const reload = ref(0)
    const location = ref({ bucket: 'lab', prefix: '' })
    const host = defineComponent({
      setup: () => () => h(GroupLocationSection, { group: group(location.value), canAdmin: true, reload: reload.value }),
    })
    const mounted = await mountApp(host)
    await flush()
    expect(content(mounted.root)).toContain('Files are stored in de.NBI-spire.')

    let answer: (value: unknown) => void = () => {}
    listGroupBackends.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    reload.value = 1
    await flush()
    expect(content(mounted.root)).toContain('Files are stored in de.NBI-spire.')
    answer({ backends: [{ backend_id: 's1', name: 'Alpha', kind: 's3', public_config: {} }] })
    await flush()
    expect(content(mounted.root)).toContain('Files are stored in Alpha.')

    listGroupBackends.mockReturnValueOnce(new Promise(() => {}))
    location.value = { bucket: 'raw', prefix: '' }
    await flush()
    expect(content(mounted.root)).not.toContain('Files are stored')
    mounted.app.unmount()
  })

  it('does not claim a disabled storage and reloads on change', async () => {
    getGroupRouting.mockResolvedValue({ group_id: 'G1', default_target: { backend_id: 's1' }, warnings: [] })
    listGroupBackends.mockResolvedValue({
      backends: [{ backend_id: 's1', name: 'Alpha', kind: 's3', public_config: {}, disabled: true }],
    })
    const reload = ref(0)
    const fixed = group({ bucket: 'lab', prefix: '' })
    const host = defineComponent({
      setup: () => () => h(GroupLocationSection, { group: fixed, canAdmin: true, reload: reload.value }),
    })
    const mounted = await mountApp(host)
    await flush()
    expect(content(mounted.root)).toContain('Alpha is disabled.')
    expect(content(mounted.root)).not.toContain('Files are stored in')

    listGroupBackends.mockResolvedValue({
      backends: [{ backend_id: 's1', name: 'Alpha', kind: 's3', public_config: {} }],
    })
    reload.value = 1
    await flush()
    expect(content(mounted.root)).toContain('Files are stored in Alpha.')
    mounted.app.unmount()
  })
})
