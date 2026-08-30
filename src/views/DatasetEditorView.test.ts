import * as VueRuntime from 'vue'
import { computed, defineComponent, h, reactive, ref, watch, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as ProfileSeed from '@/lib/crate/profileSeed'
import * as Issues from '@/lib/crate/issues'
import * as Paths from '@/lib/crate/paths'
import * as Api from '@/lib/api'
import * as Emit from '@/lib/profiles/emit'
import * as Utils from '@/lib/utils'

const route = reactive<{ name: string; params: Record<string, string> }>({ name: 'dataset-new', params: {} })
const groups = ref([{ id: 'group-1', name: 'Research group' }])
const profiles = ref<Array<Record<string, unknown>>>([])
const currentUser = ref<{ preferredProfileId?: string } | null>(null)
const saving = ref(false)
const apiBaseUrl = ref('https://api.example.test')
const authToken = ref('token')
const createMetadata = vi.fn()
const getMetadataItem = vi.fn()
const fetchRoCrateRaw = vi.fn()
const replaceMetadataRoCrate = vi.fn()
const routerPush = vi.fn(async () => undefined)

const previewResult = ref<Api.ProfileValidationPreviewResponse | null>(null)
const previewRunning = ref(false)
const previewError = ref<string | null>(null)
const previewUnavailable = ref(false)
const previewRejection = ref<unknown>(null)
const verify = vi.fn(async () => true)

// A dataset with a name, a description and a Person linked as its author.
function seeded(draft: Editor.CrateDraft): Editor.CrateDraft {
  const named = Editor.updateValue(draft, './', 'name', 0, 'Example dataset')
  const described = Editor.updateValue(named, './', 'description', 0, 'What it holds.')
  const person = Editor.addEntity(described, { type: 'Person', name: 'Ada Lovelace' })
  return Editor.addValue(person.draft, './', 'author', { kind: 'reference', value: person.entity.id })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function namedCrate(name: string) {
  return Editor.toRoCrate(Editor.updateValue(Editor.newDraft(), './', 'name', 0, name))
}

const pathTaken = ref(false)
const pathChecking = ref(false)

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
// Keeps the route target inspectable: the harness records every prop it sets.
const RouterLinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup: (props, { attrs, slots }) => () => h('a', { ...attrs, to: props.to }, slots.default?.()),
})
const PageHeaderStub = defineComponent({
  props: { title: String },
  setup: (props, { slots }) => () =>
    h('header', [h('h1', props.title), slots.breadcrumbs?.(), slots.description?.(), slots.actions?.()]),
})
// The location dialog, reduced to what the view wires to the draft.
const LocationStub = defineComponent({
  props: {
    open: Boolean,
    draft: { type: Object, required: true },
    mode: { type: String, default: 'create' },
    groupOptions: { type: Array, default: () => [] },
    folder: { type: String, default: '' },
    slug: { type: String, default: '' },
  },
  emits: ['update:open', 'update', 'folder', 'slug', 'create-group'],
  setup(props, { emit }) {
    return () => props.open
      ? h('div', [
        h('p', `Location ${props.mode}`),
        h('input', { 'aria-label': 'Dataset path', value: Paths.joinPath(props.folder, props.slug) }),
        h('input', {
          'aria-label': 'Dataset slug',
          value: props.slug,
          onInput: (event: { target: { value: string } }) => emit('slug', event.target.value),
        }),
        h('button', { onClick: () => emit('folder', 'other') }, 'Pick other folder'),
        ...(props.groupOptions as Array<{ value: string; label: string }>).map((option) =>
          h('button', {
            onClick: () => emit('update', { ...props.draft, groupId: option.value }),
          }, `Move to ${option.label}`)),
      ])
      : null
  },
})
const BrowserStub = defineComponent({
  props: { draft: { type: Object, required: true } },
  setup: (props) => () => h('p', `Entities ${(props.draft as Editor.CrateDraft).entities.length}`),
})
const EditorStub = defineComponent({
  props: { draft: { type: Object, required: true }, profiles: { type: Array, default: () => [] } },
  emits: ['update', 'profile'],
  setup(props, { emit }) {
    return () => h('div', [
      h('p', Editor.displayName(Editor.rootEntity(props.draft as Editor.CrateDraft))),
      h('p', `Document ${(props.draft as Editor.CrateDraft).documentId ?? 'none'}`),
      h('input', {
        'aria-label': 'Dataset name',
        value: Editor.entityName(Editor.rootEntity(props.draft as Editor.CrateDraft)),
        onInput: (event: { target: { value: string } }) => emit('update', Editor.setProperty(
          props.draft as Editor.CrateDraft,
          './',
          'name',
          event.target.value ? [{ kind: 'text', value: event.target.value }] : [],
        )),
      }),
      h('p', `Profiles ${(props.profiles as Array<{ label: string }>).map((profile) => profile.label).join(', ')}`),
      ...(props.profiles as Array<{ value: string; label: string }>).map((profile) =>
        h('button', { onClick: () => emit('profile', profile.value) }, `Choose ${profile.label}`)),
      h('button', { onClick: () => emit('update', seeded(props.draft as Editor.CrateDraft)) }, 'Seed dataset'),
    ])
  },
})
const GraphStub = defineComponent(() => () => h('p', 'Graph pane'))
const DrawerStub = defineComponent({
  props: { nodeIssues: { type: Array, default: () => [] } },
  setup: (props) => () => h('p', `Node issues ${(props.nodeIssues as Array<{ message: string }>).map((issue) => issue.message).join(', ')}`),
})
const NodeCheckStub = defineComponent({
  props: { canSave: Boolean, actionLabel: String },
  emits: ['save'],
  setup: (props, { emit }) => () =>
    h('button', { disabled: !props.canSave, onClick: () => emit('save') }, props.actionLabel),
})

