import { describe, expect, it } from 'vitest'
import { canRename, cleanRules, folderValue, previewCounts } from '@/lib/fileRules'

describe('file rules', () => {
  it('cleans rules before saving', () => {
    const rules = cleanRules([
      { pattern: ' *.faa.gz ', folder: 'proteins' },
      { pattern: '*.fna.gz', folder: 'nucleotides/' },
      { pattern: '', folder: 'empty/' },
      { pattern: '*.txt', folder: ' ' },
    ])
    expect(rules).toEqual([
      { pattern: '*.faa.gz', folder: 'proteins/' },
      { pattern: '*.fna.gz', folder: 'nucleotides/' },
    ])
  })

  it('counts matched and unmatched files', () => {
    const counts = previewCounts([
      { path: 'a.faa.gz', key: 'proteins/a.faa.gz', outcome: 'matched' },
      { path: 'baz', key: 'baz', outcome: 'root' },
      { path: 'bar.txt', key: 'foo/bar.txt', outcome: 'known' },
      { path: 'x.gz', outcome: 'conflict', patterns: ['*.gz', 'x.*'] },
    ])
    expect(counts).toEqual({ matched: 1, unmatched: 2, conflicts: 1 })
  })

  it('writes folders the node accepts', () => {
    expect(folderValue('')).toBe('')
    expect(folderValue(' archive ')).toBe('archive/')
    expect(folderValue('/archive/')).toBe('archive/')
  })

  it('renames only a plan without conflicts', () => {
    const item = { from: 'x', to: 'archive/x', versions: ['v'], deleted: false, files: [] }
    expect(canRename(null)).toBe(false)
    expect(canRename({ bucket: 'b', items: [], truncated: false })).toBe(false)
    expect(canRename({ bucket: 'b', items: [item], truncated: false })).toBe(true)
    const taken = { ...item, conflict: 'the key `archive/x` already exists' }
    expect(canRename({ bucket: 'b', items: [item, taken], truncated: false })).toBe(false)
  })
})
