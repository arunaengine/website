import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import * as RouterRuntime from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as DeviceApi from '@/lib/deviceApi'
import * as SyncStates from '@/lib/syncStates'
import * as Utils from '@/lib/utils'
import * as VueUse from '@vueuse/core'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  input,
  moduleDefault,
  mountApp,
  typeValue,
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
  counters: { in_sync: 9, uploading: 0, conflicts: 2, pending_replacements: 1, remote_deleted: 4, errors: 0 },
  last_reconcile_ms: null,
  created_at_ms: null,
  message: null,
}

const conflicted: FolderEntry = {
  path: 'notes/day.md',
  state: 'conflict',
  local: {
    size: 2048,
    modified_at_ms: Date.now(),
    fingerprint: 'fp-local',
    blake3: 'aaaabbbbccccdddd',
    version_id: null,
  },
  remote: {
    size: 4096,
    modified_at_ms: Date.now(),
    fingerprint: 'fp-remote',
    blake3: 'eeeeffff11112222',
    version_id: 'v7',
  },
  reason: null,
  conflicted_copy: 'notes/day (conflicted copy 2026-08-25 1200, realm).md',
  message: null,
  updated_at_ms: null,
}

const deleted: FolderEntry = { ...conflicted, path: 'notes/old.md', state: 'remote_deleted', remote: null }

const entryAction = vi.fn(async () => conflicted)
const folderReplace = vi.fn(async () => folder)

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const Input = compileClientComponent(new URL('../ui/Input.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
  '@vueuse/core': VueUse,
})

const dialogStubs = Object.fromEntries(
  ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'DialogClose'].map(
    (name) => [`@/components/ui/${name}.vue`, moduleDefault(Passthrough)],
  ),
)

const Notice = compileClientComponent(new URL('../ui/Notice.vue', import.meta.url), {
  vue: VueRuntime,
  '@/lib/utils': Utils,
})
const Spinner = compileClientComponent(new URL('../ui/Spinner.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/lib/utils': Utils,
})

const ReplaceLocalDialog = compileClientComponent(new URL('./ReplaceLocalDialog.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': RouterRuntime,
  '@lucide/vue': icons,
  ...dialogStubs,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(Input),
  '@/components/ui/Notice.vue': moduleDefault(Notice),
  '@/components/ui/Spinner.vue': moduleDefault(Spinner),
  '@/composables/useSyncedFolders': {
    useSyncedFolders: () => ({ entryAction, folderReplace, busy: ref(false) }),
  },
  '@/lib/deviceApi': DeviceApi,
  '@/lib/syncStates': SyncStates,
  '@/lib/utils': Utils,
})

function mount(props: Record<string, unknown>) {
  return mountApp(ReplaceLocalDialog, { props: { open: true, folder, ...props } })
}

function applyButton(root: HostNode, label: string): HostNode {
  return button(root, label)
}

beforeEach(() => {
  entryAction.mockClear()
  folderReplace.mockClear()
})

describe('replacing one file', () => {
  it('shows both copies before anything is given up', async () => {
    const mounted = await mount({ entry: conflicted })
    const html = content(mounted.root)

    expect(html).toContain('On this computer')
    expect(html).toContain('In the realm')
    expect(html).toContain('2 KB')
    expect(html).toContain('4 KB')
    expect(html).toContain('aaaabbbb')
    expect(html).toContain('conflicted copy')
    mounted.app.unmount()
  })

  it('sends both hashes and the remote version it was shown', async () => {
    const mounted = await mount({ entry: conflicted })

    await click(applyButton(mounted.root, 'Replace my copy'))

    expect(entryAction).toHaveBeenCalledWith('f1', 'notes/day.md', 'replace_local', {
      fingerprint: 'fp-local',
      blake3: 'aaaabbbbccccdddd',
      remote_version: 'v7',
    })
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})

describe('moving one file to the trash', () => {
  it('names the trash it lands in and never deletes', async () => {
    const mounted = await mount({ entry: deleted, action: 'remove_local' })
    const html = content(mounted.root)

    expect(html).toContain('/home/me/data-2026/.aruna/trash/')
    expect(html).toContain('never deleted')
    expect(html).toContain('On this computer')
    mounted.app.unmount()
  })

  it('asks the node to remove, with the same expectation', async () => {
    const mounted = await mount({ entry: deleted, action: 'remove_local' })

    await click(applyButton(mounted.root, 'Move it to trash'))

    expect(entryAction).toHaveBeenCalledWith('f1', 'notes/old.md', 'remove_local', {
      fingerprint: 'fp-local',
      blake3: 'aaaabbbbccccdddd',
    })
    mounted.app.unmount()
  })
})

describe('replacing a whole folder', () => {
  it('stays shut until the folder name is typed exactly', async () => {
    const mounted = await mount({ entry: null })
    const apply = applyButton(mounted.root, 'Replace them')

    expect(apply.props.disabled).toBe(true)
    await click(apply)
    expect(folderReplace).not.toHaveBeenCalled()

    await typeValue(input(mounted.root, 'aria-label', 'Folder name confirmation'), 'data')
    expect(applyButton(mounted.root, 'Replace them').props.disabled).toBe(true)

    await typeValue(input(mounted.root, 'aria-label', 'Folder name confirmation'), 'data-2026')
    expect(applyButton(mounted.root, 'Replace them').props.disabled).toBe(false)

    await click(applyButton(mounted.root, 'Replace them'))
    expect(folderReplace).toHaveBeenCalledWith('f1', 'data-2026')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('counts only what it will replace and says what it leaves alone', async () => {
    const mounted = await mount({ entry: null })
    const html = content(mounted.root)

    expect(html).toContain('Replace 3 local files')
    expect(html).toContain('every conflict and pending replacement')
    expect(html).toContain('Files in sync are untouched')
    expect(html).toContain('removals are decided one file at a time')
    expect(element(mounted.root, (node) => node.props['aria-label'] === 'Folder name confirmation')).toBeTruthy()
    mounted.app.unmount()
  })
})
