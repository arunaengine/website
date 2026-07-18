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

// GET /groups/{id}/data-paths — browsable data permission paths that feed the
// role picker's data/ tree. Verified against aruna api/src/routes/groups.rs on
// branch feat/pb-datapaths (in flight, 2026-07-17): member-gated (403 for
// non-members, 401 unauthenticated), local node only in v1, and permission
// paths are shaped /{realm}/g/{group}/data/{node}/{bucket}/{key} exactly as
// consumed by role permissions (core blob_*_permission_path). An empty/absent
// `prefix` lists the group's buckets; pass a folder's `permission_path`
// (normalized with a trailing slash) as `prefix` to list its contents with
// `delimiter=/`. `kind` is serialized lowercase. A prefix outside the group's
// data root answers 400; a bucket owned by another group yields empty entries.
export type DataPathKind = 'folder' | 'object'

export interface DataPathEntry {
  permission_path: string
  kind: DataPathKind
}

export interface DataPathsResponse {
  entries: DataPathEntry[]
  // Opaque page token; omitted on the last page. Pass back verbatim.
  continuation_token?: string
}

export interface DataPathsQuery {
  prefix?: string
  delimiter?: string
  continuationToken?: string
  limit?: number
}

export async function listGroupDataPaths(
  groupId: string,
  params: DataPathsQuery = {},
  client: ApiClientOptions = {},
): Promise<DataPathsResponse> {
  return apiRequest<DataPathsResponse>(
    `/groups/${encodeURIComponent(groupId)}/data-paths`,
    {
      query: {
        prefix: params.prefix,
        delimiter: params.delimiter,
        continuation_token: params.continuationToken,
        limit: params.limit,
      },
    },
    client,
  )
}

export interface UserSearchHit {
  user_id: string
  name: string
}

export interface UserSearchResponse {
  users: UserSearchHit[]
  next_start_after?: string | null
}

