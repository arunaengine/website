// ── Bucket usage ────────────────────────────────────────────────────────────
// GET /data/buckets/{bucket}/usage: what one bucket holds, counted by the node
// that serves it. Node-local like the other bucket routes, so it is asked of
// the bucket's own node and carries no node parameter. A node that does not
// serve the route yet answers 404, which means "not available here", not "empty".
import { apiRequest, type ApiClientOptions } from './client'

export interface BucketUsageResponse {
  bucket: string
  /** Current heads only. */
  objects: number
  /** Stored versions including noncurrent ones; delete markers excluded. */
  versions: number
  delete_markers: number
  open_multipart_uploads: number
  /** Bytes over all stored versions. */
  logical_bytes: number
  /** False when the scan hit its cap: every number is a lower bound. */
  complete: boolean
}

export function getBucketUsage(
  bucket: string,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<BucketUsageResponse> {
  return apiRequest<BucketUsageResponse>(
    `/data/buckets/${encodeURIComponent(bucket)}/usage`,
    { signal },
    client,
  )
}
