import { apiRequest, type ApiClientOptions } from './client'

// Linked folders: a folder of a group storage backend shown in a bucket folder,
// with new uploads written back to the backend. Group ADMIN. Nodes without the
// routes answer 404.

export interface BackendImportFailure {
  key: string
  message?: string
  error?: string
}

export interface BackendImportRun {
  job_id: string
  state: string
  started_at: string
  imported: number
  skipped: number
  failed: number
  errors: BackendImportFailure[]
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
  /** Five-field cron expression in UTC; `null` runs only on request. */
  schedule: string | null
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
}

function importsPath(groupId: string, importId?: string): string {
  const base = `/data/groups/${encodeURIComponent(groupId)}/storage/imports`
  return importId ? `${base}/${encodeURIComponent(importId)}` : base
}

export async function listBackendImports(groupId: string, client: ApiClientOptions): Promise<BackendImport[]> {
  const body = await apiRequest<BackendImport[] | { imports: BackendImport[] }>(importsPath(groupId), {}, client)
  if (Array.isArray(body)) return body
  return body?.imports ?? []
}

export function createBackendImport(
  groupId: string,
  input: BackendImportRequest,
  client: ApiClientOptions,
): Promise<BackendImport> {
  return apiRequest(importsPath(groupId), { method: 'POST', body: JSON.stringify(input) }, client)
}

export function updateBackendImport(
  groupId: string,
  importId: string,
  schedule: string | null,
  client: ApiClientOptions,
): Promise<BackendImport> {
  return apiRequest(importsPath(groupId, importId), { method: 'PUT', body: JSON.stringify({ schedule }) }, client)
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
