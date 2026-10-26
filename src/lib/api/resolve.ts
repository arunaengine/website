// ── Resolve a global version id ─────────────────────────────────────────────
// GET /resolve/{realm-id}/{version-id}: the node serves the bytes, or answers 307 to a holder
// with a single-use ticket in the Location. The token goes in the header, never in a URL.
import { fetchWithRetry } from '../fetch'
import { ApiError, apiUrl, type ApiClientOptions } from './client'

const RESOLVE_TIMEOUT_MS = 600_000

export async function resolveVersion(
  realmId: string,
  versionId: string,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<Blob> {
  const headers = new Headers()
  if (client.token) headers.set('Authorization', `Bearer ${client.token}`)
  const path = `/resolve/${encodeURIComponent(realmId)}/${encodeURIComponent(versionId)}`
  const response = await fetchWithRetry(apiUrl(path, {}, client), { method: 'GET', headers, signal }, RESOLVE_TIMEOUT_MS)
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as Record<string, unknown>
      const text = body.message ?? body.error ?? body.msg
      if (typeof text === 'string') message = text
    } catch {
      // Keep the status line when the body is not JSON.
    }
    throw new ApiError(response.status, message)
  }
  return response.blob()
}
