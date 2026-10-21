import { describe, expect, it } from 'vitest'
import { cleanRules, OUTCOME_WORDS, previewCounts, ruleProblem } from '@/lib/fileRules'

describe('file rules', () => {
  it('cleans rules before saving', () => {
    const rules = cleanRules([
      { pattern: ' *.faa.gz ', folder: 'proteins' },
      { pattern: '*.fna.gz', folder: 'nucleotides/' },
      { pattern: ' ', folder: '' },
    ])
    expect(rules).toEqual([
      { pattern: '*.faa.gz', folder: 'proteins/' },
      { pattern: '*.fna.gz', folder: 'nucleotides/' },
    ])
  })

  it('keeps and flags half filled rows', () => {
    const rows = [
      { pattern: '', folder: 'empty/' },
      { pattern: '*.txt', folder: ' ' },
    ]
    expect(cleanRules(rows)).toEqual([
      { pattern: '', folder: 'empty/' },
      { pattern: '*.txt', folder: '' },
    ])
    expect(ruleProblem(rows[0])).toBe('Add a file name.')
    expect(ruleProblem(rows[1])).toBe('Add a folder.')
    expect(ruleProblem({ pattern: ' ', folder: '' })).toBeNull()
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

  it('names a conflict without counting rules', () => {
    expect(OUTCOME_WORDS.conflict).toBe('Conflict')
  })
})
