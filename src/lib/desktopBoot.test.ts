import { afterEach, describe, expect, it, vi } from 'vitest'

const REALM = 'https://aruna.example/api/v1'

// The desktop context and the runtime config are both read once per module
// graph, so every case builds a graph of its own.
async function load(desktop = true, apiBaseUrl = REALM) {
  vi.resetModules()
  vi.stubGlobal('window', desktop ? { __ARUNA_DESKTOP__: { apiBaseUrl } } : {})
  const config = await import('./config')
  config.applyPortalConfig({ apiBaseUrl })
  return await import('./desktopBoot')
}

function dead(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }),
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('realm probe', () => {
  it('takes a json answer as reachable', async () => {
    const boot = await load()
    const answered = vi.fn(async (url: RequestInfo | URL) => new Response(`{"url":${JSON.stringify(String(url))}}`))
    vi.stubGlobal('fetch', answered)

    await boot.probeRealm()
    expect(boot.realmReach.value).toBe('reachable')
    expect(answered).toHaveBeenCalledTimes(1)
    expect(String(answered.mock.calls[0][0])).toBe(`${REALM}/info`)
  })

  it('condemns a realm only once every attempt failed', async () => {
    vi.useFakeTimers()
    const boot = await load()
    dead()
    const probe = boot.probeRealm()

    await vi.advanceTimersByTimeAsync(0)
    // One transport failure is a hiccup, not a verdict.
    expect(boot.realmReach.value).toBe('probing')

    await vi.advanceTimersByTimeAsync(3_000)
    await probe
    expect(boot.realmReach.value).toBe('unreachable')
    expect(boot.realmFailure.value).toContain('Failed to fetch')
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3)
  })

  it('waits out a slow realm', async () => {
    // Slowness inside the attempt budget must never read as a dead realm.
    vi.useFakeTimers()
    const boot = await load()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => setTimeout(() => resolve(new Response('{}')), 4_000))),
    )
    const probe = boot.probeRealm()

    await vi.advanceTimersByTimeAsync(3_000)
    expect(boot.realmReach.value).toBe('probing')

    await vi.advanceTimersByTimeAsync(2_000)
    await probe
    expect(boot.realmReach.value).toBe('reachable')
  })

  it('reads a timing out realm as dead', async () => {
    vi.useFakeTimers()
    const boot = await load()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)))),
    )
    const probe = boot.probeRealm()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(boot.realmReach.value).toBe('probing')

    await vi.advanceTimersByTimeAsync(15_000)
    await probe
    expect(boot.realmReach.value).toBe('unreachable')
  })

  it('rejects an origin that answers with html', async () => {
    // A proxy or captive portal page is not the realm's API.
    vi.useFakeTimers()
    const boot = await load()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><title>nope</title>')))
    const probe = boot.probeRealm()

    await vi.advanceTimersByTimeAsync(4_000)
    await probe
    expect(boot.realmReach.value).toBe('unreachable')
  })

  it('clears the verdict when a retry answers', async () => {
    vi.useFakeTimers()
    const boot = await load()
    dead()
    const probe = boot.probeRealm()
    await vi.advanceTimersByTimeAsync(4_000)
    await probe
    expect(boot.realmUnreachable()).toBe(true)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    await boot.probeRealm()
    expect(boot.realmReach.value).toBe('reachable')
    expect(boot.realmFailure.value).toBeNull()
  })

  it('never probes outside the shell', async () => {
    const boot = await load(false, '/api/v1')
    const never = vi.fn()
    vi.stubGlobal('fetch', never)

    await boot.probeRealm()
    expect(never).not.toHaveBeenCalled()
    expect(boot.realmReach.value).toBe('reachable')
  })

  it('names the api origin', async () => {
    const boot = await load()
    expect(boot.realmOrigin()).toBe('https://aruna.example')
  })
})
