import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as NotebookDocument from '@/lib/notebook/document'
import * as Context from '@/composables/s3/context'
import * as Utils from '@/lib/utils'
import * as Workspaces from '@/lib/workspaces'
import { button, click, compileClientComponent, content, element, flush, input, moduleDefault, mountApp, typeValue } from '@/test/clientRender'

const context = ref<{ userId: string; nodeId: string; groupId: string; session: { accessKeyId: string } } | null>(null)
const writable = ref(true)
const listObjects = vi.fn()
const push = vi.fn()
const replace = vi.fn()
const location = ref<{ bucket: string; prefix: string; key?: string } | null>(null)
const route = { query: { browse: '1' } }
const Slotted = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const Button = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Input = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', {
    ...attrs, value: props.modelValue,
    onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
  }),
})
const Dialog = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => props.open ? h('section', slots.default?.()) : null,
})
const groupSelection = () => ({ groupsLoading: ref(false), hasGroups: ref(true) })
const modules: Record<string, unknown> = {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push, replace }), useRoute: () => route },
  '@lucide/vue': new Proxy({}, { get: () => Slotted }),
  '@/components/dashboard/PageHeader.vue': moduleDefault(Slotted),
  '@/components/compute/ComputeGates.vue': moduleDefault(Slotted),
  '@/components/ui/Button.vue': moduleDefault(Button),
  '@/components/ui/Input.vue': moduleDefault(Input),
  '@/components/ui/Dialog.vue': moduleDefault(Dialog),
  '@/components/ui/EmptyState.vue': moduleDefault(defineComponent({
    props: ['title'], setup: (props) => () => h('p', props.title),
  })),
  '@/composables/useS3': {
    useS3: () => ({
      activeContext: context, activeKey: ref({}),
      canWrite: (bucket: string) => Boolean(bucket && context.value && writable.value),
      endpointForNode: () => 'https://node.test', nodeIdFor: () => 'node-1',
      listBuckets: async () => [{ name: 'reef' }], listObjects,
    }),
    s3ErrorMessage: String, isS3AuthError: () => false, isS3NetworkError: () => false,
  },
  '@/composables/useAruna': { useAruna: () => ({
    currentUser: ref({ id: 'user-1' }), myGroups: ref([{ id: 'group-1', name: 'Research' }]),
  }) },
  '@/composables/useGroupSelection': { useGroupSelection: groupSelection, useGroupContext: groupSelection, activeGroupId: ref('group-1') },
  '@/composables/useNotebookLocation': { useNotebookLocation: () => ({ scope: ref('scope'), location, remember: vi.fn() }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: () => 'Local node' }) },
  '@/composables/useStagingReferences': { useStagingReferences: () => ({
    prefixHasReferences: () => false, keyIsReferenced: () => false,
  }) },
  '@/composables/s3/context': { ...Context, shouldOpenContext: () => false },
  '@/lib/config': { featureEnabled: () => true },
  '@/lib/notebook/document': NotebookDocument,
  '@/lib/utils': Utils,
  '@/lib/workspaces': Workspaces,
}
for (const name of ['Badge', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'DialogClose', 'DropdownMenu', 'DropdownMenuTrigger', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuLabel', 'Notice', 'Spinner']) {
  modules[`@/components/ui/${name}.vue`] = moduleDefault(Slotted)
}
for (const name of ['Breadcrumbs', 'ObjectBrowserSkeleton', 'ObjectIcon']) {
  modules[`@/components/data/${name}.vue`] = moduleDefault(Slotted)
}
const panel = compileClientComponent(new URL('../components/data/ObjectBrowserPanel.vue', import.meta.url), modules)
modules['@/components/data/ObjectBrowserPanel.vue'] = moduleDefault(panel)
const view = compileClientComponent(new URL('./NotebooksView.vue', import.meta.url), modules)

beforeEach(() => {
  context.value = { userId: 'user-1', nodeId: 'node-1', groupId: 'group-1', session: { accessKeyId: 'session-1' } }
  writable.value = true
  push.mockReset()
  replace.mockReset()
  location.value = null
  route.query.browse = '1'
  listObjects.mockReset().mockResolvedValue({ folders: [], objects: [] })
})

async function render() {
  const { root } = await mountApp(view)
  await flush()
  await click(button(root, 'reef'))
  return root
}

describe('notebook workspace', () => {
  it('resumes the remembered notebook from the sidebar entry', async () => {
    route.query.browse = ''
    location.value = { bucket: 'reef', prefix: 'notebooks', key: 'notebooks/analysis.ipynb' }
    const { app } = await mountApp(view)
    expect(replace).toHaveBeenCalledWith({ name: 'notebook', params: { bucketId: 'reef', key: 'notebooks/analysis.ipynb' }, query: { group: 'group-1' } })
    app.unmount()
  })

  it('keeps the notebook picker open when browsing was requested', async () => {
    location.value = { bucket: 'reef', prefix: 'notebooks', key: 'notebooks/analysis.ipynb' }
    const { app } = await mountApp(view)
    expect(replace).not.toHaveBeenCalled()
    app.unmount()
  })

  it('keeps folders and notebooks while filtering ordinary files', async () => {
    listObjects.mockResolvedValue({
      folders: [{ prefix: 'notebooks/', name: 'notebooks' }],
      objects: [{ key: 'analysis.IPYNB', name: 'analysis.IPYNB' }, { key: 'reads.csv', name: 'reads.csv' }],
    })
    const root = await render()
    expect(content(root)).toContain('notebooks/')
    expect(content(root)).not.toContain('reads.csv')
    await click(element(root, (node) => node.tag === 'tr' && content(node).includes('analysis.IPYNB')))
    expect(push).toHaveBeenCalledWith({ name: 'notebook', params: { bucketId: 'reef', key: 'analysis.IPYNB' }, query: { group: 'group-1' } })
  })

  it('keeps pagination available when a page contains no notebooks', async () => {
    listObjects.mockResolvedValueOnce({ folders: [], objects: [{ key: 'reads.csv', name: 'reads.csv' }], nextToken: 'next' })
      .mockResolvedValueOnce({ folders: [], objects: [{ key: 'later.ipynb', name: 'later.ipynb' }] })
    const root = await render()
    expect(content(root)).toContain('No notebooks on this page')
    await click(button(root, 'Load more'))
    expect(listObjects).toHaveBeenLastCalledWith('reef', '', 'next', null)
    expect(content(root)).toContain('later.ipynb')
  })

  it('opens a named notebook in the selected writable bucket', async () => {
    const root = await render()
    await click(button(root, 'New notebook'))
    expect(button(root, 'Open').props.disabled).toBe(true)
    await typeValue(input(root, 'aria-label', 'Notebook name'), 'First look')
    await click(button(root, 'Open'))
    expect(push).toHaveBeenCalledWith({ name: 'notebook', params: { bucketId: 'reef', key: 'notebooks/first-look.ipynb' }, query: { group: 'group-1' } })
  })

  it('blocks creation when write access is lost', async () => {
    const root = await render()
    await click(button(root, 'New notebook'))
    await typeValue(input(root, 'aria-label', 'Notebook name'), 'Draft')
    writable.value = false
    await flush()
    expect(button(root, 'New notebook').props.disabled).toBe(true)
    expect(button(root, 'Open').props.disabled).toBe(true)
    await click(button(root, 'Open'))
    expect(push).not.toHaveBeenCalled()
  })

  it('closes creation when the storage session changes', async () => {
    const root = await render()
    await click(button(root, 'New notebook'))
    await typeValue(input(root, 'aria-label', 'Notebook name'), 'Draft')
    context.value = null
    await flush()
    expect(content(root)).not.toContain('The file is written on the first save')
    expect(push).not.toHaveBeenCalled()
  })
})
