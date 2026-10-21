import { describe, expect, it } from 'vitest'
import { abortSentence, activeJob, copyKey, failureList, linkProblems, organizeError, percent, rangeLabel, type ProgressJob } from './organize'
import { ApiError } from '@/lib/api'

const MOVE: ProgressJob = { kind: 'move', state: 'running', done: 92410, total: 214880, counted: true, skipped: 2, failed: 0, controls: true }

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
    expect(rangeLabel(0, 100, 1000, false)).toBe('1-100 of at least 1,000')
  })

  it('words a rename and a delete without a total', () => {
    const rename: ProgressJob = { ...MOVE, kind: 'rename', total: 0, done: 5 }
    expect(abortSentence(rename)).toBe('5 files are already renamed and stay renamed. You can start again later.')
    expect(abortSentence({ ...MOVE, kind: 'purge', done: 2, total: 5 })).toBe(
      '2 files are already deleted and stay deleted. The other 3 stay as they are. You can start again later.',
    )
  })

  it('gives percent and shows a job only while it runs', () => {
    expect(percent(MOVE)).toBe(43)
    expect(percent({ ...MOVE, total: 0 })).toBe(0)
    const job = { kind: 'move', state: 'paused', done: 1, skipped: 0, failed: 0, total: 4, counted: true, started_at_ms: 1, controls: true } as const
    expect(activeJob(job)).toMatchObject({ state: 'paused', total: 4 })
    expect(activeJob({ ...job, state: 'done' })).toBeNull()
    expect(activeJob({ ...job, state: 'aborted' })).toBeNull()
    expect(activeJob(null)).toBeNull()
  })

  it('words a refused call shortly', () => {
    expect(organizeError(new ApiError(403, 'forbidden'))).toBe('Only group admins with write access to the bucket can do this.')
    expect(organizeError(new ApiError(409, 'busy', 'job_running'))).toBe('Another step is running.')
    expect(organizeError(new ApiError(500, 'boom'))).toBe('boom')
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
      { conflicts: [{ path: 'raw/report.csv', reason: 'two links' }] },
    )
    expect(found.map((problem) => problem.id)).toEqual(['stopped', 'failed', 'renames'])
    expect(found[0].text).toBe('The last run stopped: keys refused. Run it again, or check your storage.')
        expect(found[2]).toMatchObject({ action: 'organize' })
    expect(found[2].text).toContain('At least 3 files still have the old name.')
  })
})

describe('copy rows', () => {
  it('tells apart two contents of one key', () => {
    const a = { key: 'x', kept: { path: 'k1' }, removed: [{ path: 'r1' }] }
    const b = { key: 'x', kept: { path: 'k2' }, removed: [{ path: 'r2' }] }
    expect(copyKey(a)).not.toBe(copyKey(b))
  })
})

describe('files a run did not add', () => {
  const LINK = { import_id: 'i', backend_id: 'b', backend_prefix: 'p/', bucket: 'reef', key_prefix: '', created_at: '' }
  const run = (failed: number, keys: string[]) => ({
    job_id: 'j', state: 'succeeded', started_at: '', imported: 0, skipped: 0, failed,
    errors: keys.map((key) => ({ key, error: 'run reason' })),
  })

  it('tells them once, with the count of the run', () => {
    const keys = Array.from({ length: 90 }, (_, index) => `f${index}`)
    const found = linkProblems({ ...LINK, last_run: run(90, keys) }, null, {
      conflicts: keys.map((path) => ({ path, reason: 'several rules read this folder' })),
    })
    expect(found.map((problem) => problem.id)).toEqual(['failed'])
    expect(found[0].text).toBe('90 files could not be added. Choose Show to see why.')
  })

  it('uses the status list when the run lists none', () => {
    const found = linkProblems({ ...LINK, last_run: run(0, []) }, null, { conflicts: [{ path: 'a', reason: 'r' }] })
    expect(found[0].text).toBe('1 file could not be added. Choose Show to see why.')
  })

  it('lists every entry with its own reason, from the node first and the run otherwise', () => {
    const linked = { ...LINK, last_run: run(1, ['a']) }
    expect(failureList(linked, [{ path: 'x', reason: 'claimed' }])).toEqual([{ path: 'x', reason: 'claimed' }])
    expect(failureList(linked, [])).toEqual([{ path: 'a', reason: 'run reason' }])
  })

  it('says nothing for a clean run', () => {
    expect(linkProblems({ ...LINK, last_run: run(0, []) }, null, { conflicts: [] })).toEqual([])
  })
})
