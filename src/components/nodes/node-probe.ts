import type { InfoResponse, RealmNodeInfo, UsageResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export interface NodeProbe {
  state: 'ok' | 'unreachable'
  info: InfoResponse | null
  usage: UsageResponse | null
  /** Browser-measured duration of the /info request, in milliseconds. */
  latencyMs?: number
  error?: string
}

const PROBE_TIMEOUT_MS = 3000

export function nodeApiBase(node: RealmNodeInfo): string | null {
  const url = (node.info?.urls?.api ?? node.rest_url ?? '').replace(/\/+$/, '')
  if (!url) return null
  return url.endsWith('/api/v1') ? url : `${url}/api/v1`
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return (await response.json()) as T
  } finally {
    window.clearTimeout(timer)
  }
}

export async function probeNode(apiBase: string): Promise<NodeProbe> {
  try {
    // Only the /info request is timed: it always runs, so latency numbers stay
    // comparable across nodes with and without the usage endpoint. Two
    // sequential samples are taken: the first pays DNS/TCP/TLS setup, the
    // second reuses the warm connection; the reported latency is the minimum.
    const coldStart = performance.now()
    const info = await fetchJson<InfoResponse>(`${apiBase}/info`)
    let latencyMs = performance.now() - coldStart
    try {
      const warmStart = performance.now()
      await fetchJson<InfoResponse>(`${apiBase}/info`)
      latencyMs = Math.min(latencyMs, performance.now() - warmStart)
    } catch {
      // The warm sample is best-effort; keep the cold measurement.
    }
    // /info/usage is still rolling out; a 404 must not mark the node unreachable.
    const usage = await fetchJson<UsageResponse>(`${apiBase}/info/usage`).catch(() => null)
    return { state: 'ok', info, usage, latencyMs }
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    return {
      state: 'unreachable',
      info: null,
      usage: null,
      error: timedOut ? `timed out after ${PROBE_TIMEOUT_MS / 1000}s` : errorMessage(err),
    }
  }
}
