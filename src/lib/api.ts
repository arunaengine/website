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
  return import.meta.env.VITE_ARUNA_API_BASE_URL || DEFAULT_API_BASE_URL
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

  const response = await fetch(url, { ...options, headers })
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
    capabilities: string
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
  interfaces: InterfaceServicesStatus
}

export interface RealmNodeInfo {
  node_id: string
  kind: 'management' | 'server' | 'local' | 'user'
  configured: boolean
  present: boolean
  connection_status: 'connected' | 'configured'
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

export interface MetadataSearchResponse {
  hits: Array<{
    document_id: string
    group_id: string
    document_path: string
    graph_iri: string
    subject_iri: string
    score: number
  }>
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

export interface CreateMetadataRequest {
  group_id: string
  path: string
  public?: boolean
  name?: string
  description?: string
  date_published?: string
  license?: string
  rocrate?: unknown
}

// The API flattens the summary fields onto the response body
// (CreateMetadataResponse uses #[serde(flatten)]).
export type CreateMetadataResponse = MetadataDocumentListItem
