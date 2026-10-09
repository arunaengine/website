// --- Federation (/federation/*, /system/realm/federation, /system/realm/descriptor) ---
// Signed payloads travel as the node wrote them; the portal reads a few fields for display
// and passes the rest through unchanged.
import type { RealmDescriptor, RealmIdValue, Signed } from '@/lib/federation/descriptor'
import type { SubmitExportResponse, SubmitImportResponse } from '@/lib/rocrateArchive'
import { apiRequest, type ApiClientOptions } from './client'
import type { CreateSessionResponse } from './sessions'

/** A user id in a signed payload: `{ user_ulid, realm_id }`. */
export interface SignedUserId {
  user_ulid: string
  realm_id: RealmIdValue
}

export interface LoginHandoff {
  issuer: RealmIdValue
  user: SignedUserId
  audience: RealmIdValue
  descriptor_digest: string
  nonce: string
  name: string | null
  issued_at: number
  expires_at: number
  handoff_id: string
}

export interface FederatedSessionResponse extends CreateSessionResponse {
  /** The login is linked, so the session acts as the linked local account. */
  linked: boolean
  /** A local account shows the same public name; it names nothing. */
  account_hint: boolean
}

export interface LinkConfirmation {
  realm_id: RealmIdValue
  action: 'Link'
  local_user: SignedUserId
  foreign_user: SignedUserId
  foreign_issued_at: number
  issued_at: number
  expires_at: number
  confirmation_id: string
}

export interface LinkedLoginsResponse {
  user_id: string
  linked_logins: string[]
}

export interface ImportDestination {
  group_id: string
  bucket: string
  prefix: string
  metadata_path: string
}

export interface ImportIntent {
  realm_id: RealmIdValue
  descriptor_digest: string
  principal: SignedUserId
  destination: ImportDestination
  max_bytes: number
  nonce: string
  issued_at: number
  expires_at: number
  intent_id: string
}

export interface ExportGrant {
  source: RealmIdValue
  audience: RealmIdValue
  export_job_id: string
  document_id: string
  artifact_url: string
  artifact_size: number
  issued_at: number
  expires_at: number
}

/** The destination's answer to a push, passed through unverified by the source. */
export interface PushAnswer {
  upload_id: string
  blake3: string
  size: number
  expires_at: string
  owner_node_url: string
}

export type AcceptedRealmsSetting = { mode: 'none' } | { mode: 'any' } | { mode: 'only'; realms: string[] }

export interface RealmFederationSettings {
  name: string
  api_url: string
  portal_url: string
  registry_url: string | null
  registration: 'enabled' | 'disabled'
  accepted_realms: AcceptedRealmsSetting
  /** Only in answers: the descriptor signed from these values. */
  descriptor?: Signed<RealmDescriptor>
}

function post<T>(path: string, body: unknown, client: ApiClientOptions): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }, client)
}

export function getRealmDescriptor(client: ApiClientOptions = {}) {
  return apiRequest<Signed<RealmDescriptor>>('/system/realm/descriptor', {}, client)
}

export function setRealmFederation(settings: RealmFederationSettings, client: ApiClientOptions = {}) {
  return apiRequest<RealmFederationSettings>(
    '/system/realm/federation',
    { method: 'PUT', body: JSON.stringify(settings) },
    client,
  )
}

/** At the home realm: a handoff for the realm of `descriptor`, bound to `nonce`. */
export function createLoginHandoff(descriptor: Signed<RealmDescriptor>, nonce: string, client: ApiClientOptions = {}) {
  return post<Signed<LoginHandoff>>('/federation/login-handoffs', { descriptor, nonce }, client)
}

/** At the serving realm: a federated session from a handoff and the browser secret. */
export function createFederatedSession(handoff: Signed<LoginHandoff>, secret: string, client: ApiClientOptions = {}) {
  return post<FederatedSessionResponse>('/federation/sessions', { handoff, secret }, client)
}

export function createLinkConfirmation(handoff: Signed<LoginHandoff>, secret: string, client: ApiClientOptions = {}) {
  return post<Signed<LinkConfirmation>>('/federation/link-confirmations', { handoff, secret }, client)
}

export function createLink(confirmation: Signed<LinkConfirmation>, client: ApiClientOptions = {}) {
  return post<LinkedLoginsResponse>('/federation/links', { confirmation }, client)
}

export function listLinks(client: ApiClientOptions = {}) {
  return apiRequest<LinkedLoginsResponse>('/federation/links', {}, client)
}

export function deleteLink(userId: string, login: string, client: ApiClientOptions = {}) {
  return apiRequest<LinkedLoginsResponse>(
    `/federation/links/${encodeURIComponent(userId)}/${encodeURIComponent(login)}`,
    { method: 'DELETE' },
    client,
  )
}

export function createImportIntent(
  request: ImportDestination & { nonce: string; max_bytes?: number },
  client: ApiClientOptions = {},
) {
  return post<Signed<ImportIntent>>('/federation/import-intents', request, client)
}

export function createImport(
  request: { intent: Signed<ImportIntent>; grant: Signed<ExportGrant>; secret: string },
  client: ApiClientOptions = {},
) {
  return post<SubmitImportResponse>('/federation/imports', request, client)
}

export function createExport(
  request: { descriptor: Signed<RealmDescriptor>; intent: Signed<ImportIntent>; document_id: string; files: string[] },
  client: ApiClientOptions = {},
) {
  return post<SubmitExportResponse>('/federation/exports', request, client)
}

export function createGrant(jobId: string, client: ApiClientOptions = {}) {
  return post<Signed<ExportGrant>>(`/federation/exports/${encodeURIComponent(jobId)}/grant`, {}, client)
}

export function revokeGrant(jobId: string, client: ApiClientOptions = {}) {
  return apiRequest<void>(`/federation/exports/${encodeURIComponent(jobId)}/grant`, { method: 'DELETE' }, client)
}

export function pushExport(
  jobId: string,
  request: { descriptor: Signed<RealmDescriptor>; intent: Signed<ImportIntent> },
  client: ApiClientOptions = {},
) {
  return post<PushAnswer>(`/federation/exports/${encodeURIComponent(jobId)}/push`, request, client)
}
