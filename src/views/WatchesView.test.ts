import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
} from '@/test/clientRender'
import * as Watches from '@/lib/watches'
import * as Utils from '@/lib/utils'
import type { ApiWatch } from '@/lib/api'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const PageHeaderStub = defineComponent({
  props: { title: String, description: String },
  setup: (props, { slots }) => () => h('header', [h('h1', props.title), h('p', props.description), slots.actions?.()]),
})
const ListShellStub = defineComponent({
  props: { state: String },
  setup: (props, { slots }) => () =>
    h('div', [slots.filters?.(), slots.tools?.(), props.state === 'ready' ? slots.default?.() : null]),
})
const NodeLabelStub = defineComponent({
  props: { nodeId: { type: String, default: '' } },
  setup: (props) => () => h('span', `node ${props.nodeId}`),
})

const watchList = ref<ApiWatch[]>([])
const deleteWatch = vi.fn(async () => undefined)

const watches = {
  available: ref(true),
  watches: watchList,
  listLoaded: ref(true),
  listLoading: ref(false),
  listError: ref<string | null>(null),
  deletingIds: ref<string[]>([]),
  loadWatches: vi.fn(async () => undefined),
  ensureLoaded: vi.fn(async () => undefined),
  deleteWatch,
}

const WatchesView = compileClientComponent(new URL('./WatchesView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Passthrough },
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(ButtonStub),
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Skeleton.vue': moduleDefault(Passthrough),
  '@/components/ui/ListShell.vue': moduleDefault(ListShellStub),
  '@/components/ui/EmptyState.vue': moduleDefault(Passthrough),
  '@/components/ui/NodeLabel.vue': moduleDefault(NodeLabelStub),
  '@/composables/useAruna': {
    useAruna: () => ({
      bootstrapped: ref(true),
      currentUser: ref({ id: 'u1' }),
      myGroups: ref([{ id: 'g1', name: 'Reef survey' }]),
      discoverableGroups: ref([]),
    }),
  },
  '@/composables/useWatches': { useWatches: () => watches },
  '@/composables/useGlobalErrors': { reportGlobalError: vi.fn() },
  '@/composables/useRefresh': { useRefresh: (fn: () => Promise<void>) => ({ busy: ref(false), refresh: fn }) },
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/watches': Watches,
  '@/lib/utils': Utils,
})

function watchRow(over: Partial<ApiWatch> = {}): ApiWatch {
  return {
    id: 'w1',
    path_prefix: 's3/g1/n1/reef/raw/',
    events: ['data_uploaded'],
    created_at_ms: Date.now() - 60_000,
    ...over,
  }
}

beforeEach(() => {
  watchList.value = []
  deleteWatch.mockClear()
})

describe('watched resources page', () => {
  it('states delivery, retention and how to stop as its description', async () => {
    const { root } = await mountApp(WatchesView)

    expect(content(root)).toContain(Watches.WATCH_DELIVERY_NOTE)
  })

  it('names the node a data watch belongs to', async () => {
    watchList.value = [watchRow()]

    const { root } = await mountApp(WatchesView)
    const text = content(root)

    expect(text).toContain('reef/raw/')
    expect(text).toContain('node n1')
    expect(text).toContain('Data uploaded')
  })

  it('shows a watch that stopped delivering, and removes only it', async () => {
    watchList.value = [watchRow({ id: 'dead', path_prefix: '', events: [], created_at_ms: 0, authorized: false })]

    const { root } = await mountApp(WatchesView)
    const text = content(root)

    expect(text).toContain('No longer delivering: read access was removed')
    expect(text).toContain('Remove it to free one of your 50 watches.')

    await click(element(root, (node) => node.props['aria-label'] === 'Remove watch that stopped delivering'))

    expect(deleteWatch).toHaveBeenCalledWith('dead')
  })

  it('treats a row without the field as delivering', async () => {
    watchList.value = [watchRow({ path_prefix: 'meta/g1/surveys', events: ['metadata_created'] })]

    const { root } = await mountApp(WatchesView)
    const text = content(root)

    expect(text).toContain('surveys')
    expect(text).not.toContain('No longer delivering')
  })

  it('renders no health state the backend never sends', async () => {
    watchList.value = [watchRow()]

    const { root } = await mountApp(WatchesView)

    expect(content(root)).not.toContain('needs attention')
  })
})
