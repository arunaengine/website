// Scoped key routes of a vault-locked bucket: key requests, grants, version
// envelopes and downloads with an object key. Verified against aruna
// api/src/routes/storage/abe/. Binary fields are standard padded base64.
import { ApiError, apiRequest, apiUrl, type ApiClientOptions } from './client'

/** The admitted public parameters of one bucket key generation. */
export interface AbeParametersView {
  realm_id: string
  node_id: string
  bucket_id: string
  generation: number
  fingerprint: string
  parameters: string
  epoch: number
  /** The canonical setup context. */
  context: string
}

/** A subtree value is empty for the bucket root or ends with `/`; values are literal. */
export interface KeyScope {
  kind: 'exact' | 'subtree'
  value: string
}

export interface KeyIssuer {
  kind: 'user' | 'node'
  id: string
}

export interface KeyRequestFields {
  request_id: string
  requesting_user: string
  recipient_user: string
  recipient_record: string | null
  recipient_public: string | null
  recipient_fingerprint: string | null
  bucket: string
  parameters: AbeParametersView
  scope: KeyScope
  epochs: number[]
  credential_id: string | null
  restrictions: unknown[] | null
  revisions: string[]
  created_at_ms: number
  /** Set on a holder proposal: the holder the grant context names. */
  issuer?: KeyIssuer
}

export interface KeyGrantFields {
  request: KeyRequestFields
  issuer: KeyIssuer
  enc: string
  ciphertext: string
}

/** `record` is canonical postcard bytes; `aad` is the grant associated data, null on an own open request. */
export interface AbeRecord<F> {
  fields: F
  record: string
  aad: string | null
}

export interface AbeRecordPage<F> {
  records: AbeRecord<F>[]
  /** Null on the last page. */
  next_cursor: string | null
}

export type KeyRequestResult =
  | { kind: 'grant'; grant: AbeRecord<KeyGrantFields> }
  | { kind: 'pending'; request: AbeRecord<KeyRequestFields> }

/** `context` echoes the proposal `record`. */
export interface GrantSubmission {
  context: string
  enc: string
  ciphertext: string
}

export interface EnvelopeContextView {
  realm_id: string
  node_id: string
  bucket_id: string
  generation: number
  fingerprint: string
  epoch: number
  object_key: string
  write_id: string
  public_key: string
  /** The framed context bytes the envelope is sealed with. */
  bytes: string
}

export interface ObjectEnvelopeView {
  version_id: string
  context: EnvelopeContextView
  parameters: AbeParametersView
  envelope: { abe: string; recovery_enc: string; recovery_ciphertext: string }
}

function keysPath(bucket: string): string {
  return `/data/buckets/${encodeURIComponent(bucket)}/abe`
}

/** Creates or repeats the caller's request; a grant comes back at once from an unlocked bucket. */
export async function requestScopedKey(
  bucket: string,
  scope: KeyScope,
  client?: ApiClientOptions,
): Promise<KeyRequestResult> {
  const record = await apiRequest<AbeRecord<KeyGrantFields | KeyRequestFields>>(
    `${keysPath(bucket)}/requests`,
    { method: 'POST', body: JSON.stringify({ scope }) },
    client,
  )
  return record.aad === null
    ? { kind: 'pending', request: record as AbeRecord<KeyRequestFields> }
    : { kind: 'grant', grant: record as AbeRecord<KeyGrantFields> }
}

/** Open requests a current key holder can issue; needs an unrestricted token. */
export function listKeyRequests(
  bucket: string,
  cursor?: string | null,
  client?: ApiClientOptions,
): Promise<AbeRecordPage<KeyRequestFields>> {
  return apiRequest(`${keysPath(bucket)}/requests`, { query: { cursor } }, client)
}

export function submitKeyGrant(
  bucket: string,
  requestId: string,
  grant: GrantSubmission,
  client?: ApiClientOptions,
): Promise<AbeRecord<KeyGrantFields>> {
  return apiRequest(
    `${keysPath(bucket)}/requests/${encodeURIComponent(requestId)}/grant`,
    { method: 'POST', body: JSON.stringify(grant) },
    client,
  )
}

/** The caller's own grants; needs an unrestricted token. */
export function listKeyGrants(
  bucket: string,
  cursor?: string | null,
  client?: ApiClientOptions,
): Promise<AbeRecordPage<KeyGrantFields>> {
  return apiRequest(`${keysPath(bucket)}/grants`, { query: { cursor } }, client)
}

export function getObjectEnvelope(
  bucket: string,
  key: string,
  versionId: string,
  client?: ApiClientOptions,
): Promise<ObjectEnvelopeView> {
  return apiRequest('/data/blobs/envelope', { query: { bucket, key, version_id: versionId } }, client)
}

export interface KeyedDownload {
  bucket: string
  key: string
  versionId: string
  /** The 32-byte object private key; the caller clears it. */
  objectKey: Uint8Array
  /** One HTTP range such as `bytes=0-99`. */
  range?: string
  signal?: AbortSignal
}

/** Reads one pinned version with its object key in a header, never in a URL. */
export async function downloadWithKey(request: KeyedDownload, client: ApiClientOptions = {}): Promise<Blob> {
  if (request.objectKey.length !== 32) throw new Error('An object key has 32 bytes.')
  const headers = new Headers()
  if (client.token) headers.set('Authorization', `Bearer ${client.token}`)
  if (request.range) headers.set('Range', request.range)
  headers.set('x-aruna-object-key', btoa(String.fromCharCode(...request.objectKey)))
  const query = { bucket: request.bucket, key: request.key, version_id: request.versionId }
  const response = await fetch(apiUrl('/data/blobs/content', query, client), { headers, signal: request.signal })
  if (response.ok) return response.blob()
  let message = `${response.status} ${response.statusText}`
  let code: string | undefined
  try {
    const body = await response.json() as Record<string, unknown>
    if (typeof body.error === 'string') message = body.error
    if (typeof body.code === 'string') code = body.code
  } catch {
    // Keep the HTTP status message if the body is not JSON.
  }
  throw new ApiError(response.status, message, code)
}
