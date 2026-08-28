import { ApiError, apiRequest, type ApiClientOptions } from './api'
import { errorMessage } from './utils'

export type StorageDeletionScope =
  | { kind: 'file'; bucket: string; key: string }
  | { kind: 'prefix'; bucket: string; prefix: string }
  | { kind: 'bucket'; bucket: string }

export interface StorageDeletionPreflightOptions {
  limit?: number
  version_key_marker?: string
  version_id_marker?: string
  multipart_key_marker?: string
  multipart_upload_id_marker?: string
}

export interface StorageDeletionCounts {
  current_heads: number
  noncurrent_versions: number
  delete_markers: number
  open_multipart_uploads: number
  complete: boolean
}

export interface StorageDeletionPermissions {
  read: boolean
  purge: boolean
}

export interface StorageDeletionTruncation {
  truncated: boolean
  versions_truncated: boolean
  next_version_key_marker?: string
  next_version_id_marker?: string
  multipart_uploads_truncated: boolean
  next_multipart_key_marker?: string
  next_multipart_upload_id_marker?: string
}

export interface StorageDeletionSyncRelationship {
  relationship_id: string
  direction: string
  source: string
  target: string
  action: string
  blocker: boolean
}

export interface StorageDeletionReferenceCoverage {
  complete: boolean
  hidden_references_exist: boolean | null
  queried_nodes: number
  failed_nodes: number
  index_freshness: string
  excluded: string[]
}

export interface StorageDeletionPreflight {
  scope: StorageDeletionScope
  counts: StorageDeletionCounts
  sync_relationships_apply_to_bucket_delete: boolean
  sync_relationships: StorageDeletionSyncRelationship[]
  permissions: StorageDeletionPermissions
  truncation: StorageDeletionTruncation
  reference_coverage: StorageDeletionReferenceCoverage
}

export interface StoragePurgeOperation {
  scope: StorageDeletionScope
  idempotencyKey: string
}

export interface StoragePurgeSubmission {
  job_id: string
  created: boolean
  status_url: string
}

export type StoragePurgeJobState =
  | 'queued'
  | 'claimed'
  | 'preparing'
  | 'ready'
  | 'running'
  | 'cancelling'
  | 'indeterminate'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface StoragePurgeProgress {
  current: number
  total?: number
  unit: string
}

export interface StoragePurgeJobError {
  message: string
  kind: string
}

export interface StoragePurgeResult {
  scope: StorageDeletionScope
  versions_removed: number
  multipart_uploads_removed: number
  batches_completed: number
  bucket_deleted: boolean
  emptiness_proven: boolean
}

export interface StoragePurgeJobStatus {
  job_id: string
  kind: string
  state: StoragePurgeJobState
  attempts: number
  cancel_requested: boolean
  created_at: string
  updated_at: string
  finished_at?: string
  progress: StoragePurgeProgress
  error?: StoragePurgeJobError
  result?: StoragePurgeResult
  workspace_bucket?: string
  workspace_mode: string
  run_crate?: unknown
  family?: unknown
}

export function createStoragePurgeOperation(
  scope: StorageDeletionScope,
  idempotencyKey?: string,
): StoragePurgeOperation {
  if (idempotencyKey) return { scope, idempotencyKey }
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return {
    scope,
    idempotencyKey: `storage-purge-${scope.kind}-${nonce}`,
  }
}

export function getStorageDeletionPreflight(
  scope: StorageDeletionScope,
  client: ApiClientOptions,
  options: StorageDeletionPreflightOptions = {},
): Promise<StorageDeletionPreflight> {
  return apiRequest<StorageDeletionPreflight>(
    '/storage/deletion-preflight',
    { method: 'POST', body: JSON.stringify({ scope, ...options }) },
    client,
  )
}

export function startStoragePurge(
  operation: StoragePurgeOperation,
  client: ApiClientOptions,
): Promise<StoragePurgeSubmission> {
  return apiRequest<StoragePurgeSubmission>(
    '/storage/purge-jobs',
    {
      method: 'POST',
      body: JSON.stringify({
        scope: operation.scope,
        idempotency_key: operation.idempotencyKey,
      }),
    },
    client,
  )
}

export function getStoragePurgeJob(
  jobId: string,
  client: ApiClientOptions,
): Promise<StoragePurgeJobStatus> {
  return apiRequest<StoragePurgeJobStatus>(`/jobs/${encodeURIComponent(jobId)}`, {}, client)
}

export function retainStoragePurgeProgress(
  retained: StoragePurgeProgress | null,
  next: StoragePurgeProgress,
): StoragePurgeProgress {
  if (!retained) return { ...next }
  return {
    current: Math.max(retained.current, next.current),
    total:
      retained.total == null
        ? next.total
        : next.total == null
          ? retained.total
          : Math.max(retained.total, next.total),
    unit: next.unit || retained.unit,
  }
}

export function isTerminalStoragePurgeJob(state: StoragePurgeJobState): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled'
}

export function isStorageDeletionNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

export function storageDeletionErrorMessage(error: unknown): string {
  return errorMessage(error)
}
