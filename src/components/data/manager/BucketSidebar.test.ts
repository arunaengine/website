import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
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
  typeValue,
} from '@/test/clientRender'
import { BUCKET_NAME_REQUIREMENT, bucketNameProblem } from '@/lib/bucketName'

const createBucket = vi.fn()
const requestDelete = vi.fn()
const showNode = vi.fn()
const reload = vi.fn()
const loadMore = vi.fn()
let canDelete = true

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
  props: { bucket: { type: String, default: '' } },
  emits: ['open'],
  setup: (props, { slots, emit }) => () =>
    h('div', [h('button', { 'aria-label': `Open ${props.bucket}`, onClick: () => emit('open') }, props.bucket), slots.actions?.()]),
})
const PickerStub = defineComponent({
  props: { modelValue: { type: String, default: null } },
  emits: ['update:modelValue'],
  setup: (_, { emit }) => () =>
    h('button', { 'aria-label': 'Pick node-2', onClick: () => emit('update:modelValue', 'node-2') }),
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

const BucketSidebar = compileClientComponent(new URL('./BucketSidebar.vue', import.meta.url), {
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
  '@/components/data/BucketSearchBox.vue': moduleDefault(Empty),
  '@/components/data/NodePicker.vue': moduleDefault(PickerStub),
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      displayName: (id: string | null) => (id ? `name-${id}` : 'this node'),
      isLocalNode: (id: string | null) => !id || id === 'home',
    }),
  },
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

// Switches the list from All nodes to one node.
async function pickNode(root: Parameters<typeof content>[0]) {
  await click(element(root, (node) => node.props['aria-label'] === 'Pick node-2'))
}

function field(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'New bucket name')
}

function createButton(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.tag === 'button' && content(node).includes('New bucket'))
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
    await pickNode(root)

    await click(trash(root))

    expect(requestDelete).toHaveBeenCalledWith({
      kind: 'bucket',
      bucket: 'reef-survey',
      nodeId: null,
    })
  })

  it('refuses a bucket another node serves and says why', async () => {
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket('node-far') } })
    await pickNode(root)

    expect(trash(root).props.disabled).toBe(true)
    expect(trash(root).props.title).toContain('Only the node that serves this bucket')
  })

  it('refuses a session without write over the whole bucket', async () => {
    canDelete = false
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket() } })
    await pickNode(root)

    expect(trash(root).props.disabled).toBe(true)
    expect(trash(root).props.title).toContain('write on the whole bucket')
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

  it('lists every node with a node badge and opens a bucket on its node', async () => {
    const state = withBucket()
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })
    const text = content(root)

    expect(text).toContain('results')
    expect(text).toContain('name-node-2')
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

  it('lists one node after picking it and names it on the create button', async () => {
    const state = withBucket()
    state.requiredNodeId.value = 'node-2'
    const { root } = await mountApp(BucketSidebar, { props: { manager: state } })

    await pickNode(root)

    expect(showNode).toHaveBeenCalledWith('node-2')
    expect(content(root)).toContain('reef-survey')
    expect(content(root)).not.toContain('results')
    expect(content(createButton(root))).not.toContain('name-node-2')
    expect(createButton(root).props.title).toBe('Creates the bucket on name-node-2')
  })

  it('falls back to the open node list when the node needs a name', async () => {
    allBuckets.needsName.value = true
    const { root } = await mountApp(BucketSidebar, { props: { manager: withBucket() } })

    expect(content(root)).toContain('Type 2 letters to search all nodes.')
    expect(content(root)).toContain('reef-survey')
  })
})
