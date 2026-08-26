import { ApiError, defaultApiBaseUrl, type ApiClientOptions } from './api'

// RO-Crate zip archive transfer, verified against aruna
// api/src/routes/rocrate_import.rs (upload_rocrate, submit_import),
// api/src/routes/metadata.rs (submit_rocrate_export), api/src/routes/jobs.rs
// (get_job_report, get_job_artifact) and core/src/structs/job.rs. The whole
// surface requires unrestricted realm auth: path-restricted (delegated) tokens
// are rejected with 403, exactly like the durable jobs API.
//
// Uploads and artifact downloads deliberately bypass `apiRequest`: it applies a
// 30 s timeout and buffers whole bodies, which neither a multi-gigabyte streamed
// upload nor a large artifact can live with.

const ZIP_MEDIA_TYPE = 'application/zip'
const ELN_MEDIA_TYPE = 'application/vnd.eln+zip'

export const ARCHIVE_FILE_ACCEPT = '.zip,.eln'

// The upload body's Content-Type picks the backend's RoCrateMediaType; anything
// else is rejected with 400 before a byte is stored.
export function archiveMediaType(fileName: string): string | null {
  const name = fileName.toLowerCase()
  if (name.endsWith('.eln')) return ELN_MEDIA_TYPE
  if (name.endsWith('.zip')) return ZIP_MEDIA_TYPE
  return null
}

export interface UploadArchiveResponse {
  upload_id: string // ULID
  blake3: string // hex
  size: number
  expires_at: string // RFC3339
  owner_node_url: string
}

// ImportSourceRequest is tagged (`kind`); `object` and `connector` variants also
// exist server-side, but the portal only submits a browser upload.
export interface ImportUploadSource {
  kind: 'upload'
  upload_id: string
}

export interface ImportTargetRequest {
  bucket: string
  // Object-key prefix for the unpacked payload; '' targets the bucket root.
  prefix: string
}

export interface ImportMetadataRequest {
  group_id: string
  path: string
  public: boolean
}

export interface SubmitImportRequest {
  source: ImportUploadSource
  target: ImportTargetRequest
  metadata: ImportMetadataRequest
  idempotency_key?: string
}

export interface SubmitImportResponse {
  job_id: string
  created: boolean
  owner_node_url: string
  status_url: string
  report_url: string
}

export interface SubmitExportResponse extends SubmitImportResponse {
  artifact_url: string
}

// core ReasonCode, snake_case: imported | unlisted | failed | not_attempted |
// included | external | denied | missing | offline | unsupported |
// path_synthesized | unrewritten_reference | signature_dropped |
// unsupported_crate_version. Kept open so added codes render instead of
// breaking (the ApiNotification / JobErrorResponse.kind pattern).
export type ArchiveReasonCode = string

export interface ArchiveValidationViolation {
  code: string
  message: string
  pointer: string
  entity_id?: string | null
}

export interface ImportReportDetail {
  archive_path: string
  target_key?: string | null
  version_id?: string | null
  blake3?: string | null
  size?: number | null
  arn?: string | null
  w3id?: string | null
  validation?: ArchiveValidationViolation | null
}

export interface ExportReportDetail {
  entity_id: string
  zip_path?: string | null
  source?: 'local' | 'remote' | 'hash' | null
  resolved_version?: string | null
  validation?: ArchiveValidationViolation | null
}

// JobReportRow<T>.
export interface ArchiveReportRow<T> {
  entry_key: string
  code: ArchiveReasonCode
  message?: string | null
  detail: T
}

export type ImportReportRow = ArchiveReportRow<ImportReportDetail>
export type ExportReportRow = ArchiveReportRow<ExportReportDetail>

export interface ArchiveReportPage<T> {
  rows: ArchiveReportRow<T>[]
  // Opaque cursor; omitted on the last page. Bound to the frozen report digest.
  next_cursor?: string
  report_digest: string
}

