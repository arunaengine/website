import { portalConfig } from './config'
import { fetchWithTimeout } from './fetch'

const DEFAULT_API_BASE_URL = '/api/v1'
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClientOptions {
  baseUrl?: string
  token?: string
}

export interface ApiRequestOptions extends RequestInit {
  token?: string
  query?: Record<string, string | number | boolean | null | undefined>
}

export function defaultApiBaseUrl(): string {
  // The build-time env pin wins over runtime config so existing deployments
  // keep their behaviour; the localStorage override in useAruna wins over both.
  return import.meta.env.VITE_ARUNA_API_BASE_URL || portalConfig().apiBaseUrl || DEFAULT_API_BASE_URL
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
  client: ApiClientOptions = {},
): Promise<T> {
  const baseUrl = (client.baseUrl || defaultApiBaseUrl()).replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${baseUrl}${normalizedPath}`, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const headers = new Headers(options.headers)
  const token = options.token ?? client.token
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetchWithTimeout(url, { ...options, headers }, DEFAULT_REQUEST_TIMEOUT_MS)
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = await response.json()
      message = body.message || body.error || message
    } catch {
      // Keep the HTTP status message if the body is not JSON.
    }
    throw new ApiError(response.status, message)
  }

  if (response.status === 204 || response.status === 205) return undefined as T
  const body = await response.text()
  if (!body) return undefined as T
  return JSON.parse(body) as T
}

export interface InfoResponse {
  node: {
    status: string
    realm_id: string
    peer_id: string
    capabilities: 'management' | 'server' | 'local'
  }
  api_version?: string
  portal?: PortalStatus | null
  my_addresses: string[]
  connections?: unknown
  services: {
    interfaces: InterfaceServicesStatus
    database?: { status: string }
    network?: { status: string }
    blob?: { status: string }
  }
  warnings: string[]
}

export interface PortalStatus {
  installed: boolean
  version?: string | null
  source?: string | null
}

export interface InterfaceServicesStatus {
  rest: InterfaceStatus
  s3: InterfaceStatus
}

export interface InterfaceStatus {
  status: string
  bind?: string | null
  url?: string | null
}

// GET /info/usage; may grow extra fields, unknown ones are ignored.
export interface UsageResponse {
  buckets: number
  objects: number
  stored_blobs: number
  stored_bytes: number
  // Newer backends add logical bytes and, for authenticated callers, realm-wide totals.
  logical_bytes?: number
  realm?: UsageTotals
  // Present on GET /groups/{id}/usage from quota-aware backends.
  quota?: GroupQuotaStatus
}

export interface GroupQuotaStatus {
  // Effective group quota (override else default); null means unlimited.
  quota_bytes: number | null
  // Quota × grace — the enforced hard cap; null means unlimited.
  ceiling_bytes: number | null
  warn_threshold_percent: number
  // True when group usage has reached the warn threshold; false when unlimited.
  warning: boolean
}

export interface UsageTotals {
  buckets: number
  objects: number
  stored_blobs: number
  stored_bytes: number
  logical_bytes: number
}

// ---------------------------------------------------------------------------
// Usage history — arunaengine/aruna#250 workplan item 3 ("history snapshots
// with their endpoint"). The backend does NOT serve this yet; the types below
// document the assumed contract so the portal side flips on trivially:
//   GET /groups/{id}/usage/history?from=<rfc3339>&to=<rfc3339>&resolution=hour|day|week
//   -> 200 UsageHistoryResponse
// Callers MUST gate on featureEnabled('usageHistory'); the flag ships off.
// ---------------------------------------------------------------------------
export type UsageHistoryResolution = 'hour' | 'day' | 'week'

export interface UsageHistoryPoint {
  // Snapshot time, RFC3339.
  timestamp: string
  totals: UsageTotals
  // Server-computed quota state at snapshot time, when the backend records it.
  quota?: GroupQuotaStatus | null
}

export interface UsageHistoryResponse {
  group_id: string
  resolution: UsageHistoryResolution
  points: UsageHistoryPoint[]
}

export interface RealmInfoResponse {
  realm_id: string
  description?: string | null
  metadata_replication: { default_replication_factor: number }
  oidc_providers: Array<{
    id: string
    issuer: string
    audience: string
    discovery_url: string
  }>
  discovery: unknown
  nodes: RealmNodeInfo[]
  // Present on newer backends; older deployments omit the quota policy.
  quota?: RealmQuotaConfig
  interfaces: InterfaceServicesStatus
}

export interface RealmQuotaConfig {
  default_group_quota_bytes: number | null
  grace_factor_percent: number
  warn_threshold_percent: number
  group_overrides: RealmGroupQuotaOverride[]
  max_groups_per_user: number | null
  user_group_cap_overrides: RealmUserGroupCapOverride[]
  max_devices_per_user: number | null
}

export interface RealmGroupQuotaOverride {
  group_id: string
  quota_bytes: number | null
  grace_factor_percent: number | null
}

export interface RealmUserGroupCapOverride {
  user_id: string
  max_groups: number | null
}

export interface RealmNodePlacement {
  location: string
  weight: number
  full: boolean
  draining: boolean
}

export interface RealmNodePublishedInfo {
  labels: Record<string, string>
  urls: { api?: string | null; s3?: string | null }
  utilization: {
    storage_bytes_used: number
    // Omitted from the wire until a node publishes them
    // (skip_serializing_if on the backend response struct).
    documents_held?: number
    load_permille?: number
    heartbeat_at_ms: number
  }
  updated_at_ms: number
}

export interface RealmNodeInfo {
  node_id: string
  kind: 'management' | 'server' | 'local' | 'user'
  configured: boolean
  present: boolean
  connection_status: 'connected' | 'configured'
  placement?: RealmNodePlacement | null
  // Latest self-published node document; null until the node publishes one.
  info?: RealmNodePublishedInfo | null
  /** @deprecated older field, never served by current backends */
  rest_url?: string | null
}

export interface UserInfoResponse {
  user: ApiUser
  realm: { realm_id: string; roles: ApiRole[] }
  groups: ApiUserGroup[]
  preferences: {
    preferred_profile_path?: string | null
    favourite_metadata_ids: string[]
    theme?: string | null
  }
}

export interface ApiUser {
  user_id: string
  name: string
  subject_ids: string[]
  attributes: Record<string, string>
}

export interface ApiRole {
  role_id: string
  name: string
  permissions: Record<string, string>
  // Only present when the caller is a member of the group; missing means hidden.
  assigned_users?: string[]
  // Applies to every principal, including anonymous requests.
  public?: boolean
}

export interface ApiUserGroup {
  group_id: string
  display_name: string
  roles: ApiRole[]
}

export interface ApiGroup {
  group_id: string
  display_name: string
  realm_id: string
  roles?: ApiRole[]
}

export interface ListGroupsResponse {
  groups: ApiGroup[]
}

export interface CreateGroupRequest {
  name: string
}

export interface GroupDetailResponse {
  display_name: string
  group_id: string
  realm_id: string
  roles: ApiRole[]
}

export interface GroupMemberRole {
  role_id: string
  name: string
}

export interface GroupMember {
  user_id: string
  name?: string
  roles: GroupMemberRole[]
}

export interface GroupMembersResponse {
  members: GroupMember[]
}

export interface AddGroupMemberRequest {
  user_id: string
  role_ids?: string[]
}

export interface GroupRolesResponse {
  roles: ApiRole[]
}

export type GroupPermissionLevel = 'read' | 'write' | 'deny'

export interface CreateGroupRoleRequest {
  name: string
  permissions: Record<string, GroupPermissionLevel>
  assigned_users?: string[]
  // Public roles apply to every principal — including anonymous requests.
  public?: boolean
}

export interface UserSearchHit {
  user_id: string
  name: string
}

export interface UserSearchResponse {
  users: UserSearchHit[]
  next_start_after?: string | null
}

// GET /users/{id} — resolves any user id within the caller's realm.
export interface GetUserResponse {
  user_id: string
  name: string
  subject_ids: string[]
  attributes: Record<string, string>
}

export interface MetadataDocumentListItem {
  document_id: string
  group_id: string
  document_path: string
  graph_iri: string
  public: boolean
  replicas: number
  created_at: string
  updated_at: string
  rocrate_summary?: unknown
}

export interface ListMetadataResponse {
  documents: MetadataDocumentListItem[]
  limit: number
  offset: number
  total_returned: number
}

export interface MetadataRoCrateResponse {
  rocrate: unknown
  total_data_entities?: number | null
  returned_data_entities?: number | null
  next_offset?: number | null
  next_cursor?: string | null
}

// GET /metadata/{id} and the response body of PUT /metadata/{id}/rocrate,
// POST /metadata (flattened) — the registry summary without rocrate_summary.
export type MetadataDocumentSummary = Omit<MetadataDocumentListItem, 'rocrate_summary'>

export interface ReplaceMetadataRoCrateRequest {
  rocrate: unknown
  // Omitted keeps the document's current visibility.
  public?: boolean
}

// GET /metadata/search — verified against aruna api/src/routes/metadata.rs and
// operations/src/metadata/{api.rs,search_cursor.rs} (aruna 9ae6bd68).
// Contract: `q` is required and non-empty (empty ⇒ 400); `limit` defaults to 25
// and is clamped 1..=100 (METADATA_SEARCH_MAX_PAGE_SIZE); `mode=local|distributed`.
// `cursor` is an accepted, query-bound opaque token — a cursor whose fingerprint
// does not match the query is rejected with 400 InvalidCursor (never 409/410).
// Hits are ordered by descending score and deduplicated server-side per
// (graph_iri, subject_iri), so one document may span multiple hits. `title` is
// always served (schema:name with subject/path fallback); `snippet` is optional;
// `next_cursor` is served for cursor paging. Only `partial` and `failed_nodes`
// remain aruna#258 forward-compat (not served yet). Enrichment fields stay
// optional client-side so older deployed nodes still type-check.
export interface MetadataSearchHit {
  document_id: string
  group_id: string
  document_path: string
  graph_iri: string
  subject_iri: string
  score: number
  // Server-side enrichment: `title` always served, `snippet` optional; kept
  // optional here to tolerate older nodes that predate aruna 9ae6bd68.
  title?: string | null
  snippet?: string | null
}

export interface MetadataSearchResponse {
  hits: MetadataSearchHit[]
  /** Node partitions queried; served today. */
  nodes_queried: number
  /** Node partitions that failed or timed out; > 0 ⇒ partial. Served today. */
  nodes_failed: number
  // partial/failed_nodes remain aruna#258 forward-compat (not served yet).
  partial?: boolean
  failed_nodes?: string[]
  /** Query-bound cursor for the next page; served for cursor paging (aruna 9ae6bd68). */
  next_cursor?: string | null
}

export interface MetadataSearchOptions {
  limit?: number
  cursor?: string
  signal?: AbortSignal
}

export interface SparqlResponse {
  kind: 'Solutions' | 'Boolean'
  value: Array<Record<string, string>> | boolean
}

export interface S3CredentialSummary {
  access_key_id: string
  group_id: string
  expires_at: string
  revoked_at?: string | null
  issued_by: string
  path_restrictions: Array<{ pattern: string; permission: string }>
  status: 'active' | 'expired' | 'revoked'
}

export interface ListS3CredentialsResponse {
  credentials: S3CredentialSummary[]
}

export interface CreateS3CredentialsRequest {
  group_id: string
  expires_in_seconds?: number
  path_restrictions?: Array<{ pattern: string; permission: string }>
}

export interface CreateS3CredentialsResponse {
  access_key_id: string
  access_secret: string
}

// The backend deserializes CreateMetadataRequest as an untagged enum with
// deny_unknown_fields, so a request must match exactly one variant shape.
export interface CreateMetadataScaffoldRequest {
  group_id: string
  path: string
  name: string
  description: string
  date_published: string
  license: string
  public?: boolean
}

export interface CreateMetadataRoCrateRequest {
  group_id: string
  path: string
  public?: boolean
  rocrate: unknown
}

export type CreateMetadataRequest = CreateMetadataScaffoldRequest | CreateMetadataRoCrateRequest

// The API flattens the summary fields onto the response body
// (CreateMetadataResponse uses #[serde(flatten)]).
export type CreateMetadataResponse = MetadataDocumentListItem

// --- Notifications (GET /notifications, /notifications/unread, POST /notifications/read) ---

// Backend NotificationResponse. Kind-specific fields are omitted (not null)
// when absent; new kinds appear over time, so `kind`/`category` stay open strings.
export interface ApiNotification {
  id: string
  category: string
  kind: string
  class: 'direct' | 'transient'
  created_at_ms: number
  read: boolean
  group_id?: string
  member_user_id?: string
  actor_user_id?: string
  node_id?: string
  realm_id?: string
  path?: string
  document_id?: string
  bucket?: string
  key?: string
  size_bytes?: number
}

export interface NotificationListResponse {
  notifications: ApiNotification[]
  // Opaque base64url cursor; omitted on the last page. Pass back verbatim.
  next_cursor?: string
}

// Bounded lower-bound count: the backend stops counting at 100 and sets capped.
export interface UnreadCountResponse {
  count: number
  capped: boolean
}

export interface NotificationStateResponse {
  epoch: string
  revision: number
  unread: UnreadCountResponse
}

export interface MarkReadRequest {
  ids: string[]
  // Inclusive created_at_ms sweep; ids: [] + up_to_ms marks everything up to it.
  up_to_ms?: number
}

export interface MarkReadResponse {
  marked: number
}

// ── Join requests (aruna#248) ────────────────────────────────────────────────
// ASSUMED API — these endpoints are NOT yet provided by the backend. Shapes are
// derived from aruna#248 (create / decide / list / withdraw, approve assigns
// roles like AddGroupMemberRequest) and existing group-route conventions
// (snake_case, ULID ids, RFC3339 timestamps, `{ requests: [...] }` wrapper).
// All consumers are gated behind featureEnabled('joinRequests').

export type JoinRequestStatus = 'pending' | 'approved' | 'denied'

export interface JoinRequest {
  request_id: string
  group_id: string
  // Echoed group name for the own-requests view; fall back to a client-side
  // join against GET /groups when absent.
  group_display_name?: string
  user_id: string
  // Requester display name for the admin inbox (like GroupMember.name).
  user_name?: string
  message?: string | null
  status: JoinRequestStatus
  decided_by?: string | null
  decision_reason?: string | null
  created_at: string
  decided_at?: string | null
}

export interface CreateJoinRequestRequest {
  message?: string
}

export interface ListJoinRequestsResponse {
  requests: JoinRequest[]
}

export interface DecideJoinRequestRequest {
  approve: boolean
  // Approval only: roles to assign; omitted defaults to the group's single
  // "user" role, mirroring AddGroupMemberRequest.role_ids.
  role_ids?: string[]
  // Denial only: optional reason surfaced to the requester.
  reason?: string
}

export interface DecideJoinRequestResponse {
  request: JoinRequest
}

export type PlacementAffinityEffect =
  | { kind: 'filter' }
  | { kind: 'multiply'; permille: number }

export interface PlacementAffinityRule {
  key: string
  value: string
  effect: PlacementAffinityEffect
}

export interface RealmPlacementStrategy {
  strategy_id: string
  name: string
  replica_count: number | null
  distinct_locations: boolean
  affinity: PlacementAffinityRule[]
  shard_count: number
}

export type RealmPlacementDocumentClass =
  | 'admin'
  | 'group'
  | 'user'
  | 'metadata'
  | 'metadata_registry'

export type RealmPlacementBindingScope =
  | { kind: 'realm' }
  | { kind: 'group'; group_id: string }
  | { kind: 'class'; document_class: RealmPlacementDocumentClass }
  | { kind: 'metadata_path_prefix'; prefix: string }

export interface RealmPlacementBinding {
  scope: RealmPlacementBindingScope
  strategy_id: string
}

export interface RealmPlacementOverride {
  subject: string
  pinned: string[]
  excluded: string[]
  strategy_id: string | null
}

export interface RealmPlacementConfigResponse {
  strategies: RealmPlacementStrategy[]
  default_strategy_id: string | null
  bindings: RealmPlacementBinding[]
  overrides: RealmPlacementOverride[]
}

export type RealmPlacementMutationRequest =
  | { mutation: 'upsert_strategy'; strategy: RealmPlacementStrategy }
  | { mutation: 'remove_strategy'; strategy_id: string }
  | { mutation: 'set_default_strategy'; strategy_id: string }
  | { mutation: 'set_binding'; binding: RealmPlacementBinding }
  | { mutation: 'remove_binding'; scope: RealmPlacementBindingScope }
  | { mutation: 'set_override'; placement_override: RealmPlacementOverride }
  | { mutation: 'remove_override'; subject: string }
