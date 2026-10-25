import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRefresh } from '@/composables/useRefresh'
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
  flush,
  moduleDefault,
  mountApp,
  nodes,
  refreshButton,
  type HostNode,
} from '@/test/clientRender'
import type { FolderEntry, SyncedFolder } from '@/lib/deviceApi'

const folder: SyncedFolder = {
  folder_id: 'f1',
  root: '/home/me/data-2026',
  local_bucket: 'dev-data',
  group_id: 'g1',
  remote: { node_id: 'n1', bucket: 'lab', prefix: 'raw/' },
  mode: 'two_way',
  propagate_deletes: true,
  state: 'active',
  counters: { in_sync: 9, uploading: 0, conflicts: 1, pending_replacements: 0, remote_deleted: 1, errors: 1 },
  last_reconcile_ms: null,
  created_at_ms: null,
  message: null,
}

function entry(overrides: Partial<FolderEntry>): FolderEntry {
  return {
    path: 'notes/day.md',
    state: 'conflict',
    local: {
      size: 2048,
      modified_at_ms: 1_700_000,
      fingerprint: 'fp-local',
      blake3: 'aaaabbbb',
      version_id: null,
    },
    remote: { size: 4096, modified_at_ms: 1_800_000, fingerprint: 'fp-remote', blake3: 'ccccdddd', version_id: 'v7' },
    reason: null,
    conflicted_copy: null,
    message: null,
    updated_at_ms: null,
    ...overrides,
  }
}

const rows: FolderEntry[] = [
  entry({}),
  entry({ path: 'notes/old.md', state: 'remote_deleted', remote: null }),
  entry({ path: 'notes/bad.md', state: 'error', message: 'The upload was refused.' }),
  entry({ path: 'notes/kept.md', state: 'in_sync' }),
]

// Echoes the row back so the list keeps its shape; the node's own answer is
// covered where it is mapped.
const entryAction = vi.fn(
  async (_folder: string, path: string, _action: string) =>
    rows.find((row) => row.path === path) ?? entry({ path }),
)
const sync = vi.fn(async () => folder)
const entries = vi.fn(async (): Promise<DeviceApi.EntryPage> => ({ entries: rows, next_cursor: null }))
const refreshFolder = vi.fn(async () => folder)
const actionErrors = reactive(new Map<string, string>())
const transfers = ref<DeviceApi.DeviceTransfer[]>([])
const unbind = vi.fn(async () => undefined)