const DatasetEditorView = compileClientComponent(new URL('./DatasetEditorView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': {
    RouterLink: RouterLinkStub,
    useRoute: () => route,
    useRouter: () => ({ push: routerPush }),
  },
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Skeleton.vue': moduleDefault(EmptyStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(EmptyStub),
  '@/components/groups/CreateGroupDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/ImportCrateDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/editor/DatasetLocationDialog.vue': moduleDefault(LocationStub),
  '@/components/metadata/editor/EntityBrowser.vue': moduleDefault(BrowserStub),
  '@/components/metadata/editor/EntityEditor.vue': moduleDefault(EditorStub),
  '@/components/metadata/editor/EditorGraph.vue': moduleDefault(GraphStub),
  '@/components/metadata/editor/IssueDrawer.vue': moduleDefault(DrawerStub),
  '@/components/metadata/editor/NodeCheckPanel.vue': moduleDefault(NodeCheckStub),
  '@/composables/useAruna': {
    profileReferenceIri: (profile: { profileUri?: string }) => profile?.profileUri,
    useAruna: () => ({
      groups,
      profiles,
      currentUser,
      createMetadata,
      getMetadataItem,
      fetchRoCrateRaw,
      replaceMetadataRoCrate,
      saving,
      apiBaseUrl,
      authToken,
    }),
  },
  '@/composables/useGroupSelection': {
    useGroupSelection: (selected: Ref<string>) => {
      watch(groups, (available) => {
        if (!selected.value && available.length) selected.value = available[0].id
      }, { immediate: true })
      return {}
    },
  },
  '@/composables/usePathPrefixes': {
    usePathPrefixes: () => ({
      options: computed(() => [{ value: 'datasets', label: 'datasets/' }, { value: '', label: 'Group root' }]),
      preselected: computed(() => 'datasets'),
      documentPaths: computed(() => ['datasets/one']),
      grants: computed(() => []),
      loading: ref(false),
    }),
  },
  '@/composables/usePathTaken': {
    usePathTaken: () => ({ taken: pathTaken, checking: pathChecking }),
  },
  '@/composables/useProfilePreview': {
    useProfilePreview: () => ({
      result: previewResult,
      running: previewRunning,
      error: previewError,
      unavailable: previewUnavailable,
      rejection: previewRejection,
      preview: vi.fn(),
      previewNow: vi.fn(),
      verify,
    }),
  },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ deviceClient: ref(null) }) },
  '@/composables/useAssistantEditor': { provideEditorBridge: vi.fn() },
  '@/lib/desktop': { isDesktop: () => false },
  '@/lib/deviceApi': { previewDeviceDraft: vi.fn(), requireDevice: vi.fn() },
  '@/lib/api': Api,
  '@/lib/utils': Utils,
  '@/lib/profiles/emit': Emit,
  '@/lib/profiles/vocabulary': { loadVocabIndex: () => Promise.resolve(null) },
  '@/lib/crate/editor': Editor,
  '@/lib/crate/profileSeed': ProfileSeed,
  '@/lib/crate/issues': Issues,
  '@/lib/crate/paths': Paths,
})

