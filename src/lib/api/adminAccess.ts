import { apiRequest, type ApiClientOptions } from './client'
import type { GroupQuotaStatus } from './usage'

// GET /access/groups/{id}/tokens: tokens this node holds for the group, never a secret.
export type GroupTokenKind = 'session' | 's3_credential' | 's3_session'
export type GroupTokenStatus = 'active' | 'expired' | 'revoked'

export interface GroupToken {
  kind: GroupTokenKind
  id: string
  owner: string
  created_at: string | null
  expires_at: string
  last_used_at: string | null
  status: GroupTokenStatus
}

export interface GroupTokensResponse {
  tokens: GroupToken[]
}

export interface RevocationResponse {
  revoked: number
  /** The member is a service account of the group and lost every token. */
  all_tokens: boolean
}

// Counts and sizes only; the routes never name buckets, objects or datasets.
export interface GroupStatistics {
  group_id: string
  display_name: string
  members: number
  admins: number
  buckets: number
  distinct_buckets?: number
  objects: number
  logical_bytes: number
  referenced_bytes: number
  quota?: GroupQuotaStatus
  running_jobs: number
  recent_jobs?: number
  active_tokens?: number
}

export interface GroupStatisticsList {
  groups: GroupStatistics[]
}

const groupPath = (groupId: string) => `/access/groups/${encodeURIComponent(groupId)}`

export function listGroupTokens(groupId: string, client: ApiClientOptions = {}): Promise<GroupTokensResponse> {
  return apiRequest<GroupTokensResponse>(`${groupPath(groupId)}/tokens`, {}, client)
}

export function revokeGroupToken(
  groupId: string,
  kind: GroupTokenKind,
  tokenId: string,
  client: ApiClientOptions = {},
): Promise<RevocationResponse> {
  const path = `${groupPath(groupId)}/tokens/${kind}/${encodeURIComponent(tokenId)}`
  return apiRequest<RevocationResponse>(path, { method: 'DELETE' }, client)
}

export function revokeMemberTokens(
  groupId: string,
  userId: string,
  client: ApiClientOptions = {},
): Promise<RevocationResponse> {
  const path = `${groupPath(groupId)}/members/${encodeURIComponent(userId)}/tokens`
  return apiRequest<RevocationResponse>(path, { method: 'DELETE' }, client)
}

/** Ends every token of the user on every node; realm administrators only. */
export function revokeUserTokens(userId: string, client: ApiClientOptions = {}): Promise<void> {
  return apiRequest<void>(`/access/users/${encodeURIComponent(userId)}/tokens`, { method: 'DELETE' }, client)
}

/** Grants (PUT) or removes (DELETE) the realm admin role; answers every realm admin id, sorted. */
export function setRealmAdmin(userId: string, admin: boolean, client: ApiClientOptions = {}): Promise<string[]> {
  const path = `/system/realm/admins/${encodeURIComponent(userId)}`
  return apiRequest<string[]>(path, { method: admin ? 'PUT' : 'DELETE' }, client)
}

// PUT /access/users/{id}/status: a ban ends every token at once and blocks sign-in until undone.
export const DEACTIVATED_ATTRIBUTE = 'aruna-engine.org/deactivated'

export function setAccountActive(userId: string, active: boolean, client: ApiClientOptions = {}): Promise<void> {
  const path = `/access/users/${encodeURIComponent(userId)}/status`
  return apiRequest<void>(path, { method: 'PUT', body: JSON.stringify({ active }) }, client)
}

export function getGroupStatistics(groupId: string, client: ApiClientOptions = {}): Promise<GroupStatistics> {
  return apiRequest<GroupStatistics>(`${groupPath(groupId)}/statistics`, {}, client)
}

export function listGroupStatistics(client: ApiClientOptions = {}): Promise<GroupStatisticsList> {
  return apiRequest<GroupStatisticsList>('/system/groups/statistics', {}, client)
}
