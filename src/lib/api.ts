import { portalConfig } from './config'
import { RATE_LIMITED_STATUS, fetchWithRetry } from './fetch'
import { errorMessage } from './utils'

const DEFAULT_API_BASE_URL = '/api/v1'
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Machine-readable backend code, e.g. `rate_limited`. */
    public code?: string,
    /** Parsed structured backend error body. */
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** True when the backend rate limiter rejected the request. */
export function isRateLimited(error: unknown): boolean {
  return error instanceof ApiError && error.status === RATE_LIMITED_STATUS
}

// A node that is not a management node relays management-only routes to one;
// these codes mean no management node answered.
const RELAY_FAILURE_CODES = ['no_management_node', 'relay_failed']

export const NO_MANAGEMENT_NODE_MESSAGE = 'No management node is reachable right now. Try again later.'

/** True when a management-only call found no management node to serve it. */
export function isNoManagementNode(error: unknown): boolean {
  return error instanceof ApiError && RELAY_FAILURE_CODES.includes(error.code ?? '')
}

/** Message to show for a failed request. */
export function apiErrorMessage(error: unknown): string {
  if (isNoManagementNode(error)) return NO_MANAGEMENT_NODE_MESSAGE
  return errorMessage(error)
}

function rateLimitMessage(response: Response): string {
  const seconds = Number(response.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0
    ? `Too many requests. Please try again in ${Math.ceil(seconds)}s.`
    : 'Too many requests. Please try again in a moment.'
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

// Origin the API base points at. The base is absolute when the node serves the
// portal on its own listener, and relative when portal and API share an origin.
export function apiOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl, window.location.origin).origin
  } catch {
    return window.location.origin
  }
}