// Records what the dialog was opened with, which is the point of the gating.
const dialogOpens: Array<{ path: string | null; action: string }> = []
const ReplaceLocalDialogStub = defineComponent({
  props: { open: Boolean, folder: Object, entry: Object, action: String },
  setup(props) {
    return () => {
      if (props.open) {
        dialogOpens.push({ path: (props.entry as FolderEntry | null)?.path ?? null, action: props.action ?? '' })
      }
      return h('div', props.open ? 'dialog open' : '')
    }
  },
})

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const PageHeaderStub = defineComponent((_, { slots }) => () =>
  h('div', [slots.breadcrumbs?.(), slots.actions?.(), slots.default?.()]))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const RefusalStub = defineComponent({
  props: { message: { type: String, required: true } },
  setup: (props) => () => h('div', props.message),
})
const ChipsStub = defineComponent({
  props: { options: { type: Array, default: () => [] }, modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h(
      'div',
      (props.options as Array<{ value: string; label: string; count?: number }>).map((option) =>
        h('button', { onClick: () => emit('update:modelValue', option.value) }, `${option.label}${option.count === undefined ? '' : ` ${option.count}`}`),
      ),
    ),
})
const ProgressStub = defineComponent({
  props: { value: Number, indeterminate: Boolean },
  setup: (props) => () => h('i', { 'data-progress': props.indeterminate ? 'unknown' : String(props.value) }),
})
// Records what the stop dialog was opened with and lets a test confirm it.
const stopDialog = { open: false, confirm: () => {} }
const StopDialogStub = defineComponent({
  props: { open: Boolean, name: String, bucket: String, sending: Number },
  emits: ['confirm'],
  setup(props, { emit }) {
    return () => {
      stopDialog.open = props.open
      stopDialog.confirm = () => emit('confirm')
      return h('div', props.open ? `stop ${props.name} ${props.bucket} ${props.sending}` : '')
    }
  },
})
const HistoryStub = defineComponent({ setup: (_, { expose }) => { expose({ reload: async () => {} }); return () => h('div', 'history') } })
const SkeletonStub = defineComponent(() => () => h('div', 'loading rows'))
const SpinnerStub = defineComponent({ props: { label: String }, setup: (props) => () => h('span', props.label) })
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const Notice = compileClientComponent(new URL('../../components/ui/Notice.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
})

const FolderDetailView = compileClientComponent(new URL('./FolderDetailView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/RefreshButton.vue': moduleDefault(refreshButton()),
  '@/components/ui/RefusalNote.vue': moduleDefault(RefusalStub),
  '@/components/ui/EmptyState.vue': moduleDefault(Passthrough),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Passthrough),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/FilterChips.vue': moduleDefault(ChipsStub),
  '@/components/ui/Progress.vue': moduleDefault(ProgressStub),
  '@/components/ui/Skeleton.vue': moduleDefault(SkeletonStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/desktop/ReplaceLocalDialog.vue': moduleDefault(ReplaceLocalDialogStub),
  '@/components/desktop/StopSyncDialog.vue': moduleDefault(StopDialogStub),
  '@/components/desktop/FolderHistory.vue': moduleDefault(HistoryStub),
  '@/composables/useDeviceTransfers': { useDeviceTransfers: () => ({ all: transfers }) },
  '@/composables/useRefresh': { useRefresh },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: () => 'lab node', isLocalNode: (id: string) => id === 'home' }) },
  '@/composables/useSyncedFolders': {
    useSyncedFolders: () => ({
      folders: ref([folder, { ...folder, folder_id: 'f2', root: '/home/me/other' }]),
      ensureLoaded: vi.fn(async () => undefined),
      refreshFolder,
      entries,
      entryAction,
      setPaused: vi.fn(),
      sync,
      unbind,
      busy: ref(false),
      actionErrors,
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
      { path: '/app/folders/:folderId', name: 'folder', component: Stub },
      { path: '/app/device', name: 'device', component: Stub },
      { path: '/app/buckets/:bucketId', name: 'bucket', component: Stub },
    ],
  })
  await router.push('/app/folders/f1')
  await router.isReady()
  return { ...(await mountApp(FolderDetailView, { router })), router }
}

function row(root: HostNode, path: string): HostNode {
  return element(root, (node) => node.tag === 'li' && content(node).includes(path))
}

function rowButton(root: HostNode, path: string, label: string): HostNode {
  const target = row(root, path)
  const match = nodes(target).find((node) => node.tag === 'button' && content(node).trim().startsWith(label))
  if (!match) throw new Error(`No "${label}" on ${path}`)
  return match
}

beforeEach(() => {
  entryAction.mockClear()
  sync.mockClear()
  entries.mockReset().mockResolvedValue({ entries: rows, next_cursor: null })
  actionErrors.clear()
  folder.last_error = null
  folder.state = 'active'
  folder.mode = 'two_way'
  transfers.value = []
  unbind.mockClear()
  dialogOpens.length = 0
  stopDialog.open = false
})

