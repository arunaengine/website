import { describe, expect, it } from 'vitest'
import type { BackendImport } from './api'
import { bucketError, defaultBucket, runActive, linkConflict, splitPath, suggestBucket } from './storageRules'
import { writesInside } from './linkedFolders'

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

  it('lets links that write where they read share a folder', () => {
    const link = { import_id: 'i1', backend_id: 's1', backend_prefix: 'lab-raw/', bucket: 'b', key_prefix: 'foo/' } as BackendImport
    expect(linkConflict(split, [link], 'lab-raw/', null, true)).toBeNull()
    expect(linkConflict(split, [link], 'lab-raw/')).toContain('overlaps')
    const elsewhere = { ...link, write_prefix: 'lab-out/' }
    expect(linkConflict(split, [elsewhere], 'lab-raw/', null, true)).toContain('overlaps')
    // A write folder inside the read folder still writes where it reads, as the node allows.
    const inside = { ...link, write_prefix: 'lab-raw/out/' }
    expect(writesInside(inside)).toBe(true)
    expect(linkConflict(split, [inside], 'lab-raw/', null, true)).toBeNull()
  })

  it('refuses folders that leave no room for a file', () => {
    expect(linkConflict(split, [], `lab-raw/${'a'.repeat(1000)}/`)).toContain('too long')
    expect(linkConflict(split, [], 'lab-raw/2024/')).toBeNull()
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

  it('treats every unfinished state as running', () => {
    const run = { job_id: 'j', started_at: '', imported: 0, skipped: 0, failed: 0, errors: [] }
    for (const state of ['queued', 'ready', 'running', 'cancelling', 'awaiting_key']) {
      expect(runActive({ ...run, state })).toBe(true)
    }
    for (const state of ['succeeded', 'failed', 'cancelled', 'indeterminate']) {
      expect(runActive({ ...run, state })).toBe(false)
    }
  })
})