// Absolute URL of an API path, so callers that need the raw Response (range
// downloads, ETag reads) build the same URL apiRequest would.
export function apiUrl(
  path: string,
  query: ApiRequestOptions['query'] = {},
  client: ApiClientOptions = {},
): URL {
  const baseUrl = (client.baseUrl || defaultApiBaseUrl()).replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${baseUrl}${normalizedPath}`, window.location.origin)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
  client: ApiClientOptions = {},
): Promise<T> {
  const url = apiUrl(path, options.query, client)

  const headers = new Headers(options.headers)
  const token = options.token ?? client.token
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetchWithRetry(url, { ...options, headers }, DEFAULT_REQUEST_TIMEOUT_MS)
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    let code: string | undefined
    let details: Record<string, unknown> | undefined
    try {
      const body = await response.json() as Record<string, unknown>
      details = body
      // `msg` is the GA4GH TES error shape (api/src/routes/tes.rs).
      const bodyMessage = body.message || body.error || body.msg
      if (typeof bodyMessage === 'string') message = bodyMessage
      code = typeof body.code === 'string' ? body.code : undefined
    } catch {
      // Keep the HTTP status message if the body is not JSON.
    }
    // A 429 has already survived the one retry fetchWithRetry allows, so tell
    // the user to wait rather than repeating the limiter's terse wording.
    if (response.status === RATE_LIMITED_STATUS) {
      message = rateLimitMessage(response)
      code = code ?? 'rate_limited'
    }
    throw new ApiError(response.status, message, code, details)
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
    capabilities: 'management' | 'server'
  }
  api_version?: string
  portal?: PortalStatus | null
  my_addresses: string[]
  connections?: unknown
  services: {
    interfaces: InterfaceServicesStatus
    database?: { status: string }
    network?: { status: string }
    blob?: BlobServiceStatus
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

// /info services.blob: verified against aruna api/src/routes/info.rs
// (BlobServiceStatus / BackendStatus). `backends` lists every registered
// backend; the headline `status` is the default backend's. Nodes that predate
// configurable storage omit `backends` entirely.
export interface BlobServiceStatus {
  status: string
  backend?: string | null
  max_bucket_size?: number | null
  multipart_bucket?: string | null
  backends?: BackendStatus[]
}

export interface BackendStatus {
  name: string
  /** Driver type (s3, filesystem, …), not the tenant-facing kind. */
  backend: string
  /** Storage class label tenant routing rules may prefer; null when unlabelled. */
  class?: string | null
  allow_tenants: boolean
  /** Operator limit for user data; null/absent means no limit. */
  quota_bytes?: number | null
  default: boolean
  status: string
  /**
   * Bytes stored on this backend. Served only once per-backend quota
   * enforcement ships (consolidation plan B9); while it is absent nothing is
   * rejected for going over `quota_bytes`.
   */
  used_bytes?: number
}

// GET /info/usage; may grow extra fields, unknown ones are ignored.
export interface UsageResponse {
  buckets: number
  objects: number
  stored_blobs: number
  stored_bytes: number
  // Newer backends add logical bytes and, for authenticated callers, realm-wide totals.
  logical_bytes?: number
  referenced_bytes: number
  realm?: UsageTotals
  // Realm-wide total of live metadata documents; only on GET /info/usage.
  metadata_documents?: number
  // Exact lifecycle-live purpose counts; only on GET /groups/{id}/usage.
  dataset_count?: number | null
  profile_count?: number | null
  process_run_count?: number | null
  // Present on GET /groups/{id}/usage from quota-aware backends.
  quota?: GroupQuotaStatus
}

export interface GroupQuotaStatus {
  // Effective group quota (override else default); null means unlimited.
  quota_bytes: number | null
  // Quota × grace: the enforced hard cap; null means unlimited.
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
  referenced_bytes: number
}

// ---------------------------------------------------------------------------
// Usage history: arunaengine/aruna#250 workplan item 3 ("history snapshots
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
  metadata_replication: { default_replication_factor: number | null }
  public_overview?: {
    live_datasets: number | null
    groups: number | null
    nodes_configured: number | null
  }
  // Public on newer backends: whether this node is a management node, and the
  // api base urls of the realm's management nodes, this node's own first.
  is_management_node?: boolean
  management_urls?: string[]
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

// One compute backend a node advertises (info.rs ExecutorCapabilityResponse).
// `file_staging` means the executor can materialize inputs on local disk,
// `direct_s3` that it reads them straight from S3.
export interface ExecutorCapability {
  kind: string
  file_staging: boolean
  direct_s3: boolean
}

export interface RealmNodePublishedInfo {
  // Empty on a node with no compute backend configured.
  executors: ExecutorCapability[]
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
  kind: 'management' | 'server' | 'user'
  // Owner of a 'user' node; null for infrastructure nodes. Absent on backends
  // that predate device enrollment.
  owner?: string | null
  configured: boolean
  present: boolean
  // Infrastructure nodes report 'connected'/'configured' from realm presence.
  // A device publishes none, so it reports 'seen' when it reached the
  // answering node in the last three minutes and 'unknown' otherwise.
  connection_status: 'connected' | 'configured' | 'seen' | 'unknown'
  // Unix ms of a device's last authenticated contact with the answering node.
  // Devices only, and absent until that node has seen one.
  last_seen_ms?: number
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
  // Public roles apply to every principal, including anonymous requests.
  public?: boolean
}

// GET /groups/{id}/data-paths: browsable data permission paths that feed the
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

// GET /users: realm user directory (verified against aruna
// api/src/routes/users.rs: ListUsersResponse over GetUserResponse, which is
// exactly ApiUser). `limit` defaults to 100, clamped 1..=1000;
// `next_start_after` is the exclusive user-id cursor, absent on the last page.
// Requires READ on /{realm_id}/admin/u/**.
export interface ListUsersResponse {
  users: ApiUser[]
  next_start_after?: string | null
}

// GET /users/{id}: resolves any user id within the caller's realm.
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
  /** Approximate match count (estimated per group, may over- or under-count); absent on older nodes. */
  total_estimate?: number
}

export interface MetadataRoCrateResponse {
  rocrate: unknown
  total_data_entities?: number | null
  returned_data_entities?: number | null
  next_offset?: number | null
  next_cursor?: string | null
}

// GET /metadata/{id} and the response body of PUT /metadata/{id}/rocrate,
// POST /metadata (flattened): the registry summary without rocrate_summary.
export type MetadataDocumentSummary = Omit<MetadataDocumentListItem, 'rocrate_summary'>

export interface ReplaceMetadataRoCrateRequest {
  rocrate: unknown
  // Omitted keeps the document's current visibility.
  public?: boolean
}

export type ProfileValidationSeverity = 'violation' | 'warning' | 'info'
export type ProfileValidationCompleteness = 'complete' | 'incomplete'
export type ProfileValidationBackendState = 'not_profiled' | 'valid' | 'invalid' | 'stale'

export interface ProfileValidationFinding {
  code: string
  severity: ProfileValidationSeverity
  focus_node?: string | null
  path?: string | null
  rule: string
  message: string
  profile_revision?: string | null
  completeness: ProfileValidationCompleteness
}

export interface ProfileValidationCapabilitiesResponse {
  evaluator: string
  supported_constraints: string[]
  unsupported_constraint_policy: 'fail_closed'
  public_profile_iri_template: string
}

export interface ProfileValidationStatusResponse {
  document_id: string
  dataset_revision: string
  state: ProfileValidationBackendState
  profile_id?: string | null
  profile_iri?: string | null
  profile_revision?: string | null
  evaluator: string
  validated_at_ms?: number | null
  findings: ProfileValidationFinding[]
  completeness: ProfileValidationCompleteness
  stale_reason?: string | null
}

// RO-Crate structural violation, as served by the write path and the preview.
export interface RoCrateStructuralViolation {
  code: string
  message: string
  pointer?: string | null
  entity_id?: string | null
}

export interface ProfileValidationPreviewResponse {
  // The verdict POST /metadata or PUT /metadata/{id}/rocrate would enforce.
  accepted: boolean
  state: Exclude<ProfileValidationBackendState, 'stale'>
  profile_id?: string | null
  profile_iri?: string | null
  profile_revision?: string | null
  evaluator: string
  findings: ProfileValidationFinding[]
  completeness: ProfileValidationCompleteness
  structural_violations: RoCrateStructuralViolation[]
}

/**
 * POST /metadata/profile-validation/preview: advisory validation of a draft
 * crate before it is saved. Rate limited like revalidate; 404/405 means the
 * node does not serve the preview at all.
 */
export function previewProfileValidation(
  rocrate: unknown,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<ProfileValidationPreviewResponse> {
  return apiRequest<ProfileValidationPreviewResponse>(
    '/metadata/profile-validation/preview',
    { method: 'POST', body: JSON.stringify({ rocrate }), signal },
    client,
  )
}

export function profileValidationFindings(error: unknown): ProfileValidationFinding[] {
  const findings = error instanceof ApiError ? error.details?.findings : undefined
  if (!Array.isArray(findings)) return []
  return findings.filter((finding): finding is ProfileValidationFinding => {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) return false
    const value = finding as Record<string, unknown>
    return typeof value.code === 'string'
      && (value.severity === 'violation' || value.severity === 'warning' || value.severity === 'info')
      && typeof value.rule === 'string'
      && typeof value.message === 'string'
      && (value.completeness === 'complete' || value.completeness === 'incomplete')
  })
}

// GET /metadata/search: verified against aruna api/src/routes/metadata.rs and
// operations/src/metadata/{api.rs,search_cursor.rs} (aruna feat/portal-backend).
// Contract: `q` is required and trimmed to >= 2 chars (shorter ⇒ 400); `limit`
// defaults to 25 and is clamped 1..=100; `mode=local|distributed`. `group_id`
// and `conforms_to` (exact conformsTo profile IRI) filter documents server-side.
// `cursor` is an accepted, query- and filter-bound opaque token: a cursor whose
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

// GET /search/buckets: federated bucket-name search (verified against aruna
// api/src/routes/search.rs on feat/portal_extensions). `q` is a case-insensitive
// bucket-name substring, trimmed to >= 2 chars (shorter ⇒ 400); `limit` defaults
// to 10 and is clamped 1..=50. Partiality is signalled via nodes_failed with the
// failing node ids listed in failed_nodes. Requires an authenticated session.
export interface BucketSearchHit {
  /** `arn:aruna:<realm>:<node>:s3/<bucket>`. Parse with parseArunaArn. */
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

// GET /search/objects: authenticated live-head inventory search. The backend
// applies group READ and token path restrictions per hit and deliberately
// exposes no total. Distributed strict fails instead of returning a partial
// page; best-effort and local answers carry their exact coverage.
export type ObjectSearchMode = 'local' | 'distributed_best_effort' | 'distributed_strict'
export type ObjectSearchMatchMode = 'substring' | 'prefix'
export type ObjectSearchScope = 'this_node' | 'realm'

export interface ObjectSearchChecksum {
  algorithm: string
  value: string
}

export interface ObjectSearchHit {
  kind: 'object'
  mode: ObjectSearchMode
  issuer_node_id: string
  group_id: string
  bucket: string
  key: string
  content_w3id?: string | null
  checksum?: ObjectSearchChecksum | null
  size?: number | null
  updated_at?: string | null
}

export interface ObjectSearchIndexFreshness {
  source: string
  as_of: string
  oldest_observed_at?: string | null
}

export interface ObjectSearchPartitionCoverage {
  node_id: string
  observed_at: string
  truncated: boolean
}

export interface ObjectSearchCoverage {
  scope: ObjectSearchScope
  mode: ObjectSearchMode
  index_freshness: ObjectSearchIndexFreshness
  nodes_queried: number
  nodes_failed: number
  failed_partitions: string[]
  omitted_partitions: number
  complete: boolean
  truncated: boolean
  partitions: ObjectSearchPartitionCoverage[]
}

export interface ObjectSearchResponse {
  hits: ObjectSearchHit[]
  next_cursor?: string | null
  coverage: ObjectSearchCoverage
}

export interface ObjectSearchOptions {
  bucket?: string
  match?: ObjectSearchMatchMode
  mode?: ObjectSearchMode
  limit?: number
  cursor?: string
  signal?: AbortSignal
}

// GET /search: unified realm search (aruna api/src/routes/search.rs). Returns
// only the requested sections; `types` defaults to all four. `cursor` continues
// exactly one section and is rejected with 400 when more than one type is asked
// for (buckets never page; a buckets cursor is always 400). `limit` is
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
  truncated: boolean
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

// POST /users/resolve: batch id → profile resolution (cap 100 ids). `attributes`
// is the safe scholarly subset only; sensitive keys (e.g. email) are excluded.
export interface ResolveUserResult {
  user_id: string
  name: string
  attributes: Record<string, string>
}

export interface SparqlResponse {
  kind: 'Solutions' | 'Boolean'
  value: Array<Record<string, string>> | boolean
  complete: boolean
  nodes_queried: number
  nodes_failed: number
  failed_partitions: string[]
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

export interface CreateS3SessionRequest {
  group_id: string
}

export interface S3SessionRestriction {
  pattern: string
  permission: string
}

export interface S3SessionResponse {
  access_key_id: string
  secret_access_key: string
  session_token: string
  expires_at: string
  group: { id: string }
  restrictions: S3SessionRestriction[]
  issuer_node: {
    node_id: string
    s3_endpoint?: string | null
  }
}

// Source connectors (GET/POST /groups/{group_id}/connectors, verified against
// aruna api/src/routes/connectors.rs). Real, served contract; no gating.
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
// new; older nodes answer 404/501 and callers degrade by hiding/disabling the
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

// Blob staging (POST /staging/, verified against aruna api/src/routes/staging.rs).
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
// Durable staging jobs. POST accepts StagingBatchRequest and recursively walks
// prefixes; list/detail expose truthful item/byte progress and per-item errors.
// ---------------------------------------------------------------------------
export type StagingJobState = 'queued' | 'running' | 'done' | 'failed'
export type StagingJobPhase =
  | 'queued'
  | 'discovering'
  | 'inspecting'
  | 'registering'
  | 'downloading'
  | 'writing'
  | 'completed'
  | 'failed'

export interface StagingJobProgress {
  items_current: number
  items_total?: number | null
  bytes_current: number
  bytes_total?: number | null
  current_path?: string | null
}

export interface StagingJob {
  job_id: string
  strategy: 'reference' | 'snapshot'
  group_id: string
  connector_id: string
  bucket: string
  state: StagingJobState
  phase: StagingJobPhase
  submitted_at: string
  finished_at?: string | null
  error?: string | null
  progress: StagingJobProgress
  errors: Array<{ source_path: string; target_key: string; error: string }>
}

export interface ListStagingJobsResponse {
  jobs: StagingJob[]
  next_cursor?: string
}

export interface CreateStagingJobResponse {
  job_id: string
  created: boolean
}

// ---------------------------------------------------------------------------
// Reference visibility (agreed contract):
//   GET /staging/references?bucket=<b>&prefix=<p>&limit=&cursor=
// reports which keys in a bucket are backed by a reference (an external
// connector source or another Aruna node) instead of node-local bytes. The
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
  /**
   * Connector the reference was staged through (non-native kinds). NOT
   * mutually exclusive with origin_node_id: external-kind entries may carry
   * both, the backend populates the hosting node alongside the connector.
   */
  connector_id?: string
  /**
   * Realm node actually holding the bytes. Always set for aruna_native
   * (which never has a connector_id); external-kind entries may carry it
   * together with connector_id.
   */
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
export type SyncReferenceHandling = 'materialize' | 'preserve' | 'skip'

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
  reference_handling: SyncReferenceHandling
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
  reference_handling: SyncReferenceHandling
  replicate_deletes?: boolean
}

export interface UpdateSyncRelationshipRequest {
  reference_handling: SyncReferenceHandling
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
// ASSUMED API: these endpoints are NOT yet provided by the backend. Shapes are
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

// --- Node onboarding (POST+GET /admin/onboarding/secrets, DELETE /admin/onboarding/secrets/{id},
// GET /onboarding/secrets/{id}/status) ---
// Verified against aruna api/src/routes/onboarding.rs. Management nodes only.
// The admin routes need WRITE on /{realm_id}/admin/onboarding; a 'User' mint is
// self-service for any realm member holding an unrestricted token, and the
// status route additionally answers the owner of the secret it names.

// Serialized aruna_core::onboarding::RequestedOnboardingMode: plain unit
// variants, so capitalized strings on the wire.
export type OnboardingMode = 'Management' | 'Server' | 'User'

export interface CreateOnboardingSecretRequest {
  // Origin-style base URL of a management node reachable by the joiner; the
  // node calls {seed_url}/api/v1/onboarding/bootstrap; never include /api/v1.
  // Empty means "the node serving this request", which is what a device sends.
  seed_url: string
  mode: OnboardingMode
  // Clamped server-side to 60..86400 seconds; default 3600.
  expires_in_seconds?: number | null
}

export interface CreateOnboardingSecretResponse {
  // Carried exactly once; the server keeps only a hash.
  onboarding_secret: string
  // Handle of the minted enrollment, taken by the status and revoke routes.
  // Absent on nodes that predate it, where the device list names it instead.
  enrollment_id?: string
  mode: OnboardingMode
  // Unix seconds.
  expires_at: number
  // aruna://enroll deep link for a 'User' mint, carrying secret/seed/realm;
  // null for infrastructure modes. Opaque; never re-encode it.
  enroll_url?: string | null
}

export interface OnboardingSecretSummary {
  enrollment_id: string // ULID
  // Debug-formatted mode; equals OnboardingMode values today, kept open for new kinds.
  mode: string
  // Owner a 'User' secret is bound to; null for infrastructure modes. Absent on
  // backends that predate device enrollment.
  owner?: string | null
  // Unix seconds. u64::MAX (~1.84e19) marks the never-expiring initial
  // admin-claim secret minted at realm initialization.
  expires_at: number
  // Node id for node claims; a user id when the initial admin-claim secret was
  // redeemed at registration. Serialized as null when unclaimed.
  claimed_node_id: string | null
}

export interface ListOnboardingSecretsResponse {
  secrets: OnboardingSecretSummary[]
}

export type OnboardingClaimStatus = 'pending' | 'claimed' | 'expired'

// A claim outlives the secret's expiry, so 'claimed' never decays to 'expired'.
// An unknown, revoked, pruned or foreign enrollment id answers 404 alike.
export interface OnboardingSecretStatus {
  enrollment_id: string
  mode: string
  owner: string | null
  status: OnboardingClaimStatus
  claimed_node_id: string | null
  expires_at: number
}

// --- User devices (GET /users/me/devices, DELETE /users/me/devices/{id}) ---
// Self-scoped: always the caller's own devices, never another user's. An
// enrolled device is addressed by its node id, an in-flight enrollment by its
// enrollment id, and one device is listed once.
export type UserDeviceStatus = 'enrolled' | 'claimed' | 'pending'

export interface UserDevice {
  id: string
  node_id: string | null
  enrollment_id: string | null
  status: UserDeviceStatus
  // Expiry of an outstanding enrollment secret; null once the device enrolled.
  expires_at: number | null
}

export interface UserDevicesResponse {
  devices: UserDevice[]
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
  | 'job_control'
  | 'placement_policy'

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
  /** The immutable strategy every job family is placed by; never removable. */
  job_family_strategy_id: string
  bindings: RealmPlacementBinding[]
  overrides: RealmPlacementOverride[]
  transitions: RealmTransitionHealth
}

// Counts only; nothing here changes where a request routes.
export interface RealmTransitionHealth {
  active: number
  incomplete_buckets: number
  stalled_buckets: number
  /** Transitions still incomplete after a day. */
  overdue: number
}

// ── Group storage backends ──────────────────────────────────────────────────
// GET/POST /groups/{gid}/storage-backends, GET/PUT/DELETE .../{bid}: verified
// against aruna api/src/routes/group_backends.rs, with the per-kind key
// allowlists in operations/src/group_backends/validation.rs. Every route takes
// group ADMIN. Secrets live in their own keyspace and are never returned.
//
// Three fields/routes are gated on presence: `disabled` (absent on older
// nodes), the enable route and the credentials route (both 404 there). DELETE
// disables the backend once that lands; before it, DELETE is a hard delete and
// can answer 409 while the backend still holds data.
export type GroupBackendKind = 's3' | 'gcs' | 'azblob' | 'azdls' | 'b2'

export interface GroupBackendResponse {
  backend_id: string
  group_id: string
  /** Open string: a node may report a kind this portal does not know. */
  kind: string
  name: string
  public_config: Record<string, string>
  /** Disabled backends refuse new writes; stored objects stay readable. */
  disabled?: boolean
}

export interface ListGroupBackendsResponse {
  backends: GroupBackendResponse[]
}

// Shared body of POST (add) and PUT (replace). PUT changes name and
// credentials only: the keys naming the physical store are fixed after create,
// and a disabled backend refuses it.
export interface GroupBackendRequest {
  name: string
  kind: GroupBackendKind
  public_config: Record<string, string>
  secret_config: Record<string, string>
}

// POST .../{bid}/credentials: writes the credentials alone, allowed on a
// disabled backend too so a leaked key can always be invalidated.
export interface BackendCredentialsRequest {
  secret_config: Record<string, string>
}

// ── Storage routing ─────────────────────────────────────────────────────────
// GET/PUT /buckets/{bucket}/storage-routing and /groups/{gid}/storage-routing:
// verified against aruna api/src/routes/storage_routing.rs. Group ADMIN.
// A target names exactly one of `backend_id` (binds that group backend) or
// `class` (a preference that may fall through to the node default); operator
// backend names are rejected. `warnings` is advisory only: rules are stored
// regardless, because the record replicates to nodes with other class tables.
export interface RoutingTarget {
  backend_id?: string
  class?: string
}

export interface StorageRoutingRule {
  key_prefix: string
  /** Whole-key match instead of a prefix match. */
  exact: boolean
  target: RoutingTarget
}

export interface BucketRoutingResponse {
  bucket: string
  rules: StorageRoutingRule[]
  warnings: string[]
}

export interface GroupRoutingResponse {
  group_id: string
  default_target?: RoutingTarget | null
  warnings: string[]
}

// ── Object storage locations ────────────────────────────────────────────────
// GET /blobs/locations?bucket=&path=&version_id=. Verified against aruna
// api/src/routes/blobs.rs. Reports where the copies of ONE version physically
// live, one entry per destination: `node_id` repeats when a node holds the
// version under several paths, so only `(node_id, bucket, key)` identifies one.
export type BlobCopyState =
  | 'present'
  | 'pending'
  | 'unreachable'
  | 'denied'
  /** The version resolves but carries no bytes: delete marker or reference. */
  | 'not-stored'

export type BlobCopyStorage = 'node-managed' | 'group-backend'

export type LocationScanLimit =
  | 'queued-scan-truncated'
  | 'queued-scan-failed'
  | 'relationship-scan-failed'
  | 'queued-record-unreadable'
  | 'candidate-cap-reached'
  | 'holder-lookup-failed'
  | 'holder-path-unknown'
  | 'holder-unreachable'

export interface BlobCopyResponse {
  node_id: string
  local: boolean
  /** Bucket on that node, which a sync relationship can map away from the requested one. */
  bucket: string
  /** Key on that node, likewise remapped by a sync relationship. */
  key: string
  state: BlobCopyState
  storage?: BlobCopyStorage | null
  /** Node-managed copies only: the operator's storage class label. */
  storage_class?: string | null
  group_backend_id?: string | null
  group_backend_name?: string | null
}

export interface BlobLocationsResponse {
  bucket: string
  key: string
  version_id: string
  copies: BlobCopyResponse[]
  /** False means a copy may be missing from `copies`, not that none exists. */
  complete: boolean
  limits: LocationScanLimit[]
}

// POST /blobs/replicate: asks one node to fetch a copy. Answered 202: the
// copy is queued, not stored yet. Needs WRITE on the object (or the bucket
// when `path` is omitted). `version_id` without `path` is a 400.
export interface ReplicateBlobRequest {
  bucket: string
  path?: string
  version_id?: string
  node_id: string
}

export interface ReplicateBlobResponse {
  bucket: string
  path?: string
  version_id?: string
  target_node_id: string
}

export type RealmPlacementMutationRequest =
  | { mutation: 'upsert_strategy'; strategy: RealmPlacementStrategy }
  | { mutation: 'remove_strategy'; strategy_id: string }
  | { mutation: 'set_default_strategy'; strategy_id: string }
  | { mutation: 'set_binding'; binding: RealmPlacementBinding }
  | { mutation: 'remove_binding'; scope: RealmPlacementBindingScope }
  | { mutation: 'set_override'; placement_override: RealmPlacementOverride }
  | { mutation: 'remove_override'; subject: string }
