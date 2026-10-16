import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, mountApp, moduleDefault, typeValue } from '@/test/clientRender'
import * as DataIdentity from '@/lib/crate/dataIdentity'

const listGroupBuckets = vi.fn()
const SelectStub = defineComponent({
  props: { options: { type: Array, default: () => [] }, modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('select', {
    value: props.modelValue,
    options: props.options,
    onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
  }),
})
const InputStub = defineComponent(() => () => h('input'))

const StorageLocationFields = compileClientComponent(new URL('./StorageLocationFields.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/composables/aruna/state': { refreshContext: () => ({ epoch: 0, client: { token: 'bearer' } }) },
  '@/lib/api': { listGroupBuckets },
  '@/lib/crate/dataIdentity': DataIdentity,
})

async function render(extra: Record<string, unknown> = {}) {
  const mounted = await mountApp(StorageLocationFields, {
    props: { groupId: 'Group-1', modelValue: { bucket: '', prefix: '' }, prefixPlaceholder: 'folder/', ...extra },
  })
  await flush()
  return mounted
}

function options(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.tag === 'select').props.options
}

describe('StorageLocationFields', () => {
  it('lists the group buckets without an S3 session', async () => {
    listGroupBuckets.mockReset().mockResolvedValue(['raw', 'datasets-group-1'])
    const mounted = await render()

    expect(listGroupBuckets).toHaveBeenCalledWith('Group-1', { token: 'bearer' })

    expect(options(mounted.root)).toEqual([
      { value: 'datasets-group-1', label: 'datasets-group-1 (default)' },
      { value: 'raw', label: 'raw' },
    ])
    expect(element(mounted.root, (node) => node.tag === 'select').props.value).toBe('datasets-group-1')
    mounted.app.unmount()
  })

  it('offers only the default bucket when the group buckets cannot be read', async () => {
    listGroupBuckets.mockReset().mockRejectedValue(new Error('forbidden'))
    const mounted = await render()

    expect(options(mounted.root)).toEqual([{ value: 'datasets-group-1', label: 'datasets-group-1 (default)' }])
    expect(content(mounted.root)).toContain("The group's other buckets could not be listed.")
    mounted.app.unmount()
  })

  it('labels the group default and keeps a picked generated bucket', async () => {
    listGroupBuckets.mockReset().mockResolvedValue([])
    const picked = vi.fn()
    const mounted = await render({ defaultLocation: { bucket: 'lab', prefix: 'p/' }, 'onUpdate:modelValue': picked })
    const select = element(mounted.root, (node) => node.tag === 'select')

    expect(select.props.options).toEqual([
      { value: 'lab', label: 'lab (group default)' },
      { value: 'datasets-group-1', label: 'datasets-group-1' },
    ])
    expect(select.props.value).toBe('lab')
    await typeValue(select, 'datasets-group-1')
    expect(picked).toHaveBeenCalledWith({ bucket: 'datasets-group-1', prefix: '' })
    mounted.app.unmount()
  })
})
