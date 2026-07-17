// Recovery for stale deployments: the portal is served from a live-rebuilt
// dist/, so an open tab can reference content-hashed chunks that no longer
// exist. A failed dynamic import then breaks navigation silently. On such a
// failure, reload once from the server to pick up the new index.html; a
// sessionStorage stamp keyed by target prevents reload loops.
const STAMP_KEY = 'aruna.chunkReload'
const LOOP_WINDOW_MS = 10_000

export function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Failed to load module script/i.test(message)
  )
}

function readStamp(): { target: string; at: number } | null {
  try {
    const raw = window.sessionStorage.getItem(STAMP_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const { target, at } = parsed as { target?: unknown; at?: unknown }
    return typeof target === 'string' && typeof at === 'number' ? { target, at } : null
  } catch {
    return null
  }
}

// defineAsyncComponent onError hook: recover stale-chunk failures, fail the
// component otherwise (its error slot/fallback then renders).
export function asyncChunkError(error: Error, _retry: () => void, fail: () => void): void {
  if (isChunkError(error) && recoverFromChunkError(window.location.pathname + window.location.search)) {
    return
  }
  fail()
}

/// Hard-reloads toward `target` once; returns false when the same target
/// already failed moments ago (caller should surface a real error instead).
export function recoverFromChunkError(target: string): boolean {
  const stamp = readStamp()
  if (stamp && stamp.target === target && Date.now() - stamp.at < LOOP_WINDOW_MS) return false
  try {
    window.sessionStorage.setItem(STAMP_KEY, JSON.stringify({ target, at: Date.now() }))
  } catch {
    // Without the guard a loop is worse than no reload; still try once.
  }
  window.location.assign(target)
  return true
}
