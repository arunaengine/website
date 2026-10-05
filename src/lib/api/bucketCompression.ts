// The compression setting of a bucket, asked of the bucket's own node. An
// encrypted bucket compresses inside Pithos at the nearest supported level,
// which `effective_level` names.
import { apiRequest, type ApiClientOptions } from './client'

export interface BucketCompressionResponse {
  bucket: string
  mode: 'off' | 'zstd'
  /** The requested zstd level; present only with `zstd`. */
  level?: number
  /** The zstd level Pithos applies in an encrypted bucket; absent when not reported. */
  effective_level?: number
}

export function getBucketCompression(
  bucket: string,
  client: ApiClientOptions,
  signal?: AbortSignal,
): Promise<BucketCompressionResponse> {
  return apiRequest(`/data/buckets/${encodeURIComponent(bucket)}/storage/compression`, { signal }, client)
}
