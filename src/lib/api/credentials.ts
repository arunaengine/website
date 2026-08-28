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
