import { describe, expect, it } from 'vitest'
import { actionBlocker, deletedOnPage, fileRows, filtersChanged, lastListedKey, shownDeleted, shownEntries } from './objectListing'

const folder = { prefix: 'raw/genomes/', name: 'genomes' }
const file = { key: 'raw/reads.fastq', name: 'reads.fastq' }
const deleted = [
  { key: 'raw/old.fastq', name: 'old.fastq', markerVersionId: 'm1' },
  { key: 'raw/notes.txt', name: 'notes.txt', markerVersionId: 'm2' },
]

describe('object list filters', () => {
  it('hides folders or files by the shown kind', () => {
    expect(shownEntries([folder], [file], 'all')).toEqual({ folders: [folder], objects: [file] })
    expect(shownEntries([folder], [file], 'files')).toEqual({ folders: [], objects: [file] })
    expect(shownEntries([folder], [file], 'folders')).toEqual({ folders: [folder], objects: [] })
  })

  it('narrows deleted files by name start and hides them with folders only', () => {
    expect(shownDeleted(deleted, 'old', 'all').map((entry) => entry.key)).toEqual(['raw/old.fastq'])
    expect(shownDeleted(deleted, '', 'files')).toHaveLength(2)
    expect(shownDeleted(deleted, '', 'folders')).toEqual([])
  })

  it('counts only the kind and the deleted switch as changed filters', () => {
    expect(filtersChanged({ show: 'all', includeDeleted: false })).toBe(false)
    expect(filtersChanged({ show: 'files', includeDeleted: false })).toBe(true)
    expect(filtersChanged({ show: 'all', includeDeleted: true })).toBe(true)
  })

  it('gives every deleted file to exactly one page', () => {
    const gaps = [
      { key: 'raw/b.txt', name: 'b.txt', markerVersionId: 'm1' },
      { key: 'raw/e.txt', name: 'e.txt', markerVersionId: 'm2' },
      { key: 'raw/z.txt', name: 'z.txt', markerVersionId: 'm3' },
    ]
    // Page one lists a..c, page two d..f, page three the rest.
    const first = lastListedKey(['raw/a.txt', 'raw/c.txt'])
    const second = lastListedKey(['raw/f.txt', 'raw/d.txt'])
    const pages = [
      deletedOnPage(gaps, undefined, first),
      deletedOnPage(gaps, first, second),
      deletedOnPage(gaps, second, undefined),
    ]
    expect(pages.map((page) => page.map((entry) => entry.name))).toEqual([['b.txt'], ['e.txt'], ['z.txt']])
  })

  it('orders live and deleted files by key', () => {
    const rows = fileRows([file], deleted)
    expect(rows.map((row) => [row.deleted, row.entry.key])).toEqual([
      [true, 'raw/notes.txt'],
      [true, 'raw/old.fastq'],
      [false, 'raw/reads.fastq'],
    ])
  })
})

describe('list bar actions', () => {
  it('blocks every action until something is ticked', () => {
    for (const action of ['download', 'move', 'copy', 'rename', 'access', 'delete'] as const) {
      expect(actionBlocker(action, 0, 0)).not.toBeNull()
    }
  })

  it('renames exactly one entry and downloads only files', () => {
    expect(actionBlocker('rename', 1, 0)).toBeNull()
    expect(actionBlocker('rename', 0, 1)).toBeNull()
    expect(actionBlocker('rename', 1, 1)).not.toBeNull()
    expect(actionBlocker('download', 0, 2)).not.toBeNull()
    expect(actionBlocker('download', 1, 2)).toBeNull()
    expect(actionBlocker('move', 0, 2)).toBeNull()
  })
})
