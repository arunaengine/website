// ── Resolve a global version id ─────────────────────────────────────────────
// GET /resolve/{realm-id}/{version-id}: the node serves the bytes, or answers 307 to a holder
// with a single-use ticket in the Location. The token goes in the header, never in a URL.
// The body is handed back as a stream and is never buffered here.
import { fetchWithRetry } from '../fetch'
import { ApiError, apiUrl, type ApiClientOptions } from './client'

const RESOLVE_TIMEOUT_MS = 600_000

/** The bytes of a version as they arrive; `size` is the announced length, when there is one. */
export interface VersionStream {
  body: ReadableStream<Uint8Array>
  size: number | null
  type: string
}

export async function resolveVersion(
  realmId: string,
  versionId: string,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<VersionStream> {
  const headers = new Headers()
  if (client.token) headers.set('Authorization', `Bearer ${client.token}`)
  const path = `/resolve/${encodeURIComponent(realmId)}/${encodeURIComponent(versionId)}`
  const response = await fetchWithRetry(apiUrl(path, {}, client), { method: 'GET', headers, signal }, RESOLVE_TIMEOUT_MS, true)
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
  const length = Number(response.headers.get('Content-Length'))
  return {
    body: response.body ?? new Blob([]).stream(),
    size: response.headers.has('Content-Length') && Number.isFinite(length) ? length : null,
    type: response.headers.get('Content-Type') ?? '',
  }
}

/** Reads a stream into a Blob; answers null, with the rest unread, once it holds more than `cap` bytes. */
export async function readCapped(version: VersionStream, cap: number): Promise<Blob | null> {
  if (version.size !== null && version.size > cap) {
    await version.body.cancel()
    return null
  }
  const reader = version.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return new Blob(chunks, { type: version.type })
      length += value.byteLength
      if (length > cap) {
        await reader.cancel()
        return null
      }
      chunks.push(value as Uint8Array<ArrayBuffer>)
    }
  } finally {
    reader.releaseLock()
  }
}
