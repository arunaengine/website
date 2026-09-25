import { ApiError, apiRequest, type ApiClientOptions } from './client'

// Invenio and Zenodo repository transfers, following the agreed contract in
// aruna api/src/routes/invenio.rs. Personal access tokens only travel in
// request bodies; responses never return them.

export type RepositoryConnectorKind = 'invenio' | 'oai_pmh'

export interface RepositoryConnector {
  connector_id: string
  group_id: string
  name: string
  kind: RepositoryConnectorKind
  endpoint: string
  community?: string | null
  has_secret_config: boolean
  created_at: string
  updated_at: string
}

// Shared body of POST and PUT. On PUT an omitted secret_config keeps the
// stored token, an empty one removes it.
export interface RepositoryConnectorRequest {
  name: string
  kind: RepositoryConnectorKind
  endpoint: string
  community?: string
  secret_config?: { token?: string }
}

export interface RepositoryConnectorList {
  connectors: RepositoryConnector[]
}

function repositoriesPath(groupId: string, connectorId?: string): string {
  const base = `/metadata/groups/${encodeURIComponent(groupId)}/repositories`
  return connectorId ? `${base}/${encodeURIComponent(connectorId)}` : base
}

export async function listRepositoryConnectors(
  groupId: string,
  client: ApiClientOptions,
): Promise<RepositoryConnector[]> {
  const body = await apiRequest<RepositoryConnectorList>(repositoriesPath(groupId), {}, client)
  return body?.connectors ?? []
}

export function createRepositoryConnector(
  groupId: string,
  input: RepositoryConnectorRequest,
  client: ApiClientOptions,
): Promise<RepositoryConnector> {
  return apiRequest(repositoriesPath(groupId), { method: 'POST', body: JSON.stringify(input) }, client)
}

export function replaceRepositoryConnector(
  groupId: string,
  connectorId: string,
  input: RepositoryConnectorRequest,
  client: ApiClientOptions,
): Promise<RepositoryConnector> {
  return apiRequest(
    repositoriesPath(groupId, connectorId),
    { method: 'PUT', body: JSON.stringify(input) },
    client,
  )
}

export function deleteRepositoryConnector(
  groupId: string,
  connectorId: string,
  client: ApiClientOptions,
): Promise<void> {
  return apiRequest(repositoriesPath(groupId, connectorId), { method: 'DELETE' }, client)
}

export interface InvenioSearchQuery {
  group_id: string
  connector_id: string
  q: string
  page: number
  size: number
  all_versions?: boolean
}

// The native repository answer; src/lib/invenio.ts maps its hits.
export interface InvenioSearchPage {
  hits?: { total?: number | { value?: number }; hits?: unknown[] }
  links?: { next?: string | null }
}

export function searchInvenioRecords(
  query: InvenioSearchQuery,
  client: ApiClientOptions,
  signal?: AbortSignal,
): Promise<InvenioSearchPage> {
  return apiRequest('/metadata/invenio/records', { query: { ...query }, signal }, client)
}

export type InvenioImportMode = 'copy' | 'reference' | 'metadata'

// The record is named by exactly one of record_id, doi (version or concept) or url.
export type InvenioRecordSource = { record_id: string } | { doi: string } | { url: string }

export type InvenioImportRequest = InvenioRecordSource & {
  group_id: string
  connector_id: string
  mode: InvenioImportMode
  all_versions: boolean
  // keep_updated creates a pull link; auto_update imports new versions without asking.
  keep_updated?: boolean
  auto_update?: boolean
  target: { bucket: string; prefix: string }
  metadata: { group_id: string; path: string; public: boolean }
  idempotency_key?: string
}

export interface TransferJobResponse {
  job_id: string
  created?: boolean
  owner_node_url?: string
  status_url: string
  report_url?: string
}

export function submitInvenioImport(
  request: InvenioImportRequest,
  client: ApiClientOptions,
): Promise<TransferJobResponse> {
  return apiRequest('/metadata/invenio/imports', { method: 'POST', body: JSON.stringify(request) }, client)
}

export interface InvenioExportRequest {
  group_id: string
  connector_id: string
  access_token: string
  new_version?: string
  metadata?: Record<string, unknown>
  publish: boolean
  public_files: boolean
}

// One-time export: the token is used for this job and is not kept on a link.
export function submitInvenioExport(
  documentId: string,
  repository: InvenioExportRequest,
  idempotencyKey: string,
  client: ApiClientOptions,
): Promise<TransferJobResponse> {
  return apiRequest(
    `/metadata/${encodeURIComponent(documentId)}/invenio/exports`,
    { method: 'POST', body: JSON.stringify({ repository, idempotency_key: idempotencyKey }) },
    client,
  )
}

// The repository record of a finished one-time export job.
export interface InvenioRecord {
  id: string
  url: string
  published: boolean
  parent_id: string
  revision_id: number
  // Reserved while the record is a draft, registered once published.
  doi?: string | null
  html_url?: string | null
  concept_doi?: string | null
  // Submitted to the connector's community instead of published.
  in_review: boolean
  // A check that failed after the repository had already published the record.
  warning?: string | null
}

export interface InvenioExportResult {
  repository: InvenioRecord
}

export type InvenioLinkStatus = 'enabled' | 'paused' | 'failed'

export type InvenioReviewState = 'none' | 'pending' | 'accepted' | 'declined'

