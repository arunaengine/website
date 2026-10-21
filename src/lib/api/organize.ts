import { apiRequest, type ApiClientOptions } from './client'
import { importsPath } from './backendImports'

// Organize a linked folder: move existing files, remove stored copies, pause or abort a
// running step, and the size of a permanent delete. Nodes without the routes answer 404.

export const PAGE_SIZE = 100

export interface PageQuery {
  offset: number
  limit: number
  /** Only names that contain this text. */
  filter: string
}

export interface MoveRequest {
  /** File name pattern of the files to move, such as `*.faa.gz`. */
  pattern: string
  /** Where they go; `{name}` is the file name, such as `proteins/{name}`. */
  target: string
}

export interface MoveItem {
  from: string
  to: string
  /** The target name is already used, so the file stays. */
  taken: boolean
}

export interface MovePreview {
  total: number
  taken: number
  items: MoveItem[]
}

export interface MovePageQuery extends PageQuery {
  /** Show only the files whose target name is taken. */
  onlyTaken: boolean
}

export interface DuplicateItem {
  kept: string
  removed: string
}

export interface DuplicatePreview {
  total: number
  bytes: number
  items: DuplicateItem[]
}

export type OrganizeKind = 'move' | 'rename' | 'duplicates'
export type OrganizeState = 'running' | 'paused' | 'done' | 'aborted' | 'failed'

export interface OrganizeJob {
  kind: OrganizeKind
  state: OrganizeState
  done: number
  total: number
  skipped: number
  /** The step can be paused and aborted; the physical rename cannot. */
  controls: boolean
}

export interface LinkIssues {
  /** Files that more than one link claims. */
  conflicts: { path: string }[]
}

export interface DeleteScope {
  kind: 'file' | 'folder' | 'bucket'
  bucket: string
  /** The file key or folder prefix; empty for a bucket. */
  key: string
}

export interface DeleteImpact {
  files: number
  versions: number
  storage_files: number
  storage_bytes: number
  /** Storage files that stay because another link or file still uses them. */
  kept_files: number
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
  page: MovePageQuery,
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

export function controlJob(
  groupId: string,
  importId: string,
  action: 'pause' | 'resume' | 'abort',
  client: ApiClientOptions,
): Promise<OrganizeJob> {
  return apiRequest(organizePath(groupId, importId, `job/${action}`), { method: 'POST' }, client)
}

export function getLinkIssues(groupId: string, importId: string, client: ApiClientOptions): Promise<LinkIssues> {
  return apiRequest(organizePath(groupId, importId, 'issues'), {}, client)
}

/** What a permanent delete removes in Aruna and in storage; nothing changes. */
export function getDeleteImpact(scope: DeleteScope, client: ApiClientOptions): Promise<DeleteImpact> {
  const path = `/data/buckets/${encodeURIComponent(scope.bucket)}/storage/delete/preview`
  return apiRequest(path, post({ kind: scope.kind, key: scope.key }), client)
}
