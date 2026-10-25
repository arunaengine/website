// One cadence for every surface that refreshes itself. The node answers on
// 127.0.0.1, so its surfaces keep a short beat; realm-wide reads take the slow
// one. Nothing polls while the window is hidden, and every surface reads once
// more the moment the owner comes back to it.

/** A file is being sent; small files finish in under a second each. */
export const POLL_FAST_MS = 1_000
/** Something is in flight: a sync run, a transfer, an active job. */
export const POLL_ACTIVE_MS = 3_000
/** The node at rest, and realm lists that change on someone else's action. */
export const POLL_IDLE_MS = 5_000
/** Realm-wide status, which is published on a heartbeat of its own. */
export const POLL_SLOW_MS = 15_000

function page(): Document | null {
  return typeof document === 'undefined' ? null : document
}

function hidden(): boolean {
  return page()?.hidden === true
}

/**
 * Re-armed poll: the next wait starts only once the run before it landed, so
 * reads never stack, and `delay` is read again on every tick so a surface that
 * turns busy tightens its own cadence. Returns the stop.
 */
export function follow(run: () => Promise<void>, delay: () => number, skip?: () => boolean): () => void {
  if (typeof window === 'undefined') return () => {}
  let timer: number | undefined
  let stopped = false
  const tick = async () => {
    if (!hidden() && !skip?.()) await run()
    // A run still in flight when the surface left must not re-arm the timer.
    if (!stopped) timer = window.setTimeout(tick, delay())
  }
  timer = window.setTimeout(tick, delay())
  return () => {
    stopped = true
    window.clearTimeout(timer)
  }
}

/**
 * One poll for every surface that shows the same read: the first start runs it,
 * the last stop ends it. Balance every start with a stop.
 */
export function sharedPoll(run: () => Promise<void>, delay: () => number, skip?: () => boolean) {
  let holders = 0
  let release: (() => void) | null = null
  function start(): void {
    holders += 1
    if (holders > 1) return
    const stop = follow(run, delay, skip)
    const unwake = onWake(() => void run())
    release = () => {
      stop()
      unwake()
    }
  }
  function stop(): void {
    if (holders === 0) return
    holders -= 1
    if (holders > 0) return
    release?.()
    release = null
  }
  return { start, stop }
}

/** Reads once more as soon as the window is back in front. Returns the stop. */
export function onWake(refresh: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
  const wake = () => {
    if (!hidden()) refresh()
  }
  window.addEventListener('focus', wake)
  page()?.addEventListener?.('visibilitychange', wake)
  return () => {
    window.removeEventListener('focus', wake)
    page()?.removeEventListener?.('visibilitychange', wake)
  }
}
