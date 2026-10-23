import { apiRequest, type ApiClientOptions } from './client'
import { importsPath } from './backendImports'

// Organize a linked folder: move existing files, remove stored copies, pause or abort a
// running step, and the size of a permanent delete. Nodes without the routes answer 404.

export const PAGE_SIZE = 100

/** One page of a preview. `next` is an opaque cursor; a count is a lower bound until `complete`. */
export interface PageQuery {
  filter?: string
  limit?: number
  after?: string | null
}

export interface MoveRequest {
  /** File name pattern of the files to move, such as `*.faa.gz`. */
  pattern: string
  /** Where they go; `{name}` is the file name, such as `proteins/{name}`. */
  target: string
  /** Only files under this folder. */
  from?: string
  subfolders?: boolean
}

export interface MoveItem {
  from: string
  to: string
  /** Why the file stays, such as a taken name. */
  conflict?: string | null
}

export interface MovePreview {
  total: number
  complete: boolean
  items: MoveItem[]
  next?: string | null
  /** Another step holds the bucket, so a move cannot start now. */
  blocked?: boolean | string | null
}

export interface StoredFile {
  path: string
  bytes: number
}

export interface DuplicateItem {
  key: string
  kept: StoredFile
  removed: StoredFile[]
}

export interface DuplicatePreview {
  total: number
  bytes: number
  complete: boolean
  items: DuplicateItem[]
  next?: string | null
}

export type OrganizeKind = 'move' | 'rename' | 'duplicates'
export type OrganizeState = 'running' | 'paused' | 'done' | 'aborted'

export interface OrganizeJob {
  kind: OrganizeKind
  state: OrganizeState
  done: number
  skipped: number
  failed: number
  /** Zero for a rename started on an older node, which reports no total. */
  total: number
  /** The total is final; before that it is a lower bound. */
  counted: boolean
  waiting?: boolean | string | null
  started_at_ms: number
  finished_at_ms?: number | null
  controls: boolean
}

export interface LinkStatus {
  /** What the link holds, when the node counts it. */
  files?: number
  /** Files that more than one link claims. */
  conflicts: { path: string; reason: string }[]
}

export interface DeleteScope {
  kind: 'file' | 'folder' | 'bucket'
  bucket: string
  /** The file key or folder prefix; empty for a bucket. */
  key: string
}

export interface DeleteItem {
  key: string
  version_id: string
  bytes: number
  storage_file?: { path: string; bytes: number; kept?: string | null } | null
}

export interface DeleteImpact {
  files: number
  versions: number
  bytes: number
  storage_files: number
  storage_bytes: number
  /** Storage files that stay because something else uses them; counts the current page only. */
  kept_files: number
  complete: boolean
  items: DeleteItem[]
  next?: string | null
}

function organizePath(groupId: string, importId: string, step: string): string {
  return `${importsPath(groupId, importId)}/organize/${step}`
}

function post(body: unknown): { method: 'POST'; body: string } {
  return { method: 'POST', body: JSON.stringify(body) }
}

export function previewMove(
  groupId: string,
  importId: string,
  request: MoveRequest,
  page: PageQuery,
  client: ApiClientOptions,
): Promise<MovePreview> {
  return apiRequest(organizePath(groupId, importId, 'move/preview'), post({ ...request, ...page }), client)
}

/** Moves exactly the files the request names; only names in Aruna change. */
export function startMove(
  groupId: string,
  importId: string,
  request: MoveRequest,
  client: ApiClientOptions,
): Promise<OrganizeJob> {
  return apiRequest(organizePath(groupId, importId, 'move'), post(request), client)
}

export function previewDuplicates(
  groupId: string,
  importId: string,
  page: PageQuery,
  client: ApiClientOptions,
): Promise<DuplicatePreview> {
  return apiRequest(organizePath(groupId, importId, 'duplicates/preview'), post(page), client)
}

export function startDuplicates(groupId: string, importId: string, client: ApiClientOptions): Promise<OrganizeJob> {
  return apiRequest(organizePath(groupId, importId, 'duplicates'), { method: 'POST' }, client)
}

/** The step that runs now; null when none does. */
export function getOrganizeJob(groupId: string, importId: string, client: ApiClientOptions): Promise<OrganizeJob | null> {
  return apiRequest(organizePath(groupId, importId, 'job'), {}, client)
}

/** 409 `no_job` when nothing runs. */
export function controlJob(
  groupId: string,
  importId: string,
  action: 'pause' | 'resume' | 'abort',
  client: ApiClientOptions,
): Promise<OrganizeJob> {
  return apiRequest(organizePath(groupId, importId, `job/${action}`), { method: 'POST' }, client)
}

export function getLinkStatus(groupId: string, importId: string, client: ApiClientOptions): Promise<LinkStatus> {
  return apiRequest(organizePath(groupId, importId, 'status'), {}, client)
}

/** What a permanent delete removes in Aruna and in storage; nothing changes. */
export function getDeleteImpact(scope: DeleteScope, client: ApiClientOptions, page: PageQuery = {}): Promise<DeleteImpact> {
  const path = `/data/buckets/${encodeURIComponent(scope.bucket)}/storage/delete/preview`
  // An empty filter is left out, so a node that lacks the field never sees it.
  const { filter, ...rest } = page
  return apiRequest(path, post({ kind: scope.kind, key: scope.key, ...rest, ...(filter ? { filter } : {}) }), client)
}
