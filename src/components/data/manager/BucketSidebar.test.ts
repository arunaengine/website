import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { BUCKET_NAME_REQUIREMENT, bucketNameProblem } from '@/lib/bucketName'
import * as Workspaces from '@/lib/workspaces'
import * as BucketPlace from '@/lib/bucketPlace'
import * as DeviceApi from '@/lib/deviceApi'
import { bindSource } from '@/lib/bindSource'

const aruna = vi.hoisted(() => ({ authToken: { value: 'token' }, searchBuckets: vi.fn() }))
const listJobs = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useAruna', () => ({
  isUnsupportedEndpoint: () => false,
  useAruna: () => ({ ...aruna, apiBaseUrl: ref('https://api.test'), sessionEpoch: ref(0) }),
}))
// Only the listing the step labels are read from; everything else of the API stays real.
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  listStorageBuckets: (...args: unknown[]) => listJobs(...args),
}))
const RealSearch = await import('@/composables/useBucketSearch')
const RealJobs = await import('@/composables/useBucketJobs')

const createBucket = vi.fn()
const requestDelete = vi.fn()
const showNode = vi.fn()
const reload = vi.fn()
const loadMore = vi.fn()
let canDelete = true
const desktopMode = { on: false }

// What the cross-group search answered for the typed name.
const otherError = ref<string | null>(null)
const otherFailed = ref(0)
const otherSearch = ref<{ arn: string; bucket: string; node_id: string; group_id: string; group_name?: string }[]>([])
// What the bucket search answered for All nodes.
const allBuckets = {
  hits: ref<{ bucket: string; node_id: string; group_id: string }[]>([]),
  failedNodes: ref(0),
  loading: ref(false),
  error: ref<string | null>(null),
  more: ref(false),
  needsName: ref(false),
  reload,
  loadMore,
}
// The steps the node reports as running, by bucket name.
const stepJobs = ref(new Map<string, { kind: string; state: string; done: number; failed: number }>())
const nodeChoice = ref<string | null>(null)
const choose = vi.fn((nodeId: string | null) => {
  nodeChoice.value = nodeId
  if (nodeId) showNode(nodeId)
})

const Empty = defineComponent(() => () => null)
// The row renders its name and action slot so the sidebar's own controls are visible.
const RowStub = defineComponent({
  props: {
    bucket: { type: String, default: '' },
    highlighted: Boolean,
    job: { type: Object, default: null },
    place: { type: String, default: null },
    placeTitle: { type: String, default: null },
    linkedTo: { type: String, default: undefined },
  },
  emits: ['open'],
  setup: (props, { slots, emit }) => () =>
    h('div', [
      h(
        'button',
        { 'aria-label': `Open ${props.bucket}`, 'aria-selected': props.highlighted, onClick: () => emit('open') },
        props.bucket,
      ),
      h('span', { role: 'tooltip' }, slots.tooltip?.()),
      props.job ? h('em', { 'data-testid': 'row-job' }, `${props.bucket}: ${(props.job as { kind: string }).kind}`) : null,
      props.place ? h('small', { 'data-testid': 'row-place', title: props.placeTitle }, `${props.bucket}: ${props.place}`) : null,
      props.linkedTo === undefined
        ? null
        : h('span', { 'data-testid': 'link-column' }, [
            props.linkedTo ? h('span', { role: 'img', 'aria-label': `Linked to ${props.linkedTo}` }) : slots.link?.(),
          ]),
      slots.actions?.(),
    ]),
})
const IconButtonStub = defineComponent({
  inheritAttrs: false,
  props: { label: { type: String, default: '' }, disabledReason: { type: String, default: null } },
  setup: (props, { attrs, slots }) => () =>
    h(
      'button',
      {
        ...attrs,
        'aria-label': props.label,
        disabled: Boolean(props.disabledReason),
        title: props.disabledReason ?? props.label,
      },
      slots.default?.(),
    ),
})
const icons = new Proxy({}, { get: () => Empty })
const Passthrough = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})

