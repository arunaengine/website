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

// POST /users/resolve: batch id → profile resolution (cap 100 ids). `attributes`
// is the safe scholarly subset only; sensitive keys (e.g. email) are excluded.
export interface ResolveUserResult {
  user_id: string
  name: string
  attributes: Record<string, string>
}
