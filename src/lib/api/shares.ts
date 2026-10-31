// ── Share links ─────────────────────────────────────────────────────────────
// Verified against aruna api/src/routes/shares (feat/share-links). Owner routes take the portal
// bearer token on the node that holds the data; visitor routes take `Authorization: Share <token>`.
import { ApiError, apiRequest, apiUrl, type ApiClientOptions } from './client'

export type ShareMode = 'read' | 'read_upload' | 'upload'
export type ShareStatus = 'active' | 'expired' | 'revoked'

export type ShareTarget =
  | { kind: 'bucket'; bucket: string }
  /** `prefix` ends with `/`. */
  | { kind: 'folder'; bucket: string; prefix: string }
  | { kind: 'object'; bucket: string; key: string }
  | { kind: 'dataset'; dataset_id: string }

export interface ShareInfo {
  id: string
  target: ShareTarget
  mode: ShareMode
  label: string
  created_at: string
  expires_at: string | null
  /** Visitors must enter a password. */
  password: boolean
  revoked_at: string | null
  status: ShareStatus
  /** Counted on the node as the link is used. */
  downloads: number
  uploads: number
  /** The last open, download or upload; null while the link was never used. */
  last_access_at?: string | null
}

export interface ShareDetails {
  share: ShareInfo
  /** Goes into the URL fragment only: `/s/<node>#<token>`. */
  token: string
}

export interface CreateShareRequest {
  target: ShareTarget
  mode: ShareMode
  label?: string
  /** RFC 3339; omitted for no expiry. */
  expires_at?: string
  password?: string
}

export type ShareAction = 'open' | 'wrong_password' | 'download' | 'upload'

export interface ShareLogEntry {
  id: string
  at: string
  action: ShareAction
  key?: string | null
  bytes?: number | null
  /** The visitor's network, an IPv4 /24 or IPv6 /48. */
  client?: string | null
}

export interface ShareLog {
  entries: ShareLogEntry[]
  next?: string | null
}

export function createShare(body: CreateShareRequest, client: ApiClientOptions): Promise<ShareDetails> {
  return apiRequest('/shares', { method: 'POST', body: JSON.stringify(body) }, client)
}

export async function listShares(client: ApiClientOptions, signal?: AbortSignal): Promise<ShareInfo[]> {
  return (await apiRequest<{ shares: ShareInfo[] }>('/shares', { signal }, client)).shares ?? []
}

export function getShare(id: string, client: ApiClientOptions): Promise<ShareDetails> {
  return apiRequest(`/shares/${encodeURIComponent(id)}`, {}, client)
}

export function revokeShare(id: string, client: ApiClientOptions): Promise<void> {
  return apiRequest(`/shares/${encodeURIComponent(id)}`, { method: 'DELETE' }, client)
}

export function shareLog(
  id: string,
  query: { after?: string; limit?: number },
  client: ApiClientOptions,
  signal?: AbortSignal,
): Promise<ShareLog> {
  return apiRequest(`/shares/${encodeURIComponent(id)}/log`, { query, signal }, client)
}

/** The link a visitor opens; the token stays in the fragment so it never reaches a server log. */
export function shareUrl(site: string, nodeId: string, token: string): string {
  return `${site.replace(/\/+$/, '')}/s/${encodeURIComponent(nodeId)}#${token}`
}

// ── Visitor side ────────────────────────────────────────────────────────────

export interface VisitShare {
  kind: 'bucket' | 'folder' | 'object' | 'dataset'
  name?: string | null
  mode: ShareMode
  expires_at?: string | null
}

export interface OpenedShare {
  visit_token: string
  expires_at: string
  share: VisitShare
}

export interface VisitFile {
  /** Path below the shared root. */
  name: string
  size?: number | null
  last_modified?: string | null
}

export interface VisitListing {
  files: VisitFile[]
  /** Below the listed folder, each ending with `/`. */
  folders: string[]
  next_cursor?: string | null
}

