import * as VueRuntime from 'vue'
import { computed, defineComponent, h, reactive, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as DeviceApi from '@/lib/deviceApi'
import * as StateBadge from '@/lib/stateBadge'
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
const folders = ref<SyncedFolder[]>([])
const listState = ref<DeviceState>('ready')
const actionErrors = reactive(new Map<string, string>())
const transfers = ref<DeviceTransfer[]>([])
const transfersState = ref<DeviceState>('ready')

const loadSync = vi.fn(async () => undefined)
const loadFolders = vi.fn(async () => undefined)
const ensureLoaded = vi.fn(async () => undefined)
const loadTransfers = vi.fn(async () => undefined)
const syncFolder = vi.fn()
const setPaused = vi.fn()

const Blank = defineComponent(() => () => h('div'))
const Pass = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const NodeLabelStub = defineComponent({
  props: { nodeId: String },
  setup: (props) => () => h('span', props.nodeId),
})
const ButtonStub = defineComponent({
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
const BindStub = defineComponent({
  props: { open: Boolean },
  setup: (props) => () => h('div', props.open ? 'bind-dialog-open' : ''),
})
const ProgressStub = defineComponent({
  props: { label: String },
  setup: (props) => () => h('div', { role: 'progressbar' }, props.label),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const Notice = compileClientComponent(new URL('../ui/Notice.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
})

const SyncItemRow = compileClientComponent(new URL('./SyncItemRow.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/NodeLabel.vue': moduleDefault(NodeLabelStub),
  '@/components/ui/Progress.vue': moduleDefault(ProgressStub),
  '@/components/ui/Spinner.vue': moduleDefault(ProgressStub),
  '@/lib/deviceApi': DeviceApi,
  '@/lib/stateBadge': StateBadge,
  '@/lib/syncStates': SyncStates,
  '@/lib/utils': Utils,
})

const LinkedFolders = compileClientComponent(new URL('./LinkedFolders.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/Skeleton.vue': moduleDefault(Blank),
  '@/components/desktop/BindFolderDialog.vue': moduleDefault(BindStub),
  '@/components/desktop/DeviceSurfaceState.vue': moduleDefault(Blank),
  '@/components/desktop/SyncItemRow.vue': moduleDefault(SyncItemRow),
  '@/composables/useDeviceSync': {
    useDeviceSync: () => ({ status, state, error: ref(null), load: loadSync }),
  },
  '@/composables/useDeviceTransfers': {
    useDeviceTransfers: () => ({
      all: transfers,
      state: transfersState,
      error: ref(null),
      load: loadTransfers,
    }),
  },
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
  '@/lib/deviceApi': DeviceApi,
  '@/lib/stateBadge': StateBadge,
  '@/lib/syncStates': SyncStates,
  '@/lib/utils': Utils,
})

async function mount() {
  const Stub = defineComponent(() => () => h('div'))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/device', name: 'device', component: Stub },
      { path: '/app/datasets/:id', name: 'dataset', component: Stub },
      { path: '/app/folders/:folderId', name: 'folder', component: Stub },
    ],
  })
  await router.push('/app/device')
  await router.isReady()
  return { ...(await mountApp(LinkedFolders, { router })), router }
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
  folders.value = [folder()]
  listState.value = 'ready'
  actionErrors.clear()
  transfers.value = []
  transfersState.value = 'ready'
  loadSync.mockClear()
  loadFolders.mockClear()
  ensureLoaded.mockClear()
  loadTransfers.mockClear()
  syncFolder.mockReset()
  syncFolder.mockImplementation(async (folderId: string) => folders.value.find((entry) => entry.folder_id === folderId))
  setPaused.mockReset()
  setPaused.mockImplementation(async () => undefined)
})

describe('the linked folders card', () => {
  it('lists folders and offline datasets in one list with their count', async () => {
    const mounted = await mount()

    expect(rows(mounted.root)).toHaveLength(2)
    expect(badge(mounted.root, '2').props['data-variant']).toBe('outline')
    expect(content(mounted.root)).not.toContain('Realm unreachable')
    mounted.app.unmount()
  })

  it('says when the realm cannot be reached', async () => {
    status.value = { ...status.value, realmReachable: false }
    const mounted = await mount()

    expect(content(mounted.root)).toContain('Realm unreachable')
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

  it('shows deleting folders without sync controls', async () => {
    folders.value = [folder({ state: 'deleting' })]
    const mounted = await mount()
    const target = row(mounted.root, 'data')

    expect(badge(target, 'Deleting').props['data-variant']).toBe('sky')
    expect(() => rowButton(mounted.root, 'data', 'Sync now')).toThrow()
    expect(() => rowButton(mounted.root, 'data', 'Pause')).toThrow()
    mounted.app.unmount()
  })

  it('renders transfers only inside their folder row', async () => {
    folders.value = [folder(), folder({ folder_id: 'f2', root: '/home/me/other' })]
    transfers.value = [transfer()]
    const mounted = await mount()

    expect(content(row(mounted.root, 'data'))).toContain('raw/scan.tiff')
    expect(content(row(mounted.root, 'other'))).not.toContain('raw/scan.tiff')
    const bar = nodes(row(mounted.root, 'data')).find((node) => node.props.role === 'progressbar')
    expect(bar?.props).toMatchObject({ warn: 101, critical: 101 })
    mounted.app.unmount()
  })

  it('opens the link dialog from the empty card', async () => {
    folders.value = []
    status.value = { ...status.value, pendingTotal: 0, documents: [] }
    const mounted = await mount()

    expect(content(mounted.root)).toContain('No folder is linked yet.')
    expect(rows(mounted.root)).toHaveLength(0)
    expect(content(mounted.root)).not.toContain('bind-dialog-open')
    await click(button(mounted.root, 'Link a local folder'))
    expect(content(mounted.root)).toContain('bind-dialog-open')
    mounted.app.unmount()
  })
})
