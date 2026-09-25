import { ApiError, apiRequest, type ApiClientOptions } from './client'
import type { ProfileValidationFinding } from './profileValidation'

// Repository transfers (Invenio and Zenodo first), following the contract of
// the metadata/repository routes. Personal access tokens only travel in
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

// What a repository kind can do; the portal offers only these actions.
export interface RepositoryCapabilities {
  drafts: boolean
  reserve_identifier: boolean
  versions: boolean
  review: boolean
  pull: boolean
  search: boolean
  // Records can be imported as datasets.
  import: boolean
  release_date: boolean
  // The identifier a published record receives, such as doi.
  identifier_kind: string
}

// A built-in requirement profile; shapes are Turtle sources.
export interface RepositoryProfile {
  iri: string
  name: string
  shapes: string[]
}

export interface RepositoryKind {
  kind: string
  capabilities: RepositoryCapabilities
  profiles: RepositoryProfile[]
  // Mapping rules: which crate entities become which repository objects.
  targets: unknown[]
}

export function listRepositoryKinds(client: ApiClientOptions): Promise<RepositoryKind[]> {
  return apiRequest('/metadata/repository/kinds', {}, client)
}

export interface RepositoryCheckRequest {
  group_id: string
  connector_id: string
  metadata?: Record<string, unknown>
}

// One crate entity and what it becomes in the repository.
export interface RepositoryMapping {
  entity_id: string
  target: string
  group?: string | null
  field?: string | null
}

export interface RepositoryCheck {
  kind: string
  profile: { iri: string; revision?: string | null }
  // True when no finding is a violation.
  ready: boolean
  findings: ProfileValidationFinding[]
  mapping: RepositoryMapping[]
}

// Checks the dataset against the repository requirements; stores nothing.
export function checkRepository(
  documentId: string,
  request: RepositoryCheckRequest,
  client: ApiClientOptions,
  signal?: AbortSignal,
): Promise<RepositoryCheck> {
  return apiRequest(
    `/metadata/${encodeURIComponent(documentId)}/repository/check`,
    { method: 'POST', body: JSON.stringify(request), signal },
    client,
  )
}

export interface RepositorySearchQuery {
  group_id: string
  connector_id: string
  q: string
  page: number
  size: number
  all_versions?: boolean
}

// The native repository answer; src/lib/repository.ts maps its hits.
export interface RepositorySearchPage {
  hits?: { total?: number | { value?: number }; hits?: unknown[] }
  links?: { next?: string | null }
}

export function searchRepositoryRecords(
  query: RepositorySearchQuery,
  client: ApiClientOptions,
  signal?: AbortSignal,
): Promise<RepositorySearchPage> {
  const { group_id: groupId, connector_id: connectorId, ...search } = query
  return apiRequest(`${repositoriesPath(groupId, connectorId)}/records`, { query: { ...search }, signal }, client)
}

export type RepositoryImportMode = 'copy' | 'reference' | 'metadata'

// The record is named by exactly one of record_id, doi (version or concept) or url.
export type RepositoryRecordSource = { record_id: string } | { doi: string } | { url: string }