const sidebarModules = {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/composables/useS3': { useS3: () => ({ canDeletePrefix: () => canDelete, clearSessions: vi.fn() }) },
  '@/components/ui/Badge.vue': moduleDefault(Passthrough),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Passthrough),
  '@/components/ui/Spinner.vue': moduleDefault(Empty),
  '@/components/ui/IconButton.vue': moduleDefault(IconButtonStub),
  '@/components/data/BucketRow.vue': moduleDefault(RowStub),
  '@/composables/useBucketJobs': { useBucketJobs: () => stepJobs },
  '@/components/data/manager/MockBucketRows.vue': moduleDefault(Empty),
  '@/components/data/BucketStorageDialog.vue': moduleDefault(Empty),
  '@/components/data/BucketCreateResults.vue': moduleDefault(Empty),
  '@/components/data/manager/DatabaseList.vue': moduleDefault(Empty),
  '@/lib/distributedMockData': { exampleBuckets: () => [] },
  '@/lib/distributedMock': { mockEnabled: () => false, defaultPlacement: () => ({}), placementLabel: () => '' },
  '@/composables/useBucketSearch': {
    useBucketSearch: () => ({ hits: otherSearch, error: otherError, searched: ref(true), nodesFailed: otherFailed }),
  },
  '@/lib/workspaces': Workspaces,
  '@/lib/bucketPlace': BucketPlace,
  '@/lib/deviceApi': DeviceApi,
  '@/lib/desktop': { isDesktop: () => desktopMode.on },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodeById: (id: string | null) =>
        id === 'node-2'
          ? { nodeId: 'node-2', kind: 'server', label: 'node-2 · Giessen', isLocal: false, location: 'Giessen' }
          : null,
      displayName: (id: string | null) => (id ? `name-${id}` : 'this node'),
      isLocalNode: (id: string | null) => !id || id === 'home',
      localNodeId: ref('home'),
    }),
  },
}
const BucketSidebar = compileClientComponent(new URL('./BucketSidebar.vue', import.meta.url), sidebarModules)

// The same sidebar on the real cross-group search, for its timing and keys.
const RealSearchSidebar = compileClientComponent(new URL('./BucketSidebar.vue', import.meta.url), {
  ...sidebarModules,
  '@/composables/useBucketSearch': RealSearch,
})

/** The slice of the data manager the sidebar reads, with the real name rule. */
function manager() {
  const newBucketName = ref('')
  const newBucketProblem = computed(() => {
    const name = newBucketName.value.trim()
    return name ? bucketNameProblem(name) : null
  })
  return {
    bucket: ref(''),
    remoteNodeId: ref(null),
    requiredNodeId: ref('home'),
    bucketNodeChoice: nodeChoice,
    selectedGroupId: ref('g1'),
    bucketNameFilter: ref(''),
    allBuckets,
    buckets: ref([]),
    recentNodes: ref([]),
    pickNode: choose,
    syncByBucket: ref(new Map()),
    syncKeyFor: () => '',
    openSearchHit: vi.fn(),
    openBucket: vi.fn(),
    openBucketOn: vi.fn(),
    shortcuts: { togglePin: vi.fn(), recent: ref([]) },
    sidebarBuckets: ref([]),
    recentBuckets: ref([]),
    workspaceBuckets: ref([]),
    workspacesOpen: ref(false),
    bucketsLoaded: ref(true),
    bucketsLoading: ref(false),
    bucketsRefreshing: ref(false),
    bucketsError: ref(null),
    bucketsAuthError: ref(false),
    newBucketName,
    newBucketProblem,
    newBucketRefusal: computed(() => null),
    createBucketBlocker: computed(() => newBucketProblem.value),
    creatingBucket: ref(false),
    createBucket,
    createBucketError: ref(null),
    requestDelete,
    // The realm nodes are node-2 and home; the laptop is the computer's own user node.
    bindSourceFor: (name: string, nodeId: string | null, groupId: string | null | undefined) =>
      bindSource(
        [
          { nodeId: 'node-2', kind: 'server' },
          { nodeId: 'home', kind: 'server' },
          { nodeId: 'laptop', kind: 'user' },
        ],
        name,
        nodeId ?? 'home',
        groupId,
      ),
    linkedFolderFor: (_nodeId: string | null, _name: string) => null as { root: string } | null,
  }
}

