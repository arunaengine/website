// ── Following where data came from ──────────────────────────────────────────
// Verified against aruna api/src/routes/storage/origin.rs, execution/runs.rs and
// storage/provenance.rs (feat/provenance-links). Each hop is read with the caller's token on
// the node that holds the record; a hop the caller may not read answers 403 or 404.
import { apiRequest, apiUrl, ApiError, type ApiClientOptions } from './client'
import type { OriginResponse } from './origin'

export interface RunResponse {
  run_id: string
  /** The submitted job; shown to the submitter only. */
  logical_job_id?: string | null
  /** The run crate document, once written. */
  run_crate?: string | null
  run_crate_iri?: string | null
  /** The crate's state for the submitter, with a `message` when it was not written. */
  run_crate_status?: { status: string; message?: string; resource?: string } | null
}

/** The origin of one exact version: a global id URL or a versioned object w3id. */
export function getVersionOrigin(version: string, client: ApiClientOptions = {}, signal?: AbortSignal): Promise<OriginResponse> {
  return apiRequest('/data/origin', { query: { version }, signal }, client)
}

/** Where a run id leads: its run crate, for the submitter and the crate's readers. */
export function getRun(runId: string, client: ApiClientOptions = {}, signal?: AbortSignal): Promise<RunResponse> {
  return apiRequest(`/compute/runs/${encodeURIComponent(runId)}`, { signal }, client)
}

/** The provenance of a version or dataset as one RO-Crate ZIP, assembled while the node waits. */
export async function downloadProvenanceCrate(
  start: { version: string } | { dataset: string },
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<Blob> {
  const headers = new Headers()
  if (client.token) headers.set('Authorization', `Bearer ${client.token}`)
  const response = await fetch(apiUrl('/data/provenance/crate', { ...start }, client), { headers, signal })
  if (response.ok) return response.blob()
  let message = `${response.status} ${response.statusText}`
  try {
    const body = (await response.json()) as Record<string, unknown>
    if (typeof body.error === 'string') message = body.error
  } catch {
    // Keep the HTTP status message if the body is not JSON.
  }
  throw new ApiError(response.status, message)
}
