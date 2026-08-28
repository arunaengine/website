import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  flush,
  moduleDefault,
  mountApp,
} from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Api from '@/lib/api'
import * as Emit from '@/lib/profiles/emit'
import * as Utils from '@/lib/utils'

const route = reactive<{ name: string; params: Record<string, string> }>({ name: 'dataset-new', params: {} })
const groups = ref([{ id: 'group-1', name: 'Research group' }])
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

// A dataset with a name and a Person linked as its author.
function seeded(draft: Editor.CrateDraft): Editor.CrateDraft {
  const named = Editor.updateValue(draft, './', 'name', 0, 'Example dataset')
  const described = Editor.updateValue(named, './', 'description', 0, 'What it holds.')
  const person = Editor.addEntity(described, { type: 'Person', name: 'Ada Lovelace' })
  return Editor.addValue(person.draft, './', 'author', { kind: 'reference', value: person.entity.id })
}

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const PageHeaderStub = defineComponent({
  props: { title: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), slots.actions?.()]),
})
const EntityListStub = defineComponent({
  props: { draft: { type: Object, required: true } },
  emits: ['update'],
  setup(props, { emit }) {
    return () => h('div', [
      h('p', `Entities ${(props.draft as Editor.CrateDraft).entities.length}`),
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
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(EmptyStub),
  '@/components/ui/Skeleton.vue': moduleDefault(EmptyStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(EmptyStub),
  '@/components/groups/GroupSelect.vue': moduleDefault(EmptyStub),
  '@/components/groups/CreateGroupDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/VisibilitySelect.vue': moduleDefault(EmptyStub),
  '@/components/metadata/ImportCrateDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/editor/EntityList.vue': moduleDefault(EntityListStub),
  '@/components/metadata/editor/IssueSummary.vue': moduleDefault(EmptyStub),
  '@/components/metadata/editor/NodeCheckPanel.vue': moduleDefault(NodeCheckStub),
  '@/composables/useAruna': {
    useAruna: () => ({
      groups,
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
})

beforeEach(() => {
  route.name = 'dataset-new'
  route.params = {}
  createMetadata.mockReset().mockResolvedValue({ document_id: 'dataset-1' })
  replaceMetadataRoCrate.mockReset().mockResolvedValue({ document_id: 'dataset-1' })
  getMetadataItem.mockReset().mockResolvedValue({
    document_id: 'dataset-1',
    group_id: 'group-1',
    document_path: 'datasets/existing',
    public: false,
  })
  fetchRoCrateRaw.mockReset().mockResolvedValue(Editor.toRoCrate(seeded(Editor.newDraft())))
  routerPush.mockClear()
  previewResult.value = null
})

describe('DatasetEditorView', () => {
  it('creates a dataset from the entity list', async () => {
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))

    expect(content(mounted.root)).toContain('Example dataset')
    await click(button(mounted.root, 'Create dataset'))

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

  it('refuses to save while the node would reject the dataset', async () => {
    previewResult.value = {
      accepted: false,
      state: 'invalid',
      evaluator: 'test',
      findings: [],
      completeness: 'complete',
      structural_violations: [{ code: 'missing_name', message: 'A name is required.', entity_id: './' }],
    }
    const mounted = await mountApp(DatasetEditorView)
    await click(button(mounted.root, 'Seed dataset'))

    expect(button(mounted.root, 'Create dataset').props.disabled).toBe(true)
    await click(button(mounted.root, 'Create dataset'))

    expect(createMetadata).not.toHaveBeenCalled()
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
