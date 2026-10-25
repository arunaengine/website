import {
  changeSettings as requestSettings,
  createDistributedBucket as requestCreate,
  deleteSet as requestDeleteSet,
  joinMember as requestJoin,
  leaveMember as requestLeave,
  transferRange as requestTransfer,
  getBucketLinks as requestLinks,
  getBucketSources as requestSources,
  getFilePartOf as requestPartOf,
  getFileOrigin as requestOrigin,
  getPartTarget as requestTarget,
  getDataLinks as requestDataLinks,
  getBucketDistribution as requestDistribution,
  getBucketUsage as requestBucketUsage,
  retryAdmission as requestRetry,
  type AdmissionResponse,
  type ChangeResponse,
  type JoinMemberRequest,
  type SettingsBody,
  type TransferRangeRequest,
  type BlobLocationsResponse,
  type BucketRoutingResponse,
  type BucketLinksQuery,
  type BucketUsageResponse,
  type CreateDistributedRequest,
  type DataLinksResponse,
  type DistributedResponse,
  type FileSourcesResponse,
  type OriginResponse,
  type PartOfResponse,
  type PartTargetResponse,
  type GroupRoutingResponse,
  type ReplicateBlobRequest,
  type ReplicateBlobResponse,
  type RoutingTarget,
  type StorageRoutingRule,
} from '@/lib/api'
import { getStorageDeletionPreflight, type StorageDeletionPreflight } from '@/lib/storageDeletion'
import { refreshContext, request, saving } from './state'

// ── Storage routing (group default and per-bucket rules) ────────────────────

export async function getGroupRouting(groupId: string): Promise<GroupRoutingResponse> {
  return request<GroupRoutingResponse>(`/data/groups/${groupId}/storage/routing`)
}

// An omitted target clears the group default, falling back to node routing. `bucket` names
// the shared bucket on a storage without a fixed bucket; the node finds or creates it.
// `bucketTemplate` gives each new bucket its own S3 bucket; "" clears it.
export async function putGroupRouting(
  groupId: string,
  target: RoutingTarget | null,
  bucket?: string,
  bucketTemplate?: string,
): Promise<GroupRoutingResponse> {
  saving.value = true
  try {
    const extra = { ...(bucket ? { bucket } : {}), ...(bucketTemplate !== undefined ? { bucket_template: bucketTemplate } : {}) }
    const body = target ? { default_target: target, ...extra } : {}
    return await request<GroupRoutingResponse>(`/data/groups/${groupId}/storage/routing`, {
      method: 'PUT',
      body: JSON.stringify(body),
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

/** What deleting a whole bucket removes; a bucket stored on more nodes also lists the datasets that link it. */
export function getSetDeletion(bucket: string): Promise<StorageDeletionPreflight> {
  return getStorageDeletionPreflight({ kind: 'bucket', bucket }, refreshContext().client)
}

/** Datasets that link a file, a folder or the root of a bucket on this node. */
export function getBucketLinks(bucket: string, query: BucketLinksQuery, signal?: AbortSignal): Promise<DataLinksResponse> {
  return requestLinks(bucket, query, refreshContext().client, signal)
}

/** Where one file version of a bucket on this node came from. */
export function getFileOrigin(bucket: string, query: { key: string; version_id?: string }, signal?: AbortSignal): Promise<OriginResponse> {
  return requestOrigin(bucket, query, refreshContext().client, signal)
}

/** The datasets whose linked parts contain a file of a bucket on this node. */
export function getFilePartOf(bucket: string, key: string, signal?: AbortSignal): Promise<PartOfResponse> {
  return requestPartOf(bucket, key, refreshContext().client, signal)
}

/** The incoming syncs and storage folders of a bucket on this node. */
export function getBucketSources(bucket: string, signal?: AbortSignal): Promise<FileSourcesResponse> {
  return requestSources(bucket, refreshContext().client, signal)
}

/** The bucket and folder a linked part covers. */
export function getPartTarget(id: string, signal?: AbortSignal): Promise<PartTargetResponse> {
  return requestTarget(id, refreshContext().client, signal)
}

/** The datasets that name one Aruna data identifier. */
export function getDataLinks(id: string, query: { parts_only?: boolean; after?: string; limit?: number } = {}, signal?: AbortSignal): Promise<DataLinksResponse> {
  return requestDataLinks(id, query, refreshContext().client, signal)
}

/** The set a bucket on this node belongs to; 404 means an ordinary bucket. */
export function getBucketDistribution(bucket: string, signal?: AbortSignal): Promise<DistributedResponse> {
  return requestDistribution(bucket, refreshContext().client, signal)
}

/** Group ADMIN: creates one bucket on several nodes with this node as publisher. */
export async function createDistributedBucket(
  groupId: string,
  body: CreateDistributedRequest,
): Promise<AdmissionResponse> {
  saving.value = true
  try {
    return await requestCreate(groupId, body, refreshContext().client)
  } finally {
    saving.value = false
  }
}

async function change<T>(work: (client: ReturnType<typeof refreshContext>['client']) => Promise<T>): Promise<T> {
  saving.value = true
  try {
    return await work(refreshContext().client)
  } finally {
    saving.value = false
  }
}

/** Group ADMIN: adds a node to an active bucket stored on more nodes. */
export const joinDistributedMember = (groupId: string, setId: string, body: JoinMemberRequest): Promise<AdmissionResponse> =>
  change((client) => requestJoin(groupId, setId, body, client))

/** Group ADMIN: marks a member leaving. */
export const leaveDistributedMember = (groupId: string, setId: string, memberId: string): Promise<ChangeResponse> =>
  change((client) => requestLeave(groupId, setId, memberId, client))

/** Group ADMIN: opens a fenced transfer of one range. */
export const transferDistributedRange = (groupId: string, setId: string, body: TransferRangeRequest): Promise<ChangeResponse> =>
  change((client) => requestTransfer(groupId, setId, body, client))

/** Group ADMIN: replaces the bucket-wide settings. */
export const changeDistributedSettings = (groupId: string, setId: string, body: SettingsBody): Promise<ChangeResponse> =>
  change((client) => requestSettings(groupId, setId, body, client))

/** Group ADMIN: deletes the set with every member bucket. */
export const deleteDistributedBucket = (groupId: string, setId: string): Promise<ChangeResponse> =>
  change((client) => requestDeleteSet(groupId, setId, client))

/** Asks the members that are not admitted yet to admit again. */
export async function retryDistributedAdmission(groupId: string, setId: string): Promise<AdmissionResponse> {
  saving.value = true
  try {
    return await requestRetry(groupId, setId, refreshContext().client)
  } finally {
    saving.value = false
  }
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
