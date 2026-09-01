import { apiRequest, type ApiClientOptions } from './client'

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

// One live S3 session of the caller, as listed by GET /access/s3/sessions.
// Nodes carry no secret here, and everything but the key id is optional so a
// node that keeps less than another still lists.
export interface S3SessionSummary {
  access_key_id: string
  group_id?: string
  group_name?: string
  group?: { id?: string; name?: string }
  node_id?: string
  created_at?: string
  expires_at?: string
}

export interface ListS3SessionsResponse {
  sessions?: S3SessionSummary[]
}

export function listS3Sessions(
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<ListS3SessionsResponse> {
  return apiRequest<ListS3SessionsResponse>('/access/s3/sessions', { signal }, client)
}

/** Revokes one of the caller's own sessions; a foreign key answers 404. */
export function revokeS3Session(
  accessKeyId: string,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  return apiRequest<void>(
    `/access/s3/sessions/${encodeURIComponent(accessKeyId)}`,
    { method: 'DELETE', signal },
    client,
  )
}
