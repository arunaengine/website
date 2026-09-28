import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'
import * as DataIdentity from '@/lib/crate/dataIdentity'

const activeGroup = ref('group-1')
const listBuckets = vi.fn()
const SelectStub = defineComponent({
  props: { options: { type: Array, default: () => [] }, modelValue: String },
  setup: (props) => () => h('select', { value: props.modelValue, options: props.options }),
})
const InputStub = defineComponent(() => () => h('input'))

const StorageLocationFields = compileClientComponent(new URL('./StorageLocationFields.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/composables/useS3': {
    useS3: () => ({
      hasActiveKey: ref(true),
      activeContext: VueRuntime.computed(() => ({ groupId: activeGroup.value })),
      listBuckets,
    }),
  },
  '@/lib/crate/dataIdentity': DataIdentity,
})

async function render() {
  const mounted = await mountApp(StorageLocationFields, {
    props: { groupId: 'Group-1', modelValue: { bucket: '', prefix: '' }, prefixPlaceholder: 'folder/' },
  })
  await flush()
  return mounted
}

function options(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.tag === 'select').props.options
}

describe('StorageLocationFields', () => {
  it('lists the group buckets after the default one', async () => {
    activeGroup.value = 'Group-1'
    listBuckets.mockReset().mockResolvedValue([{ name: 'raw' }, { name: 'datasets-group-1' }])
    const mounted = await render()

    expect(options(mounted.root)).toEqual([
      { value: 'datasets-group-1', label: 'datasets-group-1 (default)' },
      { value: 'raw', label: 'raw' },
    ])
    expect(element(mounted.root, (node) => node.tag === 'select').props.value).toBe('datasets-group-1')
    mounted.app.unmount()
  })

  it('offers only the default bucket while another group holds the S3 session', async () => {
    activeGroup.value = 'other'
    listBuckets.mockReset().mockResolvedValue([{ name: 'raw' }])
    const mounted = await render()

    expect(listBuckets).not.toHaveBeenCalled()
    expect(options(mounted.root)).toEqual([{ value: 'datasets-group-1', label: 'datasets-group-1 (default)' }])
    expect(content(mounted.root)).toContain('Other buckets are listed once S3 access for this group is active.')
    mounted.app.unmount()
  })
})