/** A sidebar showing one bucket row. */
function withBucket(nodeId: string | null = null) {
  const state = manager()
  state.sidebarBuckets = ref([{ bucket: 'reef-survey', nodeId, pinned: false }]) as never
  return state
}

function trash(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'Delete bucket…')
}

// Switches the list from All nodes to one node, as the header picker does.
async function pickNode() {
  choose('node-2')
  await flush()
}

function hovers(root: Parameters<typeof content>[0]) {
  return nodes(root).filter((node) => node.props.role === 'tooltip').map((node) => content(node).trim())
}

function field(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'New bucket name')
}

function createButton(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.tag === 'button' && node.props['aria-label'] === 'Create bucket')
}

describe('Bucket sidebar naming', () => {
  it('shows no hint before anything is typed', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })
    expect(content(root)).not.toContain(BUCKET_NAME_REQUIREMENT)
  })

  it('names the broken rule and disables creation for b1', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })

    await typeValue(field(root), 'b1')

    expect(content(root)).toContain('Bucket names must contain at least 3 characters.')
    expect(field(root).props.invalid).toBe('error')
    expect(createButton(root).props.disabled).toBe(true)
  })

  it('accepts a name the node accepts', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })

    await typeValue(field(root), 'reef-survey-2026')

    expect(content(root)).not.toContain(BUCKET_NAME_REQUIREMENT)
    expect(content(root)).not.toContain('Bucket names')
    expect(field(root).props.invalid).toBeUndefined()
    expect(createButton(root).props.disabled).toBe(false)
  })
})

describe('Bucket sidebar deletion', () => {
  beforeEach(() => {
    nodeChoice.value = null
    requestDelete.mockClear()
    canDelete = true
  })

  it('hands the row bucket to the shared delete dialog', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket() } })
    await pickNode()

    await click(trash(root))

    expect(requestDelete).toHaveBeenCalledWith({
      kind: 'bucket',
      bucket: 'reef-survey',
      nodeId: null,
    })
  })

  it('hands a bucket on another node to the dialog', async () => {
    canDelete = false
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket('node-far') } })
    await pickNode()

    expect(trash(root).props.disabled).toBeFalsy()
    await click(trash(root))
    expect(requestDelete).toHaveBeenCalledWith({ kind: 'bucket', bucket: 'reef-survey', nodeId: 'node-far' })
  })

  it('refuses a session without write over the whole bucket', async () => {
    canDelete = false
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket() } })
    await pickNode()

    expect(trash(root).props.disabled).toBe(true)
    expect(trash(root).props.title).toContain('write on the whole bucket')
  })
})

describe('Bucket sidebar link a local folder', () => {
  beforeEach(() => {
    nodeChoice.value = null
    desktopMode.on = false
  })

  it('offers the action on a bucket row in the desktop only', async () => {
    const web = await mountApp(BucketSidebar, { props: { manager: withBucket() } })
    await pickNode()
    expect(() => element(web.root, (node) => node.props['aria-label'] === 'Link a local folder to reef-survey…')).toThrow()

    desktopMode.on = true
    const onSyncComputer = vi.fn()
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket(), onSyncComputer } })
    await pickNode()
    await click(element(root, (node) => node.props['aria-label'] === 'Link a local folder to reef-survey…'))

    expect(onSyncComputer).toHaveBeenCalledWith({ bucket: 'reef-survey', nodeId: 'home', groupId: 'g1' })
  })

  it('offers nothing for a bucket on the computer’s own user node', async () => {
    desktopMode.on = true
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket('laptop') } })
    await pickNode()

    expect(() => element(root, (node) => node.props['aria-label'] === 'Link a local folder to reef-survey…')).toThrow()
  })

  it('offers the action on every All nodes result with its own node and group', async () => {
    desktopMode.on = true
    allBuckets.hits.value = [
      { bucket: 'results', node_id: 'node-2', group_id: 'g7' },
      { bucket: 'private', node_id: 'laptop', group_id: 'g1' },
    ]
    const onSyncComputer = vi.fn()
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket(), onSyncComputer } })

    await click(element(root, (node) => node.props['aria-label'] === 'Link a local folder to results…'))

    expect(onSyncComputer).toHaveBeenCalledWith({ bucket: 'results', nodeId: 'node-2', groupId: 'g7' })
    expect(() => element(root, (node) => node.props['aria-label'] === 'Link a local folder to private…')).toThrow()
  })
})

