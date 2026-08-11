import { apiRequest, type ApiClientOptions } from './api'

// w3id persistent identifiers, verified against aruna api/src/routes/pid.rs.
// The PID string is the document's graph IRI (https://w3id.org/aruna/{id});
// mint and withdraw both require WRITE on the document.

const PROBE_TIMEOUT_MS = 10_000

export type PidResolution = 'active' | 'withdrawn' | 'missing' | 'unavailable'

export interface MintPidResponse {
  pid: string
  job_id: string
  created: boolean
}

// POST /pid/{id} — 202 Accepted: the mint runs as a fenced job on the PID
// authority, so acceptance is not registration. Idempotent by document id;
// `created` is false when the job already existed.
export function mintPid(documentId: string, client: ApiClientOptions): Promise<MintPidResponse> {
  return apiRequest<MintPidResponse>(`/pid/${encodeURIComponent(documentId)}`, { method: 'POST' }, client)
}

// DELETE /pid/{id} — flips the PID to a permanent 410 tombstone; 204 only once
// the transition is durable. Terminal: there is no reactivation, and a pending
// mint job cannot land after it.
export function withdrawPid(documentId: string, client: ApiClientOptions): Promise<void> {
  return apiRequest<void>(`/pid/${encodeURIComponent(documentId)}`, { method: 'DELETE' }, client)
}

// Maps the anonymous landing answer (pid.rs landing_response). A same-origin
// fetch with redirect:'manual' surfaces the 302 as an opaqueredirect filtered
// response (status 0), so the response type carries the redirect signal.
export function pidResolution(responseType: string, status: number): PidResolution {
  if (responseType === 'opaqueredirect' || status === 302) return 'active'
  if (status === 410) return 'withdrawn'
  if (status === 404) return 'missing'
  return 'unavailable'
}

// Anonymous landing probe on GET /pid/{id}. The endpoint answers 302 only
// while the document is anonymously visible, so for a private document
// 'missing' also covers "minted but not publicly resolvable" — callers must
// present it that way instead of claiming the PID does not exist.
export async function probePid(documentId: string, baseUrl: string): Promise<PidResolution> {
  const base = baseUrl.replace(/\/$/, '')
  const url = new URL(`${base}/pid/${encodeURIComponent(documentId)}`, window.location.origin)
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(url, { redirect: 'manual', signal: controller.signal })
    return pidResolution(response.type, response.status)
  } catch {
    return 'unavailable'
  } finally {
    globalThis.clearTimeout(timer)
  }
}
