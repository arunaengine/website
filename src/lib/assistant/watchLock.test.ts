import { describe, expect, it, vi } from 'vitest'
import { WATCH_LOCK_NAME, watchLeadership, type WatchLocks } from './watchLock'

// Behaves like navigator.locks with ifAvailable: a held lock answers null at
// once, and it is free again only after the holder's callback promise settles.
function fakeLocks() {
  let holder: Promise<void> | null = null
  const requests: string[] = []
  const locks: WatchLocks = {
    async request(name, _options, callback) {
      requests.push(name)
      if (holder) return callback(null)
      const run = callback({ name })
      holder = run
      await run
      holder = null
    },
  }
  return { locks, requests, held: () => holder !== null }
}

describe('watchLeadership', () => {
  it('lets one tab lead and hands over once it releases', async () => {
    const fake = fakeLocks()
    const first = watchLeadership(fake.locks)
    const second = watchLeadership(fake.locks)

    expect(await first.claim()).toBe(true)
    expect(await second.claim()).toBe(false)
    expect(first.leading()).toBe(true)
    expect(second.leading()).toBe(false)
    expect(fake.requests).toEqual([WATCH_LOCK_NAME, WATCH_LOCK_NAME])

    first.release()
    await vi.waitFor(() => expect(fake.held()).toBe(false))

    expect(first.leading()).toBe(false)
    expect(await second.claim()).toBe(true)
    expect(second.leading()).toBe(true)
  })

  it('gives a lock back that was released while the claim was out', async () => {
    // A scope change during the request must not leave the tab holding the lock.
    let grant: ((lock: object | null) => Promise<void>) | null = null
    let holder: Promise<void> | null = null
    const locks: WatchLocks = {
      request: (_name, _options, callback) => new Promise<void>((resolve) => {
        grant = (lock) => {
          holder = callback(lock)
          return holder.then(resolve)
        }
      }),
    }
    const lead = watchLeadership(locks)
    const claim = lead.claim()
    lead.release()

    await grant!({ name: 'lock' })

    expect(await claim).toBe(false)
    expect(lead.leading()).toBe(false)
    await expect(holder).resolves.toBeUndefined()
  })

  it('asks once while it holds the lock', async () => {
    const fake = fakeLocks()
    const lead = watchLeadership(fake.locks)

    expect(await lead.claim()).toBe(true)
    expect(await lead.claim()).toBe(true)

    expect(fake.requests).toHaveLength(1)
  })

  it('treats a refused request as not leading', async () => {
    const locks: WatchLocks = { request: () => Promise.reject(new Error('insecure context')) }
    const lead = watchLeadership(locks)

    expect(await lead.claim()).toBe(false)
    expect(lead.leading()).toBe(false)
  })

  it('leads on its own without web locks', async () => {
    const lead = watchLeadership(null)

    expect(lead.leading()).toBe(true)
    expect(await lead.claim()).toBe(true)
    expect(() => lead.release()).not.toThrow()
  })
})
