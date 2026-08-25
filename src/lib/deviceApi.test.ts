import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import {
  entryExpectation,
  entryPending,
  isDeviceUnsupported,
  isStaleExpectation,
  readCompute,
  readEntry,
  readFolder,
  readTransfer,
} from './deviceApi'

describe('folder mapping', () => {
  it('keeps the binding and the counters the node reported', () => {
    const folder = readFolder({
      folder_id: 'f1',
      root: '/home/me/data',
      local_bucket: 'dev-data',
      group_id: 'g1',
      remote: { node_id: 'n1', bucket: 'lab', prefix: 'raw/' },
      mode: 'upload_only',
      propagate_deletes: false,
      state: 'paused',
      counters: { in_sync: 4, conflicts: 2, pending_replacements: 1 },
      last_reconcile_ms: 1_700_000,
    })

    expect(folder.remote).toEqual({ node_id: 'n1', bucket: 'lab', prefix: 'raw/' })
    expect(folder.mode).toBe('upload_only')
    expect(folder.propagate_deletes).toBe(false)
    expect(folder.state).toBe('paused')
    expect(folder.counters.conflicts).toBe(2)
    expect(folder.counters.errors).toBe(0)
  })

  it('defaults a folder the node described only in part', () => {
    // The routes ship in stages, so a thin answer must still be renderable.
    const folder = readFolder({ folder_id: 'f2', root: '/tmp/x' })

    expect(folder.mode).toBe('two_way')
    expect(folder.propagate_deletes).toBe(true)
    expect(folder.state).toBe('active')
    expect(folder.counters.in_sync).toBe(0)
    expect(folder.last_reconcile_ms).toBeNull()
  })

  it('refuses to invent a state it does not know', () => {
    expect(readFolder({ state: 'melting' }).state).toBe('active')
    expect(readEntry({ path: 'a.txt', state: 'sideways' }).state).toBe('error')
  })
})

describe('entry mapping', () => {
  it('carries both sides and the reason a replacement waits', () => {
    const entry = readEntry({
      path: 'notes/day.md',
      state: 'pending_replace',
      reason: 'base_unknown',
      local: { size: 12, modified_at_ms: 5, fingerprint: 'fp1', blake3: 'aa' },
      remote: { size: 40, modified_at_ms: 9, fingerprint: 'fp2', blake3: 'bb', version_id: 'v2' },
      conflicted_copy: 'notes/day (conflicted copy 2026-08-25 1200, realm).md',
    })

    expect(entry.local?.size).toBe(12)
    expect(entry.remote?.version_id).toBe('v2')
    expect(entry.reason).toBe('base_unknown')
    expect(entry.conflicted_copy).toContain('conflicted copy')
    expect(entryPending(entry)).toBe(true)
  })

  it('marks only the states that wait for a decision', () => {
    const pending = ['conflict', 'pending_replace', 'remote_deleted', 'error']
    const automatic = ['in_sync', 'local_new', 'local_changed', 'remote_new', 'remote_changed']

    for (const state of pending) expect(entryPending(readEntry({ path: 'p', state }))).toBe(true)
    for (const state of automatic) expect(entryPending(readEntry({ path: 'p', state }))).toBe(false)
  })

  it('drops a side the node did not describe', () => {
    const entry = readEntry({ path: 'new.bin', state: 'remote_new', remote: { size: 3 } })

    expect(entry.local).toBeNull()
    expect(entry.remote).toEqual({
      size: 3,
      modified_at_ms: null,
      fingerprint: null,
      blake3: null,
      version_id: null,
    })
  })

  it('demands both local hashes before anything may touch the file', () => {
    const hashed = readEntry({
      path: 'a.bin',
      state: 'conflict',
      local: { fingerprint: 'fp1', blake3: 'aa' },
      remote: { version_id: 'v3' },
    })

    expect(entryExpectation(hashed)).toEqual({ fingerprint: 'fp1', blake3: 'aa', remote_version: 'v3' })
    expect(entryExpectation(readEntry({ path: 'b.bin', state: 'conflict', local: { blake3: 'aa' } }))).toBeNull()
    expect(entryExpectation(readEntry({ path: 'c.bin', state: 'remote_new' }))).toBeNull()
  })

  it('leaves out a remote version the entry does not name', () => {
    const local = readEntry({ path: 'd.bin', state: 'local_changed', local: { fingerprint: 'fp', blake3: 'bb' } })

    expect(entryExpectation(local)).toEqual({ fingerprint: 'fp', blake3: 'bb' })
  })
})

describe('transfer and compute mapping', () => {
  it('falls back to the list a transfer came from', () => {
    expect(readTransfer({ id: 't1', path: 'a' }, 'download').direction).toBe('download')
    expect(readTransfer({ id: 't2', path: 'a', direction: 'upload' }, 'download').direction).toBe('upload')
  })

  it('reads compute as off until the node says otherwise', () => {
    const off = readCompute({})
    expect(off.enabled).toBe(false)
    expect(off.backend).toBeNull()
    expect(off.caps.max_concurrent).toBeNull()

    const on = readCompute({ enabled: true, backend: 'docker', caps: { cpu_cores: 4 }, running: 1, paused: true })
    expect(on.enabled).toBe(true)
    expect(on.caps.cpu_cores).toBe(4)
    expect(on.running).toBe(1)
    expect(on.paused).toBe(true)
  })
})

describe('failure classification', () => {
  it('treats an absent route as not served here', () => {
    expect(isDeviceUnsupported(new ApiError(404, 'nope'))).toBe(true)
    expect(isDeviceUnsupported(new ApiError(501, 'nope'))).toBe(true)
    expect(isDeviceUnsupported(new ApiError(500, 'boom'))).toBe(false)
  })

  it('names a refused action whose hashes went stale', () => {
    expect(isStaleExpectation(new ApiError(412, 'drifted'))).toBe(true)
    expect(isStaleExpectation(new ApiError(409, 'other'))).toBe(false)
  })
})
