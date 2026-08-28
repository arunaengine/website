import {
  apiRequest,
  type CreateSyncRelationshipRequest,
  type SyncReferenceHandling,
  type SyncRelationship,
  type SyncRelationshipDetail,
  type SyncRelationshipListQuery,
  type SyncRelationshipListResponse,
  type SyncRunResponse,
} from '@/lib/api'
import { assertCurrentSession, refreshContext, saving } from './state'

// ── Bucket sync relationships (aruna feat/portal_extensions) ────────────────
// Only relationships created by the caller are listed; run/delete are
// creator-only too. Relationships live on their source node, so every call
// takes an optional baseUrl to address another realm node's API (the bearer
// token is realm-wide, like the S3 credentials).

export async function syncRequest<T>(path: string, options: object, baseUrl?: string): Promise<T> {
  const context = refreshContext()
  const response = await apiRequest<T>(
    path,
    options,
    baseUrl ? { ...context.client, baseUrl } : context.client,
  )
  assertCurrentSession(context.epoch)
  return response
}

export async function listSyncRelationships(
  query: SyncRelationshipListQuery = {},
  opts: { baseUrl?: string } = {},
): Promise<SyncRelationshipListResponse> {
  return syncRequest<SyncRelationshipListResponse>(
    '/data/sync-relationships',
    { query: { bucket: query.bucket, prefix: query.prefix, direction: query.direction } },
    opts.baseUrl,
  )
}

export async function getSyncRelationship(
  id: string,
  opts: { baseUrl?: string } = {},
): Promise<SyncRelationshipDetail> {
  return syncRequest<SyncRelationshipDetail>(
    `/data/sync-relationships/${encodeURIComponent(id)}`,
    {},
    opts.baseUrl,
  )
}

// The source endpoint is always the node that receives the POST (the request
// body carries no source node id). Creating a remote-source relationship
// ("sync to this node") therefore POSTs to the remote node's API base; the
// bearer token is realm-wide, like the S3 credentials. 409 duplicate, 502
// target unreachable, 501 while mode "reference" is unimplemented.
export async function createSyncRelationship(
  input: CreateSyncRelationshipRequest,
  opts: { baseUrl?: string } = {},
): Promise<SyncRelationship> {
  saving.value = true
  try {
    const context = refreshContext()
    const response = await apiRequest<SyncRelationship>(
      '/data/sync-relationships',
      { method: 'POST', body: JSON.stringify(input) },
      opts.baseUrl ? { ...context.client, baseUrl: opts.baseUrl } : context.client,
    )
    assertCurrentSession(context.epoch)
    return response
  } finally {
    saving.value = false
  }
}

// 202: re-runs a "once" relationship / backfills a continuous one; also
// re-enables a failed relationship before queueing.
export async function runSyncRelationship(
  id: string,
  opts: { baseUrl?: string } = {},
): Promise<SyncRunResponse> {
  return syncRequest<SyncRunResponse>(
    `/data/sync-relationships/${encodeURIComponent(id)}/run`,
    { method: 'POST' },
    opts.baseUrl,
  )
}

export async function updateSyncReferenceHandling(
  id: string,
  referenceHandling: SyncReferenceHandling,
  opts: { baseUrl?: string } = {},
): Promise<SyncRelationship> {
  return syncRequest<SyncRelationship>(
    `/data/sync-relationships/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify({ reference_handling: referenceHandling }) },
    opts.baseUrl,
  )
}

export async function deleteSyncRelationship(id: string, opts: { baseUrl?: string } = {}): Promise<void> {
  return syncRequest<void>(
    `/data/sync-relationships/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    opts.baseUrl,
  )
}