// GET /jobs/{id}/report answers 404 with `{code: 'report_pending', state}` while
// the job has not frozen its report yet: pending, not an error.
export type ArchiveReportResult<T> =
  | { status: 'pending'; state: string }
  | { status: 'ready'; page: ArchiveReportPage<T> }

// JobResultPayload::ImportRoCrate.to_public_json().
export interface ImportJobResult {
  document_id: string | null
  entries_total: number
  imported: number
  unlisted: number
  failed: number
  report_digest: string
}

export interface ExportOmissionCounts {
  external: number
  denied: number
  missing: number
  offline: number
  unsupported: number
}

// JobResultPayload::ExportRoCrate.to_public_json().
export interface ExportJobResult {
  artifact: { blake3: string; size: number; expires_at_ms: number } | null
  included: number
  omitted: ExportOmissionCounts
  report_digest: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function importJobResult(result: unknown): ImportJobResult | null {
  return isRecord(result) && 'entries_total' in result ? (result as unknown as ImportJobResult) : null
}

export function exportJobResult(result: unknown): ExportJobResult | null {
  return isRecord(result) && 'included' in result ? (result as unknown as ExportJobResult) : null
}

function archiveUrl(path: string, client: ApiClientOptions, query: Record<string, string | number | undefined> = {}) {
  const baseUrl = (client.baseUrl || defaultApiBaseUrl()).replace(/\/$/, '')
  const url = new URL(`${baseUrl}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  return url
}

function authHeaders(client: ApiClientOptions, extra: Record<string, string> = {}): Headers {
  const headers = new Headers(extra)
  if (client.token) headers.set('Authorization', `Bearer ${client.token}`)
  return headers
}

interface ErrorBody {
  error?: string
  code?: string
  message?: string
  // Only on the report-pending body.
  state?: string
}

async function errorBody(response: Response): Promise<ErrorBody | null> {
  try {
    return (await response.json()) as ErrorBody
  } catch {
    return null
  }
}

// Non-2xx -> ApiError, with a portal message for the cases a user can act on and
// the server's own reason kept in parentheses.
function archiveError(response: Response, body: ErrorBody | null, overrides: Record<number, string> = {}): ApiError {
  const detail = body?.error || body?.message || ''
  let override = overrides[response.status]
  if (response.status === 400 && /expired/i.test(detail)) {
    override = 'That upload expired before the import started. Upload the archive again.'
  }
  const message = override ? (detail ? `${override} (${detail})` : override) : detail || `${response.status} ${response.statusText}`
  return new ApiError(response.status, message)
}

const UPLOAD_MESSAGES: Record<number, string> = {
  401: 'Sign in to upload an RO-Crate archive.',
  403: 'This token cannot upload archives; path-restricted tokens have no access to the RO-Crate transfer API.',
  404: 'This node does not serve the RO-Crate upload API.',
  413: 'The archive is larger than this node accepts for a direct upload.',
}

const SUBMIT_MESSAGES: Record<number, string> = {
  401: 'Sign in to import an RO-Crate archive.',
  403: 'You may not write to that group, bucket or prefix.',
  404: 'The target bucket or the upload could not be found; the upload may have expired.',
  409: 'Import conflict: the metadata path may already exist, the upload may already be claimed, or too many RO-Crate jobs are active.',
}

const EXPORT_MESSAGES: Record<number, string> = {
  401: 'Sign in to export this document as an RO-Crate archive.',
  403: 'You may not read this document, or this token is path-restricted.',
  404: 'This document does not exist, or this node does not serve RO-Crate exports.',
  409: 'Too many RO-Crate jobs are active for this account, or that idempotency key is bound to another job.',
}

const ARTIFACT_MESSAGES: Record<number, string> = {
  403: 'This token may not download the export artifact.',
  404: 'The export artifact is not available; the job may not have produced one.',
  410: 'The export artifact expired and was cleaned up. Run the export again.',
}

// POST /metadata/rocrate/uploads: raw streamed body, no timeout.
export async function uploadArchive(
  file: File,
  client: ApiClientOptions,
  options: { signal?: AbortSignal } = {},
): Promise<UploadArchiveResponse> {
  const mediaType = archiveMediaType(file.name)
  if (!mediaType) throw new ApiError(0, 'Only .zip and .eln archives can be imported.')
  const response = await fetch(archiveUrl('/metadata/rocrate/uploads', client), {
    method: 'POST',
    headers: authHeaders(client, { 'Content-Type': mediaType }),
    body: file,
    signal: options.signal,
  })
  if (!response.ok) throw archiveError(response, await errorBody(response), UPLOAD_MESSAGES)
  return (await response.json()) as UploadArchiveResponse
}

// POST /metadata/rocrate/imports: 202 with the job id; replays on a repeated
// idempotency key instead of starting a second import (`created: false`).
export async function submitImport(
  request: SubmitImportRequest,
  client: ApiClientOptions,
): Promise<SubmitImportResponse> {
  const response = await fetch(archiveUrl('/metadata/rocrate/imports', client), {
    method: 'POST',
    headers: authHeaders(client, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(request),
  })
  if (!response.ok) throw archiveError(response, await errorBody(response), SUBMIT_MESSAGES)
  return (await response.json()) as SubmitImportResponse
}

// POST /metadata/{document_id}/rocrate/exports: 202 with the job id.
export async function submitExport(
  documentId: string,
  client: ApiClientOptions,
  idempotencyKey?: string,
): Promise<SubmitExportResponse> {
  const path = `/metadata/${encodeURIComponent(documentId)}/rocrate/exports`
  const response = await fetch(archiveUrl(path, client), {
    method: 'POST',
    headers: authHeaders(client, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  })
  if (!response.ok) throw archiveError(response, await errorBody(response), EXPORT_MESSAGES)
  return (await response.json()) as SubmitExportResponse
}

// GET /jobs/{id}/report: a 404 carrying `code: 'report_pending'` means the job
// has not frozen its report yet; every other 404 is a real miss.
export async function fetchArchiveReport<T>(
  jobId: string,
  client: ApiClientOptions,
  options: { limit?: number; cursor?: string } = {},
): Promise<ArchiveReportResult<T>> {
  const path = `/jobs/${encodeURIComponent(jobId)}/report`
  const response = await fetch(archiveUrl(path, client, { limit: options.limit, cursor: options.cursor }), {
    headers: authHeaders(client),
  })
  if (response.ok) return { status: 'ready', page: (await response.json()) as ArchiveReportPage<T> }
  const body = await errorBody(response)
  if (response.status === 404 && body?.code === 'report_pending') {
    return { status: 'pending', state: typeof body.state === 'string' ? body.state : 'queued' }
  }
  throw archiveError(response, body, {
    403: 'This token may not read the job report.',
    404: 'This job has no report; it may have been pruned.',
  })
}

// RFC 5987 `filename*` first, then the plain `filename`.
function dispositionName(header: string | null): string | null {
  if (!header) return null
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1])
    } catch {
      /* fall through to the ascii filename */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain ? plain[1] : null
}

// GET /jobs/{id}/artifacts/rocrate: bearer-authenticated, so the browser cannot
// simply follow a link; the body is buffered into a blob and saved.
export async function downloadArchiveArtifact(jobId: string, client: ApiClientOptions): Promise<string> {
  const path = `/jobs/${encodeURIComponent(jobId)}/artifacts/rocrate`
  const response = await fetch(archiveUrl(path, client), { headers: authHeaders(client) })
  if (!response.ok) throw archiveError(response, await errorBody(response), ARTIFACT_MESSAGES)
  const fileName = dispositionName(response.headers.get('content-disposition')) || `ro-crate-${jobId}.zip`
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  // Revoking synchronously aborts the download of a large blob in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return fileName
}
