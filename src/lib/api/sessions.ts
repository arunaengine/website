// --- User sessions (POST+GET /users/sessions, DELETE /users/sessions/{id}) ---
// Every bearer the realm mints is bound to a session the user can list and
// revoke. The portal login is itself a `portal` session; an AI client or a
// chat panel gets a child session of kind `assistant`.
import { apiRequest, type ApiClientOptions } from './client'

export type SessionKind = 'portal' | 'assistant' | 'api'

export interface UserSession {
  session_id: string
  kind: SessionKind
  label: string
  created_at: string
  expires_at: string
  revoked: boolean
  /** The session this request authenticated with. */
  current: boolean
}

export interface ListSessionsResponse {
  sessions: UserSession[]
}

export interface CreateSessionRequest {
  kind: SessionKind
  label?: string
  /** Bounded server-side by the parent session's remaining lifetime. */
  expires_in_seconds?: number
}

export interface CreateSessionResponse {
  session_id: string
  kind: SessionKind
  label: string
  /** Carried exactly once; the node keeps only a hash. */
  token: string
  expires_at: string
}

export function listSessions(
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<ListSessionsResponse> {
  return apiRequest<ListSessionsResponse>('/users/sessions', { signal }, client)
}

export function createSession(
  request: CreateSessionRequest,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<CreateSessionResponse> {
  return apiRequest<CreateSessionResponse>(
    '/users/sessions',
    { method: 'POST', body: JSON.stringify(request), signal },
    client,
  )
}

export function revokeSession(
  sessionId: string,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  return apiRequest<void>(
    `/users/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE', signal },
    client,
  )
}

export const SESSION_KIND_LABELS: Readonly<Record<SessionKind, string>> = {
  portal: 'Portal',
  assistant: 'Assistant',
  api: 'API',
}
