import { ApiError, apiRequest, apiUrl, type ApiClientOptions } from './api'
import { fetchWithRetry } from './fetch'
import type { BadgeVariant } from '@/components/nodes/node-display'
import { stateVariant } from './stateBadge'
import { errorMessage } from './utils'

// Durable background jobs, verified against aruna api/src/routes/jobs.rs and
// core/src/structs/job.rs. The surface is owner-scoped and rejects
// path-restricted (delegated) tokens with 403.

// JobState::name(): stable machine-readable names, closed set.
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
  /** The exact version this execution wrote; the object head may be later. */
  version_id: string
  execution_id: string
  // Omitted when the backend recorded no container path.
  container_path?: string
  size: number
  digest?: string
  /**
   * Node-local S3 endpoint owning this exact version; the responder is not
   * necessarily the execution node. Always serialized, null when this
   * responder does not know the owning node's endpoint.
   */
  endpoint_url: string | null
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
  /** Absent on a device: a local run belongs to no submission family. */
  submission_id?: string | undefined
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
  // JobKind::name(): probe | execution | write_run_crate | terminal_cleanup |
  // staging | import_rocrate | export_rocrate | harvest | mint_persistent_id |
  // storage_purge. Kept open for new kinds.
  kind: string
  state: JobState
  attempts: number
  cancel_requested: boolean
  created_at: string // RFC3339
  updated_at: string
  finished_at?: string
  progress: JobProgressResponse
  error?: JobErrorResponse
  // JobResultPayload::to_public_json(): payload-specific projection.
  result?: unknown
  workspace_bucket?: string
  // WorkspaceMode::name(): none | temporary | kept | existing. Always served;
  // "none" means the run had no workspace at all.
  workspace_mode: string
  // Set only on the node-local path; a job answered from the family omits it.
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
  /** Absent on a device: a local run belongs to no submission family. */
  submission_id?: string | undefined
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

// GET /jobs/: the caller's jobs, newest first. There is NO kind filter.
export function listJobs(params: ListJobsParams, client: ApiClientOptions): Promise<JobListResponse> {
  return apiRequest<JobListResponse>(
    '/jobs/',
    { query: { limit: params.limit, cursor: params.cursor, state: params.state } },
    client,
  )
}

// GET /jobs/{job_id}: 404 here means THIS job is unknown (foreign or pruned),
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

// POST /jobs/{job_id}/cancel: idempotent; 202 while live, 200 once terminal.
// There is no restart endpoint.
export function cancelJob(jobId: string, client: ApiClientOptions): Promise<JobStatusResponse> {
  return apiRequest<JobStatusResponse>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }, client)
}

// ── Native submission ────────────────────────────────────────────────────────
// POST /jobs/: the surface the GA4GH facade maps onto. It expresses what TES
// cannot: per-input composition modes, an exact version pin, the collision
// policy, workspace prefixes to inventory, and the workspace mode.

// `exact_reference` requires version_id; `floating_reference` rejects it.
export type InputModeRequest = 'snapshot' | 'floating_reference' | 'exact_reference'

export type CollisionPolicyRequest = 'reject' | 'replace' | 'keep_existing'

export type WorkspaceModeRequest = 'temporary' | 'kept' | 'existing'

export interface ExecutionInputRequest {
  bucket: string
  key: string
  source_node_id?: string
  version_id?: string
  dest_key: string
  /** Absolute container path; the backend defaults it to /inputs/<dest_key>. */
  container_path?: string
  mode?: InputModeRequest
}

export interface ExecutionOutputRequest {
  container_path: string
  /** Destination key inside the workspace bucket. */
  dest_key: string
}

// `bucket` belongs to `existing` alone: sending one with temporary or kept is
// a 400, and omitting the whole block defaults to `kept`.
export interface WorkspaceRequest {
  mode: WorkspaceModeRequest
  bucket?: string
}

