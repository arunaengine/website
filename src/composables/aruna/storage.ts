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
  getVersionOrigin as requestVersionOrigin,
  getRun as requestRun,
  downloadProvenanceCrate as requestProvenanceCrate,
  getBucketRuns as requestBucketRuns,
  type BucketRunsResponse,
  type RunResponse,
  resolveVersion as requestResolve,
  getPartTarget as requestTarget,
  getDataLinks as requestDataLinks,
  getBucketDistribution as requestDistribution,
  getBucketUsage as requestBucketUsage,
  createArchiveLink as requestArchiveLink,
  apiUrl,
  type ArchiveEntry,
  listBucketObjects as requestObjects,
  type ObjectListResponse,
  retryAdmission as requestRetry,
  type AdmissionResponse,
  type ChangeResponse,
  type JoinMemberRequest,
  type SettingsBody,
  type TransferRangeRequest,
  type VersionStream,
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
import { nodeClientReady, refreshContext, request, saving } from './state'

// ── Storage routing (group default and per-bucket rules) ────────────────────

export async function getGroupRouting(groupId: string, nodeId?: string | null): Promise<GroupRoutingResponse> {
  return request<GroupRoutingResponse>(`/data/groups/${groupId}/storage/routing`, {}, nodeId)
}

// An omitted target clears the group default, falling back to node routing. `bucket` names
// the shared bucket on a storage without a fixed bucket; the node finds or creates it.
// `bucketTemplate` gives each new bucket its own S3 bucket; "" clears it.
export async function putGroupRouting(
  groupId: string,
  target: RoutingTarget | null,
  bucket?: string,
  bucketTemplate?: string,
  nodeId?: string | null,
): Promise<GroupRoutingResponse> {
  saving.value = true
  try {
    const extra = { ...(bucket ? { bucket } : {}), ...(bucketTemplate !== undefined ? { bucket_template: bucketTemplate } : {}) }
    const body = target ? { default_target: target, ...extra } : {}
    return await request<GroupRoutingResponse>(`/data/groups/${groupId}/storage/routing`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }, nodeId)
  } finally {
    saving.value = false
  }
}

export async function getBucketRouting(bucket: string, nodeId?: string | null): Promise<BucketRoutingResponse> {
  return request<BucketRoutingResponse>(`/data/buckets/${encodeURIComponent(bucket)}/storage/routing`, {}, nodeId)
}

/** What the serving node counts in one bucket; 404 means the node lacks the route. */
export async function getBucketUsage(bucket: string, nodeId?: string | null): Promise<BucketUsageResponse> {
  return requestBucketUsage(bucket, await nodeClientReady(nodeId))
}

/** A single-use ZIP download URL from the node that holds the buckets, resolved against its API base. */
export async function archiveLink(entries: ArchiveEntry[], nodeId?: string | null): Promise<string> {
  const client = await nodeClientReady(nodeId)
  const link = await requestArchiveLink(entries, client)
  return new URL(link.path, apiUrl('/', {}, client)).href
}

/** One page of a bucket's current objects with their versions, listed by the bucket's node. */
export async function listBucketObjects(
  bucket: string,
  query: { prefix?: string; delimiter?: string; cursor?: string; limit?: number },
  nodeId?: string | null,
  signal?: AbortSignal,
): Promise<ObjectListResponse> {
  return requestObjects(bucket, query, await nodeClientReady(nodeId, undefined, signal), signal)
}

/**
 * What deleting a whole bucket removes; a bucket stored on more nodes also lists the datasets that
 * link it. `nodeId` names a member to ask when the connected node holds no part of the bucket.
 */
export async function getSetDeletion(bucket: string, nodeId?: string | null): Promise<StorageDeletionPreflight> {
  return getStorageDeletionPreflight({ kind: 'bucket', bucket }, nodeId ? await nodeClientReady(nodeId) : refreshContext().client)
}

/** Datasets that link a file, a folder or the root of a bucket on one node, this one unless named. */
export async function getBucketLinks(bucket: string, query: BucketLinksQuery, signal?: AbortSignal, nodeId?: string | null): Promise<DataLinksResponse> {
  return requestLinks(bucket, query, await nodeClientReady(nodeId, undefined, signal), signal)
}

/** Where one file version of a bucket on one node came from, this one unless named. */
export async function getFileOrigin(bucket: string, query: { key: string; version_id?: string }, signal?: AbortSignal, nodeId?: string | null): Promise<OriginResponse> {
  return requestOrigin(bucket, query, nodeId ? await nodeClientReady(nodeId, undefined, signal) : refreshContext().client, signal)
}

/** The origin of an exact version id, read on the node that holds it. */
export function getVersionOrigin(version: string, signal?: AbortSignal): Promise<OriginResponse> {
  return requestVersionOrigin(version, refreshContext().client, signal)
}

export function getRun(runId: string, signal?: AbortSignal): Promise<RunResponse> {
  return requestRun(runId, refreshContext().client, signal)
}

/** The runs that wrote into a bucket or folder, asked on the node that holds the bucket. */
export async function getBucketRuns(bucket: string, prefix: string, nodeId?: string | null, signal?: AbortSignal): Promise<BucketRunsResponse> {
  return requestBucketRuns(bucket, prefix, await nodeClientReady(nodeId, undefined, signal), signal)
}

export function downloadProvenanceCrate(start: { version: string } | { dataset: string }, signal?: AbortSignal): Promise<Blob> {
  return requestProvenanceCrate(start, refreshContext().client, signal)
}

/** The bytes of a global version id, which the node serves or fetches from a holder. */
export function resolveVersion(realmId: string, versionId: string, signal?: AbortSignal): Promise<VersionStream> {
  return requestResolve(realmId, versionId, refreshContext().client, signal)
}

/** The datasets whose linked parts contain a file of a bucket on one node, this one unless named. */
export async function getFilePartOf(bucket: string, key: string, signal?: AbortSignal, nodeId?: string | null): Promise<PartOfResponse> {
  return requestPartOf(bucket, key, nodeId ? await nodeClientReady(nodeId, undefined, signal) : refreshContext().client, signal)
}

/** The incoming syncs and storage folders of a bucket on one node, this one unless named. */
export async function getBucketSources(bucket: string, signal?: AbortSignal, nodeId?: string | null): Promise<FileSourcesResponse> {
  return requestSources(bucket, await nodeClientReady(nodeId, undefined, signal), signal)
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
export async function getBucketDistribution(bucket: string, signal?: AbortSignal, nodeId?: string | null): Promise<DistributedResponse> {
  return requestDistribution(bucket, await nodeClientReady(nodeId, undefined, signal), signal)
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
  nodeId?: string | null,
): Promise<BucketRoutingResponse> {
  saving.value = true
  try {
    return await request<BucketRoutingResponse>(
      `/data/buckets/${encodeURIComponent(bucket)}/storage/routing`,
      { method: 'PUT', body: JSON.stringify({ rules }) },
      nodeId,
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