describe('Bucket sidebar linked buckets', () => {
  const linkLabel = (name: string) => `Link a local folder to ${name}…`
  const hasNode = (root: Parameters<typeof content>[0], label: string) =>
    nodes(root).some((node) => node.props['aria-label'] === label)
  const columns = (root: Parameters<typeof content>[0]) =>
    nodes(root).filter((node) => node.props['data-testid'] === 'link-column')
  // test on node-2 is linked to the folder test-data on this computer.
  const linkedManager = (state = manager()) => ({
    ...state,
    linkedFolderFor: (nodeId: string | null, name: string) =>
      nodeId === 'node-2' && name === 'test' ? { root: '/home/me/test-data' } : null,
  })

  beforeEach(() => {
    nodeChoice.value = null
    allBuckets.hits.value = [
      { bucket: 'raw-reads', node_id: 'node-2', group_id: 'g1' },
      { bucket: 'test', node_id: 'node-2', group_id: 'g1' },
      { bucket: 'private', node_id: 'laptop', group_id: 'g1' },
    ]
    desktopMode.on = true
  })
  afterEach(() => {
    desktopMode.on = false
    allBuckets.hits.value = []
  })

  it('marks the linked row and offers the link only on the others', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: linkedManager() } })

    expect(hasNode(root, 'Linked to test-data')).toBe(true)
    expect(hasNode(root, linkLabel('test'))).toBe(false)
    expect(hasNode(root, linkLabel('raw-reads'))).toBe(true)
  })

  it('gives every desktop row the same link column, empty where nothing applies', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: linkedManager() } })
    const [raw, test, own] = columns(root)

    expect(columns(root)).toHaveLength(3)
    expect(hasNode(raw, linkLabel('raw-reads'))).toBe(true)
    expect(hasNode(test, 'Linked to test-data')).toBe(true)
    expect(content(own)).toBe('')
    expect(nodes(own).filter((node) => node.kind === 'element')).toEqual([own])
  })

  it('marks the linked row in the list of one node too', async () => {
    const state = manager()
    state.sidebarBuckets = ref([
      { bucket: 'test', nodeId: 'node-2', pinned: false },
      { bucket: 'raw-reads', nodeId: 'node-2', pinned: false },
    ]) as never
    const { root } = await mountApp(BucketSidebar, { props: { manager: linkedManager(state) } })
    await pickNode()

    expect(hasNode(root, 'Linked to test-data')).toBe(true)
    expect(hasNode(root, linkLabel('test'))).toBe(false)
    expect(hasNode(root, linkLabel('raw-reads'))).toBe(true)
    expect(nodes(root).filter((node) => node.props['aria-label'] === 'Delete bucket…')).toHaveLength(2)
  })

  it('names the place in one node’s list only on rows from another node', async () => {
    const state = manager()
    state.remoteNodeId = ref('node-2') as never
    state.sidebarBuckets = ref([
      { bucket: 'pinned-home', nodeId: null, pinned: true },
      { bucket: 'pinned-far', nodeId: 'node-3', pinned: true },
      { bucket: 'reef', nodeId: 'node-2', pinned: false },
    ]) as never
    state.recentBuckets = ref([
      { bucket: 'seen-here', nodeId: 'node-2' },
      { bucket: 'seen-far', nodeId: 'node-3' },
    ]) as never
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    await pickNode()
    const places = nodes(root).filter((node) => node.props['data-testid'] === 'row-place')

    expect(places.map((node) => content(node))).toEqual([
      'pinned-home: This computer',
      'pinned-far: name-node-3',
      'seen-far: name-node-3',
    ])
    expect(columns(root)).toHaveLength(5)
  })

  it('names no place on rows of the connected node in its own list', async () => {
    const state = manager()
    state.sidebarBuckets = ref([
      { bucket: 'reef', nodeId: null, pinned: false },
      { bucket: 'pinned-far', nodeId: 'node-2', pinned: true },
    ]) as never
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    await pickNode()
    const places = nodes(root).filter((node) => node.props['data-testid'] === 'row-place')

    expect(places.map((node) => content(node))).toEqual(['pinned-far: node-2 · Giessen'])
  })

  it('adds no link column on the web', async () => {
    desktopMode.on = false
    const { root } = await mountApp(BucketSidebar, { props: { manager: linkedManager() } })

    expect(columns(root)).toHaveLength(0)
    expect(hasNode(root, 'Linked to test-data')).toBe(false)
  })
})

