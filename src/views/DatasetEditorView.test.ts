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
  typeValue,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as ProfileSeed from '@/lib/crate/profileSeed'
import * as Api from '@/lib/api'
import * as Emit from '@/lib/profiles/emit'
import * as Utils from '@/lib/utils'

const route = reactive<{ name: string; params: Record<string, string> }>({ name: 'dataset-new', params: {} })
const groups = ref([{ id: 'group-1', name: 'Research group' }])
const profiles = ref<Array<Record<string, unknown>>>([])
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

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    })
  },
})
const PageHeaderStub = defineComponent({
  props: { title: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), slots.actions?.()]),
})
const BrowserStub = defineComponent({
  props: { draft: { type: Object, required: true } },
  setup: (props) => () => h('p', `Entities ${(props.draft as Editor.CrateDraft).entities.length}`),
})
const EditorStub = defineComponent({
  props: { draft: { type: Object, required: true } },
  emits: ['update'],
  setup(props, { emit }) {
    return () => h('div', [
      h('p', Editor.displayName(Editor.rootEntity(props.draft as Editor.CrateDraft))),
      h('button', { onClick: () => emit('update', seeded(props.draft as Editor.CrateDraft)) }, 'Seed dataset'),
    ])
  },
})
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
  '@/components/ui/Badge.vue': moduleDefault(EmptyStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Textarea.vue': moduleDefault(InputStub),
  '@/components/ui/Skeleton.vue': moduleDefault(EmptyStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(EmptyStub),
  '@/components/groups/GroupSelect.vue': moduleDefault(EmptyStub),
  '@/components/groups/CreateGroupDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/VisibilitySelect.vue': moduleDefault(EmptyStub),
  '@/components/metadata/ImportCrateDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/editor/EntityBrowser.vue': moduleDefault(BrowserStub),
  '@/components/metadata/editor/EntityEditor.vue': moduleDefault(EditorStub),
  '@/components/metadata/editor/IssueDrawer.vue': moduleDefault(EmptyStub),
  '@/components/metadata/editor/NodeCheckPanel.vue': moduleDefault(NodeCheckStub),
  '@/composables/useAruna': {
    profileReferenceIri: (profile: { profileUri?: string }) => profile?.profileUri,
    useAruna: () => ({
      groups,
      profiles,
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
  '@/lib/desktop': { isDesktop: () => false },
  '@/lib/deviceApi': { previewDeviceDraft: vi.fn(), requireDevice: vi.fn() },
  '@/lib/api': Api,
  '@/lib/utils': Utils,
  '@/lib/profiles/emit': Emit,
  '@/lib/profiles/vocabulary': { loadVocabIndex: () => Promise.resolve(null) },
  '@/lib/crate/editor': Editor,
  '@/lib/crate/profileSeed': ProfileSeed,
})

async function start(name = 'Example dataset') {
  const mounted = await mountApp(DatasetEditorView)
  await typeValue(element(mounted.root, (node) => node.props['aria-label'] === 'Dataset name'), name)
  await click(button(mounted.root, 'Continue'))
  return mounted
}

beforeEach(() => {
  route.name = 'dataset-new'
  route.params = {}
  profiles.value = []
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
  it('asks three questions before it opens the editor', async () => {
    const mounted = await mountApp(DatasetEditorView)

    expect(content(mounted.root)).toContain('Start a dataset')
    expect(button(mounted.root, 'Continue').props.disabled).toBe(true)

    await typeValue(element(mounted.root, (node) => node.props['aria-label'] === 'Dataset name'), 'Example dataset')
    await click(button(mounted.root, 'Continue'))

    expect(content(mounted.root)).not.toContain('Start a dataset')
    expect(content(mounted.root)).toContain('Entities 1')
    expect(content(mounted.root)).toContain('Example dataset')
    mounted.app.unmount()
  })

  it('checks with the node before it writes anything', async () => {
    const mounted = await start()
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
    const mounted = await start()
    await click(button(mounted.root, 'Seed dataset'))
    await click(button(mounted.root, 'Create dataset'))
    await flush()

    expect(verify).toHaveBeenCalledTimes(1)
    expect(createMetadata).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('keeps Continue out of reach until the dataset has a name', async () => {
    const mounted = await mountApp(DatasetEditorView)
    const name = element(mounted.root, (node) => node.props['aria-label'] === 'Dataset name')

    await typeValue(name, '   ')
    expect(button(mounted.root, 'Continue').props.disabled).toBe(true)

    await typeValue(name, 'Example dataset')
    expect(button(mounted.root, 'Continue').props.disabled).toBe(false)
    mounted.app.unmount()
  })

  it('loads an existing dataset and saves the whole crate back', async () => {
    route.name = 'dataset-edit'
    route.params = { id: 'dataset-1' }
    const mounted = await mountApp(DatasetEditorView)
    await flush()

    expect(content(mounted.root)).toContain('Example dataset')
    expect(content(mounted.root)).toContain('Entities 2')
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
})
