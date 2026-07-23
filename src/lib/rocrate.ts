import { ApiError, apiRequest, defaultApiBaseUrl, type ApiClientOptions } from './api'

export const ROCRATE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024 * 1024

export type RoCrateImportSource =
  | { kind: 'upload'; upload_id: string }
  | { kind: 'object'; bucket: string; key: string; version?: string }
  | { kind: 'connector'; group_id: string; connector_id: string; path: string }

export interface RoCrateImportRequest {
  source: RoCrateImportSource
  target: { bucket: string; prefix: string }
  metadata: { group_id: string; path: string; public: boolean }
  idempotency_key?: string
}

export interface RoCrateUploadResponse {
  upload_id: string
  blake3: string
  size: number
  expires_at: string
  owner_node_url: string
}

export interface RoCrateJobSubmission {
  job_id: string
  created: boolean
  owner_node_url: string
  status_url: string
  report_url: string
}

export interface RoCrateExportSubmission extends RoCrateJobSubmission {
  artifact_url: string
}

export interface RoCrateUpload {
  promise: Promise<RoCrateUploadResponse>
  abort: () => void
}

function responseError(xhr: XMLHttpRequest): ApiError {
  let message = `${xhr.status} ${xhr.statusText}`.trim()
  try {
    const body = JSON.parse(xhr.responseText) as { message?: string; error?: string }
    message = body.message || body.error || message
  } catch {
    // Keep the HTTP status text when the response is not JSON.
  }
  return new ApiError(xhr.status, message)
}

export function uploadRoCrate(
  file: File,
  mediaType: 'application/zip' | 'application/vnd.eln+zip',
  client: ApiClientOptions,
  onProgress: (loaded: number, total: number) => void,
): RoCrateUpload {
  const xhr = new XMLHttpRequest()
  const baseUrl = (client.baseUrl || defaultApiBaseUrl()).replace(/\/$/, '')
  const promise = new Promise<RoCrateUploadResponse>((resolve, reject) => {
    xhr.open('POST', `${baseUrl}/metadata/rocrate/uploads`)
    xhr.responseType = 'text'
    xhr.setRequestHeader('Content-Type', mediaType)
    if (client.token) xhr.setRequestHeader('Authorization', `Bearer ${client.token}`)
    xhr.upload.addEventListener('progress', (event) => {
      onProgress(event.loaded, event.lengthComputable ? event.total : file.size)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(responseError(xhr))
        return
      }
      try {
        resolve(JSON.parse(xhr.responseText) as RoCrateUploadResponse)
      } catch {
        reject(new Error('The upload endpoint returned an invalid response.'))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('The RO-Crate upload failed.')))
    xhr.addEventListener('abort', () => reject(new DOMException('Upload cancelled.', 'AbortError')))
    xhr.send(file)
  })
  return { promise, abort: () => xhr.abort() }
}

export function submitRoCrateImport(
  input: RoCrateImportRequest,
  client: ApiClientOptions,
): Promise<RoCrateJobSubmission> {
  return apiRequest<RoCrateJobSubmission>(
    '/metadata/rocrate/imports',
    { method: 'POST', body: JSON.stringify(input) },
    client,
  )
}

export function submitRoCrateExport(
  documentId: string,
  idempotencyKey: string,
  client: ApiClientOptions,
): Promise<RoCrateExportSubmission> {
  return apiRequest<RoCrateExportSubmission>(
    `/metadata/${encodeURIComponent(documentId)}/rocrate/exports`,
    {
      method: 'POST',
      body: JSON.stringify(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    },
    client,
  )
}
