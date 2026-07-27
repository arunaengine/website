import { apiRequest, type ApiClientOptions } from './api'
import type { BadgeVariant } from '@/components/nodes/node-display'

// Durable background jobs, verified against aruna api/src/routes/jobs.rs and
// core/src/structs/job.rs. The surface is owner-scoped and rejects
// path-restricted (delegated) tokens with 403.

// JobState::name() — stable machine-readable names, closed set.
export type JobState =
  | 'queued'
  | 'claimed'
  | 'preparing'
  | 'ready'
  | 'running'
  | 'cancelling'
  | 'indeterminate'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface JobProgressResponse {
  current: number
  // Omitted (not null) while the executor has not published a total.
  total?: number
  unit: string
}

// `kind` is JobErrorKind::name(): 'retryable' | 'permanent' today; kept an
// open string so new kinds render instead of breaking (ApiNotification pattern).
export interface JobErrorResponse {
  message: string
  kind: string
}

export interface JobStatusResponse {
  job_id: string // ULID
  // JobPayload::kind(): probe | execution | staging | import_rocrate |
  // export_rocrate | write_run_crate | terminal_cleanup. Kept open for new kinds.
  kind: string
  state: JobState
  attempts: number
  cancel_requested: boolean
  created_at: string // RFC3339
  updated_at: string
  finished_at?: string
  progress: JobProgressResponse
  error?: JobErrorResponse
  // JobResultPayload::to_public_json() — payload-specific projection.
  result?: unknown
  workspace_bucket?: string
  // Agreed contract addition: how the run's workspace is handled
  // ("temporary" | "kept" | "existing"); kept open for older/newer backends.
  workspace_mode?: string
  run_crate?: unknown
}

export interface JobListResponse {
  jobs: JobStatusResponse[]
  // Opaque base64url cursor; omitted on the last page. Pass back verbatim.
  next_cursor?: string
}

export interface ListJobsParams {
  // Server default 50, clamped to max 200.
  limit?: number
  cursor?: string
  state?: JobState
}

// GET /jobs/ — the caller's jobs, newest first. There is NO kind filter.
export function listJobs(params: ListJobsParams, client: ApiClientOptions): Promise<JobListResponse> {
  return apiRequest<JobListResponse>(
    '/jobs/',
    { query: { limit: params.limit, cursor: params.cursor, state: params.state } },
    client,
  )
}

// GET /jobs/{job_id} — 404 here means THIS job is unknown (foreign or pruned),
// not necessarily an absent endpoint.
export function getJob(jobId: string, client: ApiClientOptions): Promise<JobStatusResponse> {
  return apiRequest<JobStatusResponse>(`/jobs/${encodeURIComponent(jobId)}`, {}, client)
}

// POST /jobs/{job_id}/cancel — idempotent; 202 while live, 200 once terminal.
// There is no restart endpoint.
export function cancelJob(jobId: string, client: ApiClientOptions): Promise<JobStatusResponse> {
  return apiRequest<JobStatusResponse>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }, client)
}

export const JOB_STATE_ORDER: JobState[] = [
  'queued',
  'claimed',
  'preparing',
  'ready',
  'running',
  'cancelling',
  'indeterminate',
  'succeeded',
  'failed',
  'cancelled',
]

// JobState::is_terminal().
const JOB_TERMINAL_STATES: ReadonlySet<JobState> = new Set<JobState>(['succeeded', 'failed', 'cancelled'])

export function isTerminalJobState(state: JobState): boolean {
  return JOB_TERMINAL_STATES.has(state)
}

// One place fixes the job state machine colours (Badge variants).
export const JOB_STATE_META: Record<JobState, { label: string; variant: BadgeVariant }> = {
  queued: { label: 'Queued', variant: 'secondary' },
  claimed: { label: 'Claimed', variant: 'sky' },
  preparing: { label: 'Preparing', variant: 'sky' },
  ready: { label: 'Ready', variant: 'accent' },
  running: { label: 'Running', variant: 'accent' },
  cancelling: { label: 'Cancelling', variant: 'warn' },
  indeterminate: { label: 'Indeterminate', variant: 'warn' },
  succeeded: { label: 'Succeeded', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
}

// "12 / 40 steps" with a known total, "12 steps" without one.
export function formatJobProgress(progress: JobProgressResponse): string {
  const { current, total, unit } = progress
  return total != null ? `${current} / ${total} ${unit}` : `${current} ${unit}`
}

// null when the total is unknown or zero — callers skip the bar then.
export function jobProgressPercent(progress: JobProgressResponse): number | null {
  if (progress.total == null || progress.total <= 0) return null
  return Math.min(100, (progress.current / progress.total) * 100)
}
