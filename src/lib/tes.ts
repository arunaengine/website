import type { BadgeVariant } from '@/components/nodes/node-display'

// ── GA4GH TES v1.1 (aruna#290) ───────────────────────────────────────────────
// Current Aruna TES facade. Consumers remain gated on featureEnabled('tes')
// because the routes are useful only when the serving node has a compute
// backend configured.

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
  // Required unless `content` carries the literal file body inline.
  url?: string
  // Absolute path inside the container the input is materialized at.
  path: string
  type?: TesFileType // default FILE
}

export interface TesOutput {
  name?: string
  description?: string
  url: string
  path: string
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
}

export interface TesCreateTaskResponse {
  id: string
}

export interface TesListTasksResponse {
  tasks: TesTask[]
  next_page_token?: string
}

// GA4GH service-info uses camelCase for its own fields (spec-faithful);
// storage / tesResources_backend_parameters are the TES additions.
export interface TesServiceInfo {
  id: string
  name: string
  type: { group: string; artifact: string; version: string }
  description?: string
  organization: { name: string; url: string }
  contactUrl?: string
  documentationUrl?: string
  createdAt?: string
  updatedAt?: string
  environment?: string
  version: string
  storage?: string[]
  tesResources_backend_parameters?: string[]
}

// ── Task state helpers ───────────────────────────────────────────────────────

// ASSUMED aruna extension (aruna#290): every task MUST carry the owning group
// as a tag. Key follows the reserved aruna.io/ label prefix already used by
// core placement matchers (aruna.io/kind) and plan #269 (aruna.io/location).
export const TES_GROUP_TAG = 'aruna.io/group'

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
  const tags = pruneRecord(task.tags)
  if (tags) out.tags = tags
  return out
}
