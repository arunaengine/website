import * as VueRuntime from 'vue'
import { defineComponent, h, reactive, ref } from 'vue'
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
const entries = vi.fn(async () => ({ entries: rows, next_cursor: null }))
const refreshFolder = vi.fn(async () => folder)
const actionErrors = reactive(new Map<string, string>())

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
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const BadgeStub = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const RefusalStub = defineComponent({
  props: { message: { type: String, required: true } },
  setup: (props) => () => h('div', props.message),
})
const SelectStub = defineComponent({ setup: () => () => h('select') })
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const FactList = compileClientComponent(new URL('../../components/ui/FactList.vue', import.meta.url), {
  vue: VueRuntime,
})
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
  '@/components/ui/FactList.vue': moduleDefault(FactList),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Skeleton.vue': moduleDefault(Passthrough),
  '@/components/dashboard/PageHeader.vue': moduleDefault(Passthrough),
  '@/components/desktop/ReplaceLocalDialog.vue': moduleDefault(ReplaceLocalDialogStub),
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: () => 'lab node' }) },
  '@/composables/useRefresh': { useRefresh },
  '@/composables/useSyncedFolders': {
    useSyncedFolders: () => ({
      folders: ref([folder]),
      ensureLoaded: vi.fn(async () => undefined),
      refreshFolder,
      entries,
      entryAction,
      setPaused: vi.fn(),
      sync,
      unbind: vi.fn(),
      busy: ref(false),
      actionErrors,
    }),
  },
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
      { path: '/app/folders/:folderId', name: 'folder', component: Stub },
      { path: '/app/device', name: 'device', component: Stub },
    ],
  })
  await router.push('/app/folders/f1')
  await router.isReady()
  return mountApp(FolderDetailView, { router })
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
  actionErrors.clear()
  folder.last_error = null
  dialogOpens.length = 0
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

    await click(rowButton(mounted.root, 'notes/day.md', 'Replace mine'))

    expect(entryAction).not.toHaveBeenCalled()
    expect(dialogOpens).toContainEqual({ path: 'notes/day.md', action: 'replace_local' })
    mounted.app.unmount()
  })

  it('separates accepting a failure from retrying it', async () => {
    const mounted = await mount()

    await click(rowButton(mounted.root, 'notes/bad.md', 'Mark handled'))
    expect(entryAction).toHaveBeenCalledWith('f1', 'notes/bad.md', 'resolve', expect.any(Object))

    await click(rowButton(mounted.root, 'notes/bad.md', 'Retry sync'))
    expect(sync).toHaveBeenCalledWith('f1')
    mounted.app.unmount()
  })

  it('offers no decision on a settled file', async () => {
    const mounted = await mount()

    expect(() => rowButton(mounted.root, 'notes/kept.md', 'Keep mine')).toThrow()
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
})
