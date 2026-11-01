import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as BucketName from '@/lib/bucketName'
import * as BucketPlace from '@/lib/bucketPlace'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes, type HostNode } from '@/test/clientRender'

// Every child is a named placeholder; the listeners the view passes land on it.
const stub = (name: string) =>
  moduleDefault(defineComponent({ name, setup: () => () => h('div', { 'data-stub': name }) }))

// The view's own width, as the element size reader would measure it.
const viewWidth = ref(0)
// These render their slots, so the title, the sheet and what they hold are visible.
const slotted = (name: string) =>
  moduleDefault(defineComponent({ name, inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('div', { ...attrs, 'data-stub': name }, Object.values(slots).map((slot) => slot?.())) }))

const children = [
  'ui/Button',
  'ui/RefreshButton',
  'ui/Input',
  'ui/Dialog',
  'ui/DialogContent',
  'ui/DialogHeader',
  'ui/DialogTitle',
  'ui/DialogDescription',
  'ui/DialogFooter',
  'ui/DialogClose',
  'ui/Notice',
  'ui/DropdownMenu',
  'ui/DropdownMenuContent',
  'ui/DropdownMenuItem',
  'ui/DropdownMenuLabel',
  'ui/DropdownMenuSeparator',
  'ui/DropdownMenuTrigger',
  'data/AddDataDialog',
  'data/DataViewSkeleton',
  'desktop/BindFolderDialog',
  'desktop/NewBucketDialog',
  'data/CreateBucketDialog',
  'data/manager/BucketSidebar',
  'data/manager/BucketChooser',
  'data/NodePicker',
  'data/DeleteDialog',
  'data/FileDetailsDialog',
  'data/PublicAccessDialog',
  'data/ShareLinkDialog',
  'ui/EmptyState',
  'data/manager/MockSidebar',
  'data/DatabaseHeader',
  'data/manager/DistributionBanner',
  'data/manager/ObjectBrowser',
  'data/manager/UploadPanel',
  'data/VisitorData',
  'notebook/NewNotebookDialog',
]

let manager: Record<string, unknown> = {}
const user = ref<unknown>(null)
const booted = ref(false)
const endpoint = ref<string | null>(null)

const DataManagerView = compileClientComponent(new URL('./DataManagerView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent(() => () => h('a')) },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => h('i')) }),
  ...Object.fromEntries(
    children.map((path) => [`@/components/${path}.vue`, stub(path.split('/').pop() ?? path)]),
  ),
  '@/components/dashboard/PageHeader.vue': slotted('PageHeader'),
  '@/components/ui/Sheet.vue': moduleDefault(defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('div', { ...attrs, 'data-stub': 'Sheet' }, attrs.open ? slots.default?.() : []) })),
  '@/components/ui/SheetContent.vue': slotted('SheetContent'),
  '@vueuse/core': { useElementSize: () => ({ width: viewWidth, height: ref(0) }) },
  '@/composables/useAruna': {
    useAruna: () => ({ bootstrapped: booted, currentUser: user, myGroups: ref([]) }),
  },
  '@/composables/useDataManager': { useDataManager: () => manager },
  '@/composables/useBucketDistribution': {
    useBucketDistribution: () => ({ view: ref(null), state: ref('unavailable') }),
  },
  '@/composables/usePageContext': { providePageContext: () => {} },
  '@/composables/useS3': { useS3: () => ({ connectedEndpoint: endpoint }), s3ErrorMessage: String },
  '@/lib/bucketName': BucketName,
  '@/lib/desktop': { isDesktop: () => true },
  '@/lib/distributedMock': { mockEnabled: () => false },
  '@/lib/distributedMockData': { mockBucket: () => undefined },
  '@/lib/bucketPlace': BucketPlace,
})

// What the view reads at mount; any other field is an empty ref.
function fakeManager(nodeChoice: string | null, needsName = false) {
  const known: Record<string, unknown> = {
    route: { name: 'buckets', query: {} },
    router: { replace: vi.fn(), push: vi.fn() },
    bucket: ref(''),
    s3Prefix: ref(''),
    detailsKey: ref(''),
    references: { entries: ref([]), reload: vi.fn() },
    bucketNodeChoice: ref(nodeChoice),
    bucketList: { refresh: vi.fn() },
    allBuckets: { reload: vi.fn(), needsName: ref(needsName) },
    loadSyncOverview: vi.fn(),
  }
  const empty = new Map<PropertyKey, unknown>()
  return new Proxy(known, {
    get: (target, key) => {
      if (key in target) return target[key as string]
      if (!empty.has(key)) empty.set(key, ref(null))
      return empty.get(key)
    },
  })
}