export interface VisitDatasetFile {
  entity_id: string
  name?: string | null
  /** `folder` for a folder or bucket part, listed with `listDatasetPart`. */
  kind: 'file' | 'folder'
}

export interface VisitDataset {
  dataset_id: string
  rocrate: Record<string, unknown>
  files: VisitDatasetFile[]
}

export interface VisitTicket {
  path: string
  expires_at: string
}

export interface UploadedFile {
  /** Where the file landed; a taken name gets a number, such as `report (1).pdf`. */
  name: string
  size: number
}

function shareAuth(token: string): HeadersInit {
  return { Authorization: `Share ${token}` }
}

export function openShare(linkToken: string, password: string | undefined, baseUrl: string): Promise<OpenedShare> {
  const body = JSON.stringify(password === undefined ? {} : { password })
  return apiRequest('/shares/open', { method: 'POST', body, headers: shareAuth(linkToken) }, { baseUrl })
}

export function listVisitFiles(
  query: { prefix?: string; cursor?: string; limit?: number },
  visitToken: string,
  baseUrl: string,
): Promise<VisitListing> {
  return apiRequest('/shares/visit/files', { query, headers: shareAuth(visitToken) }, { baseUrl })
}

export function visitTicket(name: string, visitToken: string, baseUrl: string): Promise<VisitTicket> {
  const init = { method: 'POST', body: JSON.stringify({ name }), headers: shareAuth(visitToken) }
  return apiRequest('/shares/visit/tickets', init, { baseUrl })
}

export function visitDataset(visitToken: string, baseUrl: string): Promise<VisitDataset> {
  return apiRequest('/shares/visit/dataset', { headers: shareAuth(visitToken) }, { baseUrl })
}

/** One level of a folder part; names are relative to the part. */
export function listDatasetPart(
  part: string,
  query: { prefix?: string; cursor?: string; limit?: number },
  visitToken: string,
  baseUrl: string,
): Promise<VisitListing> {
  return apiRequest('/shares/visit/dataset/files', { query: { part, ...query }, headers: shareAuth(visitToken) }, { baseUrl })
}

/** A file part by its id, or a file inside a folder part by the part's id and its `name`. */
export function datasetTicket(entityId: string, name: string | undefined, visitToken: string, baseUrl: string): Promise<VisitTicket> {
  const body = JSON.stringify(name === undefined ? { entity_id: entityId } : { entity_id: entityId, name })
  return apiRequest('/shares/visit/dataset/tickets', { method: 'POST', body, headers: shareAuth(visitToken) }, { baseUrl })
}

/** The ticket path on the node's origin; the path already starts with `/api/v1`. */
export function ticketUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/, '')}${path}`
}

/** Streams one file with upload progress, which fetch cannot report. */
export function uploadVisitFile(
  name: string,
  file: Blob,
  visitToken: string,
  baseUrl: string,
  onProgress: (sent: number) => void,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', apiUrl('/shares/visit/uploads', { name }, { baseUrl }).href)
    request.setRequestHeader('Authorization', `Share ${visitToken}`)
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    request.upload.onprogress = (event) => onProgress(event.loaded)
    request.onerror = () => reject(new ApiError(0, 'The upload did not reach the node.'))
    request.onabort = () => reject(new DOMException('The upload was stopped.', 'AbortError'))
    request.onload = () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(request.responseText || '{}')
      } catch {
        // A body that is not JSON keeps the status message.
      }
      if (request.status >= 200 && request.status < 300) return resolve(body as unknown as UploadedFile)
      const message = typeof body.error === 'string' ? body.error : `${request.status} ${request.statusText}`
      reject(new ApiError(request.status, message, typeof body.code === 'string' ? body.code : undefined, body))
    }
    signal?.addEventListener('abort', () => request.abort(), { once: true })
    request.send(file)
  })
}
