import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
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
import * as CrateBuild from '@/lib/crate/build'
import * as CrateParse from '@/lib/crate/parse'
import * as Api from '@/lib/api'
import * as Utils from '@/lib/utils'

const sourceCrate = CrateBuild.buildRoCrate({
  basics: {
    title: 'Existing dataset',
    description: 'Existing description',
    datePublished: '2026-08-28',
    license: 'https://creativecommons.org/licenses/by/4.0/',
  },
  entities: [{
    id: '#unknown-one',
    type: 'UnknownResearchThing',
    properties: { name: 'Unknown entity', retained: true },
    roles: [],
  }],
  parts: [{ kind: 'external', url: 'https://example.test/data.csv', name: 'Data' }],
  visibility: 'group',
})

const fullCrates = ref({})
const saving = ref(false)
const apiBaseUrl = ref('https://api.example.test')
const authToken = ref('token')
const getMetadataItem = vi.fn()
const fetchRoCrateRaw = vi.fn()
const replaceMetadataRoCrate = vi.fn()
const routerPush = vi.fn(async () => undefined)
const previewResult = ref(null)
const previewRunning = ref(false)
const previewError = ref(null)
const previewNow = vi.fn()

const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const EmptyStub = defineComponent(() => () => null)
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), h('p', props.description), slots.actions?.()]),
})
const ContextListStub = defineComponent({
  props: { entities: { type: Array, default: () => [] } },
  setup: (props) => () => h('div', (props.entities as Array<{ properties: { name?: string }; roles: string[] }>).map((entity) =>
    h('p', `${entity.properties.name} ${entity.roles.length ? entity.roles.join(' ') : 'Other'}`))),
})
const ReviewStub = defineComponent({
  props: { actionLabel: String },
  emits: ['create'],
  setup: (props, { emit }) => () => h('button', { onClick: () => emit('create') }, props.actionLabel),
})
const RouterLinkStub = defineComponent((_, { attrs, slots }) => () => h('a', attrs, slots.default?.()))
const icons = new Proxy({}, { get: () => EmptyStub })

const DatasetEditView = compileClientComponent(new URL('./DatasetEditView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': {
    RouterLink: RouterLinkStub,
    useRoute: () => ({ params: { id: 'dataset-1' } }),
    useRouter: () => ({ push: routerPush }),
  },
  '@lucide/vue': icons,
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(Passthrough),
  '@/components/ui/Textarea.vue': moduleDefault(Passthrough),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Skeleton.vue': moduleDefault(EmptyStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(EmptyStub),
  '@/components/metadata/ContextEntityList.vue': moduleDefault(ContextListStub),
  '@/components/metadata/AddContextDialog.vue': moduleDefault(EmptyStub),
  '@/components/metadata/DatasetPartsSection.vue': moduleDefault(EmptyStub),
  '@/components/metadata/DatasetReviewSection.vue': moduleDefault(ReviewStub),
  '@/composables/useAruna': {
    useAruna: () => ({
      fullCrates,
      getMetadataItem,
      fetchRoCrateRaw,
      replaceMetadataRoCrate,
      saving,
      apiBaseUrl,
      authToken,
    }),
  },
  '@/composables/useProfilePreview': {
    useProfilePreview: () => ({ result: previewResult, running: previewRunning, error: previewError, previewNow }),
  },
  '@/composables/useDeviceStatus': { useDeviceStatus: () => ({ deviceClient: ref(null) }) },
  '@/lib/crate/build': CrateBuild,
  '@/lib/crate/parse': CrateParse,
  '@/lib/desktop': { isDesktop: () => false },
  '@/lib/deviceApi': { previewDeviceDraft: vi.fn(), requireDevice: vi.fn() },
  '@/lib/api': Api,
  '@/lib/utils': Utils,
})

beforeEach(() => {
  getMetadataItem.mockReset().mockResolvedValue({
    document_id: 'dataset-1',
    group_id: 'group-1',
    document_path: 'datasets/existing',
    public: false,
  })
  fetchRoCrateRaw.mockReset().mockResolvedValue(sourceCrate)
  replaceMetadataRoCrate.mockReset().mockResolvedValue({ document_id: 'dataset-1' })
  routerPush.mockClear()
})

describe('DatasetEditView', () => {
  it('loads unknown entities under Other and PUTs the rebuilt whole crate', async () => {
    const mounted = await mountApp(DatasetEditView)
    await flush()

    expect(content(mounted.root)).toContain('Edit dataset')
    expect(content(mounted.root)).toContain('Unknown entity Other')
    await click(button(mounted.root, 'Save changes'))

    expect(replaceMetadataRoCrate).toHaveBeenCalledWith('dataset-1', {
      rocrate: expect.objectContaining({ '@graph': expect.any(Array) }),
      public: false,
    })
    const saved = replaceMetadataRoCrate.mock.calls[0][1].rocrate as Record<string, unknown>
    expect((saved['@graph'] as Array<Record<string, unknown>>).some((entity) => entity['@id'] === '#unknown-one')).toBe(true)
    expect(routerPush).toHaveBeenCalledWith({ name: 'dataset', params: { id: 'dataset-1' } })
    mounted.app.unmount()
  })
})
