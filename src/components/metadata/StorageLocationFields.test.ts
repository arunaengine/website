import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, mountApp, moduleDefault, typeValue } from '@/test/clientRender'
import * as DataIdentity from '@/lib/crate/dataIdentity'

const listGroupBuckets = vi.fn()
const sessionEpoch = ref(0)
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
  '@/composables/aruna/state': {
    sessionEpoch,
    refreshContext: () => ({ epoch: sessionEpoch.value, client: { token: `bearer-${sessionEpoch.value}` } }),
  },
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

    expect(listGroupBuckets).toHaveBeenCalledWith('Group-1', { token: 'bearer-0' })

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

  it('asks the new session again and drops the late old answer', async () => {
    let answerOld: (names: string[]) => void = () => {}
    listGroupBuckets
      .mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)))
      .mockResolvedValueOnce(['fresh'])
    const mounted = await render()

    sessionEpoch.value += 1
    await flush()
    answerOld(['stale'])
    await flush()

    expect(listGroupBuckets).toHaveBeenLastCalledWith('Group-1', { token: 'bearer-1' })
    const values = (options(mounted.root) as { value: string }[]).map((option) => option.value)
    expect(values).toContain('fresh')
    expect(values).not.toContain('stale')
    mounted.app.unmount()
  })
})
