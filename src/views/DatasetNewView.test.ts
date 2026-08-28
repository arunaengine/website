import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
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
  nodes,
  typeValue,
} from '@/test/clientRender'
import * as CrateBuild from '@/lib/crate/build'
import * as CrateIssues from '@/lib/crate/issues'
import * as CustomFields from '@/lib/customFields'
import * as Api from '@/lib/api'
import * as ProfileControls from '@/lib/profiles/controls'
import * as ProfileEmit from '@/lib/profiles/emit'
import * as EntityTree from '@/lib/profiles/entityTree'
import * as Utils from '@/lib/utils'

const groups = ref([{ id: 'group-1', name: 'Research group' }])
const profiles = ref([])
const fullCrates = ref({})
const saving = ref(false)
const currentUser = ref({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.org',
  affiliation: '',
  avatarColor: '#000',
  initials: 'TU',
})
const apiBaseUrl = ref('https://api.example.test')
const authToken = ref('token')
const createMetadata = vi.fn()
const loadProfileCrate = vi.fn()
const routerPush = vi.fn(async () => undefined)

const previewResult = ref<Api.ProfileValidationPreviewResponse | null>(null)
const previewRunning = ref(false)
const previewError = ref<string | null>(null)
const previewUnavailable = ref(false)
const previewLater = vi.fn()
const previewNow = vi.fn(() => {
  previewResult.value = {
    accepted: false,
    state: 'invalid',
    evaluator: 'test',
    findings: [],
    completeness: 'complete',
    structural_violations: [{ code: 'missing_name', message: 'Dataset title is required.', entity_id: './' }],
  }
})

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
const TextareaStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('textarea', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    })
  },
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  setup: (props, { attrs }) => () => h('select', { ...attrs, value: props.modelValue }),
})
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup: (props) => () => h('header', [h('h1', props.title), h('p', props.description)]),
})
const ContextListStub = defineComponent({
  props: { rootName: String, entities: { type: Array, default: () => [] } },
  setup: (props) => () => h('div', [
    h('span', props.rootName),
    ...(props.entities as Array<{ properties: { name?: string }; roles: string[] }>).map((entity) =>
      h('p', `${entity.properties.name} ${entity.roles.join(' ')}`)),
  ]),
})
const AddContextStub = defineComponent({
  props: { open: Boolean },
  emits: ['save'],
  setup(props, { emit }) {
    return () => props.open
      ? h('button', {
          onClick: () => emit('save', {
            entity: {
              id: 'https://orcid.org/0000-0002-1825-0097',
              type: 'Person',
              properties: { name: 'Ada ORCID' },
              roles: ['author'],
            },
            relatedEntities: [],
          }),
        }, 'Choose ORCID person')
      : null
  },
})
const ImportCrateStub = defineComponent({
  props: { open: Boolean },
  emits: ['imported'],
  setup(props, { emit }) {
    return () => props.open
      ? h('button', {
          onClick: () => emit('imported', {
            basics: {
              path: 'datasets/imported-dataset',
              title: 'Imported dataset',
              description: 'Imported description',
              datePublished: '2026-08-28',
              license: 'https://creativecommons.org/licenses/by/4.0/',
              keywords: ['imported'],
            },
            entities: [{
              id: 'https://orcid.org/0000-0002-1825-0097',
              type: 'Person',
              properties: { name: 'Imported author' },
              roles: ['author'],
            }],
            parts: [],
            visibility: 'group',
            custom: { citation: 'Imported citation' },
          }),
        }, 'Use fixture crate')
      : null
  },
})
const ReferenceFieldStub = defineComponent({
  props: { label: String, role: String, entities: { type: Array, default: () => [] } },
  emits: ['add'],
  setup(props, { emit, slots }) {
    return () => h('div', [
      h('button', { onClick: () => emit('add', props.role) }, `Add ${props.label}`),
      slots.action?.(),
    ])
  },
})
const ReviewStub = defineComponent({
  props: {
    previewResult: { type: Object, default: null },
    visibility: String,
  },
  emits: ['preview', 'create'],
  setup(props, { emit }) {
    return () => h('div', [
      h('span', `Visibility ${props.visibility}`),
      ...((props.previewResult as Api.ProfileValidationPreviewResponse | null)?.structural_violations ?? [])
        .map((issue) => h('p', issue.message)),
      h('button', { onClick: () => emit('preview') }, 'Run preview'),
      h('button', { onClick: () => emit('create') }, 'Create dataset'),
    ])
  },
})
const EmptyStub = defineComponent(() => () => null)
const icons = new Proxy({}, { get: () => EmptyStub })

