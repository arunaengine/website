import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { button, compileClientComponent, flush, mountApp, moduleDefault } from '@/test/clientRender'

const Passthrough = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()) })
const Empty = defineComponent(() => () => null)
const downloadProvenanceCrate = vi.fn()

const component = compileClientComponent(new URL('./DatasetActions.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRouter: () => ({ push: vi.fn() }) },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/assistant/AskAiButton.vue': moduleDefault(Empty),
  '@/components/ui/Button.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()) })),
  '@/components/ui/Switch.vue': moduleDefault(Empty),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Empty),
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
  '@/lib/utils': { errorMessage: (cause: unknown) => String(cause) },
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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

    void (button(root, 'Export as crate').props.onClick as () => Promise<void>)()
    detailId.value = 'dataset-b'
    await flush()
    answer(new Blob(['zip']))
    await flush()

    expect(downloadProvenanceCrate).toHaveBeenCalledWith({ dataset: 'dataset-a' })
    expect(anchor.download).toBe('dataset-a.zip')
  })
})