async function name(root: Parameters<typeof content>[0], value = 'Draft') {
  await typeValue(element(root, (node) => node.props['aria-label'] === 'Dataset name'), value)
}

async function openLocation(root: Parameters<typeof content>[0]) {
  await click(button(root, 'Location'))
}

beforeEach(() => {
  route.name = 'dataset-new'
  route.params = {}
  groups.value = [{ id: 'group-1', name: 'Research group' }]
  profiles.value = []
  currentUser.value = null
  createMetadata.mockReset().mockResolvedValue({ document_id: 'dataset-1' })
  replaceMetadataRoCrate.mockReset().mockResolvedValue({ document_id: 'dataset-1' })
  getMetadataItem.mockReset().mockResolvedValue({
    document_id: 'dataset-1',
    group_id: 'group-1',
    document_path: 'datasets/existing',
    public: false,
  })
  fetchRoCrateRaw.mockReset().mockResolvedValue(Editor.toRoCrate(seeded(Editor.newDraft())))
  verify.mockReset().mockResolvedValue(true)
  pathTaken.value = false
  pathChecking.value = false
  routerPush.mockClear()
  previewResult.value = null
  previewRejection.value = null
})

describe('DatasetEditorView', () => {
  it('opens a new dataset in the editor', async () => {
    const mounted = await mountApp(DatasetEditorView)

    expect(content(mounted.root)).toContain('Entities 1')
    await name(mounted.root, 'Reads 2026')

    expect(content(mounted.root)).toContain('Research group')
    expect(content(mounted.root)).toContain('datasets/')
    expect(content(mounted.root)).toContain('reads-2026')
    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  it('summarises the group, the path and the visibility', async () => {
    const mounted = await mountApp(DatasetEditorView)
    await name(mounted.root, 'Reads 2026')

    const link = element(mounted.root, (node) => node.tag === 'a')
    expect(link.props.to).toEqual({ name: 'group', params: { id: 'group-1' } })
    expect(content(link)).toBe('Research group')
    expect(content(mounted.root)).toContain('datasets/reads-2026')
    expect(content(mounted.root)).toContain('Visible to the group')
    mounted.app.unmount()
  })

  it('refuses a path the group already uses', async () => {
    pathTaken.value = true
    const mounted = await mountApp(DatasetEditorView)
    await name(mounted.root, 'Reads 2026')

    expect(content(mounted.root)).toContain('already in use')
    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('opens the location dialog from the header', async () => {
    const mounted = await mountApp(DatasetEditorView)
    expect(content(mounted.root)).not.toContain('Location create')

    await openLocation(mounted.root)

    expect(content(mounted.root)).toContain('Location create')
    mounted.app.unmount()
  })

  it('offers the dialog when no group is chosen yet', async () => {
    groups.value = []
    const mounted = await mountApp(DatasetEditorView)
    await name(mounted.root, 'Reads')

    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(true)
    await click(button(mounted.root, 'Choose a group'))

    expect(content(mounted.root)).toContain('Location create')
    mounted.app.unmount()
  })

  it('takes the group the dialog reports', async () => {
    groups.value = [{ id: 'group-1', name: 'Research group' }, { id: 'group-2', name: 'Second group' }]
    const mounted = await mountApp(DatasetEditorView)
    await openLocation(mounted.root)

    await click(button(mounted.root, 'Move to Second group'))
    await name(mounted.root, 'Reads')
    await click(button(mounted.root, 'Create dataset'))
    await flush()

    expect(createMetadata.mock.calls[0][0]).toMatchObject({ group_id: 'group-2' })
    mounted.app.unmount()
  })

  it('derives the path from the name until the slug is edited', async () => {
    const mounted = await mountApp(DatasetEditorView)
    await openLocation(mounted.root)
    const path = () => element(mounted.root, (node) => node.props['aria-label'] === 'Dataset path')
    const slug = () => element(mounted.root, (node) => node.props['aria-label'] === 'Dataset slug')

    await name(mounted.root, 'Reads 2026')
    expect(path().props.value).toBe('datasets/reads-2026')

    await typeValue(slug(), 'my-reads')
    await name(mounted.root, 'Reads 2027')
    expect(path().props.value).toBe('datasets/my-reads')

    // A picked folder survives later name edits; a cleared slug follows the name again.
    await click(button(mounted.root, 'Pick other folder'))
    await typeValue(slug(), '')
    await name(mounted.root, 'Reads 2028')
    expect(path().props.value).toBe('other/reads-2028')
    mounted.app.unmount()
  })

  it('initializes a new draft from the preferred profile', async () => {
    profiles.value = [{
      id: 'genomics',
      name: 'Genomics',
      managed: true,
      profileUri: 'https://example.test/profiles/genomics',
      propertyRules: [{
        id: 'identifier',
        label: 'Identifier',
        description: '',
        kind: 'text',
        propertyUri: 'http://schema.org/identifier',
        valueName: 'identifier',
        obligation: 'MUST',
      }],
      entityRules: [],
    }]
    currentUser.value = { preferredProfileId: 'genomics' }
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Create dataset'))
    await flush()

    const graph = createMetadata.mock.calls[0][0].rocrate['@graph'] as Array<Record<string, unknown>>
    const root = graph.find((entity) => entity['@id'] === './')
    expect(root).toMatchObject({ conformsTo: { '@id': 'https://example.test/profiles/genomics' } })
    // The seeded identifier row stays empty, so it must not reach the crate.
    expect(root).not.toHaveProperty('identifier')
    mounted.app.unmount()
  })

  it('excludes private profiles from the conformance picker', async () => {
    profiles.value = [
      { id: 'private', name: 'Private profile', managed: false },
      { id: 'public', name: 'Public profile', managed: true },
      { id: 'built-in', name: 'Built-in profile', managed: false, builtIn: true },
    ]
    const mounted = await mountApp(DatasetEditorView)
    const rendered = content(mounted.root)

    expect(rendered).toContain('Public profile')
    expect(rendered).toContain('Built-in profile')
    expect(rendered).not.toContain('Private profile')
    mounted.app.unmount()
  })

  it('validates the draft before it writes anything', async () => {
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Create dataset'))
    await flush()

    expect(verify).toHaveBeenCalledTimes(1)
    const payload = createMetadata.mock.calls[0][0]
    expect(payload).toMatchObject({ group_id: 'group-1', path: 'datasets/example-dataset', public: false })
    const graph = payload.rocrate['@graph'] as Array<Record<string, unknown>>
    expect(graph.find((entity) => entity['@id'] === './')).toMatchObject({
      name: 'Example dataset',
      author: { '@id': '#ada-lovelace' },
    })
    expect(graph.find((entity) => entity['@id'] === '#ada-lovelace')).toMatchObject({ '@type': 'Person' })
    expect(routerPush).toHaveBeenCalledWith({ name: 'dataset', params: { id: 'dataset-1' } })
    mounted.app.unmount()
  })

  it('hands a refused write to the drawer with its code', async () => {
    createMetadata.mockRejectedValue(new Api.ApiError(400, 'Bad request', 'Bad request', { error: 'Bad request' }))
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Create dataset'))
    await flush()

    expect(content(mounted.root)).toContain('Node issues Bad request')
    expect(routerPush).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('shows a refused preview in the drawer', async () => {
    previewRejection.value = new Api.ApiError(400, 'Bad request', 'Bad request', {
      violations: [{ code: 'missing_root', message: 'No root dataset.' }],
    })
    const mounted = await mountApp(DatasetEditorView)

    expect(content(mounted.root)).toContain('Node issues No root dataset.')
    mounted.app.unmount()
  })

  it('writes nothing when the node rejects the draft', async () => {
    verify.mockResolvedValue(false)
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Create dataset'))
    await flush()

    expect(verify).toHaveBeenCalledTimes(1)
    expect(createMetadata).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('locks submission while draft validation is in flight', async () => {
    const verdict = deferred<boolean>()
    verify.mockReturnValue(verdict.promise)
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))

    await click(button(mounted.root, 'Create dataset'))
    await click(button(mounted.root, 'Create dataset'))
    expect(verify).toHaveBeenCalledTimes(1)

    verdict.resolve(true)
    await flush()
    expect(createMetadata).toHaveBeenCalledTimes(1)
    mounted.app.unmount()
  })

  it('swaps the editor for the graph from the top toggle', async () => {
    const mounted = await mountApp(DatasetEditorView)

    await click(element(mounted.root, (node) => node.props.role === 'tab' && content(node).trim() === 'Graph'))

    expect(content(mounted.root)).toContain('Graph pane')
    expect(content(mounted.root)).not.toContain('Seed dataset')
    mounted.app.unmount()
  })

  it('loads an existing dataset and saves the whole crate back', async () => {
    route.name = 'dataset-edit'
    route.params = { id: 'dataset-1' }
    const mounted = await mountApp(DatasetEditorView)
    await flush()

    expect(content(mounted.root)).toContain('Example dataset')
    expect(content(mounted.root)).toContain('Entities 2')
    expect(content(mounted.root)).toContain('Document dataset-1')
    await openLocation(mounted.root)
    expect(content(mounted.root)).toContain('Location edit')

    await click(button(mounted.root, 'Save changes'))
    await flush()

    expect(verify).toHaveBeenCalledTimes(1)
    expect(replaceMetadataRoCrate).toHaveBeenCalledWith('dataset-1', {
      rocrate: expect.objectContaining({ '@graph': expect.any(Array) }),
      public: false,
    })
    const saved = replaceMetadataRoCrate.mock.calls[0][1].rocrate as Record<string, unknown>
    expect((saved['@graph'] as Array<Record<string, unknown>>).some((entity) => entity['@id'] === '#ada-lovelace')).toBe(true)
    expect(routerPush).toHaveBeenCalledWith({ name: 'dataset', params: { id: 'dataset-1' } })
    mounted.app.unmount()
  })

  it('preserves unrelated conformance declarations when changing profiles', async () => {
    const spec = 'https://w3id.org/ro/crate/1.1'
    const community = 'https://example.test/community-profile'
    const oldProfile = 'https://example.test/profiles/old'
    const newProfile = 'https://example.test/profiles/new'
    profiles.value = [
      { id: 'old', name: 'Old', managed: true, profileUri: oldProfile, propertyRules: [], entityRules: [] },
      { id: 'new', name: 'New', managed: true, profileUri: newProfile, propertyRules: [], entityRules: [] },
    ]
    const existing = Editor.setProperty(seeded(Editor.newDraft()), './', 'conformsTo', [
      spec,
      community,
      oldProfile,
    ].map((value) => ({ kind: 'reference' as const, value })))
    fetchRoCrateRaw.mockResolvedValue(Editor.toRoCrate(existing))
    route.name = 'dataset-edit'
    route.params = { id: 'dataset-1' }
    const mounted = await mountApp(DatasetEditorView)
    await flush()

    await click(button(mounted.root, 'Choose New'))
    await click(button(mounted.root, 'Save changes'))
    await flush()

    const saved = replaceMetadataRoCrate.mock.calls[0][1].rocrate['@graph'] as Array<Record<string, unknown>>
    expect(saved.find((entity) => entity['@id'] === './')?.conformsTo).toEqual([
      { '@id': spec },
      { '@id': community },
      { '@id': newProfile },
    ])
    mounted.app.unmount()
  })

  it('ignores a stale editor load after the route changes', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    getMetadataItem.mockImplementation(async (id: string) => ({
      document_id: id,
      group_id: 'group-1',
      document_path: `datasets/${id}`,
      public: false,
    }))
    fetchRoCrateRaw.mockImplementation((id: string) => id === 'dataset-a' ? first.promise : second.promise)
    route.name = 'dataset-edit'
    route.params = { id: 'dataset-a' }
    const mounted = await mountApp(DatasetEditorView)

    route.params = { id: 'dataset-b' }
    await flush()
    second.resolve(namedCrate('Dataset B'))
    await flush()
    expect(content(mounted.root)).toContain('Dataset B')

    first.resolve(namedCrate('Dataset A'))
    await flush()
    expect(content(mounted.root)).toContain('Dataset B')
    expect(content(mounted.root)).not.toContain('Dataset A')
    mounted.app.unmount()
  })

  it('resets the draft when the editor enters create mode', async () => {
    route.name = 'dataset-edit'
    route.params = { id: 'dataset-1' }
    const mounted = await mountApp(DatasetEditorView)
    await flush()
    expect(content(mounted.root)).toContain('Example dataset')

    route.name = 'dataset-new'
    route.params = {}
    await flush()

    expect(content(mounted.root)).toContain('New dataset')
    expect(content(mounted.root)).toContain('Document none')
    expect(content(mounted.root)).not.toContain('Example dataset')
    mounted.app.unmount()
  })
})
