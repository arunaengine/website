import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp } from '@/test/clientRender'
import { nodesByBucket } from '@/composables/useBucketCount'

const Empty = defineComponent(() => () => null)
const Slot = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
// The bucket select as one button per option.
const SelectStub = defineComponent({
  props: { options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', (props.options as Array<{ value: string }>).map((option) =>
      h('button', { 'data-bucket': option.value, onClick: () => emit('update:modelValue', option.value) }, option.value))),
})

const searchBuckets = vi.fn(async (_q: string, options: { groupId?: string }) => ({
  hits: [
    { bucket: 'demo', node_id: 'node-2', group_id: options.groupId },
    { bucket: 'shared', node_id: 'node-2', group_id: options.groupId },
    { bucket: 'shared', node_id: 'node-1', group_id: options.groupId },
    { bucket: 'laptop-files', node_id: 'laptop', group_id: options.groupId },
  ],
  nodes_failed: 0,
  next_cursor: null,
}))

const TransferTarget = compileClientComponent(new URL('./TransferTarget.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Button.vue': moduleDefault(Slot),
  '@/components/ui/Input.vue': moduleDefault(Empty),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/groups/GroupSelect.vue': moduleDefault(Empty),
  '@/components/data/ObjectBrowserPanel.vue': moduleDefault(Empty),
  '@/composables/useAruna': {
    useAruna: () => ({ groups: ref([{ id: 'g1', name: 'Lab' }]), searchBuckets, sessionEpoch: ref(0) }),
  },
  '@/composables/useBucketCount': {
    nodesByBucket,
    listBuckets: async (search: typeof searchBuckets, groupId: string) => ({ hits: (await search('', { groupId })).hits, complete: true }),
  },
  '@/composables/useBucketShortcuts': { useBucketShortcuts: () => ({ recent: ref([]), pinned: ref([]) }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ isTarget: (id: string) => id !== 'laptop', isLocalNode: (id: string) => id === 'node-1' }),
  },
  '@/composables/useS3': { useS3: () => ({ hasActiveKey: ref(true), endpoint: ref('https://s3.test') }) },
  '@/lib/utils': { errorMessage: String },
})

describe('TransferTarget', () => {
  it('offers the group buckets of every node but devices and names the node of the pick', async () => {
    const nodes: Array<string | null> = []
    const bucket = ref('')
    const mounted = await mountApp(defineComponent(() => () => h(TransferTarget, {
      active: true,
      groupId: 'g1',
      bucket: bucket.value,
      prefix: '',
      'onUpdate:bucket': (value: string) => (bucket.value = value),
      'onUpdate:nodeId': (value: string | null) => nodes.push(value),
    })))
    await flush()

    expect(searchBuckets).toHaveBeenCalledWith('', expect.objectContaining({ groupId: 'g1' }))
    expect(content(mounted.root)).toContain('demo')
    expect(content(mounted.root)).not.toContain('laptop-files')
    // Two buckets, so none is picked for the user.
    expect(bucket.value).toBe('')

    await click(element(mounted.root, (node) => node.props['data-bucket'] === 'demo'))
    await flush()
    expect(nodes.at(-1)).toBe('node-2')
    await click(element(mounted.root, (node) => node.props['data-bucket'] === 'shared'))
    await flush()
    expect(nodes.at(-1)).toBeNull()
    mounted.app.unmount()
  })
})
