// Typed wrappers over the REST surface the embedded node serves to its owner
// (aruna `api/src/routes/device/*`). Every call goes to the node's OWN
// listener, never the realm base: these routes exist on this machine only, and
// the owner's unrestricted token is what they authorize.
//
// The node side of this contract ships in parallel, so every reader below
// tolerates missing fields and every caller treats 404/405/501 as "not served
// here yet" rather than an error.
import { ApiError, apiRequest, type ApiClientOptions, type ApiRequestOptions } from './api'

/** Base and token of the local node; the base comes from the shell's status. */
export interface DeviceClient extends ApiClientOptions {
  baseUrl: string
}

/** The node does not serve this route (yet); the surface degrades inline. */
export function isDeviceUnsupported(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405 || err.status === 501)
}

/** The token is not the owner's, so the device refuses to answer for it. */
export function isDeviceForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403
}

/** The recorded hashes no longer describe the file, so the action was refused. */
export function isStaleExpectation(err: unknown): boolean {
  return err instanceof ApiError && err.status === 412
}

function request<T>(path: string, client: DeviceClient, options: ApiRequestOptions = {}): Promise<T> {
  return apiRequest<T>(path, options, client)
}

function post<T>(path: string, client: DeviceClient, body?: unknown): Promise<T> {
  return request<T>(path, client, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function size(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function member<T extends string>(known: readonly T[], value: unknown, fallback: T): T {
  return known.find((entry) => entry === value) ?? fallback
}

// ── Synced folders ───────────────────────────────────────────────────────────

export type FolderMode = 'two_way' | 'upload_only'
export type FolderState = 'active' | 'paused' | 'error'

export const FOLDER_MODES: readonly FolderMode[] = ['two_way', 'upload_only']
const FOLDER_STATES: readonly FolderState[] = ['active', 'paused', 'error']

/** Where a folder's contents live in the realm. */
export interface RemoteBinding {
  node_id: string
  bucket: string
  prefix: string
}

/** Per-folder tallies the detail view leads with. */
export interface FolderCounters {
  in_sync: number
  uploading: number
  conflicts: number
  pending_replacements: number
  remote_deleted: number
  errors: number
}

export interface SyncedFolder {
  folder_id: string
  root: string
  local_bucket: string
  group_id: string
  remote: RemoteBinding
  mode: FolderMode
  /** A local delete becomes a realm delete marker; per folder, on by default. */
  propagate_deletes: boolean
  state: FolderState
  counters: FolderCounters
  last_reconcile_ms: number | null
  created_at_ms: number | null
  message: string | null
}

/** How a bound folder is named to its owner: the last segment of its root. */
export function folderName(root: string): string {
  const parts = root.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? root
}

export interface BindFolderRequest {
  root: string
  group_id: string
  remote: RemoteBinding
  mode: FolderMode
  propagate_deletes: boolean
}

function readBinding(value: unknown): RemoteBinding {
  const raw = record(value)
  return {
    node_id: text(raw.node_id) ?? '',
    bucket: text(raw.bucket) ?? '',
    prefix: text(raw.prefix) ?? '',
  }
}

function readCounters(value: unknown): FolderCounters {
  const raw = record(value)
  return {
    in_sync: count(raw.in_sync),
    uploading: count(raw.uploading),
    conflicts: count(raw.conflicts),
    pending_replacements: count(raw.pending_replacements),
    remote_deleted: count(raw.remote_deleted),
    errors: count(raw.errors),
  }
}

export function readFolder(value: unknown): SyncedFolder {
  const raw = record(value)
  return {
    folder_id: text(raw.folder_id) ?? '',
    root: text(raw.root) ?? '',
    local_bucket: text(raw.local_bucket) ?? '',
    group_id: text(raw.group_id) ?? '',
    remote: readBinding(raw.remote),
    mode: member(FOLDER_MODES, raw.mode, 'two_way'),
    propagate_deletes: raw.propagate_deletes !== false,
    state: member(FOLDER_STATES, raw.state, 'active'),
    counters: readCounters(raw.counters),
    last_reconcile_ms: size(raw.last_reconcile_ms),
    created_at_ms: size(raw.created_at_ms),
    message: text(raw.message),
  }
}

/** Entries needing the owner's decision; nothing here is ever applied for them. */
export const PENDING_ENTRY_STATES = ['conflict', 'pending_replace', 'remote_deleted', 'error'] as const

export type EntryState =
  | 'in_sync'
  | 'local_new'
  | 'local_changed'
  | 'remote_new'
  | 'remote_changed'
  | 'conflict'
  | 'pending_replace'
  | 'remote_deleted'
  | 'local_deleted'
  | 'error'

const ENTRY_STATES: readonly EntryState[] = [
  'in_sync',
  'local_new',
  'local_changed',
  'remote_new',
  'remote_changed',
  'conflict',
  'pending_replace',
  'remote_deleted',
  'local_deleted',
  'error',
]

/** One side of an entry, as the device last saw it. */
export interface EntrySide {
  size: number | null
  /** Local: the file's stat mtime. Remote: when the version was written. */
  modified_at_ms: number | null
  /** Weak fingerprint the sync compares before it hashes anything. */
  fingerprint: string | null
  blake3: string | null
  version_id: string | null
}

export interface FolderEntry {
  path: string
  state: EntryState
  local: EntrySide | null
  remote: EntrySide | null
  /** Why a replacement waits: no synced base, or the local file moved on. */
  reason: 'base_unknown' | 'local_modified' | null
  /** Path of the copy the sync wrote beside the file, when it made one. */
  conflicted_copy: string | null
  message: string | null
  updated_at_ms: number | null
}

function readSide(value: unknown): EntrySide | null {
  if (!value || typeof value !== 'object') return null
  const raw = record(value)
  return {
    size: size(raw.size),
    modified_at_ms: size(raw.modified_at_ms),
    fingerprint: text(raw.fingerprint),
    blake3: text(raw.blake3),
    version_id: text(raw.version_id),
  }
}

export function readEntry(value: unknown): FolderEntry {
  const raw = record(value)
  const reason = text(raw.reason)
  return {
    path: text(raw.path) ?? '',
    state: member(ENTRY_STATES, raw.state, 'error'),
    local: readSide(raw.local),
    remote: readSide(raw.remote),
    reason: reason === 'base_unknown' || reason === 'local_modified' ? reason : null,
    conflicted_copy: text(raw.conflicted_copy),
    message: text(raw.message),
    updated_at_ms: size(raw.updated_at_ms),
  }
}

/** True while the entry is waiting for the owner instead of the sync. */
export function entryPending(entry: FolderEntry): boolean {
  return (PENDING_ENTRY_STATES as readonly string[]).includes(entry.state)
}

export interface EntryPage {
  entries: FolderEntry[]
  next_cursor: string | null
}

export type EntryAction = 'replace_local' | 'keep_local' | 'remove_local' | 'resolve'

/**
 * What the owner saw when they decided. Both local hashes are required: the
 * node compares them before it touches the file and answers 412 when either
 * moved on. `remote_version` names the version an action takes.
 */
export interface ActionExpectation {
  fingerprint: string
  blake3: string
  remote_version?: string
}

/**
 * The expectation for an entry, or null when the device has not hashed the
 * local file yet - nothing that touches it may be requested without both.
 */
export function entryExpectation(entry: FolderEntry): ActionExpectation | null {
  const fingerprint = entry.local?.fingerprint
  const blake3 = entry.local?.blake3
  if (!fingerprint || !blake3) return null
  const remoteVersion = entry.remote?.version_id
  return { fingerprint, blake3, ...(remoteVersion ? { remote_version: remoteVersion } : {}) }
}

export interface ActionRecord {
  action: string
  scope: 'entry' | 'folder'
  path: string | null
  actor: string | null
  at_ms: number | null
  before_blake3: string | null
  after_blake3: string | null
  outcome: string | null
  message: string | null
}

export function readAction(value: unknown): ActionRecord {
  const raw = record(value)
  return {
    action: text(raw.action) ?? '',
    scope: raw.scope === 'folder' ? 'folder' : 'entry',
    path: text(raw.path),
    actor: text(raw.actor),
    at_ms: size(raw.at_ms),
    before_blake3: text(raw.before_blake3),
    after_blake3: text(raw.after_blake3),
    outcome: text(raw.outcome),
    message: text(raw.message),
  }
}

export async function listFolders(client: DeviceClient): Promise<SyncedFolder[]> {
  const answer = await request<unknown>('/device/folders', client)
  return list(record(answer).folders).map(readFolder)
}

export async function getFolder(folderId: string, client: DeviceClient): Promise<SyncedFolder> {
  return readFolder(await request<unknown>(`/device/folders/${encodeURIComponent(folderId)}`, client))
}

export async function bindFolder(body: BindFolderRequest, client: DeviceClient): Promise<SyncedFolder> {
  return readFolder(await post<unknown>('/device/folders', client, body))
}

/** Unbinds the folder. The files on disk are never touched. */
export function unbindFolder(folderId: string, client: DeviceClient): Promise<void> {
  return request<void>(`/device/folders/${encodeURIComponent(folderId)}`, client, { method: 'DELETE' })
}

export async function setFolderPaused(
  folderId: string,
  paused: boolean,
  client: DeviceClient,
): Promise<SyncedFolder> {
  const path = `/device/folders/${encodeURIComponent(folderId)}/${paused ? 'pause' : 'resume'}`
  return readFolder(await post<unknown>(path, client))
}

/** Asks for a reconcile now instead of at the next sweep. */
export async function syncFolder(folderId: string, client: DeviceClient): Promise<SyncedFolder> {
  return readFolder(await post<unknown>(`/device/folders/${encodeURIComponent(folderId)}/sync`, client))
}

export async function listEntries(
  folderId: string,
  params: { state?: EntryState | ''; cursor?: string; limit?: number },
  client: DeviceClient,
): Promise<EntryPage> {
  const answer = record(
    await request<unknown>(`/device/folders/${encodeURIComponent(folderId)}/entries`, client, {
      query: { state: params.state || undefined, cursor: params.cursor, limit: params.limit },
    }),
  )
  return { entries: list(answer.entries).map(readEntry), next_cursor: text(answer.next_cursor) }
}

/**
 * Applies one owner decision to one entry. `expected` carries the hashes the
 * owner was shown, so a file that changed since is refused with 412 instead of
 * being overwritten.
 */
export async function applyEntryAction(
  folderId: string,
  path: string,
  body: { action: EntryAction; expected: ActionExpectation },
  client: DeviceClient,
): Promise<FolderEntry> {
  const route = `/device/folders/${encodeURIComponent(folderId)}/entries/${encodeURIComponent(path)}/actions`
  return readEntry(await post<unknown>(route, client, body))
}

/**
 * Folder-wide replace of every pending entry. `confirm` must be the folder
 * name the owner typed; the node refuses the request without it.
 */
export async function applyFolderAction(
  folderId: string,
  body: { action: 'replace_local'; scope: 'all_pending'; confirm: string },
  client: DeviceClient,
): Promise<SyncedFolder> {
  return readFolder(await post<unknown>(`/device/folders/${encodeURIComponent(folderId)}/actions`, client, body))
}

export async function listFolderActions(folderId: string, client: DeviceClient): Promise<ActionRecord[]> {
  const answer = await request<unknown>(`/device/folders/${encodeURIComponent(folderId)}/actions`, client)
  return list(record(answer).actions).map(readAction)
}

// ── Transfers ────────────────────────────────────────────────────────────────

export type TransferDirection = 'upload' | 'download'
export type TransferState = 'queued' | 'running' | 'retrying' | 'failed' | 'done'

const TRANSFER_STATES: readonly TransferState[] = ['queued', 'running', 'retrying', 'failed', 'done']

export interface DeviceTransfer {
  id: string
  direction: TransferDirection
  folder_id: string | null
  path: string
  bucket: string | null
  key: string | null
  state: TransferState
  bytes_total: number | null
  bytes_done: number | null
  attempts: number
  next_attempt_ms: number | null
  message: string | null
}

export function readTransfer(value: unknown, direction: TransferDirection): DeviceTransfer {
  const raw = record(value)
  return {
    id: text(raw.id) ?? '',
    direction: raw.direction === 'download' || raw.direction === 'upload' ? raw.direction : direction,
    folder_id: text(raw.folder_id),
    path: text(raw.path) ?? '',
    bucket: text(raw.bucket),
    key: text(raw.key),
    state: member(TRANSFER_STATES, raw.state, 'queued'),
    bytes_total: size(raw.bytes_total),
    bytes_done: size(raw.bytes_done),
    attempts: count(raw.attempts),
    next_attempt_ms: size(raw.next_attempt_ms),
    message: text(raw.message),
  }
}

export interface DeviceTransfers {
  uploads: DeviceTransfer[]
  downloads: DeviceTransfer[]
}

export async function getTransfers(client: DeviceClient): Promise<DeviceTransfers> {
  const answer = record(await request<unknown>('/device/transfers', client))
  return {
    uploads: list(answer.uploads).map((entry) => readTransfer(entry, 'upload')),
    downloads: list(answer.downloads).map((entry) => readTransfer(entry, 'download')),
  }
}

// ── Local compute ────────────────────────────────────────────────────────────

/** Ceilings the owner set under This device; null means the node sets it. */
export interface ComputeCaps {
  cpu_cores: number | null
  ram_bytes: number | null
  disk_bytes: number | null
  max_concurrent: number | null
}

export interface DeviceCompute {
  enabled: boolean
  /** Executor kind the node resolved: docker, apptainer, or none. */
  backend: string | null
  health: string
  caps: ComputeCaps
  running: number
  queued: number
  /** A paused node accepts no local runs at all. */
  paused: boolean
  message: string | null
}

export function readCompute(value: unknown): DeviceCompute {
  const raw = record(value)
  const caps = record(raw.caps)
  return {
    enabled: raw.enabled === true,
    backend: text(raw.backend),
    health: text(raw.health) ?? 'unknown',
    caps: {
      cpu_cores: size(caps.cpu_cores),
      ram_bytes: size(caps.ram_bytes),
      disk_bytes: size(caps.disk_bytes),
      max_concurrent: size(caps.max_concurrent),
    },
    running: count(raw.running),
    queued: count(raw.queued),
    paused: raw.paused === true,
    message: text(raw.message),
  }
}

export async function getCompute(client: DeviceClient): Promise<DeviceCompute> {
  return readCompute(await request<unknown>('/device/compute', client))
}

// ── Drafts ───────────────────────────────────────────────────────────────────

/** Metadata authored offline on this device, waiting to be published. */
export interface DeviceDraft {
  draft_id: string
  kind: string | null
  label: string | null
  state: string | null
  updated_at_ms: number | null
}

export function readDraft(value: unknown): DeviceDraft {
  const raw = record(value)
  return {
    draft_id: text(raw.draft_id) ?? text(raw.id) ?? '',
    kind: text(raw.kind),
    label: text(raw.label) ?? text(raw.title) ?? text(raw.name),
    state: text(raw.state),
    updated_at_ms: size(raw.updated_at_ms),
  }
}

export async function listDrafts(client: DeviceClient): Promise<DeviceDraft[]> {
  const answer = await request<unknown>('/device/drafts', client)
  return list(Array.isArray(answer) ? answer : record(answer).drafts).map(readDraft)
}
