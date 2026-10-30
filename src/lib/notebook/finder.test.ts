import { describe, expect, it } from 'vitest'
import { countBelow, folderOf, matchNotebooks, notebooksOf } from './finder'

const objects = [
  { key: 'notebooks/a.ipynb', lastModified: new Date('2026-10-29T10:00:00Z') },
  { key: 'notebooks/deep/b.ipynb', lastModified: new Date('2026-10-30T10:00:00Z') },
  { key: 'results/table.tsv' },
  { key: 'top.ipynb' },
]

describe('the notebook finder helpers', () => {
  it('keeps only notebooks, newest first', () => {
    expect(notebooksOf('lab', objects).map((entry) => entry.key)).toEqual(['notebooks/deep/b.ipynb', 'notebooks/a.ipynb', 'top.ipynb'])
  })

  it('counts the notebooks below a folder, nested ones included', () => {
    const found = notebooksOf('lab', objects)
    expect(countBelow(found, '')).toBe(3)
    expect(countBelow(found, 'notebooks/')).toBe(2)
    expect(countBelow(found, 'results/')).toBe(0)
  })

  it('names the folder of a key and finds notebooks by bucket, folder or name', () => {
    const found = notebooksOf('lab', objects)
    expect(folderOf('notebooks/deep/b.ipynb')).toBe('notebooks/deep/')
    expect(folderOf('top.ipynb')).toBe('')
    expect(matchNotebooks(found, 'DEEP').map((entry) => entry.key)).toEqual(['notebooks/deep/b.ipynb'])
    expect(matchNotebooks(found, 'lab/')).toHaveLength(3)
    expect(matchNotebooks(found, ' ')).toEqual([])
  })
})
