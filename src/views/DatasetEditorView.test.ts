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
import * as Assignable from '@/lib/profiles/assignable'
import * as Utils from '@/lib/utils'

const route = reactive<{ name: string; params: Record<string, string>; query: Record<string, string> }>({
  name: 'dataset-new',
  params: {},
  query: {},
})
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
const loadProfileCrate = vi.fn(async () => ({}))
const routerPush = vi.fn(async () => undefined)

const previewResult = ref<Api.ProfileValidationPreviewResponse | null>(null)
const previewRunning = ref(false)
const previewError = ref<string | null>(null)
const previewUnavailable = ref(false)
const previewRejection = ref<unknown>(null)
const verify = vi.fn(async () => true)
const previewDebounced = vi.fn()
const previewNow = vi.fn()
const previewReset = vi.fn()

// One mandatory text property is enough to see a profile reach the form.
function profileFixture(id: string, name: string, required: string[] = []): Record<string, unknown> {
  return {
    id,
    name,
    documentId: `doc-${id}`,
    managed: true,
    profileUri: `https://example.test/profiles/${id}`,
    propertyRules: required.map((valueName) => ({
      id: valueName,
      label: valueName,
      description: '',
      kind: 'text',
      propertyUri: `http://schema.org/${valueName}`,
      valueName,
      obligation: 'MUST',
    })),
    entityRules: [],
  }
}

