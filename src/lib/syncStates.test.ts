import { describe, expect, it } from 'vitest'
import { readEntry, type FolderEntry } from './deviceApi'
import { ENTRY_META, entryBadge, entryMeta, folderConfirmed, orderEntries } from './syncStates'

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
    // Decision 18: replacing local data is an explicit owner action.
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
