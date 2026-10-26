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
    /** A range splits once its coordinator counts more current objects; omitted never splits. */
    split_objects?: number | null
    /** A range splits once its current bytes exceed this; omitted never splits. */
    split_bytes?: number | null
  }
}

export type SettingsBody = NonNullable<CreateDistributedRequest['settings']>

export interface JoinMemberRequest {
  node_id: string
  coverage: 'all' | 'assigned'
  strategy: StrategyName
  range_behaviour?: BehaviourName | null
  /** Ranges the member keeps a copy of; required for `assigned` coverage. */
  ranges?: string[]
}

export interface TransferRangeRequest {
  range_id: string
  /** The member id that coordinates the range afterwards: a ready copy replica of it. */
  to: string
  /** What the former coordinator does: keep a copy, or give its copy up. */
  role: 'replica' | 'leave'
}

export interface ChangeResponse {
  set_id: string
  /** The record revision that took the change. */
  revision: number
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
  /** The range this one was split from; absent for a range from the creation. */
  lineage?: string | null
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
  /** Open transfers of ranges to another coordinator; absent on older nodes. */
  transfers?: TransferResponse[]
  /** The deletion of the set, once it is prepared. */
  deletion?: DeletionResponse | null
  /** Ranges this node fenced as their former coordinator. */
  fenced_ranges?: string[]
  /** This node applies no publication of the set anymore: it leaves or the set is deleted. */
  publications_closed?: boolean
}

export interface TransferResponse {
  transfer_id: string
  range_id: string
  /** The member id that coordinated the range. */
  from: string
  /** The member id that coordinates it once the transfer activates. */
  to: string
  epoch: number
  /** `replica` or `leave`: what the former coordinator keeps. */
  role: string
  /** The former coordinator fenced the range; writes to it fail until the activation. */
  fenced: boolean
  completed: boolean
}

export interface DeletionResponse {
  /** Every coordinator fenced its ranges; members purge their buckets. */
  committed: boolean
  /** Member ids. */
  fenced: string[]
  /** Member ids of the coordinators whose fence the commit still waits for. */
  waiting: string[]
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

/** Adds a member node to an active bucket; it creates and admits its local bucket. */
export function joinMember(
  groupId: string,
  setId: string,
  body: JoinMemberRequest,
  client: ApiClientOptions = {},
): Promise<AdmissionResponse> {
  return apiRequest(`${setPath(groupId, setId)}/members`, { method: 'POST', body: JSON.stringify(body) }, client)
}

/** Marks a member leaving. A member that coordinates a range is refused. */
export function leaveMember(groupId: string, setId: string, memberId: string, client: ApiClientOptions = {}): Promise<ChangeResponse> {
  return apiRequest(`${setPath(groupId, setId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }, client)
}

/** Opens a fenced transfer of one range to a ready copy replica of it. */
export function transferRange(
  groupId: string,
  setId: string,
  body: TransferRangeRequest,
  client: ApiClientOptions = {},
): Promise<ChangeResponse> {
  return apiRequest(`${setPath(groupId, setId)}/transfers`, { method: 'POST', body: JSON.stringify(body) }, client)
}

/** Replaces the bucket-wide settings: omitted fields take their defaults. */
export function changeSettings(
  groupId: string,
  setId: string,
  body: SettingsBody,
  client: ApiClientOptions = {},
): Promise<ChangeResponse> {
  return apiRequest(`${setPath(groupId, setId)}/settings`, { method: 'PUT', body: JSON.stringify(body) }, client)
}

/** Prepares the deletion of the set with every member bucket. */
export function deleteSet(groupId: string, setId: string, client: ApiClientOptions = {}): Promise<ChangeResponse> {
  return apiRequest(setPath(groupId, setId), { method: 'DELETE' }, client)
}