function verdict(accepted: boolean): Api.ProfileValidationPreviewResponse {
  return {
    accepted,
    state: accepted ? 'valid' : 'invalid',
    profile_id: 'genomics',
    profile_iri: 'https://example.test/profiles/genomics',
    evaluator: 'craqle',
    findings: accepted
      ? []
      : [{
          code: 'constraint_violation',
          severity: 'violation',
          rule: 'http://www.w3.org/ns/shacl#minCount',
          message: 'A required value is missing.',
          completeness: 'complete',
        }],
    completeness: 'complete',
    structural_violations: [],
  }
}

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
  props: {
    draft: { type: Object, required: true },
    profiles: { type: Array, default: () => [] },
    profileId: { type: String, default: '' },
    issues: { type: Array, default: () => [] },
  },
  emits: ['update', 'profile'],
  setup(props, { emit }) {
    const nameIssues = () => (props.issues as Editor.LiveIssue[])
      .filter((issue) => issue.property === 'name')
      .map((issue) => issue.message)
    return () => h('div', [
      h('p', Editor.displayName(Editor.rootEntity(props.draft as Editor.CrateDraft))),
      h('p', `Name issues ${nameIssues().join(' | ')}`),
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
      h('p', `Declared ${props.profileId || 'none'}`),
      ...(props.profiles as Array<{ value: string; label: string }>).map((profile) =>
        h('button', { onClick: () => emit('profile', profile.value) }, `Choose ${profile.label}`)),
      h('button', { onClick: () => emit('profile', '') }, 'Choose no profile'),
      h('button', { onClick: () => emit('update', seeded(props.draft as Editor.CrateDraft)) }, 'Seed dataset'),
    ])
  },
})
const GraphStub = defineComponent(() => () => h('p', 'Graph pane'))
const DrawerStub = defineComponent({
  props: {
    issues: { type: Array, default: () => [] },
    nodeIssues: { type: Array, default: () => [] },
  },
  setup: (props) => () => h('div', [
    h('p', `Drawer issues ${(props.issues as unknown[]).length}`),
    h('p', `Drawer says ${(props.issues as Array<{ message: string }>).map((issue) => issue.message).join(' | ')}`),
    h('p', `Node issues ${(props.nodeIssues as Array<{ message: string }>).map((issue) => issue.message).join(', ')}`),
  ]),
})
// The import dialog, reduced to handing the view one parsed crate.
const importDraft = ref<Editor.CrateDraft | null>(null)
const ImportStub = defineComponent({
  emits: ['imported', 'update:open'],
  setup: (_, { emit }) => () => h('button', {
    onClick: () => importDraft.value && emit('imported', importDraft.value),
  }, 'Import crate'),
})
const WithdrawStub = defineComponent({
  props: { documentId: { type: String, default: '' } },
  setup: (props) => () => h('p', `Administration ${props.documentId}`),
})
const NodeCheckStub = defineComponent({
  props: {
    canSave: Boolean,
    actionLabel: String,
    profileName: { type: String, default: '' },
    profileLoading: Boolean,
    profileError: { type: String, default: '' },
    blocked: { type: String, default: '' },
  },
  emits: ['save', 'retry-profile'],
  setup: (props, { emit }) => () => h('div', [
    h('p', `Checking ${props.profileName || 'no profile'}${props.profileLoading ? ', loading its rules' : ''}`),
    h('p', `Rules ${props.profileError || 'fine'}`),
    h('p', `Blocked ${props.blocked || 'not'}`),
    h('button', { onClick: () => emit('retry-profile') }, 'Retry profile rules'),
    h('button', { disabled: !props.canSave, onClick: () => emit('save') }, props.actionLabel),
  ]),
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
  '@/components/metadata/ImportCrateDialog.vue': moduleDefault(ImportStub),
  '@/components/metadata/editor/DatasetLocationDialog.vue': moduleDefault(LocationStub),
  '@/components/metadata/editor/EntityBrowser.vue': moduleDefault(BrowserStub),
  '@/components/metadata/editor/EntityEditor.vue': moduleDefault(EditorStub),
  '@/components/metadata/editor/EditorGraph.vue': moduleDefault(GraphStub),
  '@/components/metadata/editor/IssueDrawer.vue': moduleDefault(DrawerStub),
  '@/components/metadata/editor/NodeCheckPanel.vue': moduleDefault(NodeCheckStub),
  '@/components/metadata/PidWithdraw.vue': moduleDefault(WithdrawStub),
  '@/composables/useAruna': {
    profileReferenceIri: (profile: { profileUri?: string }) => profile?.profileUri,
    useAruna: () => ({
      groups,
      profiles,
      currentUser,
      createMetadata,
      getMetadataItem,
      fetchRoCrateRaw,
      loadProfileCrate,
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
      preview: previewDebounced,
      previewNow,
      reset: previewReset,
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
  '@/lib/profiles/assignable': Assignable,
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

function drawerCount(root: Parameters<typeof content>[0]): number {
  return Number(/Drawer issues (\d+)/.exec(content(root))?.[1] ?? -1)
}

function drawerSays(root: Parameters<typeof content>[0]): string {
  return /Drawer says (.*?)Node issues/.exec(content(root))?.[1] ?? ''
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
  loadProfileCrate.mockReset().mockResolvedValue({})
  route.query = {}
  previewDebounced.mockClear()
  previewNow.mockClear()
  previewReset.mockClear()
  pathTaken.value = false
  pathChecking.value = false
  routerPush.mockClear()
  previewResult.value = null
  previewRejection.value = null
  previewRunning.value = false
  previewError.value = null
  previewUnavailable.value = false
  importDraft.value = null
})

describe('DatasetEditorView', () => {
  it('opens a new dataset in the editor', async () => {
    const mounted = await mountApp(DatasetEditorView)

    expect(content(mounted.root)).toContain('Entities 1')
    await click(button(mounted.root, 'Seed dataset'))
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

  it('marks a taken path on the name', async () => {
    const mounted = await mountApp(DatasetEditorView)
    await name(mounted.root, 'Reads 2026')
    const before = drawerCount(mounted.root)

    pathTaken.value = true
    await flush()

    expect(content(mounted.root)).toContain(
      'Name issues A dataset already exists at datasets/reads-2026. Change the name or pick another location.',
    )
    expect(drawerCount(mounted.root)).toBe(before + 1)
    mounted.app.unmount()
  })

  it('keeps the admin card out of a new dataset', async () => {
    const mounted = await mountApp(DatasetEditorView)
    expect(content(mounted.root)).not.toContain('Administration')

    route.name = 'dataset-edit'
    route.params = { id: 'dataset-1' }
    await flush()

    expect(content(mounted.root)).toContain('Administration dataset-1')
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
    await click(button(mounted.root, 'Seed dataset'))
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

  it('clears a chosen profile again', async () => {
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
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Choose Genomics'))
    await click(button(mounted.root, 'Choose no profile'))
    await click(button(mounted.root, 'Create dataset'))
    await flush()

    const graph = createMetadata.mock.calls[0][0].rocrate['@graph'] as Array<Record<string, unknown>>
    expect(graph.find((entity) => entity['@id'] === './')).not.toHaveProperty('conformsTo')
    expect(content(mounted.root)).toContain('Declared none')
    mounted.app.unmount()
  })

  it('leaves neither profile behind after switching and clearing', async () => {
    const oldProfile = 'https://example.test/profiles/old'
    const newProfile = 'https://example.test/profiles/new'
    profiles.value = [
      { id: 'old', name: 'Old', managed: true, profileUri: oldProfile, propertyRules: [], entityRules: [] },
      { id: 'new', name: 'New', managed: true, profileUri: newProfile, propertyRules: [], entityRules: [] },
    ]
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Choose Old'))
    await click(button(mounted.root, 'Choose New'))
    await click(button(mounted.root, 'Choose no profile'))
    await click(button(mounted.root, 'Create dataset'))
    await flush()

    const graph = createMetadata.mock.calls[0][0].rocrate['@graph'] as Array<Record<string, unknown>>
    expect(JSON.stringify(graph)).not.toContain(oldProfile)
    expect(JSON.stringify(graph)).not.toContain(newProfile)
    mounted.app.unmount()
  })

  it('keeps the preferred profile away after an explicit clear', async () => {
    profiles.value = [{
      id: 'genomics',
      name: 'Genomics',
      managed: true,
      profileUri: 'https://example.test/profiles/genomics',
      propertyRules: [],
      entityRules: [],
    }]
    currentUser.value = { preferredProfileId: 'genomics' }
    const mounted = await mountApp(DatasetEditorView)
    expect(content(mounted.root)).toContain('Declared genomics')

    await click(button(mounted.root, 'Choose no profile'))
    profiles.value = [...profiles.value]
    await flush()

    expect(content(mounted.root)).toContain('Declared none')
    mounted.app.unmount()
  })

  it('clears a stored profile while editing', async () => {
    const spec = 'https://w3id.org/ro/crate/1.1'
    const stored = 'https://example.test/profiles/old'
    profiles.value = [
      { id: 'old', name: 'Old', managed: true, profileUri: stored, propertyRules: [], entityRules: [] },
    ]
    const existing = Editor.setProperty(seeded(Editor.newDraft()), './', 'conformsTo', [spec, stored].map((value) => ({
      kind: 'reference' as const,
      value,
    })))
    fetchRoCrateRaw.mockResolvedValue(Editor.toRoCrate(existing))
    route.name = 'dataset-edit'
    route.params = { id: 'dataset-1' }
    const mounted = await mountApp(DatasetEditorView)
    await flush()
    expect(content(mounted.root)).toContain('Declared old')

    await click(button(mounted.root, 'Choose no profile'))
    expect(content(mounted.root)).toContain('Declared none')
    await click(button(mounted.root, 'Save changes'))
    await flush()

    const saved = replaceMetadataRoCrate.mock.calls[0][1].rocrate['@graph'] as Array<Record<string, unknown>>
    expect(saved.find((entity) => entity['@id'] === './')?.conformsTo).toEqual({ '@id': spec })
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

  it('seeds a picked profile and raises what it expects', async () => {
    profiles.value = [profileFixture('genomics', 'Genomics', ['identifier'])]
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    expect(drawerSays(mounted.root)).not.toContain('Genomics expects identifier')

    await click(button(mounted.root, 'Choose Genomics'))

    expect(drawerSays(mounted.root)).toContain('Genomics expects identifier')
    // The empty row the seeding added is what raises this second one.
    expect(drawerSays(mounted.root)).toContain('identifier on Example dataset has no value yet')
    expect(content(mounted.root)).toContain('Checking Genomics')
    mounted.app.unmount()
  })

  it('replaces the findings of the profile it leaves', async () => {
    profiles.value = [
      profileFixture('old', 'Old', ['identifier']),
      profileFixture('new', 'New', ['sampleId']),
    ]
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Choose Old'))
    expect(drawerSays(mounted.root)).toContain('Old expects identifier')

    await click(button(mounted.root, 'Choose New'))

    expect(drawerSays(mounted.root)).toContain('New expects sampleId')
    expect(drawerSays(mounted.root)).not.toContain('Old expects identifier')

    await click(button(mounted.root, 'Choose no profile'))

    expect(drawerSays(mounted.root)).not.toContain('expects')
    expect(content(mounted.root)).toContain('Checking no profile')
    mounted.app.unmount()
  })

  it('drops the last verdict and re-checks when the profile changes', async () => {
    profiles.value = [profileFixture('genomics', 'Genomics', ['identifier'])]
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    previewReset.mockClear()
    previewDebounced.mockClear()

    await click(button(mounted.root, 'Choose Genomics'))

    expect(previewReset).toHaveBeenCalledTimes(1)
    expect(previewDebounced).toHaveBeenCalled()
    expect(previewReset.mock.invocationCallOrder[0])
      .toBeLessThan(previewDebounced.mock.invocationCallOrder[0]!)
    mounted.app.unmount()
  })

  it('re-checks the draft after every edit', async () => {
    const mounted = await mountApp(DatasetEditorView)
    previewDebounced.mockClear()

    // An incomplete draft is the editor's own problem, not the node's.
    await name(mounted.root, 'Reads 2026')
    expect(previewDebounced).not.toHaveBeenCalled()

    await click(button(mounted.root, 'Seed dataset'))
    await name(mounted.root, 'Reads 2027')

    expect(previewDebounced).toHaveBeenCalledTimes(2)
    const graph = previewDebounced.mock.calls[1][0]['@graph'] as Array<Record<string, unknown>>
    expect(graph.find((entity) => entity['@id'] === './')).toMatchObject({ name: 'Reads 2027' })
    mounted.app.unmount()
  })

  it('refuses to submit while a problem stands', async () => {
    const mounted = await mountApp(DatasetEditorView)
    await name(mounted.root, 'Reads 2026')

    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(true)
    expect(content(mounted.root)).toContain('Blocked Fix')
    await click(button(mounted.root, 'Create dataset'))
    expect(verify).not.toHaveBeenCalled()
    expect(createMetadata).not.toHaveBeenCalled()

    await click(button(mounted.root, 'Seed dataset'))

    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(false)
    expect(content(mounted.root)).toContain('Blocked not')
    mounted.app.unmount()
  })

  it('holds the save back until the node accepts the draft', async () => {
    previewResult.value = verdict(false)
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))

    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(true)
    await click(button(mounted.root, 'Create dataset'))
    expect(createMetadata).not.toHaveBeenCalled()

    previewResult.value = verdict(true)
    await flush()
    await click(button(mounted.root, 'Create dataset'))
    await flush()

    expect(verify).toHaveBeenCalledTimes(1)
    expect(createMetadata).toHaveBeenCalledTimes(1)
    mounted.app.unmount()
  })

  it('waits for a running check before offering the save', async () => {
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(false)

    previewRunning.value = true
    await flush()

    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(true)
    mounted.app.unmount()
  })

  it('follows the profile an imported crate declares', async () => {
    const oldIri = 'https://example.test/profiles/old'
    profiles.value = [profileFixture('old', 'Old'), profileFixture('new', 'New')]
    importDraft.value = Editor.setProperty(seeded(Editor.newDraft()), './', 'conformsTo', [
      { kind: 'reference', value: oldIri },
    ])
    const mounted = await mountApp(DatasetEditorView)

    await click(button(mounted.root, 'Import crate'))
    expect(content(mounted.root)).toContain('Declared old')

    await click(button(mounted.root, 'Choose New'))
    await click(button(mounted.root, 'Create dataset'))
    await flush()

    const graph = createMetadata.mock.calls[0][0].rocrate['@graph'] as Array<Record<string, unknown>>
    expect(graph.find((entity) => entity['@id'] === './')?.conformsTo)
      .toEqual({ '@id': 'https://example.test/profiles/new' })
    mounted.app.unmount()
  })

  it('resolves a declared profile that loads after the dataset', async () => {
    const stored = Editor.setProperty(seeded(Editor.newDraft()), './', 'conformsTo', [
      { kind: 'reference', value: 'https://example.test/profiles/old' },
    ])
    fetchRoCrateRaw.mockResolvedValue(Editor.toRoCrate(stored))
    route.name = 'dataset-edit'
    route.params = { id: 'dataset-1' }
    const mounted = await mountApp(DatasetEditorView)
    await flush()
    expect(content(mounted.root)).toContain('Declared none')

    profiles.value = [profileFixture('old', 'Old', ['identifier'])]
    await flush()

    expect(content(mounted.root)).toContain('Declared old')
    expect(drawerSays(mounted.root)).toContain('Old expects identifier')
    mounted.app.unmount()
  })

  it('picks the profile a link names', async () => {
    // A create link may carry the profile to start from.
    profiles.value = [profileFixture('genomics', 'Genomics', ['identifier'])]
    route.query = { profile: 'doc-genomics' }
    const mounted = await mountApp(DatasetEditorView)
    await flush()

    expect(content(mounted.root)).toContain('Declared genomics')
    expect(drawerSays(mounted.root)).toContain('Genomics expects identifier')
    mounted.app.unmount()
  })

  it('seeds the form once the profile rules arrive', async () => {
    const rules = deferred<unknown>()
    loadProfileCrate.mockReturnValue(rules.promise as Promise<Record<string, never>>)
    profiles.value = [profileFixture('genomics', 'Genomics')]
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Choose Genomics'))

    expect(loadProfileCrate).toHaveBeenCalledWith('doc-genomics')
    expect(content(mounted.root)).toContain('loading its rules')
    expect(drawerSays(mounted.root)).not.toContain('Genomics expects')

    rules.resolve({})
    // The lifted rules reach the view through the profile list, as the parse cache does.
    profiles.value = [profileFixture('genomics', 'Genomics', ['identifier'])]
    await flush()

    expect(content(mounted.root)).not.toContain('loading its rules')
    expect(drawerSays(mounted.root)).toContain('Genomics expects identifier')
    expect(drawerSays(mounted.root)).toContain('identifier on Example dataset has no value yet')
    mounted.app.unmount()
  })

  it('reports rules that could not be loaded', async () => {
    loadProfileCrate.mockRejectedValueOnce(new Error('offline'))
    profiles.value = [profileFixture('genomics', 'Genomics')]
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Choose Genomics'))
    await flush()

    expect(content(mounted.root)).toContain('Rules The rules of this profile could not be loaded.')
    expect(content(mounted.root)).not.toContain('loading its rules')

    await click(button(mounted.root, 'Retry profile rules'))
    await flush()

    expect(loadProfileCrate).toHaveBeenLastCalledWith('doc-genomics', { force: true })
    expect(content(mounted.root)).toContain('Rules fine')
    mounted.app.unmount()
  })

  it('drops a profile the new group may not use', async () => {
    groups.value = [{ id: 'group-1', name: 'Research group' }, { id: 'group-2', name: 'Second group' }]
    profiles.value = [{ ...profileFixture('own', 'Own profile', ['identifier']), managed: false, groupId: 'group-1' }]
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Choose Own profile'))
    expect(content(mounted.root)).toContain('Declared own')

    await openLocation(mounted.root)
    await click(button(mounted.root, 'Move to Second group'))

    expect(content(mounted.root)).toContain('Declared none')
    expect(drawerSays(mounted.root)).not.toContain('Own profile expects')
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
