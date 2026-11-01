import { ApiError, apiRequest, type ApiClientOptions } from './client'

export interface UserInfoResponse {
  user: ApiUser
  /** Logins of other realms that open sessions of this account. */
  linked_logins?: string[]
  /** Accounts merged into this one; their ids resolve to this account. */
  merged_user_ids?: string[]
  /** The same accounts with their own names; `name` is null when the node holds no record. */
  merged_users?: MergedUser[]
  realm: { realm_id: string; roles: ApiRole[] }
  groups: ApiUserGroup[]
  preferences: {
    preferred_profile_path?: string | null
    favourite_metadata_ids: string[]
    theme?: string | null
  }
}

export interface MergedUser {
  user_id: string
  name: string | null
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

// POST /access/users/resolve: batch id → profile resolution (cap 100 ids). `attributes`
// contains only fields the user marked public. Names are public by default.
export interface ResolveUserResult {
  user_id: string
  name: string
  attributes: Record<string, string>
  /** Set for a merged account: the account it now belongs to, whose name is shown. */
  merged_into?: string
}

// POST /access/users/me/merge: the other account becomes a deactivated part of the caller's.
export interface MergeAccountResponse {
  user_id: string
  merged_user_id: string
  subjects: number
  groups: number
  realm_roles: number
  devices: number
  attributes: number
  /** Attributes this account had no room for; they stay on the other account. */
  attributes_not_copied: string[]
  secondaries: number
  /** The other account was already merged into this one. */
  repeated: boolean
}

/** Merges the account of `token`, a fresh realm token of it, into the caller's. */
export function mergeAccount(token: string, client: ApiClientOptions): Promise<MergeAccountResponse> {
  return apiRequest<MergeAccountResponse>(
    '/access/users/me/merge',
    { method: 'POST', body: JSON.stringify({ token }) },
    client,
  )
}

/** Attaches the sign-in of a fresh OIDC token, which has no account yet, to the caller's. */
export function attachSignIn(token: string, client: ApiClientOptions): Promise<GetUserResponse> {
  return apiRequest<GetUserResponse>(
    '/access/users/me/subjects',
    { method: 'POST', body: JSON.stringify({ token }) },
    client,
  )
}

/** True when `GET /access/token` refused a sign-in because no account is registered for it. */
export function signInHasNoAccount(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && error.code === 'account_missing'
}

/** Exchanges an OIDC or realm token for a realm token of its account. */
export async function issueToken(token: string, baseUrl: string, seconds?: number): Promise<string> {
  const query = seconds ? { expires_in_seconds: String(seconds) } : undefined
  return (await apiRequest<{ token: string }>('/access/token', { query }, { baseUrl, token })).token
}
