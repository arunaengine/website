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
