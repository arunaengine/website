import type { BadgeVariant } from '@/components/nodes/node-display'
import type { PlacementLike } from '@/lib/jobs'
import type { WorkspaceChoice } from '@/lib/workspaces'

// ── GA4GH TES v1.1 ───────────────────────────────────────────────────────────
// Verified against the Aruna TES facade (api/src/routes/tes.rs, aruna #425).
// Consumers stay gated on featureEnabled('tes') because the routes exist only
// when the serving node has a compute backend configured.

export type TesState =
  | 'UNKNOWN'
  | 'QUEUED'
  | 'INITIALIZING'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETE'
  | 'EXECUTOR_ERROR'
  | 'SYSTEM_ERROR'
  | 'CANCELED'
  | 'PREEMPTED' // added in TES 1.1
  | 'CANCELING' // added in TES 1.1

export type TesFileType = 'FILE' | 'DIRECTORY'
export type TesView = 'MINIMAL' | 'BASIC' | 'FULL'

export interface TesInput {
  name?: string
  description?: string
  // Required by the backend; must be an s3://bucket/key URL. Inline `content`
  // is rejected (400), so scripts are uploaded to S3 and referenced here.
  url?: string
  // Inline literal the spec allows instead of a url. Both the facade and the
  // native surface reject it; typed so a re-run prefill can detect one.
  content?: string
  // Absolute path inside the container the input is materialized at.
  path: string
  type?: TesFileType // default FILE; only FILE is accepted
}

export interface TesOutput {
  name?: string
  description?: string
  url: string
  // May carry POSIX wildcards (*, ?, [...]) to capture several files.
  path: string
  // Literal ancestor stripped from every match before it is appended to `url`.
  // Required when `path` has wildcards, ignored otherwise.
  path_prefix?: string
  type?: TesFileType
}

export interface TesResources {
  cpu_cores?: number
  preemptible?: boolean
  ram_gb?: number
  disk_gb?: number
}

export interface TesExecutor {
  image: string
  command: string[]
  workdir?: string
  env?: Record<string, string>
}

export interface TesExecutorLog {
  start_time?: string
  end_time?: string
  stdout?: string
  stderr?: string
  exit_code?: number
}

export interface TesOutputFileLog {
  url: string
  path: string
  // int64 serialized as a string per the spec.
  size_bytes: string
}

export interface TesTaskLog {
  logs: TesExecutorLog[]
  start_time?: string
  end_time?: string
  outputs: TesOutputFileLog[]
  system_logs?: string[]
}

export interface TesTask {
  id?: string // output only
  state?: TesState // output only
  name?: string
  description?: string
  inputs?: TesInput[]
  outputs?: TesOutput[]
  resources?: TesResources
  executors: TesExecutor[] // current facade requires exactly one on create
  volumes?: string[]
  tags?: Record<string, string>
  logs?: TesTaskLog[] // output only
  creation_time?: string // output only, RFC3339
  // Aruna extension (not GA4GH): per-run workspace handling. The current
  // facade derives the workspace from the serving node's deployment and
  // ignores this field, so the run's effective mode is the `workspace_mode`
  // the native job reports back. useTes.createTask degrades gracefully when a
  // node rejects the unknown field instead.
  workspace?: WorkspaceChoice
}

export interface TesCreateTaskResponse {
  id: string
}

export interface TesListTasksResponse {
  tasks: TesTask[]
  next_page_token?: string
}

// Shape verified against api/src/routes/tes.rs service_info: snake_case fields,
// the GA4GH service-type triple under `type`, `storage` currently emitted empty.
export interface TesServiceInfo {
  id: string
  name: string
  type: { group: string; artifact: string; version: string }
  description?: string
  organization: { name: string; url: string }
  documentation_url?: string
  environment?: string
  version: string
  storage?: string[]
}

// ── Task state helpers ───────────────────────────────────────────────────────

