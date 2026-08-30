import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  input,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import * as PermissionPaths from '@/components/groups/permission-paths'
import * as Editor from '@/lib/crate/editor'
import * as Paths from '@/lib/crate/paths'
import * as Emit from '@/lib/profiles/emit'

const documentPaths = ref<string[]>([])
const grants = ref<string[]>([])
const loading = ref(false)

const EmptyStub = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup: (props, { attrs, emit }) => () => h('input', {
    ...attrs,
    value: props.modelValue,
    onInput: (event: { target: HostNode }) => emit('update:modelValue', String(event.target.value)),
  }),
})
const GroupSelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, disabled: Boolean },
  emits: ['update:modelValue'],
  inheritAttrs: false,
  setup: (props, { emit, slots }) => () => h('div', [
    h('select', { 'aria-label': 'Group', value: props.modelValue, disabled: props.disabled }),
    h('button', { onClick: () => emit('update:modelValue', 'group-2') }, 'Pick group two'),
    slots.action?.(),
  ]),
})

const icons = new Proxy({}, { get: () => EmptyStub })

const LocationFolderTree = compileClientComponent(new URL('./LocationFolderTree.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Skeleton.vue': moduleDefault(Passthrough),
  '@/components/groups/permission-paths': PermissionPaths,
  '@/lib/crate/paths': Paths,
})

const DatasetLocationDialog = compileClientComponent(
  new URL('./DatasetLocationDialog.vue', import.meta.url),
  {
    vue: VueRuntime,
    'vue-router': RouterRuntime,
    '@lucide/vue': icons,
    '@/components/ui/Button.vue': moduleDefault(ButtonStub),
    '@/components/ui/Dialog.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
    '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
    '@/components/ui/Input.vue': moduleDefault(InputStub),
    '@/components/groups/GroupSelect.vue': moduleDefault(GroupSelectStub),
    './LocationFolderTree.vue': moduleDefault(LocationFolderTree),
    '@/composables/useAruna': { useAruna: () => ({ realm: ref({ id: 'realm-1' }) }) },
    '@/lib/crate/paths': Paths,
    '@/lib/profiles/emit': Emit,
    '@/lib/crate/editor': Editor,
  },
)

const GROUPS = [
  { value: 'group-1', label: 'Research group' },
  { value: 'group-2', label: 'Other group' },
]

function draftAt(path: string): Editor.CrateDraft {
  return { ...Editor.newDraft(), groupId: 'group-1', visibility: 'group', path }
}

interface Seen {
  updates: Editor.CrateDraft[]
  folders: string[]
  slugs: string[]
  opens: boolean[]
  createGroup: ReturnType<typeof vi.fn>
}

function seen(): Seen {
  return { updates: [], folders: [], slugs: [], opens: [], createGroup: vi.fn() }
}

async function memoryRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', name: 'dashboard', component: EmptyStub },
      { path: '/app/groups/:id', name: 'group', component: EmptyStub },
    ],
  })
  await router.push('/app')
  await router.isReady()
  return router
}

async function mount(draft: Editor.CrateDraft, events: Seen, mode: 'create' | 'edit' = 'create') {
  return mountApp(DatasetLocationDialog, {
    router: await memoryRouter(),
    props: {
      open: true,
      draft,
      mode,
      groupOptions: GROUPS,
      folder: Paths.splitPath(draft.path ?? '').prefix,
      slug: Paths.splitPath(draft.path ?? '').slug,
      documentPaths: documentPaths.value,
      grants: grants.value,
      loading: loading.value,
      onUpdate: (next: Editor.CrateDraft) => events.updates.push(next),
      onFolder: (folder: string) => events.folders.push(folder),
      onSlug: (slug: string) => events.slugs.push(slug),
      'onUpdate:open': (value: boolean) => events.opens.push(value),
      onCreateGroup: events.createGroup,
    },
  })
}

/** Every folder tree row, in render order, as a person reads it. */
function rows(root: HostNode): string[] {
  return nodes(root)
    .filter((node) => node.props.role === 'treeitem')
    .map((node) => content(node).trim())
}

beforeEach(() => {
  documentPaths.value = []
  grants.value = []
  loading.value = false
})

