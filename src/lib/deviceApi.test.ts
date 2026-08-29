import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import {
  bindFolder,
  deviceSyncStatus,
  entryExpectation,
  isDeviceUnsupported,
  isStaleExpectation,
  readAction,
  readCompute,
  readDraft,
  readEntry,
  readFolder,
  readTransfer,
  requireDevice,
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
      counters: { in_sync: 4, observed: 7, conflicts: 2, pending_replacements: 1 },
      last_reconcile_ms: 1_700_000,
      last_error: 'the bucket "lab" does not exist on node n1',
      last_error_at_ms: 1_700_001,
    })

    expect(folder.remote).toEqual({ node_id: 'n1', bucket: 'lab', prefix: 'raw/' })
    expect(folder.mode).toBe('upload_only')
    expect(folder.propagate_deletes).toBe(false)
    expect(folder.state).toBe('paused')
    expect(folder.counters.conflicts).toBe(2)
    expect(folder.counters.errors).toBe(0)
    expect(folder.counters.observed).toBe(7)
    expect(folder.last_error).toBe('the bucket "lab" does not exist on node n1')
    expect(folder.last_error_at_ms).toBe(1_700_001)
  })

  it('defaults a folder the node described only in part', () => {
    // The routes ship in stages, so a thin answer must still be renderable.
    const folder = readFolder({ folder_id: 'f2', root: '/tmp/x' })

    expect(folder.mode).toBe('two_way')
    expect(folder.propagate_deletes).toBe(true)
    expect(folder.state).toBe('active')
    expect(folder.counters.in_sync).toBe(0)
    expect(folder.counters.observed).toBe(0)
    expect(folder.last_reconcile_ms).toBeNull()
    expect(folder.last_error).toBeNull()
    expect(folder.last_error_at_ms).toBeNull()
  })

  it('refuses to invent a state it does not know', () => {
    expect(readFolder({ state: 'deleting' }).state).toBe('deleting')
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
    expect(off.healthy).toBe(false)
    expect(off.limits.max_concurrent).toBeNull()

    const on = readCompute({
      enabled: true,
      backend: 'docker',
      healthy: true,
      limits: { max_cpu_cores: 4, max_ram_bytes: 8_000_000_000 },
      running: 1,
      paused: true,
    })
    expect(on.enabled).toBe(true)
    expect(on.healthy).toBe(true)
    expect(on.limits.max_cpu_cores).toBe(4)
    expect(on.limits.max_ram_bytes).toBe(8_000_000_000)
    expect(on.running).toBe(1)
    expect(on.paused).toBe(true)
  })

  it('reads a draft as the node stores it', () => {
    const draft = readDraft({
      draft_id: 'd1',
      group_id: 'g1',
      path: 'datasets/field-notes',
      public: true,
      status: 'pending',
      document_id: null,
      created_at_ms: 1_700_000,
    })

    expect(draft).toEqual({
      draft_id: 'd1',
      group_id: 'g1',
      path: 'datasets/field-notes',
      public: true,
      status: 'pending',
      document_id: null,
      created_at_ms: 1_700_000,
    })
    expect(readDraft({}).path).toBe('')
    expect(readDraft({}).public).toBe(false)
  })
})

describe('action audit', () => {
  it('reads the scope the node recorded', () => {
    expect(readAction({ action: 'replace_local', scope: 'all_pending', confirm: 'x' }).scope).toBe('all_pending')
    expect(readAction({ action: 'keep_local' }).scope).toBe('entry')
    expect(readAction({ action: 'keep_local', scope: 'folder' }).scope).toBe('entry')
  })
})

describe('device client', () => {
  it('refuses instead of falling back to the realm API', () => {
    // A device surface with no node must never list the realm's data as local.
    expect(() => requireDevice(null, 'its runs')).toThrow(/not running/)
    expect(() => requireDevice(undefined, 'its folders')).toThrow(/its folders/)
  })

  it('hands back the local node client when there is one', () => {
    const client = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' }
    expect(requireDevice(client, 'its runs')).toBe(client)
  })
})

describe('bind request wire shape', () => {
  it('flattens the remote binding', async () => {
    // The node deserializes a flat body with deny_unknown_fields: a nested
    // `remote` object is answered with 422 before the handler runs.
    const request = vi.spyOn(await import('./api'), 'apiRequest').mockResolvedValue({})
    const client = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' }
    await bindFolder(
      {
        root: '/home/me/data',
        group_id: 'g1',
        remote: { node_id: 'n1', bucket: 'lab', prefix: 'raw/' },
        create_bucket: true,
        mode: 'two_way',
        propagate_deletes: true,
      },
      client,
    )
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body))
    expect(body).toEqual({
      root: '/home/me/data',
      group_id: 'g1',
      remote_node_id: 'n1',
      remote_bucket: 'lab',
      remote_prefix: 'raw/',
      create_bucket: true,
      mode: 'two_way',
      propagate_deletes: true,
    })
    request.mockRestore()
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

describe('sync dataset mapping', () => {
  it('keeps an active dataset active', async () => {
    const request = vi.spyOn(await import('./api'), 'apiRequest').mockResolvedValue({
      datasets: [
        { folderId: 'f1', state: 'active', unsyncedFiles: 4, lastError: 'retrying' },
        { folderId: 'f2', state: 'deleting' },
      ],
    })
    const client = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner-token' }

    const status = await deviceSyncStatus(client)

    expect(status.datasets[0]?.state).toBe('active')
    expect(status.datasets[0]?.unsyncedFiles).toBe(4)
    expect(status.datasets[0]?.lastError).toBe('retrying')
    expect(status.datasets[1]?.state).toBe('deleting')
    request.mockRestore()
  })
})
