import { describe, expect, it } from 'vitest'
import { abortSentence, activeJob, bucketJobLabel, copyKey, organizeError, percent, rangeLabel, timeLeft, type ProgressJob } from './organize'
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

  it('names the step running on a bucket', () => {
    const kinds = ['rename', 'move', 'compression', 'encryption', 'duplicates', 'key_move', 'check', 'purge', 'import'] as const
    expect(kinds.map((kind) => bucketJobLabel({ kind, state: 'running', done: 0, failed: 0 }))).toEqual([
      'Renaming',
      'Moving',
      'Compressing',
      'Encrypting',
      'Removing copies',
      'Moving keys',
      'Checking',
      'Deleting',
      'Importing',
    ])
    expect(bucketJobLabel({ kind: 'move', state: 'paused', done: 0, failed: 0 })).toBe('Moving (paused)')
  })

  it('tells the time left from the speed so far', () => {
    const MIN = 60_000
    const rename: ProgressJob = { ...MOVE, kind: 'rename', done: 152, total: 3877, started_at_ms: 0 }
    // 152 files in 10 minutes leave 3,725 files: about 245 minutes.
    expect(timeLeft(rename, 10 * MIN)).toBe('about 4 h left')
    expect(timeLeft({ ...rename, done: 1000 }, 10 * MIN)).toBe('about 29 min left')
    expect(timeLeft({ ...rename, done: 3870 }, 10 * MIN)).toBe('less than 1 min left')
    expect(timeLeft({ ...rename, done: 100, failed: 52 }, 10 * MIN)).toBe('about 4 h left')
  })

  it('tells no time before it can know', () => {
    const rename: ProgressJob = { ...MOVE, kind: 'rename', done: 4, total: 100, started_at_ms: 0 }
    expect(timeLeft(rename, 60_000)).toBeNull()
    expect(timeLeft({ ...rename, done: 50 }, 60_000)).not.toBeNull()
    expect(timeLeft({ ...rename, done: 50, state: 'paused' }, 60_000)).toBeNull()
    expect(timeLeft({ ...rename, done: 50, total: 0 }, 60_000)).toBeNull()
    expect(timeLeft({ ...rename, done: 100 }, 60_000)).toBeNull()
    expect(timeLeft({ ...rename, done: 50, started_at_ms: undefined }, 60_000)).toBeNull()
    expect(timeLeft({ ...rename, done: 50 }, 0)).toBeNull()
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

describe('copy rows', () => {
  it('tells apart two contents of one key', () => {
    const a = { key: 'x', kept: { path: 'k1' }, removed: [{ path: 'r1' }] }
    const b = { key: 'x', kept: { path: 'k2' }, removed: [{ path: 'r2' }] }
    expect(copyKey(a)).not.toBe(copyKey(b))
  })
})
