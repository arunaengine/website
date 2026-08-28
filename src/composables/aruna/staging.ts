import {
  type CreateStagingJobResponse,
  type ListStagingJobsResponse,
  type StageBlobResponse,
  type StageBlobSubmission,
  type StagingBatchRequest,
  type StagingBatchResponse,
  type StagingJob,
  type StagingReferenceEntry,
  type StagingReferencesResponse,
} from '@/lib/api'
import { request } from './state'

// Synchronous one-shot staging: the node pulls source_path from the connector
// and materializes it as bucket/key (201 on success). Slow for big blobs;
// callers must show a running state. The axum route is literally "/staging/".
export async function stageBlob(input: StageBlobSubmission): Promise<StageBlobResponse> {
  return request<StageBlobResponse>('/staging/', { method: 'POST', body: JSON.stringify(input) })
}

// Batch staging (agreed contract): many items/prefixes through one connector in
// one call. Older nodes answer 404/501; callers fall back to per-item staging.
export async function stageBatch(input: StagingBatchRequest): Promise<StagingBatchResponse> {
  return request<StagingBatchResponse>('/staging/batch', { method: 'POST', body: JSON.stringify(input) })
}

export async function listStagingJobs(cursor?: string, limit = 50): Promise<ListStagingJobsResponse> {
  return request<ListStagingJobsResponse>('/staging/jobs', { query: { limit, cursor } })
}

export async function createStagingJob(input: StagingBatchRequest): Promise<CreateStagingJobResponse> {
  return request<CreateStagingJobResponse>('/staging/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getStagingJob(jobId: string): Promise<StagingJob> {
  return request<StagingJob>(`/staging/jobs/${encodeURIComponent(jobId)}`)
}

// Reference-backed keys of a bucket (agreed contract, see api.ts). Follows
// next_cursor until the listing is exhausted.
export async function listStagingReferences(
  bucket: string,
  prefix?: string,
  signal?: AbortSignal,
): Promise<StagingReferenceEntry[]> {
  const entries: StagingReferenceEntry[] = []
  let cursor: string | undefined
  do {
    const page = await request<StagingReferencesResponse>('/staging/references', {
      signal,
      query: { bucket, prefix: prefix || undefined, limit: 500, cursor },
    })
    entries.push(...(page.entries ?? []).filter((entry) => entry.referenced))
    cursor = page.next_cursor
  } while (cursor)
  return entries
}
