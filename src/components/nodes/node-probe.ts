import type { InfoResponse, RealmNodeInfo, UsageResponse } from '@/lib/api'

export interface NodeProbe {
  state: 'ok' | 'unreachable'
  info: InfoResponse | null
  usage: UsageResponse | null
  error?: string
}

const PROBE_TIMEOUT_MS = 3000

export function nodeApiBase(node: RealmNodeInfo): string | null {
  const url = (node.info?.urls?.api ?? node.rest_url ?? '').replace(/\/+$/, '')
  if (!url) return null
  return url.endsWith('/api/v1') ? url : `${url}/api/v1`
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json() as Promise<T>
}

export async function probeNode(apiBase: string): Promise<NodeProbe> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const info = await fetchJson<InfoResponse>(`${apiBase}/info`, controller.signal)
    // /info/usage is still rolling out; a 404 must not mark the node unreachable.
    const usage = await fetchJson<UsageResponse>(`${apiBase}/info/usage`, controller.signal).catch(
      () => null,
    )
    return { state: 'ok', info, usage }
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    return {
      state: 'unreachable',
      info: null,
      usage: null,
      error: timedOut ? `timed out after ${PROBE_TIMEOUT_MS / 1000}s` : err instanceof Error ? err.message : String(err),
    }
  } finally {
    window.clearTimeout(timer)
  }
}