describe('folder entries', () => {
  it('puts what waits for a decision above what is settled', async () => {
    const mounted = await mount()
    const paths = nodes(mounted.root)
      .filter((node) => node.tag === 'li')
      .map((node) => content(node))

    expect(paths[0]).toContain('notes/day.md')
    expect(paths.at(-1)).toContain('notes/kept.md')
    expect(content(mounted.root)).toContain('2 files wait for your decision')
    expect(content(mounted.root)).toContain('1 file failed')
    mounted.app.unmount()
  })

  it('shows and guards an incremental page load', async () => {
    let resolveMore!: (page: DeviceApi.EntryPage) => void
    entries
      .mockResolvedValueOnce({ entries: rows, next_cursor: 'next' })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveMore = resolve }))
    const mounted = await mount()

    const loading = click(button(mounted.root, 'Load more'))
    await VueRuntime.nextTick()

    expect(content(mounted.root)).toContain('Loading more files')
    expect(button(mounted.root, 'Loading more files').props.disabled).toBe(true)
    resolveMore({ entries: [], next_cursor: null })
    await loading
    mounted.app.unmount()
  })

  it('keeps a local copy with both hashes and the version it saw', async () => {
    const mounted = await mount()

    await click(rowButton(mounted.root, 'notes/day.md', 'Keep mine'))

    expect(entryAction).toHaveBeenCalledWith('f1', 'notes/day.md', 'keep_local', {
      fingerprint: 'fp-local',
      blake3: 'aaaabbbb',
      remote_version: 'v7',
    })
    mounted.app.unmount()
  })

  it('never removes a local file straight from the row', async () => {
    // Decision 18: giving up bytes is confirmed in the dialog, never inline.
    const mounted = await mount()

    await click(rowButton(mounted.root, 'notes/old.md', 'Move mine to trash'))

    expect(entryAction).not.toHaveBeenCalled()
    expect(dialogOpens).toContainEqual({ path: 'notes/old.md', action: 'remove_local' })
    mounted.app.unmount()
  })

  it('opens the same dialog to replace one copy', async () => {
    const mounted = await mount()

    await click(rowButton(mounted.root, 'notes/day.md', 'Use the Aruna one'))

    expect(entryAction).not.toHaveBeenCalled()
    expect(dialogOpens).toContainEqual({ path: 'notes/day.md', action: 'replace_local' })
    mounted.app.unmount()
  })

  it('separates accepting a failure from retrying it', async () => {
    const mounted = await mount()

    await click(rowButton(mounted.root, 'notes/bad.md', 'Mark handled'))
    expect(entryAction).toHaveBeenCalledWith('f1', 'notes/bad.md', 'resolve', expect.any(Object))

    await click(rowButton(mounted.root, 'notes/bad.md', 'Retry'))
    expect(sync).toHaveBeenCalledWith('f1')
    mounted.app.unmount()
  })

  it('keeps both copies of a conflict through the existing resolve action', async () => {
    const mounted = await mount()

    await click(rowButton(mounted.root, 'notes/day.md', 'Keep both'))

    expect(entryAction).toHaveBeenCalledWith('f1', 'notes/day.md', 'resolve', expect.any(Object))
    mounted.app.unmount()
  })

  it('offers no keep both where there is no copy beside the file', async () => {
    entries.mockResolvedValue({ entries: [entry({ path: 'notes/wait.md', state: 'pending_replace' })], next_cursor: null })
    const mounted = await mount()

    expect(() => rowButton(mounted.root, 'notes/wait.md', 'Keep both')).toThrow()
    expect(rowButton(mounted.root, 'notes/wait.md', 'Keep mine')).toBeTruthy()
    mounted.app.unmount()
  })

  it('shows progress on a file the node is moving and no invented percent otherwise', async () => {
    transfers.value = [
      DeviceApi.readTransfer({ id: 't1', folder_id: 'f1', path: 'notes/kept.md', state: 'running', bytes_total: 200, bytes_done: 50 }, 'upload'),
      DeviceApi.readTransfer({ id: 't2', folder_id: 'f1', path: 'notes/bad.md', state: 'running', bytes_total: 200 }, 'upload'),
    ]
    const mounted = await mount()

    expect(content(row(mounted.root, 'notes/kept.md'))).toContain('Sending 25%')
    expect(content(row(mounted.root, 'notes/kept.md'))).toContain('50 B of 200 B sent.')
    const unknown = nodes(row(mounted.root, 'notes/bad.md')).find((node) => node.props['data-progress'])
    expect(unknown?.props['data-progress']).toBe('unknown')
    mounted.app.unmount()
  })

  it('reloads the rows quietly when the file in flight changes', async () => {
    const sending = (path: string) =>
      DeviceApi.readTransfer({ id: path, folder_id: 'f1', path, state: 'running', bytes_total: 10, bytes_done: 1 }, 'upload')
    const waiting = [entry({ path: 'notes/a.md', state: 'local_new' }), entry({ path: 'notes/b.md', state: 'local_new' })]
    entries.mockResolvedValue({ entries: waiting, next_cursor: null })
    transfers.value = [sending('notes/a.md')]
    const mounted = await mount()
    const reads = entries.mock.calls.length
    let release!: (page: DeviceApi.EntryPage) => void
    entries.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))

    transfers.value = [sending('notes/b.md')]
    await flush()
    const paths = nodes(mounted.root).filter((node) => node.tag === 'li').map((node) => content(node))

    expect(entries.mock.calls.length).toBe(reads + 1)
    expect(content(mounted.root)).not.toContain('loading rows')
    expect(paths[0]).toContain('notes/b.md')
    release({ entries: [{ ...waiting[0]!, state: 'in_sync' }, waiting[1]!], next_cursor: null })
    await flush()
    expect(content(row(mounted.root, 'notes/a.md'))).toContain('Synced')
    expect(content(row(mounted.root, 'notes/b.md'))).toContain('Sending 10%')
    mounted.app.unmount()
  })

  it('shows the skeleton only while there are no rows yet', async () => {
    entries.mockImplementationOnce(() => new Promise(() => {}))
    const mounted = await mount()

    expect(content(mounted.root)).toContain('loading rows')
    mounted.app.unmount()
  })

  it('offers no decision on a settled file', async () => {
    const mounted = await mount()

    expect(() => rowButton(mounted.root, 'notes/kept.md', 'Keep mine')).toThrow()
    mounted.app.unmount()
  })
})

