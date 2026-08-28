import * as VueRuntime from 'vue'
import { computed, defineComponent, h, reactive, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRefresh } from '@/composables/useRefresh'
import * as DeviceApi from '@/lib/deviceApi'
import * as SyncStates from '@/lib/syncStates'
import * as Utils from '@/lib/utils'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  nodes,
  refreshButton,
  type HostNode,
} from '@/test/clientRender'
import type {
  DeviceState,
  DeviceSyncStatus,
  DeviceTransfer,
  SyncedFolder,
  SyncDocument,
} from '@/lib/deviceApi'

function folder(overrides: Partial<SyncedFolder> = {}): SyncedFolder {
  return {
    folder_id: 'f1',
    root: '/home/me/data',
    local_bucket: 'dev-data',
    group_id: 'g1',
    remote: { node_id: 'node-123456789', bucket: 'lab', prefix: 'raw/' },
    mode: 'two_way',
    propagate_deletes: true,
    state: 'active',
    counters: {
      in_sync: 5,
      uploading: 0,
      conflicts: 0,
      pending_replacements: 0,
      remote_deleted: 0,
      errors: 0,
    },
    last_reconcile_ms: Date.now() - 60_000,
    created_at_ms: null,
    message: null,
    last_error: null,
    last_error_at_ms: null,
    ...overrides,
  }
}

function doc(overrides: Partial<SyncDocument> = {}): SyncDocument {
  return {
    documentId: 'd1',
    path: 'lab/run.json',
    groupId: 'g1',
    state: 'synced',
    pendingEdits: 0,
    localOnly: false,
    validationFindings: 0,
    lastError: null,
    lastSyncedMs: null,
    ...overrides,
  }
}

function transfer(overrides: Partial<DeviceTransfer> = {}): DeviceTransfer {
  return {
    id: 't1',
    direction: 'upload',
    folder_id: 'f1',
    path: 'raw/scan.tiff',
    bucket: 'lab',
    key: 'raw/scan.tiff',
    state: 'running',
    bytes_total: 100,
    bytes_done: 40,
    attempts: 1,
    next_attempt_ms: null,
    message: null,
    ...overrides,
  }
}

const status = ref<DeviceSyncStatus>({
  realmReachable: true,
  lastSyncMs: null,
  pendingTotal: 0,
  documents: [],
  datasets: [],
})
const state = ref<DeviceState>('ready')
const running = ref(false)
const runError = ref<string | null>(null)
const folders = ref<SyncedFolder[]>([])
const listState = ref<DeviceState>('ready')
const actionErrors = reactive(new Map<string, string>())
const transfers = ref<DeviceTransfer[]>([])
const transfersState = ref<DeviceState>('ready')
const uploadItems = ref<Array<Record<string, unknown>>>([])

const runSync = vi.fn(async () => undefined)
const loadSync = vi.fn(async () => undefined)
const loadFolders = vi.fn(async () => undefined)
const ensureLoaded = vi.fn(async () => undefined)
const loadTransfers = vi.fn(async () => undefined)
const syncFolder = vi.fn()
const setPaused = vi.fn()

