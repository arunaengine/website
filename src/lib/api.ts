import { portalConfig } from './config'
import { noteFetchFailure, noteFetchSuccess } from './connectivity'

const DEFAULT_API_BASE_URL = '/api/v1'

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

  let response: Response
  try {
    response = await fetch(url, { ...options, headers })
  } catch (err) {
    // Network-level failure (or a deliberate abort) — the request never
    // reached a server. Report it to the connectivity model (which ignores
    // AbortError) and rethrow the original rejection verbatim.
    noteFetchFailure(err)
    throw err
  }
  // Any HTTP response — even an error status — proves the node is reachable.
  noteFetchSuccess()
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

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
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
    documents_held: number
    load_permille: number
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

// --- SPARQL (POST /metadata/sparql/query, POST /metadata/{id}/sparql/query) ---

export type SparqlQueryMode = 'local' | 'distributed'

// Omitted mode defaults to 'distributed' on the backend. Only SELECT and ASK
// query forms are accepted; the form check parses the raw text, so queries
// must declare their own PREFIXes.
export interface SparqlQueryRequest {
  query: string
  mode?: SparqlQueryMode
}

// Solution cells are N-Triples-encoded terms: '<iri>', '"literal"',
// '"literal"@lang', '"3"^^<datatype>', '_:blank'. Unbound variables are
// absent from the row. nodes_failed > 0 means the merged result is partial.
export type SparqlResponse =
  | { kind: 'Solutions'; value: Array<Record<string, string>>; nodes_queried: number; nodes_failed: number }
  | { kind: 'Boolean'; value: boolean; nodes_queried: number; nodes_failed: number }

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

// Source connectors (GET/POST /groups/{group_id}/connectors — verified against
// aruna api/src/routes/connectors.rs). Real, served contract — no gating.
export type SourceConnectorKind = 'http' | 's3' | 'webdav' | 'ftp' | 'aruna_native'

export interface SourceConnectorSummary {
  connector_id: string
  group_id: string
  name: string
  kind: SourceConnectorKind
  public_config: Record<string, string>
  created_at: string
  updated_at: string
  created_by: string
  has_secret_config: boolean
}

export interface ListSourceConnectorsResponse {
  connectors: SourceConnectorSummary[]
}

// Blob staging (POST /staging/ — verified against aruna api/src/routes/staging.rs).
// Internally tagged: the `strategy` discriminant sits beside the flattened
// target fields. Synchronous one-shot materialization (201 on success);
// 'sync' exists in the API enum but returns 501 on today's backends.
export type StagingStrategy = 'snapshot' | 'reference' | 'sync'

export interface StageBlobSubmission {
  strategy: StagingStrategy
  group_id: string
  connector_id: string
  source_path: string
  bucket: string
  key: string
}

export interface StageBlobResponse {
  strategy: StagingStrategy
  bucket: string
  key: string
  version_id: string
  size: number
  content_type?: string | null
  etag?: string | null
  last_modified?: string | null
}

// ---------------------------------------------------------------------------
// Staging jobs — arunaengine/aruna#276 ("staging jobs get a side panel").
// POST /staging/ is synchronous and today's backend keeps NO job registry;
// the types below document the assumed listing contract so the panel flips
// on trivially once it ships:
//   GET /staging/jobs -> 200 ListStagingJobsResponse
// Callers MUST gate on featureEnabled('stagingJobs'); the flag ships off.
// ---------------------------------------------------------------------------
export type StagingJobState = 'queued' | 'running' | 'done' | 'failed'

export interface StagingJob {
  job_id: string
  strategy: StagingStrategy
  group_id: string
  connector_id: string
  source_path: string
  bucket: string
  key: string
  state: StagingJobState
  submitted_at: string
  finished_at?: string | null
  error?: string | null
  version_id?: string | null
  size?: number | null
}