describe('folder filters', () => {
  it('counts the chips from the node tally and asks for the states a chip stands for', async () => {
    const mounted = await mount()

    expect(content(mounted.root)).toContain('Synced 9')
    expect(content(mounted.root)).toContain('Needs you 2')
    expect(content(mounted.root)).toContain('Failed 1')

    entries.mockClear()
    await click(button(mounted.root, 'Needs you'))

    const states = entries.mock.calls.map((call) => (call as unknown as [string, { state: string }])[1].state)
    expect(states).toEqual(['conflict', 'pending_replace', 'remote_deleted'])
    mounted.app.unmount()
  })

  it('leaves out Receiving for a folder that only sends', async () => {
    folder.mode = 'upload_only'
    const mounted = await mount()

    expect(content(mounted.root)).not.toContain('Receiving')
    mounted.app.unmount()
  })
})

describe('the bucket and stopping', () => {
  it('links to the bucket on its node', async () => {
    const mounted = await mount()

    expect(content(mounted.root)).toContain('lab')
    expect(content(mounted.root)).toContain('on lab node')
    mounted.app.unmount()
  })

  it('asks before it stops syncing and keeps the files', async () => {
    const mounted = await mount()

    await click(button(mounted.root, 'Stop syncing'))
    expect(stopDialog.open).toBe(true)
    expect(unbind).not.toHaveBeenCalled()
    expect(content(mounted.root)).toContain('stop data-2026 lab 0')

    stopDialog.confirm()
    await VueRuntime.nextTick()
    expect(unbind).toHaveBeenCalledWith('f1')
    await vi.waitFor(() => expect(mounted.router.currentRoute.value.name).toBe('device'))
    mounted.app.unmount()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

describe('reading the list after a retry', () => {
  it('reads the entries again once the folder was swept, so a fixed file stops showing as failed', async () => {
    const mounted = await mount()
    entries.mockClear()
    entries.mockResolvedValue({ entries: [entry({ path: 'notes/bad.md', state: 'in_sync' })], next_cursor: null })

    await click(rowButton(mounted.root, 'notes/bad.md', 'Retry'))
    await VueRuntime.nextTick()

    expect(sync).toHaveBeenCalledWith('f1')
    expect(entries).toHaveBeenCalled()
    expect(refreshFolder).toHaveBeenCalled()
    expect(content(row(mounted.root, 'notes/bad.md'))).toContain('Synced')
    mounted.app.unmount()
  })

  it('keeps a way to read the folder again by hand', async () => {
    const mounted = await mount()
    entries.mockClear()

    await click(button(mounted.root, 'Refresh'))

    expect(entries).toHaveBeenCalled()
    mounted.app.unmount()
  })
})

describe('answers for another filter or folder', () => {
  it('drops the answer of a filter the owner has left', async () => {
    const mounted = await mount()
    const slow = deferred<DeviceApi.EntryPage>()
    entries.mockReset()
    entries.mockReturnValueOnce(slow.promise)
    await click(button(mounted.root, 'Failed'))
    entries.mockResolvedValue({ entries: [entry({ path: 'notes/synced.md', state: 'in_sync' })], next_cursor: null })
    await click(button(mounted.root, 'Synced'))
    await VueRuntime.nextTick()

    slow.resolve({ entries: [entry({ path: 'notes/failed.md', state: 'error' })], next_cursor: null })
    await slow.promise
    await VueRuntime.nextTick()

    expect(content(mounted.root)).toContain('notes/synced.md')
    expect(content(mounted.root)).not.toContain('notes/failed.md')
    mounted.app.unmount()
  })

  it('shows no row of the old folder under the new one and drops its late answer', async () => {
    const slow = deferred<DeviceApi.EntryPage>()
    const router = await (async () => {
      const Stub = defineComponent(() => () => h('div'))
      const made = createRouter({
        history: createMemoryHistory(),
        routes: [
              { path: '/app/folders/:folderId', name: 'folder', component: Stub },
          { path: '/app/device', name: 'device', component: Stub },
              { path: '/app/buckets/:bucketId', name: 'bucket', component: Stub },
        ],
      })
      await made.push('/app/folders/f1')
      await made.isReady()
      return made
    })()
    entries.mockResolvedValue({ entries: rows, next_cursor: null })
    const mounted = await mountApp(FolderDetailView, { router })
    expect(content(mounted.root)).toContain('notes/day.md')

    entries.mockReset()
    entries.mockReturnValue(slow.promise)
    await router.push('/app/folders/f2')
    await vi.waitFor(() => expect(entries).toHaveBeenCalledWith('f2', expect.anything()))
    expect(content(mounted.root)).not.toContain('notes/day.md')

    // The slow answer is for f2; the owner has already gone back to f1.
    entries.mockResolvedValue({ entries: [entry({ path: 'f1-only.md', state: 'in_sync' })], next_cursor: null })
    await router.push('/app/folders/f1')
    await vi.waitFor(() => expect(entries).toHaveBeenCalledWith('f1', expect.anything()))
    slow.resolve({ entries: [entry({ path: 'f2-only.md', state: 'in_sync' })], next_cursor: null })
    await slow.promise
    await VueRuntime.nextTick()

    expect(content(mounted.root)).toContain('f1-only.md')
    expect(content(mounted.root)).not.toContain('f2-only.md')
    mounted.app.unmount()
  })
})

describe('folder-wide replace', () => {
  it('opens the dialog for the whole folder, not one entry', async () => {
    const mounted = await mount()

    await click(button(mounted.root, 'Replace 1 of them'))

    expect(dialogOpens).toContainEqual({ path: null, action: 'replace_local' })
    mounted.app.unmount()
  })
})

describe('folder failures', () => {
  it('shows both the persisted folder error and the latest action refusal', async () => {
    folder.last_error = 'the bucket "lab" does not exist on node n1'
    actionErrors.set('f1', 'the node is unreachable')
    const mounted = await mount()

    expect(content(mounted.root)).toContain('the bucket "lab" does not exist on node n1')
    expect(content(mounted.root)).toContain('the node is unreachable')
    mounted.app.unmount()
  })

  it('shows cleanup without folder actions', async () => {
    folder.state = 'deleting'
    const mounted = await mount()

    expect(content(mounted.root)).toContain('deleting')
    expect(() => button(mounted.root, 'Pause')).toThrow()
    expect(() => button(mounted.root, 'Sync now')).toThrow()
    expect(() => button(mounted.root, 'Stop syncing')).toThrow()
    mounted.app.unmount()
  })
})
