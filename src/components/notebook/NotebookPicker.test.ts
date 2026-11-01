import { defineComponent, h, ref, shallowRef } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Finder from '@/lib/notebook/finder'
import * as Document from '@/lib/notebook/document'
import { bubbleClick, button, click, compileClientComponent, content, flush, mountApp, moduleDefault, nodes, type HostNode } from '@/test/clientRender'

const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, [slots.header?.(), slots.default?.(), slots.footer?.()]) })
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('input', { value: props.modelValue, onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value) }),
})
const SwitchStub = defineComponent({
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { emit }) => () => h('button', { role: 'switch', onClick: () => emit('update:checked', !props.checked) }),
})

const lab = Finder.notebooksOf('lab', [{ key: 'notebooks/a.ipynb' }, { key: 'notebooks/deep/b.ipynb' }])
const far = [{ bucket: 'far', key: 'remote.ipynb', nodeId: 'node-2' }]
const finder = {
  buckets: ref(['lab', 'empty', 'far']),
  nodes: shallowRef(new Map<string, string | null>([['lab', null], ['empty', null], ['far', 'node-2']])),
  scans: shallowRef(new Map([['lab', { notebooks: lab, truncated: false }], ['empty', { notebooks: [], truncated: false }], ['far', { notebooks: far, truncated: false }]])),
  notebooks: ref([...lab, ...far]),
  failed: ref<string[]>([]),
  partial: ref<string[]>([]),
  state: ref('ready'),
  error: ref(null),
  load: vi.fn(),
}
const referenceForNode = vi.fn(async (nodeId: string, groupId: string) => ({ nodeId, groupId, accessKeyId: 'k2' }))
const listObjects = vi.fn(async (_bucket: string, prefix: string, _token?: string, _node?: string, _options?: unknown) => (prefix === ''
  ? { folders: [{ prefix: 'notebooks/', name: 'notebooks' }, { prefix: 'results/', name: 'results' }], objects: [{ key: 'readme.md', name: 'readme.md' }] }
  : { folders: [{ prefix: 'notebooks/deep/', name: 'deep' }], objects: [{ key: 'notebooks/a.ipynb', name: 'a.ipynb' }] }))
const push = vi.fn()

const component = compileClientComponent(new URL('./NotebookPicker.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push }) },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DetailDialog.vue': moduleDefault(Slotted('div')),
  '@/components/ui/DialogTitle.vue': moduleDefault(Slotted('h2')),
  '@/components/ui/IconTile.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/Spinner.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/composables/useNotebookFinder': { useNotebookFinder: () => finder },
  '@/composables/useGroupSelection': { activeGroupId: ref('group') },
  '@/composables/useS3': { useS3: () => ({ listObjects, referenceForNode }) },
  '@/lib/notebook/finder': Finder,
  '@/lib/notebook/document': Document,
  '@/lib/utils': { errorMessage: String, formatDateTime: () => '29 Oct 2026, 13:38' },
})

const rows = (root: HostNode) => nodes(root).filter((node) => node.tag === 'tr').slice(1).map((node) => content(node).replace(/\s+/g, ' '))

describe('the notebook picker', () => {
  it('shows only places that hold notebooks, with counts, until all files are asked for', async () => {
    const { root } = await mountApp(component, { props: { open: true, finder } })

    expect(rows(root)).toEqual([expect.stringContaining('lab'), expect.stringContaining('far')])
    expect(rows(root)[0]).toContain('2 notebooks')
    expect(content(root)).toContain('Hidden because they hold no notebooks: 1 bucket')

    await bubbleClick(button(root, 'lab'))
    await flush()
    expect(rows(root)).toHaveLength(1)
    expect(rows(root)[0]).toContain('notebooks/')
    expect(content(root)).toContain('1 folder, 1 file')

    await click(nodes(root).find((node) => node.props.role === 'switch')!)
    expect(rows(root).join(' ')).toContain('results/')
    expect(rows(root).join(' ')).toContain('readme.md')
  })

  it('offers every bucket as the place of a new notebook', async () => {
    const { root } = await mountApp(component, { props: { open: true, finder, mode: 'new' } })

    expect(rows(root)).toEqual([expect.stringContaining('lab'), expect.stringContaining('empty'), expect.stringContaining('far')])
    expect(content(root)).not.toContain('Hidden because they hold no notebooks')
  })

  it('finds notebooks in all buckets and opens one directly', async () => {
    const { root } = await mountApp(component, { props: { open: true, finder } })
    const search = nodes(root).find((node) => node.tag === 'input')!
    ;(search.props.onInput as (event: { target: { value: string } }) => void)({ target: { value: 'deep' } })
    await flush()

    expect(content(root)).toContain('1 notebook found in all buckets')
    await bubbleClick(button(root, 'b.ipynb'))
    expect(push).toHaveBeenCalledWith({ name: 'notebook', params: { bucketId: 'lab', key: 'notebooks/deep/b.ipynb' }, query: { group: 'group' } })
  })

  it('loads a long folder page by page through the listing cursor', async () => {
    listObjects
      .mockResolvedValueOnce({ folders: [], objects: [{ key: 'readme.md', name: 'readme.md' }], nextToken: 't2' } as never)
      .mockResolvedValueOnce({ folders: [{ prefix: 'later/', name: 'later' }], objects: [{ key: 'z.ipynb', name: 'z.ipynb' }] } as never)
    const { root } = await mountApp(component, { props: { open: true, finder } })
    await bubbleClick(button(root, 'lab'))
    await flush()
    expect(content(root)).toContain('No notebooks loaded yet')

    await click(button(root, 'Load more'))
    await flush()
    expect(listObjects).toHaveBeenLastCalledWith('lab', '', 't2')
    expect(rows(root).join(' ')).toContain('z.ipynb')
    expect(() => button(root, 'Load more')).toThrow()
  })

  it('opens and browses a bucket on another node through that node', async () => {
    const { root } = await mountApp(component, { props: { open: true, finder } })
    const search = nodes(root).find((node) => node.tag === 'input')!
    ;(search.props.onInput as (event: { target: { value: string } }) => void)({ target: { value: 'remote' } })
    await flush()
    await bubbleClick(button(root, 'remote.ipynb'))
    expect(push).toHaveBeenLastCalledWith({ name: 'notebook', params: { bucketId: 'far', key: 'remote.ipynb' }, query: { group: 'group', node: 'node-2' } })

    ;(search.props.onInput as (event: { target: { value: string } }) => void)({ target: { value: '' } })
    await flush()
    await bubbleClick(button(root, 'far'))
    await flush()
    expect(listObjects).toHaveBeenLastCalledWith('far', '', undefined, 'node-2', { reference: { nodeId: 'node-2', groupId: 'group', accessKeyId: 'k2' } })
  })
})
