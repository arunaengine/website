import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiRequest = vi.hoisted(() => vi.fn())

vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  apiRequest,
}))

import {
  createStoragePurgeOperation,
  getStorageDeletionPreflight,
  getStoragePurgeJob,
  isTerminalStoragePurgeJob,
  retainStoragePurgeProgress,
  startStoragePurge,
  type StorageDeletionPreflight,
  type StoragePurgeJobStatus,
} from './storageDeletion'

const client = { baseUrl: 'https://node.test/api/v1', token: 'bearer' }
const scope = { kind: 'prefix', bucket: 'bucket-a', prefix: 'folder/' } as const

const preflight: StorageDeletionPreflight = {
  scope,
  counts: {
    current_heads: 4,
    noncurrent_versions: 7,
    delete_markers: 2,
    open_multipart_uploads: 1,
    complete: false,
  },
  sync_relationships_apply_to_bucket_delete: false,
  sync_relationships: [],
  permissions: { read: true, purge: true },
  truncation: {
    truncated: true,
    versions_truncated: true,
    next_version_key_marker: 'folder/more.txt',
    next_version_id_marker: '01VERSION',
    multipart_uploads_truncated: false,
  },
  reference_coverage: {
    complete: false,
    hidden_references_exist: null,
    queried_nodes: 0,
    failed_nodes: 0,
    index_freshness: 'not_evaluated',
    excluded: ['realm_backlink_fanout_unavailable'],
  },
}

beforeEach(() => {
  apiRequest.mockReset()
})

describe('storage deletion adapter', () => {
  it('posts the tagged scope and bounded preflight cursors without changing api.ts', async () => {
    apiRequest.mockResolvedValueOnce(preflight)

    await expect(
      getStorageDeletionPreflight(scope, client, {
        limit: 1000,
        version_key_marker: 'folder/next.txt',
        version_id_marker: '01NEXT',
      }),
    ).resolves.toBe(preflight)

    expect(apiRequest).toHaveBeenCalledWith(
      '/storage/deletion-preflight',
      {
        method: 'POST',
        body: JSON.stringify({
          scope,
          limit: 1000,
          version_key_marker: 'folder/next.txt',
          version_id_marker: '01NEXT',
        }),
      },
      client,
    )
  })

  it('keeps an idempotency key bound to its scope across a lost-response retry', async () => {
    const operation = createStoragePurgeOperation(scope, 'storage-purge-prefix-retry-1')
    apiRequest.mockResolvedValue({
      job_id: '01JOB',
      created: true,
      status_url: 'https://node.test/api/v1/jobs/01JOB',
    })

    await startStoragePurge(operation, client)
    await startStoragePurge(operation, client)

    expect(apiRequest).toHaveBeenCalledTimes(2)
    for (const call of apiRequest.mock.calls) {
      expect(call).toEqual([
        '/storage/purge-jobs',
        {
          method: 'POST',
          body: JSON.stringify({
            scope,
            idempotency_key: 'storage-purge-prefix-retry-1',
          }),
        },
        client,
      ])
    }
  })

  it('reads storage-purge entry progress and retains committed work on later failure', async () => {
    const failed: StoragePurgeJobStatus = {
      job_id: '01JOB',
      kind: 'storage_purge',
      state: 'failed',
      attempts: 3,
      cancel_requested: false,
      created_at: '2026-08-19T10:00:00Z',
      updated_at: '2026-08-19T10:01:00Z',
      finished_at: '2026-08-19T10:01:00Z',
      progress: { current: 1000, total: 2401, unit: 'entries' },
      error: { kind: 'retryable', message: 'later batch failed' },
      workspace_mode: 'temporary',
    }
    apiRequest.mockResolvedValueOnce(failed)

    await expect(getStoragePurgeJob('01JOB', client)).resolves.toBe(failed)
    expect(apiRequest).toHaveBeenCalledWith('/jobs/01JOB', {}, client)
    expect(
      retainStoragePurgeProgress(
        { current: 1000, total: 2401, unit: 'entries' },
        { current: 0, total: 2401, unit: 'entries' },
      ),
    ).toEqual({ current: 1000, total: 2401, unit: 'entries' })
    expect(isTerminalStoragePurgeJob(failed.state)).toBe(true)
    expect(isTerminalStoragePurgeJob('running')).toBe(false)
  })
})