async function finishLink(nodeChoice: string | null, needsName = false) {
  manager = fakeManager(nodeChoice, needsName)
  const { root, app } = await mountApp(DataManagerView)
  const bind = element(root, (node: HostNode) => node.props['data-stub'] === 'BindFolderDialog')
  await (bind.props.onBound as (folder: unknown) => void)({ folder_id: 'f1' })
  app.unmount()
  return manager as { allBuckets: { reload: () => void }; bucketList: { refresh: () => void } }
}

describe('Data view after a folder link', () => {
  it('reloads the All nodes list it shows', async () => {
    const shown = await finishLink(null)

    expect(shown.allBuckets.reload).toHaveBeenCalled()
    expect(shown.bucketList.refresh).not.toHaveBeenCalled()
  })

  it('reloads the one node list that stands in when the search needs a name', async () => {
    const shown = await finishLink(null, true)

    expect(shown.bucketList.refresh).toHaveBeenCalled()
    expect(shown.allBuckets.reload).not.toHaveBeenCalled()
  })

  it('reloads the one node list when one node is shown', async () => {
    const shown = await finishLink('node-2')

    expect(shown.bucketList.refresh).toHaveBeenCalled()
    expect(shown.allBuckets.reload).not.toHaveBeenCalled()
  })
})

describe('Data view new notebook', () => {
  it('opens a new notebook on the node that holds the bucket', async () => {
    manager = fakeManager(null)
    const known = manager as Record<string, unknown>
    known.bucket = ref('reads')
    known.remoteNodeId = ref('store-1')
    const { root, app } = await mountApp(DataManagerView)
    const dialog = element(root, (node: HostNode) => node.props['data-stub'] === 'NewNotebookDialog')
    expect(dialog.props['node-id'] ?? dialog.props.nodeId).toBe('store-1')
    app.unmount()
  })
})

describe('Data view search hits', () => {
  it('opens a found file with its details and a found folder as the folder', async () => {
    manager = fakeManager(null)
    const known = manager as Record<string, unknown>
    known.bucket = ref('reads')
    known.remoteNodeId = ref(null)
    known.realmNodes = { isLocalNode: (id: string) => id === 'n1' }
    known.navigateTo = vi.fn()
    Object.assign(known, { hasGroups: ref(true), groupsLoading: ref(false), viewReady: ref(true), contextBusy: ref(false) })
    user.value = { id: 'u1' }
    booted.value = true
    endpoint.value = 'https://s3.test'
    const { root, app } = await mountApp(DataManagerView)
    // A hit of the whole-bucket search comes up from the file list, where the one box lives.
    const open = element(root, (node: HostNode) => node.props['data-stub'] === 'ObjectBrowser').props.onOpenHit as (hit: unknown) => void

    open({ key: 'ui-list/check.txt', bucket: 'reads', issuer_node_id: 'n1', group_id: 'g1' })
    open({ key: 'ui-list/', bucket: 'reads', issuer_node_id: 'n1', group_id: 'g1' })
    app.unmount()
    user.value = null
    booted.value = false
    endpoint.value = null

    const push = (known.router as { push: ReturnType<typeof vi.fn> }).push
    expect(push).toHaveBeenCalledWith({
      name: 'bucket',
      params: { bucketId: 'reads' },
      query: { prefix: 'ui-list', group: 'g1', object: 'ui-list/check.txt' },
    })
    expect(known.navigateTo).toHaveBeenCalledWith('ui-list')
  })
})

