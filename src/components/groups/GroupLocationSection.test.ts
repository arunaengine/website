import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as DataIdentity from '@/lib/crate/dataIdentity'

const setGroupLocation = vi.fn()
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
  '@/composables/useAruna': { useAruna: () => ({ setGroupLocation }) },
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
})
