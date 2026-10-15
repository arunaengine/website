import { describe, expect, it } from 'vitest'
import { defaultBucket, linkConflict, runProblem, runText, splitPath, suggestBucket } from './storageRules'

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

  it('shows a cross only for a failed run', () => {
    const run = { job_id: 'j', started_at: '', imported: 0, skipped: 0, failed: 0, errors: [] }
    expect(runProblem({ ...run, state: 'succeeded' })).toBeNull()
    expect(runProblem({ ...run, state: 'running', failed: 2 })).toBeNull()
    expect(runProblem({ ...run, state: 'failed' })).toBe('The last run failed.')
  })

  it('says Synced only after a run that succeeded', () => {
    const run = { job_id: 'j', started_at: new Date().toISOString(), imported: 0, skipped: 0, failed: 0, errors: [] }
    expect(runText({ ...run, state: 'succeeded' }).text).toMatch(/^Synced/)
    expect(runText({ ...run, state: 'cancelled' }).text).toMatch(/^Stopped/)
    expect(runText({ ...run, state: 'indeterminate' }).text).toMatch(/^Unknown/)
  })
})