export interface SubmitExecutionRequest {
  group_id: string
  image: string
  entrypoint?: string[]
  command: string[]
  env: Record<string, string>
  tags: Record<string, string>
  workdir: string | null
  cpu_cores?: number
  ram_bytes?: number
  max_walltime_ms?: number
  executor_constraint?: string
  inputs: ExecutionInputRequest[]
  outputs: ExecutionOutputRequest[]
  /** Workspace prefixes inventoried at completion; at most 32. */
  output_prefixes: string[]
  collision_policy: CollisionPolicyRequest
  /** Scoped to the caller; the same key with a different plan is a 409. */
  idempotency_key?: string
  workspace?: WorkspaceRequest
  /**
   * Where the job runs. 'local' is the owner's own device and is accepted only
   * by that device's API; absent means the realm, as it always did.
   */
  target?: 'realm' | 'local'
}

export interface SubmitJobResponse {
  /** The caller's stable handle, even when a merge moves the canonical alias. */
  job_id: string
  /** False on an idempotent replay: nothing new was admitted. */
  created: boolean
  /** Absent for a local run, which a device admits without a family. */
  submission_id?: string | undefined
  canonical_job_id: string
  /** Point-in-time; a replay of a running request reports that instead. */
  state: string
  /** A preferred route, not an owner. */
  origin_node_url: string
  status_url: string
}

// POST /jobs/: 201 when admitted, 200 when the idempotency key already names
// this exact plan. `created` tells them apart, so the status is not needed.
export function submitJob(
  request: SubmitExecutionRequest,
  client: ApiClientOptions,
): Promise<SubmitJobResponse> {
  return apiRequest<SubmitJobResponse>(
    '/jobs/',
    { method: 'POST', body: JSON.stringify(request) },
    client,
  )
}

// A 503 is always retryable here, and retrying with the SAME idempotency key
// is what keeps a submission that may already have committed from duplicating.
export function isSubmitRetryable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503
}

export function isNativeSubmitUnsupported(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 405)
}

// A plain-language reason for the refusals this surface actually produces.
// The 503 reason rides in the message, because `code` is the generic status.
export function submitErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return errorMessage(error)
  if (error.status === 503) {
    if (error.message === 'job_placement_unavailable') {
      return 'No node could admit this job right now. Retrying keeps the same idempotency key, so a submission that already committed is not duplicated.'
    }
    if (error.message === 'structured_id_clock_unhealthy') {
      return 'The node could not mint a job id right now. Retry in a moment.'
    }
    return `The node could not admit this job right now (${error.message}). Retry in a moment.`
  }
  if (error.status === 409) {
    if (error.code === 'JobPlanConflict') {
      return 'This idempotency key is already bound to a different plan. Change the run, or start a new submission.'
    }
    if (error.code === 'compute_quota_denied') {
      return `The group's standing compute quota refused this job. ${error.message}`
    }
    return error.message
  }
  if (error.status === 403) {
    return 'This token may not submit for that group, or may not write the workspace bucket it names.'
  }
  if (error.status === 401) return 'Sign in again before submitting.'
  return error.message
}

// ── Frozen per-entry report ──────────────────────────────────────────────────
// Only import_rocrate and export_rocrate jobs keep one; every other kind is a
// plain 404. Rows are untyped on the wire (serde_json::Value), so the shared
// envelope is typed and the detail is left open.

export interface JobReportRow {
  entry_key: string
  // ReasonCode: imported | unlisted | failed | not_attempted | included |
  // external | denied | missing | offline | unsupported | path_synthesized |
  // unrewritten_reference | signature_dropped | unsupported_crate_version.
  code: string
  message: string | null
  detail?: unknown
}

export interface JobReportResponse {
  rows: JobReportRow[]
  // Opaque; bound to this job AND to the frozen report it was issued against.
  next_cursor?: string
  report_digest: string
}

export interface GetJobReportParams {
  // Server default 200, clamped to 1000.
  limit?: number
  cursor?: string
}

