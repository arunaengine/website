import { apiRequest, type ApiClientOptions } from './client'
import type { MoveProgress } from './bucketStorage'

// Linked folders: a folder of a group storage backend shown in a bucket folder,
// with new uploads written back to the backend. Group ADMIN. Nodes without the
// routes answer 404.

export interface BackendImportFailure {
  key: string
  error: string
}

export interface BackendImportRun {
  job_id: string
  state: string
  started_at: string
  imported: number
  skipped: number
  failed: number
  errors: BackendImportFailure[]
  /** Why a failed or indeterminate run stopped as a whole; older nodes omit it. */
  error?: string | null
}

export interface BackendImport {
  import_id: string
  backend_id: string
  backend_prefix: string
  bucket: string
  key_prefix: string
  write_backend_id?: string | null
  write_prefix?: string | null
  write_pattern?: string | null
  /** Five-field cron expression in UTC; omitted when it runs only on request. */
  schedule?: string
  created_at: string
  last_run?: BackendImportRun | null
}

export interface BackendImportRequest {
  backend_id: string
  backend_prefix: string
  bucket: string
  key_prefix: string
  write_backend_id?: string
  write_prefix?: string
  write_pattern?: string
  schedule?: string
  /** Also moves the files already stored under `key_prefix` to the write folder. */
  move_existing?: boolean
}

function importsPath(groupId: string, importId?: string): string {
  const base = `/data/groups/${encodeURIComponent(groupId)}/storage/imports`
  return importId ? `${base}/${encodeURIComponent(importId)}` : base
}

export async function listBackendImports(groupId: string, client: ApiClientOptions): Promise<BackendImport[]> {
  const body = await apiRequest<{ imports: BackendImport[] }>(importsPath(groupId), {}, client)
  return body.imports
}

export function createBackendImport(
  groupId: string,
  input: BackendImportRequest,
  client: ApiClientOptions,
): Promise<BackendImport> {
  return apiRequest(importsPath(groupId), { method: 'POST', body: JSON.stringify(input) }, client)
}

/** Replaces the schedule; a given `writePattern` names later uploads only. */
export function updateBackendImport(
  groupId: string,
  importId: string,
  schedule: string | null,
  client: ApiClientOptions,
  writePattern?: string,
): Promise<BackendImport> {
  const body = writePattern === undefined ? { schedule } : { schedule, write_pattern: writePattern }
  return apiRequest(importsPath(groupId, importId), { method: 'PUT', body: JSON.stringify(body) }, client)
}

export function deleteBackendImport(groupId: string, importId: string, client: ApiClientOptions): Promise<void> {
  return apiRequest(importsPath(groupId, importId), { method: 'DELETE' }, client)
}

/** Starts a run; 409 while one is still going. */
export function runBackendImport(
  groupId: string,
  importId: string,
  client: ApiClientOptions,
): Promise<{ job_id: string }> {
  return apiRequest(`${importsPath(groupId, importId)}/run`, { method: 'POST' }, client)
}

export interface BackendImportRenames {
  /** Files an earlier name pattern named; a lower bound unless `complete`. */
  count: number
  complete: boolean
  /** The first files, with the name they get. */
  files: { from: string; to: string }[]
  /** The last move of the link's folder, which renames them. */
  progress?: MoveProgress | null
}

/** Files of a link that still have a name of an earlier pattern. */
export function getImportRenames(
  groupId: string,
  importId: string,
  client: ApiClientOptions,
): Promise<BackendImportRenames> {
  return apiRequest(`${importsPath(groupId, importId)}/rename`, {}, client)
}

/** Gives them the current name: a copy first, then the old file is removed. */
export function startImportRenames(groupId: string, importId: string, client: ApiClientOptions): Promise<unknown> {
  return apiRequest(`${importsPath(groupId, importId)}/rename`, { method: 'POST' }, client)
}
