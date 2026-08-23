import { apiRequest, type ApiClientOptions } from './api'

// w3id persistent identifiers, verified against aruna api/src/routes/pid.rs.
// PIDs are minted automatically when a document is persisted; the portal only
// reads GET /metadata/{id}/pids and performs the admin-only withdrawal on
// DELETE /pid/{id}.

export type PersistentIdState =
  | 'requested'
  | 'processing'
  | 'active'
  | 'failed'
  | 'admin-withdrawn'
  | 'tombstoned'
  | 'unknown'

export interface PersistentIdFailure {
  message: string
  retryable: boolean
  recorded_at_ms: number
}

export interface PersistentIdView {
  kind: string
  provider: string
  value: string | null
  state: PersistentIdState
  document_id: string
  job_id: string | null
  failure: PersistentIdFailure | null
  requested_at_ms: number | null
  minted_at_ms: number | null
  withdrawn_at_ms: number | null
}

// GET /metadata/{document_id}/pids — the typed status is authoritative;
// `unknown` means the authority record is missing or unreachable, never
// "unminted".
export function listPersistentIds(
  documentId: string,
  client: ApiClientOptions,
): Promise<PersistentIdView[]> {
  return apiRequest<PersistentIdView[]>(
    `/metadata/${encodeURIComponent(documentId)}/pids`,
    {},
    client,
  )
}

// DELETE /pid/{document_id} — exceptional administrative withdrawal. Terminal
// and idempotent: the landing page answers 410 Gone forever afterwards.
export function withdrawPid(
  documentId: string,
  confirmPid: string,
  reason: string,
  client: ApiClientOptions,
): Promise<void> {
  return apiRequest<void>(
    `/pid/${encodeURIComponent(documentId)}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ provider: 'w3id', confirm_pid: confirmPid, reason }),
    },
    client,
  )
}

type PidBadgeVariant = 'secondary' | 'success' | 'warn' | 'destructive' | 'outline'

const PID_STATE_META = {
  requested: { label: 'Registering', variant: 'secondary' },
  processing: { label: 'Registering', variant: 'secondary' },
  active: { label: 'Active', variant: 'success' },
  failed: { label: 'Registration failed', variant: 'destructive' },
  'admin-withdrawn': { label: 'Withdrawn — permanent', variant: 'destructive' },
  tombstoned: { label: 'Tombstoned', variant: 'outline' },
  unknown: { label: 'Status unknown', variant: 'warn' },
} satisfies Record<PersistentIdState, { label: string; variant: PidBadgeVariant }>

export function pidStateMeta(state: PersistentIdState): { label: string; variant: PidBadgeVariant } {
  return PID_STATE_META[state] ?? PID_STATE_META.unknown
}