// GET /jobs/{job_id}/report. A 404 carrying code `report_pending` means the
// job is not terminal yet and the caller should poll; any other 404 means
// there is no readable report at all. A 409 means the cursor was issued for a
// different job or a different frozen snapshot.
export function getJobReport(
  jobId: string,
  params: GetJobReportParams,
  client: ApiClientOptions,
): Promise<JobReportResponse> {
  return apiRequest<JobReportResponse>(
    `/jobs/${encodeURIComponent(jobId)}/report`,
    { query: { limit: params.limit, cursor: params.cursor } },
    client,
  )
}

// The pending 404 is a bare {code, state} document, not the standard error
// body, so the job state rides in `state` rather than in `details`.
export function reportPendingState(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 404) return null
  if (error.code !== 'report_pending') return null
  const state = error.details?.state
  return typeof state === 'string' ? state : 'unknown'
}

// No readable report at all: unknown job, a job of a kind that keeps none, or
// one whose retention window passed. Distinct from the pending 404.
export function isReportAbsent(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code !== 'report_pending'
}

export function isReportCursorConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

// ── Run crate artifact ───────────────────────────────────────────────────────
// GET|HEAD /jobs/{job_id}/artifacts/rocrate. Binary application/zip behind
// bearer auth, so it cannot be a plain link: fetch it and hand the caller a
// Blob. `pending` and `expired` are honest states, not failures.

export type JobArtifactState = 'available' | 'pending' | 'expired' | 'absent' | 'unauthorized' | 'error'

export interface JobArtifactStatus {
  state: JobArtifactState
  /** BLAKE3 hex of the archive, quotes stripped; only when available. */
  etag?: string
  size?: number
  filename?: string
  /** Job state the backend reported while the artifact is still pending. */
  jobState?: string
  message?: string
}

const ARTIFACT_TIMEOUT_MS = 120_000

function artifactPath(jobId: string): string {
  return `/jobs/${encodeURIComponent(jobId)}/artifacts/rocrate`
}

function unquote(value: string | null): string | undefined {
  if (!value) return undefined
  return value.replace(/^W\//, '').replace(/^"|"$/g, '') || undefined
}

// Content-Disposition filename*, else the ASCII fallback.
function artifactFilename(header: string | null): string | undefined {
  if (!header) return undefined
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1])
    } catch {
      /* fall through to the ASCII form */
    }
  }
  return /filename="([^"]*)"/i.exec(header)?.[1] || undefined
}

async function statusFromResponse(response: Response): Promise<JobArtifactStatus> {
  if (response.ok || response.status === 206) {
    const length = Number(response.headers.get('Content-Length'))
    return {
      state: 'available',
      etag: unquote(response.headers.get('ETag')),
      size: Number.isFinite(length) ? length : undefined,
      filename: artifactFilename(response.headers.get('Content-Disposition')),
    }
  }
  // HEAD answers carry no body; a coded body is read when there is one.
  let body: Record<string, unknown> = {}
  try {
    body = (await response.json()) as Record<string, unknown>
  } catch {
    /* header-only answer */
  }
  const code = typeof body.code === 'string' ? body.code : undefined
  const message = typeof body.error === 'string' ? body.error : undefined
  if (response.status === 410) return { state: 'expired', message }
  if (response.status === 401 || response.status === 403) return { state: 'unauthorized', message }
  if (response.status === 404) {
    if (code !== 'artifact_pending') return { state: 'absent', message }
    return {
      state: 'pending',
      jobState: typeof body.details === 'string' ? body.details : undefined,
      message,
    }
  }
  return { state: 'error', message: message ?? `${response.status} ${response.statusText}` }
}

export async function headJobArtifact(
  jobId: string,
  client: ApiClientOptions,
): Promise<JobArtifactStatus> {
  const headers = new Headers()
  if (client.token) headers.set('Authorization', `Bearer ${client.token}`)
  const response = await fetchWithRetry(
    apiUrl(artifactPath(jobId), {}, client),
    { method: 'HEAD', headers },
    ARTIFACT_TIMEOUT_MS,
  )
  return statusFromResponse(response)
}

export interface JobArtifactDownload extends JobArtifactStatus {
  blob?: Blob
}

