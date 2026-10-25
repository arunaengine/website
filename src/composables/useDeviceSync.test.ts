import { defineComponent, h, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceSyncStatus, SyncDataset, SyncDocument } from '@/lib/deviceApi'
import { mountApp } from '@/test/clientRender'

function statusOf(overrides: Partial<DeviceSyncStatus> = {}): DeviceSyncStatus {
  return { realmReachable: true, lastSyncMs: 1_000, pendingTotal: 0, documents: [], datasets: [], ...overrides }
}

function doc(overrides: Partial<SyncDocument> = {}): SyncDocument {
  return {
    documentId: 'd1',
    path: 'lab/run.json',
    groupId: 'g1',
    state: 'pending',
    pendingEdits: 1,
    localOnly: false,
    validationFindings: 0,
    lastError: null,
    lastSyncedMs: null,
    ...overrides,
  }
}

function dataset(overrides: Partial<SyncDataset> = {}): SyncDataset {
  return {
    folderId: 'f1',
    label: 'data-2026',
    state: 'pending',
    pendingUploads: 1,
    unsyncedFiles: 1,
    conflicts: 0,
    ...overrides,
  }
}

let answer: DeviceSyncStatus = statusOf()
const read = vi.fn(async () => answer)
const run = vi.fn(async () => true)
const owner = { baseUrl: 'http://127.0.0.1:9000/api/v1', token: 'owner' }
const client = shallowRef<typeof owner | null>(owner)

vi.mock('@/lib/deviceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deviceApi')>()
  return { ...actual, deviceSyncStatus: () => read(), runDeviceSync: () => run() }
})
vi.mock('@/composables/useDeviceStatus', () => ({
  useDeviceStatus: () => ({ deviceClient: client }),
}))

// The status is a module singleton, so each case takes a graph of its own
// rather than the leftovers of the one before it.
async function load() {
  vi.resetModules()
  return (await import('./useDeviceSync')).useDeviceSync({ poll: false })
}

beforeEach(() => {
  answer = statusOf()
  client.value = owner
  read.mockClear()
  run.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('sync state', () => {
  it('separates work in flight from what waits for the owner', async () => {
    answer = statusOf({
      pendingTotal: 4,
      documents: [
        doc({ state: 'pending' }),
        doc({ documentId: 'd2', state: 'publishing' }),
        doc({ documentId: 'd3', state: 'invalid' }),
        doc({ documentId: 'd4', state: 'failed' }),
        doc({ documentId: 'd5', state: 'synced' }),
      ],
      datasets: [dataset({ conflicts: 2 }), dataset({ folderId: 'f2', state: 'synced' })],
    })
    const sync = await load()
    await sync.load()

    expect(sync.pendingDocuments.value).toBe(2)
    expect(sync.pendingDatasets.value).toBe(1)
    expect(sync.needsOwner.value).toBe(4)
  })

  it('reports nothing before the first read lands', async () => {
    const sync = await load()

    expect(sync.loading.value).toBe(true)
    expect(sync.status.value.documents).toEqual([])
    expect(sync.needsOwner.value).toBe(0)
  })
})

describe('sync polling', () => {
  it('tightens the poll while the device owes the realm work', async () => {
    const sync = await load()
    await sync.load()
    expect(sync.pollMs.value).toBe(5_000)

    answer = statusOf({ pendingTotal: 2 })
    await sync.load()
    expect(sync.pollMs.value).toBe(3_000)
  })

  it('runs one poll for all open pages and stops with the last one', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    vi.resetModules()
    const { useDeviceSync } = await import('./useDeviceSync')
    const Page = defineComponent(() => {
      useDeviceSync()
      return () => h('div')
    })
    const first = await mountApp(Page)
    const second = await mountApp(Page)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(read).toHaveBeenCalledTimes(1)
    first.app.unmount()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(read).toHaveBeenCalledTimes(2)
    second.app.unmount()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('reads once for two callers at the same time', async () => {
    const sync = await load()

    await Promise.all([sync.load(), sync.load()])

    expect(read).toHaveBeenCalledTimes(1)
  })

  it('tightens the poll from the moment a run is asked for', async () => {
    // The run was accepted but the status has not caught up, so the wait is
    // shortened on the optimistic flag alone.
    answer = statusOf()
    const sync = await load()
    await sync.load()

    await sync.runSync()

    expect(sync.running.value).toBe(true)
    expect(sync.pollMs.value).toBe(3_000)
  })
})

describe('running a sync', () => {
  it('stays busy until a status shows the run moved', async () => {
    answer = statusOf({ lastSyncMs: 1_000, pendingTotal: 2 })
    const sync = await load()
    await sync.load()

    await sync.runSync()
    expect(sync.running.value).toBe(true)

    answer = statusOf({ lastSyncMs: 2_000, pendingTotal: 1 })
    await sync.load()
    expect(sync.running.value).toBe(false)
  })

  it('forgets the last session when the owner signs in again', async () => {
    answer = statusOf({ pendingTotal: 2 })
    const sync = await load()
    await sync.load()
    let finish: (value: DeviceSyncStatus) => void = () => {}
    read.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    const asked = sync.runSync()
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))

    client.value = null
    client.value = { ...owner, token: 'next' }
    expect(sync.running.value).toBe(false)
    expect(sync.status.value.pendingTotal).toBe(0)

    finish(statusOf({ pendingTotal: 7 }))
    await asked
    expect(sync.status.value.pendingTotal).toBe(0)
  })

  it('ignores a late refusal', async () => {
    const sync = await load()
    await sync.load()
    let refuse: (err: Error) => void = () => {}
    run.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)))
    const stale = sync.runSync()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))

    client.value = { ...owner, token: 'next' }
    await sync.load()
    await sync.runSync()
    refuse(new Error('The old session was refused.'))
    await stale
    expect(sync.running.value).toBe(true)
    expect(sync.runError.value).toBeNull()

    await sync.runSync()
    expect(run).toHaveBeenCalledTimes(2)
    answer = statusOf({ lastSyncMs: 2_000 })
    await sync.load()
    expect(sync.running.value).toBe(false)
  })

  it('asks for one run at a time', async () => {
    const sync = await load()
    await sync.load()

    await sync.runSync()
    await sync.runSync()

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('names a refused run without pretending it is still going', async () => {
    run.mockRejectedValueOnce(new Error('The node refused the run.'))
    const sync = await load()
    await sync.load()

    await sync.runSync()

    expect(sync.running.value).toBe(false)
    expect(sync.runError.value).toBe('The node refused the run.')
  })
})