// GET /users — realm user directory (verified against aruna
// api/src/routes/users.rs: ListUsersResponse over GetUserResponse, which is
// exactly ApiUser). `limit` defaults to 100, clamped 1..=1000;
// `next_start_after` is the exclusive user-id cursor, absent on the last page.
// Requires READ on /{realm_id}/admin/u/**.
export interface ListUsersResponse {
  users: ApiUser[]
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
// operations/src/metadata/{api.rs,search_cursor.rs} (aruna feat/portal-backend).
// Contract: `q` is required and trimmed to >= 2 chars (shorter ⇒ 400); `limit`
// defaults to 25 and is clamped 1..=100; `mode=local|distributed`. `group_id`
// and `conforms_to` (exact conformsTo profile IRI) filter documents server-side.
// `cursor` is an accepted, query- and filter-bound opaque token — a cursor whose
// fingerprint does not match the query or filters is rejected with 400.
// Hits are ordered by descending score and deduplicated server-side per
// (graph_iri, subject_iri), so one document may span multiple hits. `title` is
// always served (schema:name with subject/path fallback); `snippet` is optional.
// Partiality is signalled by `nodes_failed` (not a `partial` flag); `truncated`
// marks a page that stopped at the server depth cap before exhausting matches.
export interface MetadataSearchHit {
  document_id: string
  group_id: string
  document_path: string
  graph_iri: string
  subject_iri: string
  score: number
  // Always served by the answering node (schema:name, then subject/path fallback).
  title: string
  // Query-relevant excerpt; absent when the resource has no indexed literals.
  snippet?: string | null
}

export interface MetadataSearchResponse {
  hits: MetadataSearchHit[]
  /** Node partitions queried. */
  nodes_queried: number
  /** Node partitions that failed or timed out; > 0 ⇒ partial. */
  nodes_failed: number
  /** True when paging stopped at the server depth cap before exhausting matches. */
  truncated?: boolean
  /** Query- and filter-bound cursor for the next page. */
  next_cursor?: string | null
}

export interface MetadataSearchOptions {
  limit?: number
  cursor?: string
  group_id?: string
  conforms_to?: string
  signal?: AbortSignal
}

// GET /search/buckets — federated bucket-name search (verified against aruna
// api/src/routes/search.rs on feat/portal_extensions). `q` is a case-insensitive
// bucket-name substring, trimmed to >= 2 chars (shorter ⇒ 400); `limit` defaults
// to 10 and is clamped 1..=50. Partiality is signalled via nodes_failed with the
// failing node ids listed in failed_nodes. Requires an authenticated session.
export interface BucketSearchHit {
  /** `arn:aruna:<realm>:<node>:s3/<bucket>` — parse with parseArunaArn. */
  arn: string
  bucket: string
  node_id: string
  group_id: string
  group_name?: string | null
  created_at: string
}

export interface BucketSearchResponse {
  hits: BucketSearchHit[]
  nodes_queried: number
  nodes_failed: number
  failed_nodes: string[]
}

// GET /search — unified realm search (aruna api/src/routes/search.rs). Returns
// only the requested sections; `types` defaults to all four. `cursor` continues
// exactly one section and is rejected with 400 when more than one type is asked
// for (buckets never page — a buckets cursor is always 400). `limit` is
// per-section (default 10, clamped 1..=100). `group_id`, `conforms_to` and
// `mode` apply to the documents section only.
export type SearchSectionType = 'documents' | 'buckets' | 'groups' | 'users'

export interface UnifiedSearchOptions {
  types?: SearchSectionType[]
  limit?: number
  cursor?: string
  group_id?: string
  conforms_to?: string
  mode?: 'local' | 'distributed'
  signal?: AbortSignal
}

export interface SearchDocumentsSection {
  hits: MetadataSearchHit[]
  next_cursor?: string | null
  nodes_queried: number
  nodes_failed: number
}

export interface SearchGroupHit {
  group_id: string
  display_name: string
}

export interface SearchGroupsSection {
  hits: SearchGroupHit[]
  next_cursor?: string | null
}

export interface SearchUserHit {
  user_id: string
  name: string
}

export interface SearchUsersSection {
  hits: SearchUserHit[]
  next_cursor?: string | null
}

export interface UnifiedSearchResponse {
  documents?: SearchDocumentsSection
  buckets?: BucketSearchResponse
  groups?: SearchGroupsSection
  users?: SearchUsersSection
}

// POST /users/resolve — batch id → profile resolution (cap 100 ids). `attributes`
// is the safe scholarly subset only; sensitive keys (e.g. email) are excluded.
export interface ResolveUserResult {
  user_id: string
  name: string
  attributes: Record<string, string>
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

// Shared body of POST and PUT (CreateSourceConnectorRequest /
// ReplaceSourceConnectorRequest are field-identical in the backend). PUT is a
// full replace: secret_config always overwrites the stored secrets, and
// responses never echo them back (only has_secret_config). Allowed/required
// config keys are validated per kind server-side
// (aruna operations/src/connectors/validation.rs); `aruna_native` is rejected.
export interface SourceConnectorRequest {
  name: string
  kind: SourceConnectorKind
  public_config: Record<string, string>
  secret_config?: Record<string, string>
}

// Connector check & browse (agreed portal↔backend contract; the endpoints are
// new — older nodes answer 404/501 and callers degrade by hiding/disabling the
// affordance with a short hint):
//   POST /groups/{gid}/connectors/check            (inline config, incl. secrets)
//   POST /groups/{gid}/connectors/{cid}/check      (stored config + secrets)
//   GET  /groups/{gid}/connectors/{cid}/entries?path=&limit=
export interface ConnectorCheckResponse {
  ok: boolean
  latency_ms?: number
  error?: string
}

export interface ConnectorEntry {
  name: string
  path: string
  kind: 'file' | 'dir'
  size?: number
  modified_ms?: number
}

export interface ConnectorEntriesResponse {
  entries: ConnectorEntry[]
  truncated: boolean
}

// Batch staging (agreed contract): POST /staging/batch stages many items (and
// whole prefixes) through one connector in a single call.
export interface StagingBatchItem {
  source_path: string
  target_key: string
}

export interface StagingBatchPrefix {
  source_prefix: string
  target_prefix: string
}

export interface StagingBatchRequest {
  group_id: string
  node_id?: string
  connector_id: string
  bucket: string
  strategy: StagingStrategy
  items?: StagingBatchItem[]
  prefixes?: StagingBatchPrefix[]
}

export interface StagingBatchResult {
  source_path: string
  target_key: string
  status: 'ok' | 'error'
  error?: string
}

export interface StagingBatchResponse {
  results: StagingBatchResult[]
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

// ---------------------------------------------------------------------------
// Reference visibility (agreed contract):
//   GET /staging/references?bucket=<b>&prefix=<p>&limit=&cursor=
// reports which keys in a bucket are backed by a reference — an external
// connector source or another Aruna node — instead of node-local bytes. The
// listing MAY include non-referenced entries (referenced: false); consumers
// aggregate client-side on `referenced`.
// ---------------------------------------------------------------------------
export interface StagingReferenceEntry {
  key: string
  size: number
  referenced: boolean
  /** Source kind; aruna_native marks a reference into another realm node. */
  kind?: SourceConnectorKind
  /** Path/URL of the object at its source, in the connector's namespace. */
  source_path?: string
  /** Connector the reference was staged through (non-native kinds). */
  connector_id?: string
  /** aruna_native only: the realm node actually holding the bytes. */
  origin_node_id?: string
}

export interface StagingReferencesResponse {
  entries: StagingReferenceEntry[]
  /** Opaque cursor; omitted on the last page. Pass back verbatim. */
  next_cursor?: string
}

// ---------------------------------------------------------------------------
// Bucket sync relationships (verified against aruna api/src/routes/sync.rs on
// feat/portal_extensions):
//   POST   /data/sync-relationships          201 SyncRelationship; 409 duplicate;
//                                            502 target unreachable
//   GET    /data/sync-relationships          ?bucket=&prefix=&direction=out|in|both
//   GET    /data/sync-relationships/{id}     SyncRelationshipDetail
//   POST   /data/sync-relationships/{id}/run 202 (re-run once / backfill continuous)
//   DELETE /data/sync-relationships/{id}     204 (synced data is retained)
// Listing and detail only surface relationships CREATED BY the caller; run and
// delete are creator-only too (403 otherwise).
// ---------------------------------------------------------------------------
export type SyncMode = 'once' | 'reference' | 'continuous'

// Wire state is a plain string ("enabled" | "paused" | "failed"); a failed
// relationship carries failure_reason alongside. Kept open for future states.
export type SyncRelationshipState = 'enabled' | 'paused' | 'failed' | (string & {})

export interface SyncCounters {
  versions_synced: number
  bytes_synced: number
  failures: number
  consecutive_failures: number
}

export interface SyncStatusSnapshot {
  last_synced_at?: string | null
  last_error?: string | null
  counters: SyncCounters
}

export interface SyncRelationship {
  id: string
  /** Source ARN `arn:aruna:<realm>:<node>:s3/<bucket>[/<prefix>]`. */
  source: string
  /** Target ARN, same shape as source. */
  target: string
  mode: SyncMode
  replicate_deletes: boolean
  created_by: string
  created_at: string
  state: SyncRelationshipState
  failure_reason?: string | null
  status: SyncStatusSnapshot
}

export interface SyncRelationshipListResponse {
  outgoing: SyncRelationship[]
  incoming: SyncRelationship[]
}

export interface SyncRelationshipDetail {
  relationship: SyncRelationship
  pending_jobs: number
  oldest_lag_ms?: number | null
  last_synced_at?: string | null
  last_error?: string | null
}

export interface SyncRunResponse {
  relationship_id: string
  queued: number
}

// The source is always the node answering the request (it has no node_id);
// creating a remote-source relationship means POSTing to that node's API.
export interface CreateSyncRelationshipRequest {
  source: { bucket: string; prefix?: string }
  target: { node_id: string; bucket: string; prefix?: string }
  mode: SyncMode
  replicate_deletes?: boolean
}

export interface SyncRelationshipListQuery {
  bucket?: string
  prefix?: string
  direction?: 'out' | 'in' | 'both'
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
  // sync_completed / sync_failed (bucket sync watch events)
  relationship_id?: string
  versions_synced?: number
  error?: string
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

// --- Notification watches (GET/POST /notifications/watches, DELETE /notifications/watches/{id}) ---

// Backend WatchResponse. `events` carries stable WatchEventKind names
// (metadata_created, data_uploaded); the list stays open for future kinds.
export interface ApiWatch {
  id: string
  path_prefix: string
  events: string[]
  created_at_ms: number
  // Agreed contract addition: newer backends MAY report per-watch health;
  // render it when present, kept an open string for forward compatibility.
  health?: 'active' | 'needs_attention' | string
}

export interface WatchListResponse {
  watches: ApiWatch[]
}

// path_prefix format: `s3/{group_id}/{node_id}/{bucket}/{key-prefix}` for
// data_uploaded, `meta/{group_id}/{document-path-prefix}` for metadata_created.
// The slash after the bucket or group is required, no leading slash, and the
// two namespaces cannot be combined in one watch.
export interface CreateWatchRequest {
  path_prefix: string
  events: string[]
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
