import {
  getBucketUsage as requestBucketUsage,
  type BlobLocationsResponse,
  type BucketRoutingResponse,
  type BucketUsageResponse,
  type GroupRoutingResponse,
  type ReplicateBlobRequest,
  type ReplicateBlobResponse,
  type RoutingTarget,
  type StorageRoutingRule,
} from '@/lib/api'
import { refreshContext, request, saving } from './state'

// ── Storage routing (group default and per-bucket rules) ────────────────────

export async function getGroupRouting(groupId: string): Promise<GroupRoutingResponse> {
  return request<GroupRoutingResponse>(`/data/groups/${groupId}/storage/routing`)
}

// An omitted target clears the group default, falling back to node routing.
export async function putGroupRouting(
  groupId: string,
  target: RoutingTarget | null,
): Promise<GroupRoutingResponse> {
  saving.value = true
  try {
    return await request<GroupRoutingResponse>(`/data/groups/${groupId}/storage/routing`, {
      method: 'PUT',
      body: JSON.stringify(target ? { default_target: target } : {}),
    })
  } finally {
    saving.value = false
  }
}

export async function getBucketRouting(bucket: string): Promise<BucketRoutingResponse> {
  return request<BucketRoutingResponse>(`/data/buckets/${encodeURIComponent(bucket)}/storage/routing`)
}

/** What the serving node counts in one bucket; 404 means the node lacks the route. */
export function getBucketUsage(bucket: string): Promise<BucketUsageResponse> {
  return requestBucketUsage(bucket, refreshContext().client)
}

export async function putBucketRouting(
  bucket: string,
  rules: StorageRoutingRule[],
): Promise<BucketRoutingResponse> {
  saving.value = true
  try {
    return await request<BucketRoutingResponse>(
      `/data/buckets/${encodeURIComponent(bucket)}/storage/routing`,
      { method: 'PUT', body: JSON.stringify({ rules }) },
    )
  } finally {
    saving.value = false
  }
}

// Where the copies of one object version physically live. Omitting versionId
// asks about the current version; the response names the one it resolved.
export async function getBlobLocations(
  bucket: string,
  path: string,
  versionId?: string,
): Promise<BlobLocationsResponse> {
  return request<BlobLocationsResponse>('/data/blobs/locations', {
    query: { bucket, path, version_id: versionId },
  })
}

// Asks one node to fetch a copy. Answered 202: the copy is queued, not stored
// yet. Needs WRITE on the object, or on the bucket when `path` is omitted.
export async function replicateBlob(input: ReplicateBlobRequest): Promise<ReplicateBlobResponse> {
  return request<ReplicateBlobResponse>('/data/blobs/replicate', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
