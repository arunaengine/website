import { describe, expect, it } from 'vitest'
import type { BucketMoveResponse } from './api'
import { moveText, moveView, rememberMoves, bucketError, bucketTitle, defaultBucket, runActive, linkConflict, runText, splitPath, suggestBucket } from './storageRules'

const split = { backend_id: 's1', group_id: 'g1', kind: 's3', name: 'lab', public_config: { endpoint: 'https://s3' } }
const fixed = { ...split, backend_id: 's2', public_config: { endpoint: 'https://s3', bucket: 'data' } }

describe('storageRules', () => {
  it('reads the bucket from the path only without a fixed bucket', () => {
    expect(splitPath(split, 'lab-raw/2024/')).toEqual({ bucket: 'lab-raw', folder: '2024/' })
    expect(splitPath(fixed, 'raw/')).toEqual({ bucket: 'data', folder: 'raw/' })
    expect(defaultBucket(fixed)).toBe('data')
    expect(defaultBucket(split)).toBeNull()
  })

  it('suggests a valid default bucket', () => {
    expect(suggestBucket('Lab Group')).toBe('aruna-lab-group-default')
    expect(suggestBucket('***')).toBe('aruna-default')
  })

  it('refuses folders that leave no room for a file', () => {
    expect(linkConflict(split, [], `lab-raw/${'a'.repeat(1000)}/`)).toContain('too long')
    expect(linkConflict(split, [], 'lab-raw/2024/')).toBeNull()
  })

  it('takes the bucket check from the saved state, not from runs', () => {
    const checked = { ...split, public_config: { ...split.public_config, 'bucket:lab-raw': 'created' } }
    expect(bucketTitle(checked, 'lab-raw')).toBe('Bucket created')
    expect(bucketTitle(split, 'lab-raw')).toBeNull()
    expect(bucketTitle(fixed, 'data')).toBe('Bucket found')
  })

  it('shows a cross only when a failed run used nothing', () => {
    const run = { job_id: 'j', started_at: '', imported: 0, skipped: 0, failed: 1, state: 'failed' }
    const denied = [{ key: 'lab-raw/a.csv', error: 'Access denied' }]
    expect(bucketError({ ...run, errors: denied })).toBe('Access denied')
    expect(bucketError({ ...run, imported: 4, errors: denied })).toBeNull()
    expect(bucketError({ ...run, state: 'succeeded', errors: denied })).toBeNull()
    expect(bucketError({ ...run, errors: [] })).toBeNull()
    // A node that names the run error shows it, even after some items went through.
    const listed = { ...run, imported: 2, errors: [], error: 'List error: access denied' }
    expect(bucketError(listed)).toBe('List error: access denied')
    expect(bucketError({ ...listed, state: 'indeterminate' })).toBe('List error: access denied')
    expect(bucketError({ ...listed, state: 'succeeded' })).toBeNull()
  })

  it('counts the root and refuses Aruna folders and former default buckets', () => {
    const rooted = { ...split, public_config: { ...split.public_config, root: `/${'r'.repeat(900)}/` } }
    expect(linkConflict(rooted, [], `lab-raw/${'a'.repeat(200)}/`)).toContain('too long')
    expect(linkConflict(split, [], 'lab-raw/_aruna_parts/')).toContain('Aruna uses')
    expect(linkConflict(split, [], 'lab-raw/_parts/')).toBeNull()
    const former = { ...split, public_config: { ...split.public_config, 'layout:lab-old': 'true' } }
    expect(linkConflict(former, [], 'lab-old/')).toContain('default rule')
  })

  it('says Synced only after a run that succeeded', () => {
    const run = { job_id: 'j', started_at: new Date().toISOString(), imported: 0, skipped: 0, failed: 0, errors: [] }
    expect(runText({ ...run, state: 'succeeded' }).text).toMatch(/^Synced/)
    expect(runText({ ...run, state: 'cancelled' }).text).toMatch(/^Stopped/)
    expect(runText({ ...run, state: 'indeterminate' }).text).toMatch(/^Unknown/)
    // Labels come before item failures, which stay open behind the text.
    const failed = { ...run, failed: 3 }
    expect(runText({ ...failed, state: 'cancelling' })).toMatchObject({ text: 'Stopping…', failures: true })
    expect(runText({ ...failed, state: 'cancelled' }).text).toMatch(/^Stopped/)
    expect(runText({ ...failed, state: 'indeterminate' }).text).toMatch(/^Unknown/)
    expect(runText({ ...failed, state: 'succeeded' }).text).toMatch(/^3 failed/)
  })

  it('treats every unfinished state as running', () => {
    const run = { job_id: 'j', started_at: '', imported: 0, skipped: 0, failed: 0, errors: [] }
    for (const state of ['queued', 'ready', 'running', 'cancelling', 'awaiting_key']) {
      expect(runActive({ ...run, state })).toBe(true)
    }
    for (const state of ['succeeded', 'failed', 'cancelled', 'indeterminate']) {
      expect(runActive({ ...run, state })).toBe(false)
    }
  })

  it('counts a move up from a total that never shrinks', () => {
    const at = (misplaced: number, migrated: number, started = 1): BucketMoveResponse => ({
      bucket: 'b', misplaced, complete: true,
      progress: { migrated, skipped: 9, failed: 0, started_at_ms: started, finished_at_ms: null },
    })
    const totals = new Map<string, number>()
    const text = (move: BucketMoveResponse) => {
      rememberMoves(totals, [move])
      return moveText(moveView([move], undefined, totals))
    }
    expect(text(at(100, 0))).toBe('Moving files: 0 of 100')
    expect(text(at(99, 0))).toBe('Moving files: 1 of 100')
    expect(text(at(36, 64))).toBe('Moving files: 64 of 100')
    // A saved page never moves the number back or past the total.
    expect(text(at(36, 70))).toBe('Moving files: 70 of 106')
    expect(text(at(10, 90))).toBe('Moving files: 96 of 106')
    // A new run has its own total.
    expect(text(at(20, 0, 2))).toBe('Moving files: 0 of 20')
  })
})