describe('Data view width', () => {
  async function open(width: number) {
    manager = fakeManager(null)
    const known = manager as Record<string, unknown>
    known.bucket = ref('laptop')
    known.route = { name: 'bucket', query: {} }
    Object.assign(known, { hasGroups: ref(true), groupsLoading: ref(false), viewReady: ref(true), contextBusy: ref(false), contextReady: ref(true) })
    user.value = { id: 'u1' }
    booted.value = true
    endpoint.value = 'https://s3.test'
    viewWidth.value = width
    const mounted = await mountApp(DataManagerView)
    const lists = () => nodes(mounted.root).filter((node) => node.props['data-stub'] === 'BucketSidebar')
    const sheet = () => element(mounted.root, (node) => node.props['data-stub'] === 'Sheet')
    const picker = () => nodes(mounted.root).find((node) => node.tag === 'button' && node.props['aria-label'] === 'laptop, switch bucket')
    const done = () => {
      mounted.app.unmount()
      user.value = null
      booted.value = false
      endpoint.value = null
      viewWidth.value = 0
    }
    return { root: mounted.root, lists, sheet, picker, done }
  }

  it('shows the list beside the files and no node choice in the header on a wide view', async () => {
    const view = await open(1130)
    expect(view.lists()).toHaveLength(1)
    expect(view.lists()[0].props.sheet).toBeUndefined()
    expect(view.picker()).toBeUndefined()
    expect(nodes(view.root).some((node) => node.props['data-stub'] === 'NodePicker')).toBe(false)
    expect(view.sheet().props.open).toBe(false)
    view.done()
  })

  it('makes the title the bucket picker below 960 px and opens the list in a sheet', async () => {
    const view = await open(800)
    expect(view.lists().filter((list) => list.props.sheet === undefined)).toHaveLength(0)

    await click(view.picker()!)
    expect(view.sheet().props.open).toBe(true)
    const inSheet = view.lists().filter((list) => list.props.sheet !== undefined)
    expect(inSheet).toHaveLength(1)
    // A new bucket from the sheet closes it and opens the dialog.
    await (inSheet[0].props.onNewBucket as () => Promise<void>)()
    await flush()
    expect(view.sheet().props.open).toBe(false)
    expect(element(view.root, (node) => node.props['data-stub'] === 'NewBucketDialog').props.open).toBe(true)
    view.done()
  })

  it('closes the picker once a bucket opens, and keeps only the refresh icon on a phone', async () => {
    const view = await open(390)
    await click(view.picker()!)
    ;(manager as Record<string, { value: string }>).bucket.value = 'other'
    await flush()
    expect(view.sheet().props.open).toBe(false)
    expect(element(view.root, (node) => node.props['data-stub'] === 'RefreshButton').props['sr-label']).toBe('Refresh')
    view.done()
  })
})

describe('Data view on another node', () => {
  it('keeps the shown bucket list while a bucket opens there', async () => {
    manager = fakeManager(null)
    const known = manager as Record<string, unknown>
    const busy = ref(false)
    const ready = ref(false)
    const group = ref('g1')
    Object.assign(known, { hasGroups: ref(true), groupsLoading: ref(false), viewReady: ready, contextBusy: busy, selectedGroupId: group })
    user.value = { id: 'u1' }
    booted.value = true
    endpoint.value = 'https://s3.test'
    viewWidth.value = 1130
    const { root, app } = await mountApp(DataManagerView)
    const stubs = (name: string) => nodes(root).filter((node) => node.props['data-stub'] === name)
    // Before the view was ever shown, one placeholder stands for all of it.
    expect(stubs('BucketSidebar')).toHaveLength(0)
    expect(stubs('DataViewSkeleton')[0].props.files).toBeUndefined()

    ready.value = true
    await flush()
    const list = stubs('BucketSidebar')[0]
    // A bucket on another node opens a new session, so the view waits for it again.
    ;(known.bucket as { value: string }).value = 'bakrep'
    busy.value = true
    ready.value = false
    await flush()
    expect(stubs('BucketSidebar')[0]).toBe(list)
    expect(stubs('DataViewSkeleton').map((node) => node.props.files)).toEqual([''])
    expect(stubs('ObjectBrowser')).toHaveLength(0)

    busy.value = false
    ready.value = true
    await flush()
    expect(stubs('BucketSidebar')[0]).toBe(list)
    expect(stubs('ObjectBrowser')).toHaveLength(1)

    // Another group starts over with the whole placeholder.
    group.value = 'g2'
    ready.value = false
    await flush()
    expect(stubs('BucketSidebar')).toHaveLength(0)
    app.unmount()
    user.value = null
    booted.value = false
    endpoint.value = null
    viewWidth.value = 0
  })
})

describe('Data view for a visitor', () => {
  it('shows the public browser instead of a sign-in wall, with or without an S3 endpoint', async () => {
    manager = fakeManager(null)
    user.value = null
    booted.value = true
    endpoint.value = null
    const { root, app } = await mountApp(DataManagerView)
    const stubs = (name: string) => nodes(root).filter((node) => node.props['data-stub'] === name)

    expect(stubs('VisitorData')).toHaveLength(1)
    expect(stubs('BucketSidebar')).toHaveLength(0)
    expect(content(root)).not.toContain('Sign in to browse data')
    app.unmount()
    booted.value = false
  })
})