const Blank = defineComponent(() => () => h('div'))
const Pass = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const MenuItemStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const BadgeStub = defineComponent({
  props: { variant: String },
  setup: (props, { slots }) => () => h('span', { 'data-variant': props.variant }, slots.default?.()),
})
const EmptyStateStub = defineComponent({
  props: { title: String, description: String },
  setup: (props, { slots }) => () => h('div', [props.title, ' ', props.description, slots.default?.()]),
})
const PageHeaderStub = defineComponent({
  props: { title: String },
  setup: (props, { slots }) => () => h('div', [props.title, slots.breadcrumbs?.(), slots.actions?.()]),
})
const FilterChipsStub = defineComponent({
  props: { options: { type: Array, default: () => [] }, modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h(
      'div',
      (props.options as Array<{ value: string; label: string; count?: number }>).map((option) =>
        h('button', { onClick: () => emit('update:modelValue', option.value) }, `${option.label} ${option.count}`),
      ),
    ),
})
const RefusalStub = defineComponent({
  props: { message: { type: String, required: true } },
  setup: (props) => () => h('div', props.message),
})
const ProgressStub = defineComponent({
  props: { label: String },
  setup: (props) => () => h('div', { role: 'progressbar' }, props.label),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const SyncItemRow = compileClientComponent(new URL('../../components/desktop/SyncItemRow.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Progress.vue': moduleDefault(ProgressStub),
  '@/lib/deviceApi': DeviceApi,
  '@/lib/syncStates': SyncStates,
  '@/lib/utils': Utils,
})

const SyncView = compileClientComponent(new URL('./SyncView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/DropdownMenu.vue': moduleDefault(Pass),
  '@/components/ui/DropdownMenuContent.vue': moduleDefault(Pass),
  '@/components/ui/DropdownMenuItem.vue': moduleDefault(MenuItemStub),
  '@/components/ui/DropdownMenuTrigger.vue': moduleDefault(Pass),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/ui/FilterChips.vue': moduleDefault(FilterChipsStub),
  '@/components/ui/Progress.vue': moduleDefault(ProgressStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(refreshButton()),
  '@/components/ui/RefusalNote.vue': moduleDefault(RefusalStub),
  '@/components/ui/Skeleton.vue': moduleDefault(Blank),
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/desktop/BindFolderDialog.vue': moduleDefault(Blank),
  '@/components/desktop/DeviceSurfaceState.vue': moduleDefault(Blank),
  '@/components/desktop/SyncItemRow.vue': moduleDefault(SyncItemRow),
  '@/composables/useDeviceSync': {
    useDeviceSync: () => ({
      status,
      state,
      loading: computed(() => state.value === 'idle' || state.value === 'loading'),
      error: ref(null),
      runError,
      running,
      runSync,
      load: loadSync,
    }),
  },
  '@/composables/useDeviceTransfers': {
    useDeviceTransfers: () => ({
      all: transfers,
      state: transfersState,
      error: ref(null),
      load: loadTransfers,
    }),
  },
  '@/composables/useRefresh': { useRefresh },
  '@/composables/useSyncedFolders': {
    useSyncedFolders: () => ({
      folders,
      listState,
      listError: ref(null),
      busy: ref(false),
      actionErrors,
      load: loadFolders,
      ensureLoaded,
      setPaused,
      sync: syncFolder,
    }),
  },
  '@/composables/useUploadQueue': { useUploadQueue: () => ({ items: uploadItems }) },
  '@/lib/deviceApi': DeviceApi,
  '@/lib/syncStates': SyncStates,
  '@/lib/utils': Utils,
})

async function mount() {
  const Stub = defineComponent(() => () => h('div'))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/sync', name: 'sync', component: Stub },
      { path: '/app/search', name: 'search', component: Stub },
      { path: '/app/metadata/:id', name: 'metadata-detail', component: Stub },
      { path: '/app/folders/:folderId', name: 'folder', component: Stub },
    ],
  })
  await router.push('/app/sync')
  await router.isReady()
  return { ...(await mountApp(SyncView, { router })), router }
}

function rows(root: HostNode): HostNode[] {
  return nodes(root).filter((node) => node.tag === 'li')
}

function row(root: HostNode, text: string): HostNode {
  return element(root, (node) => node.tag === 'li' && content(node).includes(text))
}

function rowButton(root: HostNode, rowText: string, label: string): HostNode {
  return element(row(root, rowText), (node) => node.tag === 'button' && content(node).trim().startsWith(label))
}

function badge(root: HostNode, label: string): HostNode {
  return element(root, (node) => node.tag === 'span' && content(node).trim() === label)
}

beforeEach(() => {
  status.value = {
    realmReachable: true,
    lastSyncMs: Date.now() - 60_000,
    pendingTotal: 3,
    documents: [doc()],
    datasets: [],
  }
  state.value = 'ready'
  running.value = false
  runError.value = null
  folders.value = [folder()]
  listState.value = 'ready'
  actionErrors.clear()
  transfers.value = []
  transfersState.value = 'ready'
  uploadItems.value = []
  runSync.mockClear()
  loadSync.mockClear()
  loadFolders.mockClear()
  ensureLoaded.mockClear()
  loadTransfers.mockClear()
  syncFolder.mockReset()
  syncFolder.mockImplementation(async (folderId: string) => folders.value.find((entry) => entry.folder_id === folderId))
  setPaused.mockReset()
  setPaused.mockImplementation(async () => undefined)
})

describe('the unified sync list', () => {
  it('shows one realm status line', async () => {
    const mounted = await mount()

    expect(badge(mounted.root, 'Realm reachable').props['data-variant']).toBe('success')
    expect(content(mounted.root)).toContain('last sync')
    expect(content(mounted.root)).toContain('3 changes pending')
    mounted.app.unmount()
  })

  it('keeps a node refusal on the folder row after Sync now fails', async () => {
    const refusal = 'the bucket "missing" does not exist on node node-123456789'
    syncFolder.mockImplementationOnce(async (folderId: string) => {
      actionErrors.set(folderId, refusal)
      throw new Error(refusal)
    })
    const mounted = await mount()

    await click(rowButton(mounted.root, 'data', 'Sync now'))

    expect(content(row(mounted.root, 'data'))).toContain(refusal)
    expect(badge(row(mounted.root, 'data'), 'Error').props['data-variant']).toBe('destructive')
    mounted.app.unmount()
  })

  it('shows paused before a folder error, decisions, and uploads', async () => {
    folders.value = [
      folder({
        state: 'paused',
        last_error: 'bucket failed',
        counters: { ...folder().counters, conflicts: 2, uploading: 4 },
      }),
    ]
    const mounted = await mount()

    expect(badge(mounted.root, 'Paused').props['data-variant']).toBe('secondary')
    expect(content(row(mounted.root, 'data'))).not.toContain('bucket failed')
    mounted.app.unmount()
  })

  it('renders transfers only inside their folder row', async () => {
    folders.value = [folder(), folder({ folder_id: 'f2', root: '/home/me/other' })]
    transfers.value = [transfer()]
    const mounted = await mount()

    expect(content(row(mounted.root, 'data'))).toContain('raw/scan.tiff')
    expect(content(row(mounted.root, 'other'))).not.toContain('raw/scan.tiff')
    expect(nodes(row(mounted.root, 'data')).some((node) => node.props.role === 'progressbar')).toBe(true)
    mounted.app.unmount()
  })

  it('counts merged folder and document rows in the filters', async () => {
    folders.value = [
      folder({ counters: { ...folder().counters, conflicts: 1 } }),
      folder({ folder_id: 'f2', root: '/home/me/moving', counters: { ...folder().counters, uploading: 2 } }),
    ]
    status.value = {
      ...status.value,
      documents: [doc(), doc({ documentId: 'd2', path: 'lab/bad.json', state: 'failed', lastError: 'failed' })],
    }
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text).toContain('All 4')
    expect(text).toContain('Needs attention 2')
    expect(text).toContain('Syncing 1')
    expect(text).toContain('In sync 1')
    mounted.app.unmount()
  })

  it('offers both Add actions when nothing syncs yet', async () => {
    folders.value = []
    status.value = { ...status.value, pendingTotal: 0, documents: [] }
    const mounted = await mount()
    const text = content(mounted.root)

    expect(text).toContain('Nothing syncs with this computer yet')
    expect(text).toContain('Sync a folder...')
    expect(text).toContain('Document available offline...')
    expect(rows(mounted.root)).toHaveLength(0)
    mounted.app.unmount()
  })

  it('takes the document Add item to the realm search', async () => {
    const mounted = await mount()

    await click(button(mounted.root, 'Document available offline...'))

    expect(mounted.router.currentRoute.value.name).toBe('search')
    mounted.app.unmount()
  })
})