export type RepositoryImportRequest = RepositoryRecordSource & {
  group_id: string
  connector_id: string
  mode: RepositoryImportMode
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

export function submitRepositoryImport(
  request: RepositoryImportRequest,
  client: ApiClientOptions,
): Promise<TransferJobResponse> {
  return apiRequest('/metadata/repository/imports', { method: 'POST', body: JSON.stringify(request) }, client)
}

export interface RepositoryExportRequest {
  group_id: string
  connector_id: string
  access_token: string
  // Continues this published record as a new version.
  published_id?: string
  metadata?: Record<string, unknown>
  publish: boolean
  public_files: boolean
}

// One-time export: the token is used for this job and is not kept on a link.
export function submitRepositoryExport(
  documentId: string,
  repository: RepositoryExportRequest,
  idempotencyKey: string,
  client: ApiClientOptions,
): Promise<TransferJobResponse> {
  return apiRequest(
    `/metadata/${encodeURIComponent(documentId)}/repository/exports`,
    { method: 'POST', body: JSON.stringify({ repository, idempotency_key: idempotencyKey }) },
    client,
  )
}

// The repository record of a finished one-time export job.
export interface RepositoryRecord {
  id: string
  url: string
  published: boolean
  parent_id: string
  revision_id: number
  // Of the kind's identifier_kind; reserved while a draft, registered once published.
  identifier?: string | null
  html_url?: string | null
  concept_identifier?: string | null
  // Submitted to the connector's community instead of published.
  in_review: boolean
  // A check that failed after the repository had already published the record.
  warning?: string | null
}

export interface RepositoryExportResult {
  repository: RepositoryRecord
}

export type RepositoryLinkStatus = 'enabled' | 'paused' | 'failed'

export type RepositoryReviewState = 'none' | 'pending' | 'accepted' | 'declined'

// Derived by the node from the remote fields below.
export type RemoteState = 'none' | 'draft' | 'review' | 'published'

export interface RepositoryLinkRemote {
  state?: RemoteState | (string & {})
  parent_id?: string | null
  draft_id?: string | null
  record_id?: string | null
  identifier?: string | null
  // True while the identifier is only reserved on the open draft.
  identifier_reserved?: boolean
  concept_identifier?: string | null
  record_url?: string | null
  published: boolean
  review?: RepositoryReviewState
  // Pull links: the latest published version at the last check.
  latest_remote_id?: string | null
}

export interface RepositoryLink {
  link_id: string
  document_id: string
  group_id: string
  connector_id: string
  // The repository kind, for example invenio; fixed when the link is created.
  kind: string
  // The kind of identifier the records receive, such as doi.
  identifier_kind: string
  endpoint: string
  owner_node_url: string
  created_by: string
  direction: 'push' | 'pull'
  // Kept open so a new status renders instead of breaking.
  status: RepositoryLinkStatus | (string & {})
  reason?: string | null
  // What the dataset still lacks, when reason is requirements_unmet.
  findings?: ProfileValidationFinding[] | null
  warning?: string | null
  auto_publish: boolean
  // Pull links only.
  auto_update?: boolean
  last_checked_at?: string | null
  public_files: boolean
  // A push is queued or running, or a pull is running.
  pending: boolean
  remote: RepositoryLinkRemote
  last_push?: { event_id: string; job_id: string; pushed_at: string } | null
  created_at: string
  updated_at: string
}

export interface CreateRepositoryLink {
  group_id: string
  connector_id: string
  access_token: string
  parent_id?: string
  auto_publish?: boolean
  public_files?: boolean
  metadata?: Record<string, unknown>
}

// auto_update applies to pull links; auto_publish, public_files and metadata to push links.
export interface PatchRepositoryLink {
  paused?: boolean
  auto_publish?: boolean
  auto_update?: boolean
  public_files?: boolean
  metadata?: Record<string, unknown>
}

function linksPath(documentId: string, linkId?: string, action?: string): string {
  let path = `/metadata/${encodeURIComponent(documentId)}/repository/links`
  if (linkId) path += `/${encodeURIComponent(linkId)}`
  return action ? `${path}/${action}` : path
}

export function listRepositoryLinks(documentId: string, client: ApiClientOptions): Promise<RepositoryLink[]> {
  return apiRequest(linksPath(documentId), {}, client)
}

export function getRepositoryLink(documentId: string, linkId: string, client: ApiClientOptions): Promise<RepositoryLink> {
  return apiRequest(linksPath(documentId, linkId), {}, client)
}

export function createRepositoryLink(
  documentId: string,
  input: CreateRepositoryLink,
  client: ApiClientOptions,
): Promise<RepositoryLink> {
  return apiRequest(linksPath(documentId), { method: 'POST', body: JSON.stringify(input) }, client)
}

export function patchRepositoryLink(
  documentId: string,
  linkId: string,
  input: PatchRepositoryLink,
  client: ApiClientOptions,
): Promise<RepositoryLink> {
  return apiRequest(linksPath(documentId, linkId), { method: 'PATCH', body: JSON.stringify(input) }, client)
}

// Removes the link and its sealed token; records in the repository stay.
export function deleteRepositoryLink(documentId: string, linkId: string, client: ApiClientOptions): Promise<void> {
  return apiRequest(linksPath(documentId, linkId), { method: 'DELETE' }, client)
}

export function pushRepositoryLink(
  documentId: string,
  linkId: string,
  client: ApiClientOptions,
): Promise<TransferJobResponse> {
  return apiRequest(linksPath(documentId, linkId, 'push'), { method: 'POST' }, client)
}

export function publishRepositoryLink(
  documentId: string,
  linkId: string,
  client: ApiClientOptions,
): Promise<TransferJobResponse> {
  return apiRequest(linksPath(documentId, linkId, 'publish'), { method: 'POST' }, client)
}

// Makes the current remote latest record the new base and clears remote_changed.
export function acceptRemoteLink(documentId: string, linkId: string, client: ApiClientOptions): Promise<RepositoryLink> {
  return apiRequest(linksPath(documentId, linkId, 'accept-remote'), { method: 'POST' }, client)
}

// Imports the available remote version into a pull link's dataset.
export function pullRepositoryLink(
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
