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
// The realm's databases, by bucket and the node that holds them.
const databaseRows = ref<unknown[]>([])
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
    pinnable: { type: Boolean, default: true },
    pinned: Boolean,
    database: Boolean,
    subtitle: { type: String, default: null },
  },
  emits: ['open', 'toggle-pin'],
  setup: (props, { slots, emit }) => () =>
    h('div', [
      h(
        'button',
        { 'aria-label': `Open ${props.bucket}`, 'aria-selected': props.highlighted, onClick: () => emit('open') },
        props.bucket,
      ),
      h('span', { role: 'tooltip' }, slots.tooltip?.()),
      props.database ? h('i', { 'data-testid': 'database-icon' }, `${props.bucket} is a database`) : null,
      props.subtitle ? h('small', { 'data-testid': 'row-subtitle' }, `${props.bucket}: ${props.subtitle}`) : null,
      props.pinnable ? h('button', { 'aria-label': `${props.pinned ? 'Unpin' : 'Pin'} ${props.bucket}`, onClick: () => emit('toggle-pin') }) : null,
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
  '@/components/data/manager/DatabaseRows.vue': moduleDefault(Empty),
  '@/components/data/BucketStorageDialog.vue': moduleDefault(Empty),
  '@/components/data/BucketCreateResults.vue': moduleDefault(Empty),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(Passthrough),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Passthrough),
  '@/lib/distributedMockData': { exampleBuckets: () => [] },
  '@/lib/distributedMock': { mockEnabled: () => false, defaultPlacement: () => ({}), placementLabel: () => '' },
  '@/composables/useBucketSearch': {
    useBucketSearch: () => ({ hits: otherSearch, error: otherError, searched: ref(true), nodesFailed: otherFailed }),
  },
  '@/lib/workspaces': Workspaces,
  '@/lib/bucketPlace': BucketPlace,
  '@/lib/deviceApi': DeviceApi,
  '@/lib/desktop': { isDesktop: () => desktopMode.on },
  '@/composables/useDatabases': { useDatabases: () => ({ rows: databaseRows, ensure: () => {} }) },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodeById: (id: string | null) =>
        id === 'node-2'
          ? { nodeId: 'node-2', kind: 'server', label: 'node-2 · Giessen', isLocal: false, location: 'Giessen' }
          : null,
      displayName: (id: string | null) => (id ? `name-${id}` : 'this node'),
      isLocalNode: (id: string | null) => !id || id === 'home',
      // The laptop is a device, never a place to pick.
      isTarget: (id: string | null) => id !== 'laptop',
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

// The database view: the database rows offer their own openers.
const openDatabase = vi.fn()
const DatabaseSidebar = compileClientComponent(new URL('./BucketSidebar.vue', import.meta.url), {
  ...sidebarModules,
  '@/components/data/manager/DatabaseRows.vue': moduleDefault(defineComponent({
    props: { highlighted: Number },
    setup: (props, { expose }) => {
      expose({ openers: [() => openDatabase('spire')] })
      return () => h('li', { 'aria-selected': props.highlighted === 0 }, 'spire database')
    },
  })),
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
    shortcuts: { togglePin: vi.fn(), pinned: ref<{ bucket: string; nodeId: string | null }[]>([]), recent: ref<{ bucket: string; nodeId: string | null; groupId?: string }[]>([]) },
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

// Picks a choice of the bucket filter menu.
async function filter(root: Parameters<typeof content>[0], label: string) {
  await click(element(root, (node) => node.props.role === 'menuitemradio' && content(node).trim() === label))
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

  it('shows 25 buckets a page and reads the next page from the nodes when needed', async () => {
    const listed = (count: number, from = 0) =>
      Array.from({ length: count }, (_, index) => ({ bucket: `b${String(from + index).padStart(2, '0')}`, node_id: 'home', group_id: 'g1' }))
    const shown = (root: Parameters<typeof content>[0]) =>
      nodes(root).filter((node) => String(node.props['aria-label']).startsWith('Open b')).map((node) => content(node))
    allBuckets.hits.value = listed(25)
    allBuckets.more.value = true
    loadMore.mockImplementationOnce(async () => {
      allBuckets.hits.value = [...allBuckets.hits.value, ...listed(5, 25)]
      allBuckets.more.value = false
    })
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })
    await flush()
    expect(shown(root)).toHaveLength(25)
    expect(content(root)).toContain('Page 1')
    expect(button(root, 'Prev').props.disabled).toBe(true)

    await click(button(root, 'Next'))
    await flush()
    expect(loadMore).toHaveBeenCalledOnce()
    expect(shown(root)).toEqual(['b25', 'b26', 'b27', 'b28', 'b29'])
    expect(content(root)).toContain('Page 2')
    expect(button(root, 'Next').props.disabled).toBe(true)

    await click(button(root, 'Prev'))
    expect(shown(root)[0]).toBe('b00')
    allBuckets.hits.value = []
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
      { arn: 'd', bucket: 'laptop-notes', node_id: 'laptop', group_id: 'g2' },
    ]
    const state = manager()
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    const text = content(root)

    expect(text).toContain('Other groups')
    expect(text).toContain('shared-reads')
    expect(text).not.toContain('ws-scratch')
    expect(text).not.toContain('laptop-notes')
    await click(element(root, (node) => node.props['aria-label'] === 'Open shared-reads'))
    expect(state.openSearchHit).toHaveBeenCalledWith(otherSearch.value[1])
    otherSearch.value = []
  })

  it('offers no whole-bucket copy for a match on another node in the web portal', async () => {
    desktopMode.on = false
    otherSearch.value = [{ arn: 'a', bucket: 'results', node_id: 'node-2', group_id: 'g2' }]
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })

    expect(content(root)).toContain('results')
    expect(() => element(root, (node) => String(node.props['aria-label'] ?? '').startsWith('Sync results'))).toThrow()
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

  it('moves through the database rows, not the buckets, in the database view', async () => {
    openDatabase.mockReset()
    const state = withBucket()
    const { root } = await mountApp(DatabaseSidebar, { props: { manager: state } })
    await filter(root, 'Only databases')
    const field = element(root, (node) => node.props['aria-label'] === 'Find a bucket')

    await key(field, 'ArrowDown')
    expect(selected(root)).toEqual(['spire database'])
    await key(field, 'Enter')
    expect(openDatabase).toHaveBeenCalledWith('spire')
    expect(state.openBucketOn).not.toHaveBeenCalled()
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

describe('All nodes list order and pins', () => {
  it('lists pins first, then recently browsed buckets, then the rest, and pins by node', async () => {
    nodeChoice.value = null
    allBuckets.needsName.value = false
    allBuckets.hits.value = [
      { bucket: 'alpha', node_id: 'home', group_id: 'g1' },
      { bucket: 'mid', node_id: 'home', group_id: 'g1' },
      { bucket: 'zeta', node_id: 'node-2', group_id: 'g1' },
      { bucket: 'beta', node_id: 'node-2', group_id: 'g1' },
    ]
    const state = manager()
    state.shortcuts.pinned.value = [{ bucket: 'zeta', nodeId: 'node-2' }, { bucket: 'gamma', nodeId: null }]
    state.shortcuts.recent.value = [{ bucket: 'mid', nodeId: null, groupId: 'g1' }, { bucket: 'elsewhere', nodeId: null, groupId: 'g2' }]
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    await flush()
    const order = nodes(root).filter((node) => String(node.props['aria-label']).startsWith('Open ')).map((node) => content(node))

    expect(order).toEqual(['zeta', 'gamma', 'mid', 'alpha', 'beta'])
    expect(element(root, (node) => node.props['aria-label'] === 'Unpin zeta')).toBeTruthy()
    await click(element(root, (node) => node.props['aria-label'] === 'Pin beta'))
    await click(element(root, (node) => node.props['aria-label'] === 'Pin alpha'))
    expect(state.shortcuts.togglePin.mock.calls).toEqual([['beta', 'node-2'], ['alpha', null]])
    allBuckets.hits.value = []
  })
})

describe('database buckets in the list', () => {
  it('marks a database with its icon and title in both lists', async () => {
    nodeChoice.value = null
    allBuckets.needsName.value = false
    databaseRows.value = [
      { bucket: 'bakta-database', places: [{ bucket: 'bakta-database', nodeId: 'node-2' }], title: 'Bakta database (light)', metadata: { database: true, identifiers: [] } },
      { bucket: 'reef-survey', places: [{ bucket: 'reef-survey', nodeId: 'home' }], title: null, metadata: { database: true, title: 'Reef survey', identifiers: [] } },
    ]
    allBuckets.hits.value = [
      { bucket: 'bakta-database', node_id: 'node-2', group_id: 'g1' },
      { bucket: 'laptop', node_id: 'node-2', group_id: 'g1' },
    ]
    const all = await mountApp(BucketSidebar, { props: { manager: manager() } })
    await flush()
    const marks = (root: Parameters<typeof content>[0], id: string) =>
      nodes(root).filter((node) => node.props['data-testid'] === id).map((node) => content(node))

    expect(marks(all.root, 'database-icon')).toEqual(['bakta-database is a database'])
    expect(marks(all.root, 'row-subtitle')).toEqual(['bakta-database: Bakta database (light)'])

    const one = await mountApp(BucketSidebar, { props: { manager: withBucket() } })
    await pickNode()
    expect(marks(one.root, 'row-subtitle')).toEqual(['reef-survey: Reef survey'])
    databaseRows.value = []
    allBuckets.hits.value = []
  })

  it('filters by kind from a menu beside the search, with no kind switch', async () => {
    const { root } = await mountApp(DatabaseSidebar, { props: { manager: withBucket() } })
    const trigger = () => element(root, (node) => node.tag === 'button' && String(node.props['aria-label']).startsWith('Filter buckets'))
    const checked = () => nodes(root).filter((node) => node.props['aria-checked'] === true).map((node) => content(node).trim())

    expect(nodes(root).some((node) => node.props.role === 'radiogroup')).toBe(false)
    expect(nodes(root).filter((node) => node.props.role === 'menuitemradio').map((node) => content(node).trim()))
      .toEqual(['All buckets', 'Only databases', 'Hide databases'])
    expect(checked()).toEqual(['All buckets'])
    expect(trigger().props).toMatchObject({ 'aria-label': 'Filter buckets', variant: 'outline' })
    expect(content(root)).toContain('reef-survey')

    await filter(root, 'Only databases')
    expect(checked()).toEqual(['Only databases'])
    expect(trigger().props).toMatchObject({ 'aria-label': 'Filter buckets: Only databases', variant: 'default' })
    expect(content(root)).toContain('spire database')
    expect(content(root)).not.toContain('reef-survey')

    await filter(root, 'All buckets')
    expect(trigger().props).toMatchObject({ 'aria-label': 'Filter buckets', variant: 'outline' })
    expect(content(root)).not.toContain('spire database')
  })

  it('hides database buckets in both lists and keeps the rest', async () => {
    nodeChoice.value = null
    allBuckets.needsName.value = false
    databaseRows.value = [
      { bucket: 'bakta-database', places: [{ bucket: 'bakta-database', nodeId: 'node-2' }], title: 'Bakta database (light)', metadata: { database: true, identifiers: [] } },
      { bucket: 'reef-survey', places: [{ bucket: 'reef-survey', nodeId: 'home' }], title: null, metadata: { database: true, title: 'Reef survey', identifiers: [] } },
    ]
    allBuckets.hits.value = [
      { bucket: 'bakta-database', node_id: 'node-2', group_id: 'g1' },
      { bucket: 'laptop', node_id: 'node-2', group_id: 'g1' },
    ]
    const opened = (root: Parameters<typeof content>[0]) =>
      nodes(root).filter((node) => String(node.props['aria-label']).startsWith('Open ')).map((node) => content(node))
    const all = await mountApp(BucketSidebar, { props: { manager: manager() } })
    await flush()
    expect(opened(all.root)).toEqual(['bakta-database', 'laptop'])

    await filter(all.root, 'Hide databases')
    expect(opened(all.root)).toEqual(['laptop'])
    expect(element(all.root, (node) => node.props['aria-label'] === 'Filter buckets: Hide databases').props.variant).toBe('default')

    const state = withBucket()
    state.sidebarBuckets.value = [{ bucket: 'reef-survey', nodeId: null, pinned: false }, { bucket: 'plain', nodeId: null, pinned: false }] as never
    const one = await mountApp(BucketSidebar, { props: { manager: state } })
    await pickNode()
    await filter(one.root, 'Hide databases')
    expect(opened(one.root)).toEqual(['plain'])
    databaseRows.value = []
    allBuckets.hits.value = []
    nodeChoice.value = null
  })

  it('keeps pins of a device and pins not matching the searched name out of the list', async () => {
    nodeChoice.value = null
    allBuckets.needsName.value = false
    allBuckets.hits.value = [{ bucket: 'reads-2026', node_id: 'home', group_id: 'g1' }]
    const state = manager()
    state.bucketNameFilter.value = 'reads'
    state.shortcuts.pinned.value = [
      { bucket: 'reads-old', nodeId: null },
      { bucket: 'reads-laptop', nodeId: 'laptop' },
      { bucket: 'images', nodeId: null },
    ]
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    await flush()
    const order = nodes(root).filter((node) => String(node.props['aria-label']).startsWith('Open ')).map((node) => content(node))

    expect(order).toEqual(['reads-old', 'reads-2026'])
    allBuckets.hits.value = []
  })

  it('shows a distributed bucket pinned on one of its other nodes once, keeping that pin', async () => {
    nodeChoice.value = null
    allBuckets.needsName.value = false
    allBuckets.hits.value = [{ bucket: 'shared', node_id: 'home', group_id: 'g1', set_id: 's1', nodes: ['home', 'node-2'] } as never]
    const state = manager()
    state.shortcuts.pinned.value = [{ bucket: 'shared', nodeId: 'node-2' }]
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    await flush()
    const order = nodes(root).filter((node) => String(node.props['aria-label']).startsWith('Open ')).map((node) => content(node))

    expect(order).toEqual(['shared'])
    await click(element(root, (node) => node.props['aria-label'] === 'Unpin shared'))
    expect(state.shortcuts.togglePin).toHaveBeenCalledWith('shared', 'node-2')
    allBuckets.hits.value = []
  })

  it('keeps the order when a recent bucket arrives with a later page', async () => {
    nodeChoice.value = null
    allBuckets.needsName.value = false
    const listed = (count: number, from = 0) =>
      Array.from({ length: count }, (_, index) => ({ bucket: `b${String(from + index).padStart(2, '0')}`, node_id: 'home', group_id: 'g1' }))
    const shown = (root: Parameters<typeof content>[0]) =>
      nodes(root).filter((node) => String(node.props['aria-label']).startsWith('Open b')).map((node) => content(node))
    allBuckets.hits.value = listed(25)
    allBuckets.more.value = true
    loadMore.mockImplementationOnce(async () => {
      allBuckets.hits.value = [...allBuckets.hits.value, ...listed(5, 25)]
      allBuckets.more.value = false
    })
    const state = manager()
    state.shortcuts.recent.value = [{ bucket: 'b27', nodeId: null, groupId: 'g1' }]
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    await flush()

    await click(button(root, 'Next'))
    await flush()
    expect(shown(root)).toEqual(['b25', 'b26', 'b27', 'b28', 'b29'])
    allBuckets.hits.value = []
  })

  it('keeps a recent distributed bucket in place when its local member arrives later', async () => {
    nodeChoice.value = null
    allBuckets.needsName.value = false
    const listed = (count: number, from = 0) =>
      Array.from({ length: count }, (_, index) => ({ bucket: `b${String(from + index).padStart(2, '0')}`, node_id: 'home', group_id: 'g1' }))
    const shown = (root: Parameters<typeof content>[0]) =>
      nodes(root).filter((node) => String(node.props['aria-label']).startsWith('Open b')).map((node) => content(node))
    const remote = { bucket: 'b03', node_id: 'node-2', group_id: 'g1', set_id: 's1', nodes: ['node-2'] }
    allBuckets.hits.value = listed(25).map((hit) => (hit.bucket === 'b03' ? remote : hit)) as never
    allBuckets.more.value = true
    // The later page holds this node's member, which now stands for the merged row.
    loadMore.mockImplementationOnce(async () => {
      const merged = { ...remote, node_id: 'home', nodes: ['node-2', 'home'] }
      allBuckets.hits.value = [...allBuckets.hits.value.map((hit) => (hit.bucket === 'b03' ? merged : hit)), ...listed(5, 25)] as never
      allBuckets.more.value = false
    })
    const state = manager()
    state.shortcuts.recent.value = [{ bucket: 'b03', nodeId: 'node-2', groupId: 'g1' }]
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    await flush()
    const before = shown(root)
    expect(before[0]).toContain('b03')

    await click(button(root, 'Next'))
    await flush()
    await click(button(root, 'Prev'))
    expect(shown(root)).toEqual(before)
    allBuckets.hits.value = []
  })

  it('fills a short page before it moves on, so no bucket is skipped', async () => {
    nodeChoice.value = null
    allBuckets.needsName.value = false
    const listed = (count: number, from = 0) =>
      Array.from({ length: count }, (_, index) => ({ bucket: `b${String(from + index).padStart(2, '0')}`, node_id: 'home', group_id: 'g1' }))
    const shown = (root: Parameters<typeof content>[0]) =>
      nodes(root).filter((node) => String(node.props['aria-label']).startsWith('Open b')).map((node) => content(node))
    allBuckets.hits.value = listed(5)
    allBuckets.more.value = true
    loadMore.mockImplementationOnce(async () => {
      allBuckets.hits.value = [...allBuckets.hits.value, ...listed(25, 5)]
      allBuckets.more.value = false
    })
    const { root } = await mountApp(BucketSidebar, { props: { manager: manager() } })
    await flush()

    await click(button(root, 'Next'))
    await flush()
    expect(content(root)).toContain('Page 1')
    expect(shown(root)).toEqual(listed(25).map((entry) => entry.bucket))
    await click(button(root, 'Next'))
    expect(shown(root)).toEqual(['b25', 'b26', 'b27', 'b28', 'b29'])
    allBuckets.hits.value = []
  })

  it('does not move a replaced search on with an old Next', async () => {
    nodeChoice.value = null
    allBuckets.needsName.value = false
    allBuckets.hits.value = Array.from({ length: 25 }, (_, index) => ({ bucket: `b${index}`, node_id: 'home', group_id: 'g1' }))
    allBuckets.more.value = true
    let answer!: () => void
    loadMore.mockImplementationOnce(() => new Promise<void>((resolve) => (answer = () => {
      allBuckets.hits.value = [...allBuckets.hits.value, { bucket: 'b25', node_id: 'home', group_id: 'g1' }]
      resolve()
    })))
    const state = manager()
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    await flush()

    void (button(root, 'Next').props.onClick as () => Promise<void>)()
    state.bucketNameFilter.value = 'b2'
    await flush()
    answer()
    await flush()
    expect(content(root)).toContain('Page 1')
    allBuckets.hits.value = []
    allBuckets.more.value = false
  })
})
