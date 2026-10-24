// ── Buckets stored on more nodes ────────────────────────────────────────────
// Verified against aruna api/src/routes/storage/distributed.rs. Creating and
// retrying are group ADMIN calls made on the connected node, which publishes
// the configuration. A status read is answered from that node's own record.
import { apiRequest, type ApiClientOptions } from './client'

export type StrategyName = 'copy' | 'copy_on_use' | 'cache_on_use' | 'stream'
export type BehaviourName = 'passthrough' | 'fill_first' | 'serve_and_fill'
export type LayoutName = 'replica' | 'sharding'
export type MemberStateName = 'created' | 'catching_up' | 'ready' | 'leaving' | 'failed'

export interface CreateDistributedRequest {
  bucket: string
  layout: LayoutName
  /** Nodes that coordinate or replicate ranges, in layout order. */
  nodes: string[]
  /** Lower bounds of the second and later ranges (sharding only). */
  boundaries?: string[]
  /** Further copies of each range (sharding only). */
  replicas?: number
  /** Members that hold every record and fetch or stream bytes on use. */
  edges?: { node_id: string; strategy: Exclude<StrategyName, 'copy'> }[]
  settings?: {
    refresh_secs?: number | null
    range_behaviour?: BehaviourName | null
    search_index?: boolean
    public?: boolean
  }
}

export interface MemberOutcomeResponse {
  member_id: string
  node_id: string
  admitted: boolean
  error?: string | null
}

export interface AdmissionResponse {
  set_id: string
  /** Every coordinator and replica is admitted and the bucket serves. */
  active: boolean
  members: MemberOutcomeResponse[]
  /** Why admission or activation stopped; the set exists and the admission can be retried. */
  error?: string | null
}

export interface DistributedMemberResponse {
  member_id: string
  node_id: string
  state: MemberStateName
  coverage: 'all' | 'assigned'
  strategy: StrategyName
  admitted: boolean
}

export interface DistributedRangeResponse {
  range_id: string
  /** Inclusive lower key bound. */
  lower: string
  /** Exclusive upper key bound; absent for the end of the key space. */
  upper?: string | null
  /** The member id of the coordinator. */
  coordinator: string
  coordinator_node?: string | null
  epoch: number
  /** Member ids. */
  replicas: string[]
  degraded: boolean
  /** Unix milliseconds of the last contact with the unreachable coordinator. */
  unreachable_since_ms?: number | null
}

export interface DistributedResponse {
  set_id: string
  bucket: string
  group_id: string
  publisher: string
  revision: number
  phase: 'pending' | 'active'
  serving: boolean
  conflicted: boolean
  configuration_changes_unavailable: boolean
  degraded: boolean
  members: DistributedMemberResponse[]
  ranges: DistributedRangeResponse[]
  /** The node glob grant that covers this bucket on every member node. */
  recommended_grant: string
}

function setPath(groupId: string, setId?: string): string {
  const base = `/data/groups/${encodeURIComponent(groupId)}/distributed-buckets`
  return setId ? `${base}/${encodeURIComponent(setId)}` : base
}

export function createDistributedBucket(
  groupId: string,
  body: CreateDistributedRequest,
  client: ApiClientOptions = {},
): Promise<AdmissionResponse> {
  return apiRequest(setPath(groupId), { method: 'POST', body: JSON.stringify(body) }, client)
}

export function retryAdmission(
  groupId: string,
  setId: string,
  client: ApiClientOptions = {},
): Promise<AdmissionResponse> {
  return apiRequest(`${setPath(groupId, setId)}/admission`, { method: 'POST' }, client)
}

export function getDistributedBucket(
  groupId: string,
  setId: string,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<DistributedResponse> {
  return apiRequest(setPath(groupId, setId), { signal }, client)
}

/** The set a bucket belongs to; an ordinary bucket answers 404. */
export function getBucketDistribution(
  bucket: string,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<DistributedResponse> {
  return apiRequest(`/data/buckets/${encodeURIComponent(bucket)}/distribution`, { signal }, client)
}