// Owning-group tag (api/src/routes/tes.rs GROUP_TAG_KEY). The portal uses bearer
// auth, for which the backend requires this tag; an S3-credential caller instead
// derives the group and may omit it. The node accounts the run under this group.
export const TES_GROUP_TAG = 'aruna-engine.org/group'

// Optional dedup tag scoped per authenticated user (IDEMPOTENCY_TAG_KEY); a
// duplicate key bound to a different task plan is rejected with 409.
export const TES_IDEMPOTENCY_TAG = 'aruna-engine.org/idempotency-key'

// Pins the executor kind the task may run on (EXECUTOR_TAG_KEY); it becomes
// the native request's `executor_constraint`. Echoed back on BASIC and FULL.
export const TES_EXECUTOR_TAG = 'aruna-engine.org/executor'

// ── Read-only placement tags ─────────────────────────────────────────────────
// Agreed contract: BASIC and FULL task views carry the native job's identity
// and, once the request is placed, its planner outcome. A node that has not
// shipped them omits the keys, so every accessor returns undefined and the
// consuming UI hides the row rather than inventing a value.

/** The native job id behind the task; always present once served. */
export const TES_JOB_ID_TAG = 'aruna-engine.org/job-id'
/** The family's logical state, when the responder knows it. */
export const TES_LOGICAL_STATE_TAG = 'aruna-engine.org/logical-state'
/** The chosen executor kind, only once the request is placed. */
export const TES_EXECUTOR_KIND_TAG = 'aruna-engine.org/executor-kind'
/** Planner transfer estimate, a decimal string, only once placed. */
export const TES_TRANSFER_BYTES_TAG = 'aruna-engine.org/estimated-transfer-bytes'

export const TES_READONLY_TAGS: readonly string[] = [
  TES_JOB_ID_TAG,
  TES_LOGICAL_STATE_TAG,
  TES_EXECUTOR_KIND_TAG,
  TES_TRANSFER_BYTES_TAG,
]

export interface TesPlacementTags {
  jobId?: string
  logicalState?: string
  executorKind?: string
  estimatedTransferBytes?: number
}

