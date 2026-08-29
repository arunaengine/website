import { describe, expect, it } from 'vitest'
import { readEntry, type DeviceTransfer, type FolderEntry, type SyncedFolder, type SyncDocument } from './deviceApi'
import {
  ENTRY_META,
  entryBadge,
  entryMeta,
  folderConfirmed,
  itemChip,
  orderEntries,
} from './syncStates'

function folder(overrides: Partial<SyncedFolder> = {}): SyncedFolder {
  return {
    folder_id: 'f1',
    root: '/home/me/data',
    local_bucket: 'dev-data',
    group_id: 'g1',
    remote: { node_id: 'node-123456', bucket: 'lab', prefix: 'raw/' },
    mode: 'two_way',
    propagate_deletes: true,
    state: 'active',
    counters: {
      in_sync: 1,
      uploading: 0,
      conflicts: 0,
      pending_replacements: 0,
      remote_deleted: 0,
      errors: 0,
    },
    last_reconcile_ms: 1,
    created_at_ms: null,
    message: null,
    last_error: null,
    last_error_at_ms: null,
    ...overrides,
  }
}

function failedTransfer(message: string | null): DeviceTransfer {
  return {
    id: 't1',
    direction: 'upload',
    folder_id: 'f1',
    path: 'raw/file.txt',
    bucket: 'lab',
    key: 'raw/file.txt',
    state: 'failed',
    bytes_total: 10,
    bytes_done: 2,
    attempts: 1,
    next_attempt_ms: null,
    message,
  }
}

describe('folder item chips', () => {
  it('uses paused before errors, decisions, and activity', () => {
    const value = folder({
      state: 'paused',
      last_error: 'bucket failed',
      counters: { ...folder().counters, conflicts: 2, uploading: 3 },
    })

    expect(itemChip({ kind: 'folder', folder: value, transfers: [failedTransfer('transfer failed')] })).toEqual({
      label: 'Paused',
      variant: 'secondary',
    })
  })

  it('shows cleanup before stale folder activity', () => {
    const value = folder({
      state: 'deleting',
      last_error: 'old failure',
      counters: { ...folder().counters, conflicts: 2, uploading: 3 },
    })

    expect(itemChip({ kind: 'folder', folder: value })).toEqual({ label: 'Deleting', variant: 'sky' })
  })

  it('uses errors before decisions and activity', () => {
    const value = folder({ counters: { ...folder().counters, conflicts: 2, uploading: 3 } })

    expect(itemChip({ kind: 'folder', folder: value, actionError: 'sync refused' })).toEqual({
      label: 'Error',
      variant: 'destructive',
      detail: 'sync refused',
    })
  })

  it('selects folder, action, then transfer detail', () => {
    const transfer = failedTransfer('transfer failed')

    expect(
      itemChip({ kind: 'folder', folder: folder({ last_error: 'folder failed' }), actionError: 'action failed', transfers: [transfer] }).detail,
    ).toBe('folder failed')
    expect(itemChip({ kind: 'folder', folder: folder(), actionError: 'action failed', transfers: [transfer] }).detail).toBe(
      'action failed',
    )
    expect(itemChip({ kind: 'folder', folder: folder(), transfers: [transfer] }).detail).toBe('transfer failed')
  })

  it('counts decisions before uploads', () => {
    const value = folder({
      counters: { ...folder().counters, uploading: 4, conflicts: 1, pending_replacements: 2, remote_deleted: 3 },
    })

    expect(itemChip({ kind: 'folder', folder: value })).toEqual({ label: 'Needs you 6', variant: 'warn' })
  })

  it('says when an otherwise quiet folder has never been checked', () => {
    expect(itemChip({ kind: 'folder', folder: folder({ last_reconcile_ms: null }) })).toEqual({
      label: 'In sync',
      variant: 'success',
      detail: 'Never checked',
    })
  })
})

describe('document item chips', () => {
  it('keeps the document failure reason', () => {
    const document: SyncDocument = {
      documentId: 'd1',
      path: 'lab/run.json',
      groupId: 'g1',
      state: 'failed',
      pendingEdits: 1,
      localOnly: false,
      validationFindings: 0,
      lastError: 'The realm refused the push.',
      lastSyncedMs: null,
    }

    expect(itemChip({ kind: 'document', document })).toEqual({
      label: 'Error',
      variant: 'destructive',
      detail: 'The realm refused the push.',
    })
  })
})

function entry(path: string, state: string): FolderEntry {
  return readEntry({ path, state })
}

describe('entry wording', () => {
  it('names every state a folder entry can be in', () => {
    for (const [state, meta] of Object.entries(ENTRY_META)) {
      expect(meta.label.length, state).toBeGreaterThan(0)
      expect(meta.hint.length, state).toBeGreaterThan(0)
    }
  })

  it('never describes an automatic overwrite of local bytes', () => {
    expect(entryMeta('conflict').hint).toContain('kept')
    expect(entryMeta('pending_replace').tone).toBe('decide')
    expect(entryMeta('remote_deleted').hint).toContain('still here')
    expect(entryMeta('remote_changed').hint).toContain('unchanged since the last sync')
  })

  it('marks the states that wait for a decision apart from the quiet ones', () => {
    expect(entryBadge('conflict')).toBe('warn')
    expect(entryBadge('pending_replace')).toBe('warn')
    expect(entryBadge('error')).toBe('destructive')
    expect(entryBadge('in_sync')).toBe('secondary')
  })
})

describe('entry ordering', () => {
  it('puts decisions first and settled files last', () => {
    const ordered = orderEntries([
      entry('c.txt', 'in_sync'),
      entry('b.txt', 'local_new'),
      entry('a.txt', 'error'),
      entry('d.txt', 'conflict'),
      entry('e.txt', 'remote_deleted'),
    ])

    expect(ordered.map((row) => row.path)).toEqual(['d.txt', 'e.txt', 'a.txt', 'b.txt', 'c.txt'])
  })

  it('sorts by path inside one group and leaves the input alone', () => {
    const input = [entry('z.txt', 'in_sync'), entry('a.txt', 'in_sync')]
    const ordered = orderEntries(input)

    expect(ordered.map((row) => row.path)).toEqual(['a.txt', 'z.txt'])
    expect(input.map((row) => row.path)).toEqual(['z.txt', 'a.txt'])
  })
})

describe('folder-wide confirmation', () => {
  it('takes the folder name and nothing else', () => {
    expect(folderConfirmed('/home/me/data-2026', 'data-2026')).toBe(true)
    expect(folderConfirmed('/home/me/data-2026', ' data-2026 ')).toBe(true)
    expect(folderConfirmed('/home/me/data-2026', 'data')).toBe(false)
    expect(folderConfirmed('/home/me/data-2026', '/home/me/data-2026')).toBe(false)
    expect(folderConfirmed('/home/me/data-2026', '')).toBe(false)
  })

  it('stays closed when the folder has no name to type', () => {
    expect(folderConfirmed('', '')).toBe(false)
    expect(folderConfirmed('/', '')).toBe(false)
  })
})
