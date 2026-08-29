import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
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
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as ProfileSeed from '@/lib/crate/profileSeed'
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

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const PageHeaderStub = defineComponent({
  props: { title: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), slots.breadcrumbs?.(), slots.actions?.()]),
})
const GroupSelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, disabled: Boolean },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('button', {
    'aria-label': 'Group',
    disabled: props.disabled,
    onClick: () => emit('update:modelValue', 'group-1'),
  }, props.modelValue),
})
const BrowserStub = defineComponent({
  props: { draft: { type: Object, required: true } },
  emits: ['graph'],
  setup(props, { emit }) {
    return () => h('div', [
      h('p', `Entities ${(props.draft as Editor.CrateDraft).entities.length}`),
      h('button', { onClick: () => emit('graph') }, 'Show the graph'),
    ])
  },
})
const EditorStub = defineComponent({
  props: { draft: { type: Object, required: true }, profiles: { type: Array, default: () => [] } },
  emits: ['update', 'profile'],
  setup(props, { emit }) {
    return () => h('div', [
      h('p', Editor.displayName(Editor.rootEntity(props.draft as Editor.CrateDraft))),
      h('p', `Profiles ${(props.profiles as Array<{ label: string }>).map((profile) => profile.label).join(', ')}`),
      ...(props.profiles as Array<{ value: string; label: string }>).map((profile) =>
        h('button', { onClick: () => emit('profile', profile.value) }, `Choose ${profile.label}`)),
      h('button', { onClick: () => emit('update', seeded(props.draft as Editor.CrateDraft)) }, 'Seed dataset'),
    ])
  },
})
const GraphStub = defineComponent(() => () => h('p', 'Graph pane'))
const NodeCheckStub = defineComponent({
  props: { canSave: Boolean, actionLabel: String },
  emits: ['save'],
  setup: (props, { emit }) => () =>
    h('button', { disabled: !props.canSave, onClick: () => emit('save') }, props.actionLabel),
})

const DatasetEditorView = compileClientComponent(new URL('./DatasetEditorView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRoute: () => route, useRouter: () => ({ push: routerPush }) },
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Skeleton.vue': moduleDefault(EmptyStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(EmptyStub),
  '@/components/groups/GroupSelect.vue': moduleDefault(GroupSelectStub),
  '@/components/groups/CreateGroupDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/VisibilitySelect.vue': moduleDefault(EmptyStub),
  '@/components/metadata/ImportCrateDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/editor/EntityBrowser.vue': moduleDefault(BrowserStub),
  '@/components/metadata/editor/EntityEditor.vue': moduleDefault(EditorStub),
  '@/components/metadata/editor/EditorGraph.vue': moduleDefault(GraphStub),
  '@/components/metadata/editor/IssueDrawer.vue': moduleDefault(EmptyStub),
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
  '@/composables/useProfilePreview': {
    useProfilePreview: () => ({
      result: previewResult,
      running: previewRunning,
      error: previewError,
      unavailable: previewUnavailable,
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
})

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
  routerPush.mockClear()
  previewResult.value = null
})

describe('DatasetEditorView', () => {
  it('opens the editor on an empty root, asking nothing first', async () => {
    const mounted = await mountApp(DatasetEditorView)

    expect(content(mounted.root)).toContain('Entities 1')
    expect(content(mounted.root)).toContain('New dataset')
    expect(element(mounted.root, (node) => node.props['aria-label'] === 'Group').props.disabled).toBe(false)
    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('keeps Create out of reach until there is a name and a group', async () => {
    groups.value = []
    const mounted = await mountApp(DatasetEditorView)

    await click(button(mounted.root, 'Seed dataset'))
    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(true)

    await click(element(mounted.root, (node) => node.props['aria-label'] === 'Group'))
    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(false)
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
    expect(graph.find((entity) => entity['@id'] === './')).toMatchObject({
      conformsTo: { '@id': 'https://example.test/profiles/genomics' },
      identifier: '',
    })
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

  it('swaps the editor for the graph when the browser asks', async () => {
    const mounted = await mountApp(DatasetEditorView)

    await click(button(mounted.root, 'Show the graph'))

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
    expect(element(mounted.root, (node) => node.props['aria-label'] === 'Group').props.disabled).toBe(true)
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
    expect(content(mounted.root)).toContain('Entities 1')
    expect(content(mounted.root)).not.toContain('Example dataset')
    mounted.app.unmount()
  })
})