const DatasetNewView = compileClientComponent(new URL('./DatasetNewView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push: routerPush }) },
  '@lucide/vue': icons,
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Textarea.vue': moduleDefault(TextareaStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/groups/GroupSelect.vue': moduleDefault(SelectStub),
  '@/components/groups/CreateGroupDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/ProfileControlField.vue': moduleDefault(EmptyStub),
  '@/components/metadata/DatasetEntityInstances.vue': moduleDefault(EmptyStub),
  '@/components/metadata/ContextEntityList.vue': moduleDefault(ContextListStub),
  '@/components/metadata/AddContextDialog.vue': moduleDefault(AddContextStub),
  '@/components/metadata/DatasetPartsSection.vue': moduleDefault(EmptyStub),
  '@/components/metadata/DatasetReviewSection.vue': moduleDefault(ReviewStub),
  '@/components/metadata/ImportCrateDialog.vue': moduleDefault(ImportCrateStub),
  '@/components/metadata/CustomFieldsEditor.vue': moduleDefault(EmptyStub),
  '@/components/metadata/LicenseField.vue': moduleDefault(EmptyStub),
  '@/components/metadata/RootReferenceField.vue': moduleDefault(ReferenceFieldStub),
  '@/composables/useAruna': {
    profileReferenceIri: () => undefined,
    useAruna: () => ({
      groups,
      profiles,
      fullCrates,
      createMetadata,
      loadProfileCrate,
      saving,
      currentUser,
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
      preview: previewLater,
      previewNow,
    }),
  },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ deviceClient: ref(null) }) },
  '@/lib/crate/build': CrateBuild,
  '@/lib/crate/issues': CrateIssues,
  '@/lib/customFields': CustomFields,
  '@/lib/desktop': { isDesktop: () => false },
  '@/lib/deviceApi': { previewDeviceDraft: vi.fn(), requireDevice: vi.fn() },
  '@/lib/api': Api,
  '@/lib/profiles/controls': ProfileControls,
  '@/lib/profiles/emit': ProfileEmit,
  '@/lib/profiles/entityTree': EntityTree,
  '@/lib/utils': Utils,
})

beforeEach(() => {
  createMetadata.mockReset().mockResolvedValue({ document_id: 'dataset-1' })
  routerPush.mockClear()
  previewNow.mockClear()
  previewResult.value = null
})

async function fillRequired(root: Parameters<typeof nodes>[0]) {
  const title = nodes(root).filter((node) => node.tag === 'input')[0]!
  await typeValue(title, 'Example dataset')
  await typeValue(element(root, (node) => node.tag === 'textarea'), 'Example description')
}

describe('DatasetNewView', () => {
  it('renders all four reachable sections', async () => {
    const mounted = await mountApp(DatasetNewView)
    const text = content(mounted.root)

    expect(text).toContain('New dataset')
    for (const section of ['Basics', 'Context', 'Parts', 'Review']) expect(text).toContain(section)
    mounted.app.unmount()
  })

  it('adds a mocked ORCID Person to Context with the author role', async () => {
    const mounted = await mountApp(DatasetNewView)

    await click(button(mounted.root, 'Add entity'))
    await click(button(mounted.root, 'Choose ORCID person'))

    expect(content(mounted.root)).toContain('Ada ORCID author')
    mounted.app.unmount()
  })

  it('seeds the draft from the Basics RO-Crate JSON-LD action', async () => {
    const mounted = await mountApp(DatasetNewView)

    await click(button(mounted.root, 'Import an RO-Crate'))
    await click(button(mounted.root, 'Use fixture crate'))
    await flush()

    expect(content(mounted.root)).toContain('Imported dataset')
    expect(content(mounted.root)).toContain('Imported author author')
    await click(button(mounted.root, 'Create dataset'))
    const payload = createMetadata.mock.calls[0]?.[0]
    const graph = payload.rocrate['@graph'] as Array<Record<string, unknown>>
    expect(payload).toMatchObject({
      group_id: 'group-1',
      path: 'datasets/imported-dataset',
      public: false,
    })
    expect(graph.find((entity) => entity['@id'] === './')).toMatchObject({
      name: 'Imported dataset',
      citation: 'Imported citation',
    })
    mounted.app.unmount()
  })

  it('refuses to create while the node would reject the dataset', async () => {
    const mounted = await mountApp(DatasetNewView)
    await fillRequired(mounted.root)

    await click(button(mounted.root, 'Run preview'))
    await flush()
    expect(content(mounted.root)).toContain('Dataset title is required.')

    await click(button(mounted.root, 'Create dataset'))

    expect(createMetadata).not.toHaveBeenCalled()
    mounted.app.unmount()
  })

  it('creates Group-visible metadata once the node accepts the draft', async () => {
    const mounted = await mountApp(DatasetNewView)
    await fillRequired(mounted.root)

    previewResult.value = {
      accepted: true,
      state: 'valid',
      evaluator: 'test',
      findings: [],
      completeness: 'complete',
      structural_violations: [],
    }
    await flush()
    await click(button(mounted.root, 'Create dataset'))

    expect(createMetadata).toHaveBeenCalledWith(expect.objectContaining({
      group_id: 'group-1',
      path: 'datasets/example-dataset',
      public: false,
      rocrate: expect.objectContaining({ '@graph': expect.any(Array) }),
    }))
    expect(routerPush).toHaveBeenCalledWith({ name: 'dataset', params: { id: 'dataset-1' } })
    mounted.app.unmount()
  })
})
