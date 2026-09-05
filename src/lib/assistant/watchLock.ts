// One tab at a time runs the background watchers: two tabs of the same user
// polling the same job would each answer it with a model turn. The Web Locks
// API picks the tab; a browser without it leaves every tab running as before.
export const WATCH_LOCK_NAME = 'aruna.assistant.watch'

/** The part of navigator.locks the leadership uses; a test hands in a fake. */
export interface WatchLocks {
  request(
    name: string,
    options: { ifAvailable: true },
    callback: (lock: object | null) => Promise<void>,
  ): Promise<unknown>
}

export interface WatchLeadership {
  /** True while this tab holds the lock, and always without Web Locks. */
  leading(): boolean
  /** Tries for the lock once without waiting; resolves to whether this tab leads. */
  claim(): Promise<boolean>
  /** Lets another tab take over; a closed tab releases on its own. */
  release(): void
}

function browserLocks(): WatchLocks | null {
  if (typeof navigator === 'undefined') return null
  return navigator.locks ?? null
}

export function watchLeadership(locks: WatchLocks | null = browserLocks()): WatchLeadership {
  if (!locks) return { leading: () => true, claim: () => Promise.resolve(true), release: () => {} }
  let held: (() => void) | null = null
  let claiming: Promise<boolean> | null = null
  // A release asked for while the claim is out is applied once the lock arrives.
  let releasePending = false
  return {
    leading: () => held !== null,
    claim() {
      if (held) return Promise.resolve(true)
      claiming ??= new Promise<boolean>((resolve) => {
        // The browser keeps the lock with this tab until the callback's promise settles.
        locks.request(WATCH_LOCK_NAME, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false)
            return Promise.resolve()
          }
          return new Promise<void>((done) => {
            held = () => {
              held = null
              done()
            }
            if (releasePending) {
              releasePending = false
              held()
              resolve(false)
              return
            }
            resolve(true)
          })
        }).catch(() => resolve(false))
      }).finally(() => {
        claiming = null
      })
      return claiming
    },
    release() {
      if (held) held()
      else if (claiming) releasePending = true
    },
  }
}
