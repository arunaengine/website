import * as VueRuntime from 'vue'
import { defineComponent, h, onMounted, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  input,
  moduleDefault,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import * as Api from '@/lib/api'
import * as Watches from '@/lib/watches'
import * as Utils from '@/lib/utils'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const TooltipStub = defineComponent({
  props: { label: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('div', [slots.default?.(), h('span', props.label)]),
})
const NodeLabelStub = defineComponent({
  props: { nodeId: { type: String, default: '' } },
  setup: (props) => () => h('span', `node ${props.nodeId}`),
})
// The dialog under test is asserted open: mounting reports the open state the
// component reacts to, and the content renders unconditionally.
const DialogStub = defineComponent({
  props: { open: Boolean },
  emits: ['update:open'],
  setup: (_, { emit, slots }) => {
    onMounted(() => emit('update:open', true))
    return () => h('div', slots.default?.())
  },
})

const outgoing = ref<unknown[]>([])
const listSyncRelationships = vi.fn(async () => ({ outgoing: outgoing.value, incoming: [] }))
const createWatch = vi.fn(async () => ({ id: 'w1', path_prefix: '', events: [], created_at_ms: 0 }))
const deleteWatch = vi.fn(async () => undefined)
const watchList = ref<Api.ApiWatch[]>([])

const watches = {
  available: ref(true),
  creating: ref(false),
  deletingIds: ref<string[]>([]),
  ensureLoaded: vi.fn(async () => undefined),
  createWatch,
  deleteWatch,
  findWatch: (pathPrefix: string) => watchList.value.find((w) => w.path_prefix === pathPrefix),
}

const WatchButton = compileClientComponent(new URL('./WatchButton.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Dialog.vue': moduleDefault(DialogStub),
  '@/components/ui/DialogContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogHeader.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTitle.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogDescription.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogFooter.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogClose.vue': moduleDefault(Passthrough),
  '@/components/ui/DialogTrigger.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/NodeLabel.vue': moduleDefault(NodeLabelStub),
  '@/components/ui/Tooltip.vue': moduleDefault(TooltipStub),
  '@/composables/useAruna': {
    useAruna: () => ({
      myGroups: ref([{ id: 'g1', name: 'Reef survey' }]),
      discoverableGroups: ref([]),
      listSyncRelationships,
    }),
  },
  '@/composables/useWatches': { useWatches: () => watches },
  '@/lib/api': Api,
  '@/lib/watches': Watches,
  '@/lib/connectivity': { OFFLINE_WRITE_HINT: 'offline', useConnectivity: () => ({ writesDisabled: ref(false) }) },
  '@/lib/utils': Utils,
})

function bucketProps(over: Record<string, unknown> = {}) {
  return {
    surface: 'bucket',
    pathPrefix: 's3/g1/n1/reef/raw/',
    resourceLabel: 'reef/raw/',
    groupId: 'g1',
    ...over,
  }
}

function datasetProps(over: Record<string, unknown> = {}) {
  return {
    surface: 'dataset',
    pathPrefix: 'meta/g1/surveys/reef',
    resourceLabel: 'surveys/reef',
    groupId: 'g1',
    ...over,
  }
}

function submit(root: HostNode, label: string): HostNode {
  const matches = nodes(root).filter(
    (node) => node.kind === 'element' && node.tag === 'button' && content(node).trim().startsWith(label),
  )
  const last = matches[matches.length - 1]
  if (!last) throw new Error(`No button labelled ${label}`)
  return last
}

beforeEach(() => {
  outgoing.value = []
  watchList.value = []
  watches.available.value = true
  createWatch.mockClear()
  createWatch.mockResolvedValue({ id: 'w1', path_prefix: '', events: [], created_at_ms: 0 })
  listSyncRelationships.mockClear()
})

describe('watch dialog on a bucket folder', () => {
  it('names the folder, its node and the applicable events', async () => {
    const { root } = await mountApp(WatchButton, { props: bucketProps() })
    const text = content(root)

    expect(text).toContain('Watch this folder')
    expect(text).toContain('New uploads to reef/raw/ on')
    expect(text).toContain('node n1')
    expect(text).toContain('Data uploaded')
    expect(text).toContain('Sync completed')
    expect(text).toContain('Sync failed')
    expect(text).not.toContain('Dataset created')
  })

  it('disables the sync kinds with a reason outside a sync source', async () => {
    const { root } = await mountApp(WatchButton, { props: bucketProps() })

    expect(content(root)).toContain('This folder is not the source of a sync')
    expect(input(root, 'value', 'sync_completed').props.disabled).toBe(true)
    expect(input(root, 'value', 'sync_failed').props.disabled).toBe(true)
    expect(input(root, 'value', 'data_uploaded').props.disabled).toBe(false)
  })

  it('offers the sync kinds once the folder is a sync source', async () => {
    outgoing.value = [{ id: 'rel-1' }]

    const { root } = await mountApp(WatchButton, { props: bucketProps() })

    expect(listSyncRelationships).toHaveBeenCalledWith({ bucket: 'reef', direction: 'out' })
    expect(content(root)).not.toContain('This folder is not the source of a sync')
    expect(input(root, 'value', 'sync_completed').props.disabled).toBe(false)
  })

  it('treats a failed relationship lookup as no sync', async () => {
    listSyncRelationships.mockRejectedValueOnce(new Error('unreachable'))

    const { root } = await mountApp(WatchButton, { props: bucketProps() })

    expect(content(root)).toContain('This folder is not the source of a sync')
  })
})

describe('watch dialog on a dataset path', () => {
  it('promises new datasets under the path, not edits', async () => {
    const { root } = await mountApp(WatchButton, { props: datasetProps() })
    const text = content(root)

    expect(text).toContain('Watch this path')
    expect(text).toContain('New datasets under Reef survey / surveys/reef')
    expect(text).toContain('It does not notify you about edits to this dataset.')
    expect(text).toContain('Dataset created')
    expect(text).not.toContain('Data uploaded')
    expect(text).not.toContain('Sync completed')
    expect(listSyncRelationships).not.toHaveBeenCalled()
  })
})

describe('watch dialog copy and refusals', () => {
  it('states delivery, retention and how to stop on both surfaces', async () => {
    const folder = await mountApp(WatchButton, { props: bucketProps() })
    const dataset = await mountApp(WatchButton, { props: datasetProps() })

    expect(content(folder.root)).toContain(Watches.WATCH_DELIVERY_NOTE)
    expect(content(dataset.root)).toContain(Watches.WATCH_DELIVERY_NOTE)
    expect(Watches.WATCH_DELIVERY_NOTE).toContain('in-app only')
    expect(Watches.WATCH_DELIVERY_NOTE).toContain('kept for 30 days')
  })

  it('reports a refused create inside the dialog', async () => {
    createWatch.mockRejectedValueOnce(new Api.ApiError(403, 'Forbidden'))
    const { root } = await mountApp(WatchButton, { props: bucketProps() })

    await click(submit(root, 'Watch'))

    expect(content(root)).toContain('You need read access to watch this')
    expect(watches.available.value).toBe(true)
  })

  it('shows the message of any other failure', async () => {
    createWatch.mockRejectedValueOnce(new Api.ApiError(409, 'You already hold 50 watches'))
    const { root } = await mountApp(WatchButton, { props: bucketProps() })

    await click(submit(root, 'Watch'))

    expect(content(root)).toContain('You already hold 50 watches')
  })
})

describe('watch button without a usable prefix', () => {
  it('stays visible and asks for a group', async () => {
    const { root } = await mountApp(WatchButton, {
      props: bucketProps({ pathPrefix: '', groupId: null }),
    })

    const trigger = submit(root, 'Watch')

    expect(content(root)).toContain('Pick a group to watch this folder')
    expect(trigger.props).toHaveProperty('disabled')
    expect(trigger.props.title).toBe('Pick a group to watch this folder')
  })

  it('names the unresolved node when the group is known', async () => {
    const { root } = await mountApp(WatchButton, { props: bucketProps({ pathPrefix: '' }) })

    expect(content(root)).toContain('Uploads to this node cannot be watched from here')
  })

  it('says why a dataset without a path cannot be watched', async () => {
    const { root } = await mountApp(WatchButton, { props: datasetProps({ pathPrefix: '' }) })

    expect(content(root)).toContain('This dataset has no catalog path to watch yet')
  })
})
