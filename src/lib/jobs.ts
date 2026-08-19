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

export type LogicalJobState = 'queued' | 'running' | 'indeterminate' | 'succeeded' | 'failed' | 'cancelled'

export interface JobOutputResponse {
  bucket: string
  key: string
  version_id: string
  execution_id: string
  container_path: string
  size: number
  digest?: string
}

export interface JobPlacementResponse {
  executor_kind?: string
  estimated_transfer_bytes: number
  estimated_transfer_ms: number
  alternatives: number
  rejected: number
  omitted: number
  sealed_at_ms: number
}

export interface JobFamilyResponse {
  submission_id: string
  request_digest: string
  canonical_job_id: string
  aliases: string[]
  alias_count: number
  conflict_count: number
  logical_state: LogicalJobState
  canonical_execution_id?: string
  executions: number
  duplicate_successes: number
  outputs: JobOutputResponse[]
  revision: number
  projection_digest: string
  eventually_consistent: boolean
  responder_node_id?: string
  partial: boolean
  locally_exhausted: boolean
  cancel_requested: boolean
  placement?: JobPlacementResponse
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
  family?: JobFamilyResponse
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

export type JobAuditScope = 'family' | 'submission'
export type JobAuditRecordKind = 'spec' | 'claim' | 'budget' | 'launch' | 'receipt' | 'update' | 'output' | 'cancel'

interface JobAuditRecordBase<K extends JobAuditRecordKind> {
  kind: K
  digest: string
  request_digest: string
  conflicting_family: boolean
  at_ms: number
}

export interface JobAuditSpecRecord extends JobAuditRecordBase<'spec'> {
  job_id: string
  spec_digest: string
}

export interface JobAuditClaimRecord extends JobAuditRecordBase<'claim'> {
  job_id: string
  canonical_alias: boolean
  spec_digest: string
}

export interface JobAuditBudgetRecord extends JobAuditRecordBase<'budget'> {
  sequence: number
  spec_digest: string
}

export interface JobAuditLaunchRecord extends JobAuditRecordBase<'launch'> {
  job_id: string
  sequence: number
  spec_digest: string
  plan_digest: string
}

export interface JobAuditReceiptRecord extends JobAuditRecordBase<'receipt'> {
  job_id: string
  execution_id: string
  spec_digest: string
}

export interface JobAuditUpdateRecord extends JobAuditRecordBase<'update'> {
  execution_id: string
  sequence: number
  state: string
}

export interface JobAuditOutputRecord extends JobAuditRecordBase<'output'> {
  job_id: string
  execution_id: string
  outputs?: JobOutputResponse[]
}

export interface JobAuditCancelRecord extends JobAuditRecordBase<'cancel'> {
  job_id: string
  spec_digest: string
}

export type JobAuditRecord =
  | JobAuditSpecRecord
  | JobAuditClaimRecord
  | JobAuditBudgetRecord
  | JobAuditLaunchRecord
  | JobAuditReceiptRecord
  | JobAuditUpdateRecord
  | JobAuditOutputRecord
  | JobAuditCancelRecord

export interface JobAuditConflict {
  kind: JobAuditRecordKind
  digest: string
  retained: string
  observed_at_ms: number
}

export interface JobAuditResponse {
  submission_id: string
  request_digest: string
  scope: JobAuditScope
  records: JobAuditRecord[]
  conflicts: JobAuditConflict[]
  next_cursor?: string
  projection_digest: string
  responder_node_id?: string
  partial: boolean
}

export interface GetJobAuditParams {
  scope: JobAuditScope
  cursor?: string
  // Server default/max is 64.
  limit?: number
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

// GET /jobs/{job_id}/audit: stable-key pagination. Consumers must sort by
// `at_ms` when presenting the records as a timeline.
export function getJobAudit(
  jobId: string,
  params: GetJobAuditParams,
  client: ApiClientOptions,
): Promise<JobAuditResponse> {
  return apiRequest<JobAuditResponse>(
    `/jobs/${encodeURIComponent(jobId)}/audit`,
    { query: { scope: params.scope, cursor: params.cursor, limit: params.limit } },
    client,
  )
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