describe('Bucket sidebar in the desktop', () => {
  beforeEach(() => {
    nodeChoice.value = null
    allBuckets.hits.value = []
    desktopMode.on = true
  })
  afterEach(() => {
    desktopMode.on = false
  })

  it('asks for the New bucket dialog instead of a name field', async () => {
    const onNewBucket = vi.fn()
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager(), onNewBucket } })

    expect(() => field(root)).toThrow()
    await click(button(root, 'New bucket'))

    expect(onNewBucket).toHaveBeenCalled()
    expect(createBucket).not.toHaveBeenCalled()
  })

  it('names the place of every row, with kind and id in the tooltip', async () => {
    allBuckets.hits.value = [
      { bucket: 'results', node_id: 'node-2', group_id: 'g1' },
      { bucket: 'notes', node_id: 'home', group_id: 'g1' },
    ]
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })
    const places = nodes(root).filter((node) => node.props['data-testid'] === 'row-place')

    expect(places.map((node) => content(node))).toEqual(['results: node-2 · Giessen', 'notes: This computer'])
    expect(places[0].props.title).toBe('node-2 · Giessen (server node-2)')
  })
})

describe('Bucket sidebar running steps', () => {
  const shown = (root: Parameters<typeof content>[0]) =>
    nodes(root).filter((node) => node.props['data-testid'] === 'row-job').map((node) => content(node))

  beforeEach(() => {
    nodeChoice.value = null
    allBuckets.hits.value = []
    stepJobs.value = new Map([['reef-survey', { kind: 'rename', state: 'running', done: 2, failed: 0 }]])
  })

  it('marks a bucket of this node that has a step running', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket() } })
    await pickNode()
    expect(shown(root)).toEqual(['reef-survey: rename'])
  })

  it('marks nothing when the node reports no step', async () => {
    stepJobs.value = new Map()
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket() } })
    await pickNode()
    expect(shown(root)).toEqual([])
  })

  it('does not put the steps of this node on a bucket of another node', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket('node-far') } })
    await pickNode()
    expect(shown(root)).toEqual([])
  })

  it('marks the results of this node under All nodes, not those of other nodes', async () => {
    stepJobs.value = new Map([
      ['reef-survey', { kind: 'move', state: 'running', done: 2, failed: 0 }],
      ['far-reads', { kind: 'move', state: 'running', done: 2, failed: 0 }],
    ])
    allBuckets.hits.value = [
      { bucket: 'reef-survey', node_id: 'home', group_id: 'g1' },
      { bucket: 'far-reads', node_id: 'node-2', group_id: 'g1' },
    ]
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })
    expect(shown(root)).toEqual(['reef-survey: move'])
  })
})

// The same sidebar on the real step reader, which asks the node's bucket listing.
const RealJobsSidebar = compileClientComponent(new URL('./BucketSidebar.vue', import.meta.url), {
  ...sidebarModules,
  '@/composables/useBucketJobs': RealJobs,
})

