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

const aruna = vi.hoisted(() => ({ authToken: { value: 'token' }, searchBuckets: vi.fn() }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
const RealSearch = await import('@/composables/useBucketSearch')

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
const nodeChoice = ref<string | null>(null)
const choose = vi.fn((nodeId: string | null) => {
  nodeChoice.value = nodeId
  if (nodeId) showNode(nodeId)
})

const Empty = defineComponent(() => () => null)
// The row renders its name and action slot so the sidebar's own controls are visible.
const RowStub = defineComponent({
  props: { bucket: { type: String, default: '' }, highlighted: Boolean },
  emits: ['open'],
  setup: (props, { slots, emit }) => () =>
    h('div', [
      h(
        'button',
        { 'aria-label': `Open ${props.bucket}`, 'aria-selected': props.highlighted, onClick: () => emit('open') },
        props.bucket,
      ),
      h('span', { role: 'tooltip' }, slots.tooltip?.()),
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
  '@/composables/useBucketSearch': {
    useBucketSearch: () => ({ hits: otherSearch, error: otherError, searched: ref(true), nodesFailed: otherFailed }),
  },
  '@/lib/workspaces': Workspaces,
  '@/lib/desktop': { isDesktop: () => desktopMode.on },
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
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

describe('Bucket sidebar sync to this computer', () => {
  beforeEach(() => {
    nodeChoice.value = null
    desktopMode.on = false
  })

  it('offers the action on a bucket row in the desktop only', async () => {
    const web = await mountApp(BucketSidebar, { props: { manager: withBucket() } })
    await pickNode()
    expect(() => element(web.root, (node) => node.props['aria-label'] === 'Sync reef-survey to this computer…')).toThrow()

    desktopMode.on = true
    const onSyncComputer = vi.fn()
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket(), onSyncComputer } })
    await pickNode()
    await click(element(root, (node) => node.props['aria-label'] === 'Sync reef-survey to this computer…'))

    expect(onSyncComputer).toHaveBeenCalledWith({ bucket: 'reef-survey', nodeId: null, groupId: 'g1' })
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