describe('dataset location dialog', () => {
  it('renders the group folders and their datasets', async () => {
    documentPaths.value = ['datasets/one', 'datasets/deep/two', 'profiles/hidden', 'top']
    const events = seen()
    const { root } = await mount(draftAt('reads'), events)

    expect(rows(root)).toEqual(['Group root', 'datasets', 'deep', 'one', 'top'])
    expect(content(root)).not.toContain('profiles')
    expect(content(root)).not.toContain('hidden')

    await click(element(root, (node) => node.props['aria-label'] === 'Expand deep'))
    expect(rows(root)).toEqual(['Group root', 'datasets', 'deep', 'two', 'one', 'top'])
  })

  it('leaves the datasets in a folder unselectable', async () => {
    documentPaths.value = ['datasets/one']
    const { root } = await mount(draftAt('reads'), seen())

    expect(nodes(root).some((node) => node.tag === 'button' && content(node).trim() === 'one')).toBe(false)
  })

  it('emits the picked folder', async () => {
    documentPaths.value = ['datasets/one']
    const events = seen()
    const { root } = await mount(draftAt('reads'), events)

    await click(button(root, 'datasets'))

    expect(events.folders).toEqual(['datasets'])
    expect(events.slugs).toEqual([])
  })

  it('emits the empty folder for the group root', async () => {
    documentPaths.value = ['datasets/one']
    const events = seen()
    const { root } = await mount(draftAt('datasets/reads'), events)

    await click(button(root, 'Group root'))

    expect(events.folders).toEqual([''])
  })

  it('adds a new folder under the selection and picks it', async () => {
    documentPaths.value = ['datasets/one']
    const events = seen()
    const { root } = await mount(draftAt('datasets/reads'), events)

    await typeValue(input(root, 'aria-label', 'New folder name'), 'My Folder')
    await click(button(root, 'Create folder'))

    expect(events.folders).toEqual(['datasets/my-folder'])
    expect(rows(root)).toEqual(['Group root', 'datasets', 'my-folder(new)', 'one'])
  })

  it('shows a picked folder without a name yet', async () => {
    // The folder never leaks into the name box; the preview marks the missing name.
    documentPaths.value = ['datasets/one']
    const Host = defineComponent({
      setup() {
        const folder = ref('')
        return () => h(DatasetLocationDialog, {
          open: true,
          draft: draftAt(''),
          mode: 'create',
          groupOptions: GROUPS,
          folder: folder.value,
          slug: '',
          documentPaths: documentPaths.value,
          grants: grants.value,
          onFolder: (value: string) => { folder.value = value },
        })
      },
    })
    const { root } = await mountApp(Host, { router: await memoryRouter() })

    await click(button(root, 'datasets'))

    expect(content(root)).toContain('/realm-1/g/group-1/meta/datasets/…')
    expect(input(root, 'aria-label', 'Dataset path').props.value).toBe('')
    const row = nodes(root).find((node) => node.props.role === 'treeitem' && content(node).trim() === 'datasets')
    expect(row?.props['aria-selected']).toBe(true)
  })

  it('slugifies what is typed as the last path part', async () => {
    const events = seen()
    const { root } = await mount(draftAt('datasets/reads'), events)

    await typeValue(input(root, 'aria-label', 'Dataset path'), 'New Reads!')

    expect(events.slugs).toEqual(['new-reads'])
  })

  it('disables the folders no role can write to', async () => {
    documentPaths.value = ['datasets/one', 'other/two']
    grants.value = ['datasets']
    const { root } = await mount(draftAt('datasets/reads'), seen())

    const blocked = element(root, (node) => node.tag === 'button' && content(node).trim() === 'other')
    expect(blocked.props.disabled).toBe(true)
    expect(blocked.props.title).toBe('Your roles cannot write here')
    expect(button(root, 'Group root').props.disabled).toBe(true)
    expect(button(root, 'datasets').props.disabled).toBe(false)
  })

  it('reports the chosen visibility', async () => {
    const events = seen()
    const { root } = await mount(draftAt('datasets/reads'), events)

    await click(button(root, 'Public'))

    expect(events.updates).toEqual([{ ...draftAt('datasets/reads'), visibility: 'public' }])
  })

  it('reports the chosen group', async () => {
    const events = seen()
    const { root } = await mount(draftAt('datasets/reads'), events)

    await click(button(root, 'Pick group two'))

    expect(events.updates[0]?.groupId).toBe('group-2')
  })

  it('offers group creation from the picker', async () => {
    const events = seen()
    const { root } = await mount(draftAt('datasets/reads'), events)

    await click(button(root, 'Create a group'))

    expect(events.createGroup).toHaveBeenCalledTimes(1)
  })

  it('locks the group and the path of a stored dataset', async () => {
    documentPaths.value = ['datasets/one']
    const { root } = await mount(draftAt('datasets/reads'), seen(), 'edit')

    expect(element(root, (node) => node.tag === 'select').props.disabled).toBe(true)
    expect(nodes(root).some((node) => node.tag === 'input')).toBe(false)
    expect(rows(root)).toEqual([])
    expect(content(element(root, (node) => node.props.title === 'datasets/reads'))).toBe('datasets/reads')
  })

  it('shows the full permission path and closes on done', async () => {
    const events = seen()
    const { root } = await mount(draftAt('datasets/reads'), events)

    expect(content(root)).toContain('/realm-1/g/group-1/meta/datasets/reads')
    await click(button(root, 'Done'))

    expect(events.opens).toEqual([false])
  })
})