export interface InvenioLinkRemote {
  parent_id?: string | null
  draft_id?: string | null
  record_id?: string | null
  doi?: string | null
  // True while the DOI is only reserved on the open draft.
  doi_reserved?: boolean
  concept_doi?: string | null
  record_url?: string | null
  published: boolean
  review?: InvenioReviewState
  // Pull links: the latest published version at the last check.
  latest_remote_id?: string | null
}

export interface InvenioLink {
  link_id: string
  document_id: string
  group_id: string
  connector_id: string
  endpoint: string
  owner_node_url: string
  created_by: string
  direction: 'push' | 'pull'
  // Kept open so a new status renders instead of breaking.
  status: InvenioLinkStatus | (string & {})
  reason?: string | null
  warning?: string | null
  auto_publish: boolean
  // Pull links only.
  auto_update?: boolean
  last_checked_at?: string | null
  public_files: boolean
  // A push is queued or running, or a pull is running.
  pending: boolean
  remote: InvenioLinkRemote
  last_push?: { event_id: string; job_id: string; pushed_at: string } | null
  created_at: string
  updated_at: string
}

export interface CreateInvenioLink {
  group_id: string
  connector_id: string
  access_token: string
  parent_id?: string
  auto_publish?: boolean
  public_files?: boolean
  metadata?: Record<string, unknown>
}

// auto_update applies to pull links; auto_publish, public_files and metadata to push links.
export interface PatchInvenioLink {
  paused?: boolean
  auto_publish?: boolean
  auto_update?: boolean
  public_files?: boolean
  metadata?: Record<string, unknown>
}

function linksPath(documentId: string, linkId?: string, action?: string): string {
  let path = `/metadata/${encodeURIComponent(documentId)}/invenio/links`
  if (linkId) path += `/${encodeURIComponent(linkId)}`
  return action ? `${path}/${action}` : path
}

export function listInvenioLinks(documentId: string, client: ApiClientOptions): Promise<InvenioLink[]> {
  return apiRequest(linksPath(documentId), {}, client)
}

export function getInvenioLink(documentId: string, linkId: string, client: ApiClientOptions): Promise<InvenioLink> {
  return apiRequest(linksPath(documentId, linkId), {}, client)
}

export function createInvenioLink(
  documentId: string,
  input: CreateInvenioLink,
  client: ApiClientOptions,
): Promise<InvenioLink> {
  return apiRequest(linksPath(documentId), { method: 'POST', body: JSON.stringify(input) }, client)
}

export function patchInvenioLink(
  documentId: string,
  linkId: string,
  input: PatchInvenioLink,
  client: ApiClientOptions,
): Promise<InvenioLink> {
  return apiRequest(linksPath(documentId, linkId), { method: 'PATCH', body: JSON.stringify(input) }, client)
}

// Removes the link and its sealed token; records in the repository stay.
export function deleteInvenioLink(documentId: string, linkId: string, client: ApiClientOptions): Promise<void> {
  return apiRequest(linksPath(documentId, linkId), { method: 'DELETE' }, client)
}

export function pushInvenioLink(
  documentId: string,
  linkId: string,
  client: ApiClientOptions,
): Promise<TransferJobResponse> {
  return apiRequest(linksPath(documentId, linkId, 'push'), { method: 'POST' }, client)
}

export function publishInvenioLink(
  documentId: string,
  linkId: string,
  client: ApiClientOptions,
): Promise<TransferJobResponse> {
  return apiRequest(linksPath(documentId, linkId, 'publish'), { method: 'POST' }, client)
}

// Makes the current remote latest record the new base and clears remote_changed.
export function acceptRemoteLink(documentId: string, linkId: string, client: ApiClientOptions): Promise<InvenioLink> {
  return apiRequest(linksPath(documentId, linkId, 'accept-remote'), { method: 'POST' }, client)
}

// Imports the available remote version into a pull link's dataset.
export function pullInvenioLink(
  documentId: string,
  linkId: string,
  client: ApiClientOptions,
): Promise<TransferJobResponse> {
  return apiRequest(linksPath(documentId, linkId, 'pull'), { method: 'POST' }, client)
}

export function rotateLinkToken(
  documentId: string,
  linkId: string,
  accessToken: string,
  client: ApiClientOptions,
): Promise<void> {
  return apiRequest(
    linksPath(documentId, linkId, 'token'),
    { method: 'PUT', body: JSON.stringify({ access_token: accessToken }) },
    client,
  )
}

export type SecondaryIdentifierKind = 'doi' | 'invenio_record' | 'invenio_parent'

// published: this dataset was pushed or exported there; imported: copied from it.
export type IdentifierOrigin = 'published' | 'imported'

export interface SecondaryIdentifier {
  kind: SecondaryIdentifierKind | (string & {})
  value: string
  endpoint?: string | null
  origin?: IdentifierOrigin
}

export interface PidLookupMatch {
  document_id: string
  pid?: string | null
  origin: IdentifierOrigin
}

// GET /pid/lookup: every readable dataset holding the identifier, published first.
export async function lookupPid(
  kind: SecondaryIdentifierKind,
  value: string,
  client: ApiClientOptions,
): Promise<PidLookupMatch[]> {
  try {
    const body = await apiRequest<{ matches?: PidLookupMatch[] }>('/pid/lookup', { query: { kind, value } }, client)
    return body?.matches ?? []
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return []
    throw err
  }
}