describe('Bucket sidebar step reads', () => {
  const shown = (root: Parameters<typeof content>[0]) =>
    nodes(root).filter((node) => node.props['data-testid'] === 'row-job').map((node) => content(node))
  const RENAMING = { kind: 'rename', state: 'running', done: 2, failed: 0 }

  beforeEach(() => {
    nodeChoice.value = null
    allBuckets.loading.value = false
    allBuckets.hits.value = [{ bucket: 'reef-survey', node_id: 'home', group_id: 'g1' }]
    listJobs.mockReset().mockResolvedValue({ buckets: [{ bucket: 'reef-survey' }], next: null })
  })

  it('labels a step that started elsewhere once the All nodes list is read again', async () => {
    const { root } = await mountApp(RealJobsSidebar, { props: { manager: manager() } })
    await flush()
    expect(listJobs).toHaveBeenCalledTimes(1)
    expect(shown(root)).toEqual([])
    // Refresh with All nodes selected reloads only the search results.
    listJobs.mockResolvedValue({ buckets: [{ bucket: 'reef-survey', job: RENAMING }], next: null })
    allBuckets.loading.value = true
    await flush()
    allBuckets.hits.value = [{ bucket: 'reef-survey', node_id: 'home', group_id: 'g1' }]
    allBuckets.loading.value = false
    await flush()
    await flush()
    expect(listJobs).toHaveBeenCalledTimes(2)
    expect(shown(root)).toEqual(['reef-survey: rename'])
  })

  it('does not read the steps again for each typed letter', async () => {
    await mountApp(RealJobsSidebar, { props: { manager: manager() } })
    await flush()
    allBuckets.hits.value = []
    await flush()
    allBuckets.hits.value = []
    await flush()
    expect(listJobs).toHaveBeenCalledTimes(1)
  })
})

describe('Bucket sidebar node choice', () => {
  beforeEach(() => {
    nodeChoice.value = null
    showNode.mockClear()
    reload.mockClear()
    loadMore.mockClear()
    allBuckets.hits.value = [
      { bucket: 'results', node_id: 'node-2', group_id: 'g1' },
      { bucket: 'images', node_id: 'home', group_id: 'g1' },
    ]
    allBuckets.failedNodes.value = 0
    allBuckets.more.value = false
    allBuckets.needsName.value = false
  })

  it('lists every node with its node on hover and opens a bucket on its node', async () => {
    const state = withBucket()
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    const text = content(root)

    expect(text).toContain('results')
    expect(hovers(root)).toEqual(['On name-node-2', 'On name-home'])
    expect(text).not.toContain('reef-survey')

    await click(element(root, (node) => node.props['aria-label'] === 'Open results'))
    await click(element(root, (node) => node.props['aria-label'] === 'Open images'))
    expect(state.openBucketOn).toHaveBeenNthCalledWith(1, 'results', 'node-2')
    expect(state.openBucketOn).toHaveBeenNthCalledWith(2, 'images', null)
  })

  it('sums up nodes that did not answer in one line with a retry', async () => {
    allBuckets.failedNodes.value = 2
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })

    expect(content(root)).toContain('2 nodes did not answer.')
    await click(button(root, 'Retry'))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('pages with Load more', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })
    expect(content(root)).not.toContain('Load more')

    allBuckets.more.value = true
    await flush()
    await click(button(root, 'Load more'))
    expect(loadMore).toHaveBeenCalledOnce()
  })

  it('lists one node after picking it and names it in the create button title', async () => {
    const state = withBucket()
    state.requiredNodeId.value = 'node-2'
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })

    await pickNode()

    expect(showNode).toHaveBeenCalledWith('node-2')
    expect(content(root)).toContain('reef-survey')
    expect(hovers(root)).toEqual(['On name-home'])
    expect(content(root)).not.toContain('results')
    expect(createButton(root).props.title).toBe('Creates the bucket on name-node-2')
  })

  it('lists matches of other groups below the list and opens them', async () => {
    otherSearch.value = [
      { arn: 'a', bucket: 'results', node_id: 'node-2', group_id: 'g1' },
      { arn: 'b', bucket: 'shared-reads', node_id: 'home', group_id: 'g2', group_name: 'Lab' },
      { arn: 'c', bucket: 'ws-scratch', node_id: 'home', group_id: 'g2' },
    ]
    const state = manager()
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    const text = content(root)

    expect(text).toContain('Other groups')
    expect(text).toContain('shared-reads')
    expect(text).not.toContain('ws-scratch')
    await click(element(root, (node) => node.props['aria-label'] === 'Open shared-reads'))
    expect(state.openSearchHit).toHaveBeenCalledWith(otherSearch.value[1])
    otherSearch.value = []
  })

  it('says when other groups could not be searched or answered in part', async () => {
    otherError.value = 'search failed'
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })
    expect(content(root)).toContain('Other groups could not be searched.')

    otherError.value = null
    otherFailed.value = 2
    await flush()
    expect(content(root)).toContain('Some nodes did not answer.')
    otherFailed.value = 0
  })

  it('names the browsed node on workspace rows', async () => {
    const state = {
      ...manager(),
      remoteNodeId: ref<string | null>('node-2'),
      bucketNodeChoice: ref<string | null>('node-2'),
      workspaceBuckets: ref([{ name: 'ws-run-1' }]),
      workspacesOpen: ref(true),
    }
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })

    expect(element(root, (node) => node.tag === 'button' && content(node).includes('ws-run-1')).props.title).toBe('On name-node-2')
  })

  it('falls back to the open node list when the node needs a name', async () => {
    allBuckets.needsName.value = true
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket() } })

    expect(content(root)).not.toContain('letters')
    expect(content(root)).toContain('reef-survey')
  })
})

