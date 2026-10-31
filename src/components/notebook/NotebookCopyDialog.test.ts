import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { nodesByBucket } from '@/composables/useBucketCount'
import { button, click, compileClientComponent, content, flush, moduleDefault, mountApp } from '@/test/clientRender'

const Slotted = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Dialog = defineComponent({ props: { open: Boolean }, setup: (props, { slots }) => () => (props.open ? h('section', slots.default?.()) : null) })
// One button per option, so a test picks a bucket by name.
const Select = defineComponent({
  props: ['modelValue', 'options'], emits: ['update:modelValue'],
  setup: (props, { emit }) => () => props.options.map((option: { value: string }) => h('button', { onClick: () => emit('update:modelValue', option.value) }, `Bucket ${option.value}`)),
})
const Browser = defineComponent({
  props: ['bucket'], emits: ['navigate'],
  setup: (props, { emit }) => () => h('button', { onClick: () => emit('navigate', { bucket: props.bucket, prefix: 'out/' }) }, `Browse ${props.bucket} out`),
})

// The group's buckets as the realm search lists them: one on another node, one on a device.
const hits = ['dest', 'ws-scratch', 'other'].map((bucket) => ({ bucket, node_id: 'node-1' }))
  .concat({ bucket: 'remote', node_id: 'node-2' }, { bucket: 'laptop', node_id: 'device' })
const searchBuckets = vi.fn(async (_q: string, _options: { groupId?: string }) => ({ hits, nodes_failed: 0, next_cursor: null }))
const modules: Record<string, unknown> = {
  vue: VueRuntime,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(Dialog),
  '@/components/ui/Select.vue': moduleDefault(Select),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent(() => () => null)),
  '@/components/data/ObjectBrowserPanel.vue': moduleDefault(Browser),
  '@/composables/useAruna': { useAruna: () => ({ searchBuckets, sessionEpoch: ref(0) }) },
  '@/composables/useBucketCount': {
    nodesByBucket,
    listBuckets: async (search: typeof searchBuckets, groupId: string) => ({ hits: (await search('', { groupId })).hits, complete: true }),
  },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({ isTarget: (id: string) => id !== 'device', isLocalNode: (id: string) => id === 'node-1' }),
  },
  '@/lib/utils': { errorMessage: String },
}
for (const name of ['DialogClose', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle']) {
  modules[`@/components/ui/${name}.vue`] = moduleDefault(Slotted)
}
const dialog = compileClientComponent(new URL('./NotebookCopyDialog.vue', import.meta.url), modules)

async function render(count: number) {
  const copy = vi.fn()
  const host = defineComponent({ setup: () => () => h(dialog, { open: true, source: 'a.csv', count, groupId: 'group', onCopy: copy }) })
  const { root, app } = await mountApp(host)
  await flush()
  return { root, app, copy }
}

describe('notebook copy dialog', () => {
  it('offers user buckets and emits the browsed folder', async () => {
    const { root, app, copy } = await render(1)
    expect(searchBuckets).toHaveBeenCalledWith('', expect.objectContaining({ groupId: 'group' }))
    expect(content(root)).not.toContain('Bucket ws-scratch')
    expect(content(root)).not.toContain('Bucket laptop')
    expect(button(root, 'Copy a.csv').props.disabled).toBe(true)
    await click(button(root, 'Bucket dest'))
    await click(button(root, 'Browse dest out'))
    expect(content(root)).toContain('s3://dest/out/')
    await click(button(root, 'Copy a.csv'))
    expect(copy).toHaveBeenCalledWith({ bucket: 'dest', prefix: 'out/', nodeId: null })
    app.unmount()
  })

  it('drops the folder when the bucket changes and counts files', async () => {
    const { root, app, copy } = await render(3)
    await click(button(root, 'Bucket dest'))
    await click(button(root, 'Browse dest out'))
    await click(button(root, 'Bucket other'))
    expect(content(root)).toContain('s3://other/')
    await click(button(root, 'Copy 3 files'))
    expect(copy).toHaveBeenCalledWith({ bucket: 'other', prefix: '', nodeId: null })
    app.unmount()
  })

  it('names the node of a bucket on another node', async () => {
    const { root, app, copy } = await render(1)
    await click(button(root, 'Bucket remote'))
    await click(button(root, 'Copy a.csv'))
    expect(copy).toHaveBeenCalledWith({ bucket: 'remote', prefix: '', nodeId: 'node-2' })
    app.unmount()
  })
})
