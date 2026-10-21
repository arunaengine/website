import { describe, expect, it } from 'vitest'
import { abortSentence, linkProblems, percent, rangeLabel, renameJob } from './organize'
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

describe('link problems', () => {
  const LINK = {
    import_id: 'i',
    backend_id: 'b',
    backend_prefix: 'p/',
    bucket: 'reef',
    key_prefix: '',
    created_at: '',
  }

  it('is quiet for a link that is fine', () => {
    expect(linkProblems(LINK, { count: 0, complete: true, files: [] }, { conflicts: [] })).toEqual([])
  })

  it('names each problem with a next step', () => {
    const run = { job_id: 'j', state: 'failed', started_at: '', imported: 0, skipped: 0, failed: 2, errors: [], error: 'keys refused.' }
    const found = linkProblems(
      { ...LINK, last_run: run },
      { count: 3, complete: false, files: [] },
      { conflicts: [{ path: 'raw/report.csv' }] },
    )
    expect(found.map((problem) => problem.id)).toEqual(['stopped', 'failed', 'conflicts', 'renames'])
    expect(found[0].text).toBe('The last run stopped: keys refused. Run it again, or check your storage.')
    expect(found[2].text).toContain('Add a file rule to choose one.')
    expect(found[3]).toMatchObject({ action: 'organize' })
    expect(found[3].text).toContain('At least 3 files still have the old name.')
  })
})