describe('Bucket sidebar search keys', () => {
  afterEach(() => vi.useRealTimers())

  function key(field: ReturnType<typeof element>, name: string) {
    ;(field.props.onKeydown as (event: unknown) => void)({ key: name, preventDefault: () => {} })
    return flush()
  }
  function selected(root: Parameters<typeof content>[0]) {
    return nodes(root).filter((node) => node.props['aria-selected'] === true).map((node) => content(node))
  }

  it('moves through this group and other groups and opens the chosen row', async () => {
    vi.useFakeTimers()
    aruna.searchBuckets.mockReset().mockResolvedValue({
      hits: [{ arn: 'x', bucket: 'reef-shared', node_id: 'home', group_id: 'g2', group_name: 'Lab' }],
      nodes_queried: 1,
      nodes_failed: 0,
    })
    nodeChoice.value = 'home'
    const state = withBucket()
    const { root } = await mountApp(RealSearchSidebar, { props: { manager: state } })
    const field = element(root, (node) => node.props['aria-label'] === 'Find a bucket')
    expect(field.props.role).toBe('combobox')

    await typeValue(field, 'reef')
    await vi.advanceTimersByTimeAsync(300)
    expect(content(root)).toContain('reef-shared')

    await key(field, 'ArrowDown')
    expect(selected(root)).toEqual(['reef-survey'])
    await key(field, 'ArrowDown')
    expect(selected(root)).toEqual(['reef-shared'])
    await key(field, 'Enter')
    expect(state.openSearchHit).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'reef-shared' }))

    await typeValue(field, 'r')
    expect(content(root)).not.toContain('reef-shared')
    nodeChoice.value = null
  })

  it('starts ArrowUp at the last row and drops the highlight when the list changes', async () => {
    vi.useFakeTimers()
    aruna.searchBuckets.mockReset().mockResolvedValue({
      hits: [{ arn: 'x', bucket: 'reef-shared', node_id: 'home', group_id: 'g2' }],
      nodes_queried: 1,
      nodes_failed: 0,
    })
    nodeChoice.value = 'home'
    const { root } = await mountApp(RealSearchSidebar, { props: { manager: withBucket() } })
    const field = element(root, (node) => node.props['aria-label'] === 'Find a bucket')
    await typeValue(field, 'reef')
    await vi.advanceTimersByTimeAsync(300)

    await key(field, 'ArrowUp')
    expect(selected(root)).toEqual(['reef-shared'])

    await typeValue(field, 'reef-s')
    expect(selected(root)).toEqual([])
    nodeChoice.value = null
  })
})
