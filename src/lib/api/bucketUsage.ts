// ── Bucket usage ────────────────────────────────────────────────────────────
// GET /data/buckets/{bucket}/usage: what one bucket holds, counted by the node
// that serves it. It is asked of the bucket's own node and carries no node
// parameter; any member of a distributed bucket sums every range. A node that
// does not serve the route yet answers 404: "not available here", not "empty".
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
  /** Bytes reachable only through external references; absent on older nodes. */
  referenced_bytes?: number
  /** False while a count is not whole: every number is a lower bound. */
  complete: boolean
  /** Ranges of a distributed bucket and how many of them were counted. */
  ranges?: number
  ranges_counted?: number
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