// Full download. The caller owns the object URL it creates from `blob`.
export async function downloadJobArtifact(
  jobId: string,
  client: ApiClientOptions,
): Promise<JobArtifactDownload> {
  const headers = new Headers()
  if (client.token) headers.set('Authorization', `Bearer ${client.token}`)
  const response = await fetchWithRetry(
    apiUrl(artifactPath(jobId), {}, client),
    { method: 'GET', headers },
    ARTIFACT_TIMEOUT_MS,
  )
  if (!response.ok) return statusFromResponse(response)
  const status = await statusFromResponse(response.clone())
  return { ...status, blob: await response.blob() }
}

// ── Placement verdict ────────────────────────────────────────────────────────
// The planner routes every input to the candidate it ranks best; an input the
// candidate already holds routes locally and contributes zero bytes
// (core/src/scheduling/cost.rs). A zero total therefore means every input was
// already on the chosen executor's node: the compute went to the data.

export type PlacementVerdict = 'compute-to-data' | 'data-to-compute' | 'unplaced'

export interface PlacementVerdictInfo {
  verdict: PlacementVerdict
  label: string
  explanation: string
}

/** Only the two fields the verdict depends on, so TES tags can reuse it. */
export interface PlacementLike {
  executor_kind?: string
  estimated_transfer_bytes: number
}

export function placementVerdict(placement?: PlacementLike | null): PlacementVerdictInfo {
  if (!placement?.executor_kind) {
    return {
      verdict: 'unplaced',
      label: 'Not placed',
      explanation:
        'No executor was selected in a plan this node sealed, so there is no local verdict. Another node may have planned the request.',
    }
  }
  if (placement.estimated_transfer_bytes === 0) {
    return {
      verdict: 'compute-to-data',
      label: 'Compute-to-data',
      explanation:
        'Every input already had a usable copy on the node that was chosen to run the work, so the plan expected to move no bytes.',
    }
  }
  return {
    verdict: 'data-to-compute',
    label: 'Data-to-compute',
    explanation:
      'At least one input had no usable copy on the chosen node, so the plan expected to move those bytes to it before the run.',
  }
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

const JOB_STATE_LABEL: Record<JobState, string> = {
  queued: 'Queued',
  claimed: 'Claimed',
  preparing: 'Preparing',
  ready: 'Ready',
  running: 'Running',
  cancelling: 'Cancelling',
  indeterminate: 'Indeterminate',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

// Colours come from the shared state vocabulary.
export const JOB_STATE_META = Object.fromEntries(
  (Object.keys(JOB_STATE_LABEL) as JobState[]).map((state) => [
    state,
    { label: JOB_STATE_LABEL[state], variant: stateVariant(state) },
  ]),
) as Record<JobState, { label: string; variant: BadgeVariant }>

const JOB_KIND_LABEL: Record<string, string> = {
  probe: 'Probe',
  execution: 'Execution',
  write_run_crate: 'Write run crate',
  terminal_cleanup: 'Terminal cleanup',
  staging: 'Staging',
  import_rocrate: 'Import RO-Crate',
  export_rocrate: 'Export RO-Crate',
  harvest: 'Harvest',
  mint_persistent_id: 'Mint persistent id',
  storage_purge: 'Storage purge',
}

// `kind` stays open for kinds the backend adds, so an unknown one reads as its
// own words rather than as a raw identifier.
export function jobKindLabel(kind: string): string {
  const known = JOB_KIND_LABEL[kind]
  if (known) return known
  const words = kind.replaceAll('_', ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : kind
}

// "12 / 40 steps" with a known total, "12 steps" without one.
export function formatJobProgress(progress: JobProgressResponse): string {
  const { current, total, unit } = progress
  return total != null ? `${current} / ${total} ${unit}` : `${current} ${unit}`
}

// null when the total is unknown or zero; callers skip the bar then.
export function jobProgressPercent(progress: JobProgressResponse): number | null {
  if (progress.total == null || progress.total <= 0) return null
  return Math.min(100, (progress.current / progress.total) * 100)
}
