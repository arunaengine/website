import { createSSRApp, defineComponent, h, ref, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeAll, describe, expect, it, vi } from 'vitest'
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
  counters: { in_sync: 9, uploading: 0, conflicts: 2, pending_replacements: 1, remote_deleted: 0, errors: 0 },
  last_reconcile_ms: null,
  created_at_ms: null,
  message: null,
}

const entry: FolderEntry = {
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

const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const ButtonStub = defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  setup: (props, { attrs }) => () => h('input', { ...attrs, value: props.modelValue }),
})

let ReplaceLocalDialog: Component

beforeAll(async () => {
  vi.doMock('@/composables/useSyncedFolders', () => ({
    useSyncedFolders: () => ({ entryAction: vi.fn(), folderReplace: vi.fn(), busy: ref(false) }),
  }))
  for (const name of ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'DialogClose']) {
    vi.doMock(`@/components/ui/${name}.vue`, () => ({ default: Passthrough }))
  }
  vi.doMock('@/components/ui/Button.vue', () => ({ default: ButtonStub }))
  vi.doMock('@/components/ui/Input.vue', () => ({ default: InputStub }))
  ReplaceLocalDialog = (await import('./ReplaceLocalDialog.vue')).default
})

function render(props: Record<string, unknown>): Promise<string> {
  return renderToString(createSSRApp(ReplaceLocalDialog, { open: true, folder, ...props }))
}

describe('replacing one file', () => {
  it('shows both copies before anything is given up', async () => {
    const html = await render({ entry })

    expect(html).toContain('On this computer')
    expect(html).toContain('In the realm')
    expect(html).toContain('2 KB')
    expect(html).toContain('4 KB')
    expect(html).toContain('aaaabbbb')
    expect(html).toContain('conflicted copy')
  })

  it('is ready to apply, because the owner picked this one file', async () => {
    const html = await render({ entry })

    expect(html).toContain('Replace my copy')
    expect(html).toContain('Keep my copy')
    expect(html).not.toMatch(/Replace my copy<\/button>[\s\S]*disabled/)
    expect(html).not.toContain('to confirm')
  })
})

describe('replacing a whole folder', () => {
  it('asks for the folder name and stays shut until it is typed', async () => {
    // Nothing is typed on the first paint, so the destructive button is closed.
    const html = await render({ entry: null })

    expect(html).toContain('Type ')
    expect(html).toContain('data-2026')
    expect(html).toContain('Folder name confirmation')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Replace them/)
  })

  it('says how many copies are at stake and what stays untouched', async () => {
    const html = await render({ entry: null })

    expect(html).toContain('Replace 3 local files')
    expect(html).toContain('already in sync are untouched')
  })
})