export interface ListStagingJobsResponse {
  jobs: StagingJob[]
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

// --- Node onboarding (POST+GET /admin/onboarding/secrets, DELETE /admin/onboarding/secrets/{id}) ---

// Serialized aruna_core::onboarding::OnboardingMode — plain unit variants,
// so capitalized strings on the wire.
export type OnboardingMode = 'Management' | 'Server' | 'Local'

export interface CreateOnboardingSecretRequest {
  // Origin-style base URL of a management node reachable by the joiner; the
  // node calls {seed_url}/api/v1/onboarding/bootstrap — never include /api/v1.
  seed_url: string
  mode: OnboardingMode
  // Clamped server-side to 60..86400 seconds; default 3600.
  expires_in_seconds?: number
}

export interface CreateOnboardingSecretResponse {
  // Carried exactly once — the server keeps only a hash. No enrollment_id here.
  onboarding_secret: string
  mode: OnboardingMode
  // Unix seconds.
  expires_at: number
}

export interface OnboardingSecretSummary {
  enrollment_id: string // ULID
  // Debug-formatted mode; equals OnboardingMode values today, kept open for new kinds.
  mode: string
  // Unix seconds. u64::MAX (~1.84e19) marks the never-expiring initial
  // admin-claim secret minted at realm initialization.
  expires_at: number
  // Node id for node claims; a user id when a Local secret was redeemed at
  // registration (first admin claim). Serialized as null when unclaimed.
  claimed_node_id: string | null
}

export interface ListOnboardingSecretsResponse {
  secrets: OnboardingSecretSummary[]
}

// --- User devices (aruna#271) -----------------------------------------------
// ASSUMED API — NOT yet provided by the backend (aruna#271; self-service
// enrollment is gated on the aruna#272 security guard). Shapes are a
// user-scoped sibling of the admin onboarding surface
// (/admin/onboarding/secrets): unix-second timestamps, ULID enrollment ids,
// a one-time secret carried exactly once, and a `{ devices: [...] }` list
// wrapper. The 'user' node kind and quota.max_devices_per_user already exist on
// the backend (RealmNodeInfo.kind / RealmQuotaConfig above); only these
// self-service endpoints are missing. All consumers are gated behind
// featureEnabled('deviceEnrollment').

export interface UserDevice {
  enrollment_id: string // ULID; stable across pending → claimed
  device_name: string | null
  // iroh node id once the device redeemed its token (matches
  // RealmNodeInfo.node_id for kind 'user'); null while pending.
  node_id: string | null
  created_at: number // unix seconds
  // Pending-token expiry (unix seconds); null once claimed.
  expires_at: number | null
}

export interface ListUserDevicesResponse {
  devices: UserDevice[]
}

export interface EnrollUserDeviceRequest {
  // Origin-style URL of a realm node reachable from the device; the device
  // calls {seed_url}/api/v1/onboarding/bootstrap — never include /api/v1
  // (same semantics as CreateOnboardingSecretRequest.seed_url).
  seed_url: string
  device_name?: string
  // Mirrors the admin clamp 60..86400 seconds, default 3600.
  expires_in_seconds?: number
}

export interface EnrollUserDeviceResponse {
  // One-time device token; the server keeps only a hash (sibling of
  // CreateOnboardingSecretResponse.onboarding_secret).
  onboarding_secret: string
  enrollment_id: string
  expires_at: number // unix seconds
}

// ── Placement administration (aruna#269) ────────────────────────────────────
// ASSUMED API — NOT yet provided by the backend (issue #269 workplan item 1;
// blocked by aruna#261/#265). Field vocabulary follows the existing core
// structs (core/src/structs/placement.rs: PlacementStrategy, AffinityRule,
// LabelMatch, AffinityEffect::Filter|Multiply{permille}) flattened into the
// REST style of routes/info.rs. All consumers gate on
// featureEnabled('placementAdmin'); the flag ships off.

export interface PlacementAffinityRule {
  key: string
  value: string
  // 'filter' restricts placement to matching nodes; 'multiply' scales their
  // selection weight by `permille` (1000 = neutral).
  effect: 'filter' | 'multiply'
  permille?: number
}

export interface PlacementStrategyConfig {
  // null ⇒ store on all sync-eligible nodes (core: replica_count: None).
  replica_count: number | null
  distinct_locations: boolean
  affinity: PlacementAffinityRule[]
}

export interface GroupPlacementStrategyResponse {
  group_id: string
  strategy: PlacementStrategyConfig
  // True when the group has no own binding and inherits the realm default.
  inherited: boolean
}

export interface PutPlacementStrategyRequest {
  strategy: PlacementStrategyConfig
}

export interface RealmPlacementDefaultsResponse {
  default_strategy: PlacementStrategyConfig
}

export interface GroupPlacementResponse {
  group_id: string
  // Strategy that produced this computed view (realm default when inherited).
  strategy_id: string | null
  // Union of nodes currently selected to hold the group's records; the
  // portal aggregates these by location against GET /info/realm.
  node_ids: string[]
  // Unix ms at which a management node computed the view.
  computed_at_ms: number
}

export type PlacementTransitionState = 'pending' | 'copying' | 'verifying' | 'done' | 'failed'

export interface PlacementTransition {
  transition_id: string
  // Opaque subject (document/shard) being moved.
  subject: string
  from_node_id: string | null
  to_node_id: string
  state: PlacementTransitionState
  updated_at_ms: number
}

export interface PlacementTransitionsResponse {
  transitions: PlacementTransition[]
}
