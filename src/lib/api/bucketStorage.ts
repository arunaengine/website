// Moving a bucket's files to where the storage rules put them, and the check for
// broken files. Group ADMIN starts them. Nodes without the routes answer 404.
import { apiRequest, type ApiClientOptions } from './client'

export interface MoveProgress {
  migrated: number
  skipped: number
  failed: number
  started_at_ms: number
  finished_at_ms?: number | null
}

export interface BucketMoveResponse {
  bucket: string
  /** Files not where the rules put them; a lower bound unless `complete`. */
  misplaced: number
  complete: boolean
  move_prefix?: string | null
  progress?: MoveProgress | null
}

export interface CheckProgress {
  checked: number
  broken: number
  failed: number
  started_at_ms: number
  finished_at_ms?: number | null
}

export type BrokenReason = 'missing_record' | 'storage_removed' | 'missing_blob'

export interface BrokenFile {
  key: string
  version_id: string
  reason: BrokenReason
  found_at_ms: number
}

export interface BucketCheckResponse {
  bucket: string
  progress?: CheckProgress | null
  broken: BrokenFile[]
  next?: string | null
}

export interface BucketCleanupResponse {
  bucket: string
  deleted: number
  kept: number
  more: boolean
}

function storagePath(bucket: string, tail: string): string {
  return `/data/buckets/${encodeURIComponent(bucket)}/storage/${tail}`
}

export function getBucketMove(
  bucket: string,
  prefix: string,
  client: ApiClientOptions,
): Promise<BucketMoveResponse> {
  return apiRequest(storagePath(bucket, 'move'), { query: { prefix } }, client)
}

export function startBucketMove(bucket: string, prefix: string, client: ApiClientOptions): Promise<unknown> {
  return apiRequest(storagePath(bucket, 'move'), { method: 'POST', body: JSON.stringify({ prefix }) }, client)
}

export function getBucketCheck(
  bucket: string,
  query: { after?: string; limit?: number },
  client: ApiClientOptions,
): Promise<BucketCheckResponse> {
  return apiRequest(storagePath(bucket, 'check'), { query }, client)
}

export function startBucketCheck(bucket: string, client: ApiClientOptions): Promise<CheckProgress> {
  return apiRequest(storagePath(bucket, 'check'), { method: 'POST' }, client)
}

export function cleanBucketCheck(bucket: string, client: ApiClientOptions): Promise<BucketCleanupResponse> {
  return apiRequest(storagePath(bucket, 'check/cleanup'), { method: 'POST' }, client)
}
