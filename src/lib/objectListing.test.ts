import { describe, expect, it } from 'vitest'
import { actionBlocker, archiveEntries, deletedOnPage, downloadKind, fileRows, filtersChanged, lastListedKey, pageRange, selectedText, shownDeleted, shownEntries, sortRows, splitName } from './objectListing'

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

describe('list bar downloads', () => {
  it('downloads one file directly and anything more as a ZIP', () => {
    expect(downloadKind(1, 0, false)).toBe('download')
    expect(downloadKind(2, 0, false)).toBe('zip')
    expect(downloadKind(0, 1, false)).toBe('zip')
    expect(downloadKind(1, 1, false)).toBe('zip')
    expect(downloadKind(0, 0, false)).toBeNull()
  })

  it('leaves the ZIP out of a bucket locked on its node, but keeps the single download', () => {
    expect(downloadKind(2, 0, true)).toBeNull()
    expect(downloadKind(0, 1, true)).toBeNull()
    expect(downloadKind(1, 0, true)).toBe('download')
  })

  it('asks for folders by prefix and files by key, all in the one bucket', () => {
    expect(archiveEntries('reef', ['raw/a.txt', 'b.csv'], ['raw/reads/'])).toEqual([
      { bucket: 'reef', prefix: 'raw/reads/' },
      { bucket: 'reef', key: 'raw/a.txt' },
      { bucket: 'reef', key: 'b.csv' },
    ])
  })

  it('counts the ticked files and folders in words', () => {
    expect(selectedText(3, 1)).toBe('3\u00a0files, 1\u00a0folder')
    expect(selectedText(1, 0)).toBe('1\u00a0file')
    expect(selectedText(0, 2)).toBe('2\u00a0folders')
    expect(selectedText(1200, 0)).toBe('1,200\u00a0files')
  })
})

describe('object list order and ranges', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 9, n))
  const rows = [
    { name: 'b10.fna', size: 5, lastModified: day(3) },
    { name: 'b2.fna', size: 50, lastModified: day(1) },
    { name: 'a.fna', lastModified: day(2) },
  ]
  const names = (sorted: typeof rows) => sorted.map((row) => row.name)

  it('orders names naturally and either way', () => {
    expect(names(sortRows(rows, { key: 'name', descending: false }, (row) => row))).toEqual(['a.fna', 'b2.fna', 'b10.fna'])
    expect(names(sortRows(rows, { key: 'name', descending: true }, (row) => row))).toEqual(['b10.fna', 'b2.fna', 'a.fna'])
  })

  it('orders by size or date and keeps a row without one last', () => {
    expect(names(sortRows(rows, { key: 'size', descending: true }, (row) => row))).toEqual(['b2.fna', 'b10.fna', 'a.fna'])
    expect(names(sortRows(rows, { key: 'size', descending: false }, (row) => row))).toEqual(['b10.fna', 'b2.fna', 'a.fna'])
    expect(names(sortRows(rows, { key: 'modified', descending: false }, (row) => row))).toEqual(['b2.fna', 'a.fna', 'b10.fna'])
  })

  it('keeps the end of a long name whole', () => {
    expect(splitName('GCF_000005845.2_ASM584v2_genomic_vs_my_genome_alignment_minimap2.paf')).toEqual([
      'GCF_000005845.2_ASM584v2_genomic_vs_my_genome_alignment_',
      'minimap2.paf',
    ])
    expect(splitName('genome.embl')).toEqual(['genome.embl', ''])
  })

  it('names the total only once the last page is listed', () => {
    expect(pageRange(1, 25, 9, true)).toBe('1-9 of 9')
    expect(pageRange(2, 1000, 1000, false)).toBe('1,001-2,000')
    expect(pageRange(3, 10, 1, true)).toBe('21 of 21')
    expect(pageRange(1, 25, 0, true)).toBe('')
  })
})
