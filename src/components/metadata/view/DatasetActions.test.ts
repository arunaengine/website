import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, compileClientComponent, content, element, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Passthrough = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()) })
const Empty = defineComponent(() => () => null)
const downloadProvenanceCrate = vi.fn()

const component = compileClientComponent(new URL('./DatasetActions.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': {
    useRouter: () => ({ push: vi.fn() }),
    RouterLink: defineComponent({ props: { to: { type: Object, required: true } }, setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()) }),
  },
  '@/composables/assistantState': { assistantAvailable: ref(false) },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/assistant/AskAiButton.vue': moduleDefault(Empty),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/components/ui/Switch.vue': moduleDefault(Empty),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuLabel.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuSeparator.vue': moduleDefault(Empty),
  '@/components/watches/WatchButton.vue': moduleDefault(Empty),
  '@/composables/useAruna': { useAruna: () => ({ currentUser: ref({ id: 'u1' }), toggleFavourite: vi.fn(), downloadProvenanceCrate }) },
  '@/composables/useJobs': { useJobs: () => ({ jobsEnabled: ref(false) }) },
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: () => false }) },
  '@/composables/useGlobalErrors': { reportGlobalError: vi.fn() },
  '@/lib/crateImport': { downloadCrateJson: vi.fn() },
  '@/lib/utils': { errorMessage: (cause: unknown) => String(cause), copyToClipboard: vi.fn() },
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function viewState() {
  return {
    detailId: ref('record-1'), docState: ref('found'), current: ref({ ulid: 'record-1', title: 'Annotate', realmId: 'g1' }), currentCrate: ref(null),
    crateHasEntities: ref(false), canWrite: ref(true), currentPath: ref(''), watchPathPrefix: ref(''), offlineShown: ref(false),
    offlineSelected: ref(false), offlineBusy: ref(false), setOffline: vi.fn(),
  }
}

describe('run record actions', () => {
  it('leads with Show results, keeps Cite and Export beside it and link and edit in the menu', async () => {
    const results = { name: 'bucket', params: { bucketId: 'laptop' }, query: { prefix: 'results/bakta', run: 'r1' } }
    const { root } = await mountApp(component, { props: { state: viewState(), run: true, results } })
    const text = content(root)

    expect(element(root, (node) => node.props['aria-label'] === 'More actions')).toBeTruthy()
    expect(element(root, (node) => node.tag === 'a' && content(node).includes('Show results')).props.to).toEqual(results)
    expect(button(root, 'Cite')).toBeTruthy()
    expect(button(root, 'Export')).toBeTruthy()
    for (const label of ['Copy link', 'Edit']) expect(text).toContain(label)
  })
})

describe('dataset crate export', () => {
  it('names the file after the dataset it was asked for', async () => {
    let answer!: (blob: Blob) => void
    downloadProvenanceCrate.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve }))
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', { createElement: () => anchor, body: { append: () => {} } })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:crate')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const detailId = ref('dataset-a')
    const state = {
      detailId, docState: ref('found'), current: ref(null), currentCrate: ref(null), crateHasEntities: ref(false),
      canWrite: ref(false), currentPath: ref(''), watchPathPrefix: ref(''), offlineShown: ref(false),
      offlineSelected: ref(false), offlineBusy: ref(false), setOffline: vi.fn(),
    }
    const { root } = await mountApp(component, { props: { state } })

    void (button(root, 'Export').props.onClick as () => Promise<void>)()
    detailId.value = 'dataset-b'
    await flush()
    answer(new Blob(['zip']))
    await flush()

    expect(downloadProvenanceCrate).toHaveBeenCalledWith({ dataset: 'dataset-a' })
    expect(anchor.download).toBe('dataset-a.zip')
  })
})
