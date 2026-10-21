import { describe, expect, it } from 'vitest'
import { abortSentence, percent, rangeLabel, renameJob } from './organize'
import type { OrganizeJob } from '@/lib/api'

const MOVE: OrganizeJob = { kind: 'move', state: 'running', done: 92410, total: 214880, skipped: 2, controls: true }

describe('organize words', () => {
  it('says what an abort keeps', () => {
    expect(abortSentence(MOVE)).toBe(
      '92,410 files are already moved and stay moved. The other 122,470 keep their names. You can start again later.',
    )
    expect(abortSentence({ ...MOVE, kind: 'duplicates', done: 1, total: 3 })).toContain('1 file is already removed')
  })

  it('labels a page range', () => {
    expect(rangeLabel(0, 100, 214880)).toBe('1-100 of 214,880')
    expect(rangeLabel(100, 20, 120)).toBe('101-120 of 120')
    expect(rangeLabel(0, 0, 0)).toBe('No files')
  })

  it('gives percent and a rename job only while it runs', () => {
    expect(percent(MOVE)).toBe(43)
    expect(percent({ ...MOVE, total: 0 })).toBe(0)
    const progress = { migrated: 5, skipped: 1, failed: 0, started_at_ms: 1 }
    expect(renameJob({ count: 15, complete: true, files: [], progress })).toMatchObject({ done: 5, total: 20, controls: false })
    expect(renameJob({ count: 15, complete: true, files: [], progress: { ...progress, finished_at_ms: 2 } })).toBeNull()
    expect(renameJob({ count: 15, complete: true, files: [] })).toBeNull()
  })
})