// Non-negative decimals only: a malformed value is dropped rather than shown.
function tagBytes(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined
  const parsed = Number(value.trim())
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

export function tesPlacementTags(tags: Record<string, string> | undefined): TesPlacementTags {
  const read = (key: string) => tags?.[key]?.trim() || undefined
  return {
    jobId: read(TES_JOB_ID_TAG),
    logicalState: read(TES_LOGICAL_STATE_TAG),
    executorKind: read(TES_EXECUTOR_KIND_TAG),
    estimatedTransferBytes: tagBytes(read(TES_TRANSFER_BYTES_TAG)),
  }
}

// The verdict needs both halves: an executor kind without an estimate cannot
// say whether bytes moved, so it stays unplaced rather than guessing zero.
export function tesPlacementLike(placement: TesPlacementTags): PlacementLike | null {
  if (!placement.executorKind || placement.estimatedTransferBytes === undefined) return null
  return {
    executor_kind: placement.executorKind,
    estimated_transfer_bytes: placement.estimatedTransferBytes,
  }
}

// The backend emits 9 of the 11 states; PAUSED and PREEMPTED are accepted as
// list filters but never produced (api/src/routes/tes.rs tes_state).
export const TES_TERMINAL_STATES: ReadonlySet<TesState> = new Set<TesState>([
  'COMPLETE',
  'EXECUTOR_ERROR',
  'SYSTEM_ERROR',
  'CANCELED',
  'PREEMPTED',
])

// UNKNOWN | QUEUED | INITIALIZING | RUNNING | PAUSED | CANCELING — anything the
// backend is still working on. Used to decide whether to keep polling.
const TES_ACTIVE_STATES: ReadonlySet<TesState> = new Set<TesState>([
  'UNKNOWN',
  'QUEUED',
  'INITIALIZING',
  'RUNNING',
  'PAUSED',
  'CANCELING',
])

export function isTerminalTesState(state: TesState | undefined): boolean {
  return state === undefined ? false : TES_TERMINAL_STATES.has(state)
}

// A missing state counts as active so polling continues until the backend
// reports a concrete terminal state.
export function isActiveTesState(state: TesState | undefined): boolean {
  return state === undefined ? true : TES_ACTIVE_STATES.has(state)
}

// One place fixes the TES state machine colours (Badge variants).
export const TES_STATE_META: Record<TesState, { label: string; variant: BadgeVariant }> = {
  UNKNOWN: { label: 'Unknown', variant: 'outline' },
  QUEUED: { label: 'Queued', variant: 'secondary' },
  INITIALIZING: { label: 'Initializing', variant: 'sky' },
  RUNNING: { label: 'Running', variant: 'accent' },
  PAUSED: { label: 'Paused', variant: 'warn' },
  COMPLETE: { label: 'Complete', variant: 'success' },
  EXECUTOR_ERROR: { label: 'Executor error', variant: 'destructive' },
  SYSTEM_ERROR: { label: 'System error', variant: 'destructive' },
  CANCELING: { label: 'Canceling', variant: 'warn' },
  CANCELED: { label: 'Canceled', variant: 'outline' },
  PREEMPTED: { label: 'Preempted', variant: 'warn' },
}

// ── Data references ──────────────────────────────────────────────────────────
// Same canonical id the profile publish flow emits (useProfilePublish.ts keeps
// its own module-private copy; intentionally not refactored here — diff scope).
export const W3ID_DATA_PREFIX = 'https://w3id.org/aruna/data/'

const HEX64 = /^[0-9a-f]{64}$/i

export interface ParsedS3Ref {
  bucket: string
  key: string
}

// s3://bucket/key, or path-style {endpoint}/bucket/key when `endpoint` is given.
export function parseS3Url(url: string, endpoint?: string | null): ParsedS3Ref | null {
  const value = url.trim()
  if (!value) return null
  let rest: string | null = null
  if (value.startsWith('s3://')) {
    rest = value.slice('s3://'.length)
  } else if (endpoint) {
    const base = endpoint.replace(/\/+$/, '')
    if (value === base) return null
    if (value.startsWith(`${base}/`)) rest = value.slice(base.length + 1)
  }
  if (rest === null) return null
  rest = rest.replace(/^\/+/, '')
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const bucket = rest.slice(0, slash)
  const key = rest.slice(slash + 1)
  if (!bucket || !key) return null
  return { bucket, key }
}

// True for the DRS-resolvable id forms the node accepts (routes/drs.rs
// parse_requested_object_id): a canonical w3id URL with a 64-hex blake3 hash, a
// content-hash ARN (arn:aruna:<realm>:<node>:ch/<64-hex>). `drs://` URIs are the
// GA4GH scheme and are passed to the backend verbatim.
export function isDrsReference(url: string): boolean {
  const value = url.trim()
  if (value.startsWith(W3ID_DATA_PREFIX)) {
    return HEX64.test(value.slice(W3ID_DATA_PREFIX.length))
  }
  if (/^drs:\/\//i.test(value)) return true
  const arn = value.match(/^arn:aruna:[^:]+:[^:]+:ch\/([0-9a-f]{64})$/i)
  return arn !== null
}

export function drsObjectHref(apiBase: string, id: string): string {
  return `${apiBase.replace(/\/+$/, '')}/ga4gh/drs/v1/objects/${encodeURIComponent(id)}`
}

export function drsDownloadHref(apiBase: string, id: string): string {
  return `${apiBase.replace(/\/+$/, '')}/ga4gh/drs/v1/download?object_id=${encodeURIComponent(id)}`
}

// ── Container path validation ────────────────────────────────────────────────

// Absolute canonical container FILE path: /a/b.txt, no trailing slash, no
// empty, '.' or '..' segments.
export function validContainerFilePath(path: string): boolean {
  return (
    path.startsWith('/') &&
    path !== '/' &&
    !path.split('/').slice(1).some((component) => !component || component === '.' || component === '..')
  )
}

// Absolute canonical container DIRECTORY path (mount points, folder capture
// bases). A missing trailing slash is tolerated; '/' itself is a valid mount
// root. Normalize with normalizeContainerDir before building paths on top.
export function validContainerDir(path: string): boolean {
  const value = path.trim()
  if (!value.startsWith('/')) return false
  if (value === '/') return true
  const segments = value.replace(/\/$/, '').split('/').slice(1)
  return segments.every((segment) => segment && segment !== '.' && segment !== '..')
}

export function normalizeContainerDir(path: string): string {
  const value = path.trim()
  return value.endsWith('/') ? value : `${value}/`
}

// ── Compute input picker entries ─────────────────────────────────────────────
// Discriminated union the TesDataRefDialog emits and the input editors store:
// files map 1:1 to TES inputs; a folder pick is expanded at add time (for
// validation and the file cap) but carried as ONE entry with its file list so
// editors render a summary row. The facade accepts type FILE inputs only, so
// folders MUST be expanded to per-file inputs at task assembly.
export type TesDataRefEntry =
  | { kind: 'file'; url: string; path: string; name: string }
  | {
      kind: 'folder'
      bucket: string
      prefix: string
      name: string
      /** Container directory the folder's files mount under; absolute, trailing slash. */
      basePath: string
      files: Array<{ key: string; /** Path relative to the folder prefix (may contain '/'). */ name: string }>
    }

// Expands one picker entry into its TES FILE inputs (folders: one per file).
export function expandDataRefEntry(entry: TesDataRefEntry): TesInput[] {
  if (entry.kind === 'file') {
    return [{ name: entry.name, url: entry.url, path: entry.path.trim(), type: 'FILE' }]
  }
  const base = normalizeContainerDir(entry.basePath)
  return entry.files.map((file) => ({
    name: `${entry.name}/${file.name}`,
    url: `s3://${entry.bucket}/${file.key}`,
    path: `${base}${file.name}`,
    type: 'FILE',
  }))
}

// ── Output captures ──────────────────────────────────────────────────────────
// The facade rejects `type: DIRECTORY`, so a folder capture is expressed as a
// wildcard output instead. The glob is built with a literal separator, so `*`
// never crosses '/': only the folder's own files are captured, and nested
// subfolders are not. `path_prefix` is the literal ancestor stripped from each
// match before the remainder is appended to the destination key.

export function isFolderCapture(containerPath: string): boolean {
  return containerPath.trim().endsWith('/')
}

/** Destination key without its trailing separator; the backend appends one. */
function capturePrefixKey(key: string): string {
  return key.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

// One capture row (container path plus S3 destination) as a TES output.
export function captureOutput(containerPath: string, bucket: string, key: string): TesOutput {
  const path = containerPath.trim()
  const target = bucket.trim()
  if (!isFolderCapture(path)) {
    return { url: `s3://${target}/${key.trim().replace(/^\/+/, '')}`, path, type: 'FILE' }
  }
  const directory = path.replace(/\/+$/, '')
  return {
    url: `s3://${target}/${capturePrefixKey(key)}`,
    path: `${directory}/*`,
    path_prefix: directory,
    type: 'FILE',
  }
}

// Inverse of captureOutput for a re-run prefill: a wildcard capture becomes the
// folder row it came from, so the editor shows a folder rather than a pattern.
export function captureContainerPath(output: TesOutput): string {
  const path = output.path.trim()
  if (output.path_prefix && path === `${output.path_prefix.replace(/\/+$/, '')}/*`) {
    return `${output.path_prefix.replace(/\/+$/, '')}/`
  }
  // A legacy DIRECTORY output still restores as the folder it named.
  if (output.type === 'DIRECTORY' && !path.endsWith('/')) return `${path}/`
  return path
}

// ── Task pruning ─────────────────────────────────────────────────────────────

function trimmed(value: string | undefined): string | undefined {
  const v = value?.trim()
  return v ? v : undefined
}

function pruneRecord(record: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!record) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(record)) {
    const k = key.trim()
    if (k) out[k] = value
  }
  return Object.keys(out).length ? out : undefined
}

function pruneInput(input: TesInput): TesInput {
  const out: TesInput = { path: input.path.trim() }
  const name = trimmed(input.name)
  if (name) out.name = name
  const description = trimmed(input.description)
  if (description) out.description = description
  const url = trimmed(input.url)
  if (url) out.url = url
  if (input.type && input.type !== 'FILE') out.type = input.type
  return out
}

function pruneOutput(output: TesOutput): TesOutput {
  const out: TesOutput = { url: output.url.trim(), path: output.path.trim() }
  const name = trimmed(output.name)
  if (name) out.name = name
  const description = trimmed(output.description)
  if (description) out.description = description
  const prefix = trimmed(output.path_prefix)
  if (prefix) out.path_prefix = prefix
  if (output.type) out.type = output.type
  return out
}

function pruneExecutor(executor: TesExecutor): TesExecutor {
  const out: TesExecutor = {
    image: executor.image.trim(),
    command: executor.command.map((arg) => arg).filter((arg) => arg !== ''),
  }
  const workdir = trimmed(executor.workdir)
  if (workdir) out.workdir = workdir
  const env = pruneRecord(executor.env)
  if (env) out.env = env
  return out
}

function pruneResources(resources: TesResources | undefined): TesResources | undefined {
  if (!resources) return undefined
  const out: TesResources = {}
  if (typeof resources.cpu_cores === 'number' && !Number.isNaN(resources.cpu_cores)) {
    out.cpu_cores = resources.cpu_cores
  }
  if (typeof resources.ram_gb === 'number' && !Number.isNaN(resources.ram_gb)) out.ram_gb = resources.ram_gb
  if (typeof resources.disk_gb === 'number' && !Number.isNaN(resources.disk_gb)) out.disk_gb = resources.disk_gb
  if (resources.preemptible) out.preemptible = true
  return Object.keys(out).length ? out : undefined
}

// Drops empty optional fields from a wizard draft so the submitted JSON is the
// minimal spec-valid document (no empty arrays/objects/'' values). Output-only
// fields (id/state/logs/creation_time) are never carried through.
export function pruneTesTask(task: TesTask): TesTask {
  const out: TesTask = { executors: task.executors.slice(0, 1).map(pruneExecutor) }
  const name = trimmed(task.name)
  if (name) out.name = name
  const description = trimmed(task.description)
  if (description) out.description = description
  const inputs = (task.inputs ?? []).map(pruneInput).filter((input) => input.path)
  if (inputs.length) out.inputs = inputs
  const outputs = (task.outputs ?? []).map(pruneOutput).filter((output) => output.url && output.path)
  if (outputs.length) out.outputs = outputs
  const resources = pruneResources(task.resources)
  if (resources) out.resources = resources
  if (task.volumes?.length) out.volumes = task.volumes.filter((v) => v.trim())
  // The read-only placement tags are rejected on create, and a re-run prefill
  // copies them straight off a fetched task, so they are dropped here.
  const tags = pruneRecord(task.tags)
  if (tags) {
    for (const key of TES_READONLY_TAGS) delete tags[key]
    if (Object.keys(tags).length) out.tags = tags
  }
  if (task.workspace) {
    const bucket = trimmed(task.workspace.bucket)
    out.workspace =
      task.workspace.mode === 'existing' && bucket
        ? { mode: 'existing', bucket }
        : { mode: task.workspace.mode }
  }
  return out
}
