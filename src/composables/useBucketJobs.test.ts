import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listStorageBuckets = vi.fn()
const { MockApiError } = vi.hoisted(() => ({
  MockApiError: class extends Error {
    constructor(public status: number, message = 'refused') {
      super(message)
    }
  },
}))
const epoch = ref(0)

vi.mock('@/composables/useAruna', () => ({
  isUnsupportedEndpoint: (err: { status?: number }) => err?.status === 404,
  useAruna: () => ({ apiBaseUrl: ref('https://api.test'), authToken: ref('t'), sessionEpoch: epoch }),
}))
// Another node's address may wait for the realm on a fresh load.
const address = vi.hoisted(() => ({ known: Promise.resolve() }))
vi.mock('@/composables/aruna/state', () => ({
  nodeClientReady: async (node: string) => {
    await address.known
    return { baseUrl: `https://${node}`, token: 't' }
  },
}))
vi.mock('@/lib/api', () => ({
  listStorageBuckets: (...args: unknown[]) => listStorageBuckets(...args),
  ApiError: MockApiError,
}))

import { useBucketJobs } from './useBucketJobs'

const RENAMING = { kind: 'rename', state: 'running', done: 3, failed: 0 }
const listed = (bucket: string, job?: unknown) => ({ bucket, backend_id: null, import_id: null, ...(job ? { job } : {}) })
const settle = async () => {
  for (let turn = 0; turn < 6; turn++) await Promise.resolve()
  await nextTick()
}

function setup(group = 'g1', nodes: string[] = []) {
  const groupId = ref(group)
  const bucketList = ref<unknown>([])
  const others = ref(nodes)
  const scope = effectScope()
  const jobs = scope.run(() => useBucketJobs(groupId, bucketList, others))!
  return { scope, jobs, groupId, bucketList }
}

beforeEach(() => {
  vi.useRealTimers()
  epoch.value = 0
  listStorageBuckets.mockReset().mockResolvedValue({ buckets: [], next: null })
})

describe('useBucketJobs', () => {
  it('holds the job of each bucket that has one and nothing for the rest', async () => {
    listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', RENAMING), listed('reads')], next: null })
    const { scope, jobs } = setup()
    await settle()
    expect(listStorageBuckets).toHaveBeenCalledTimes(1)
    expect(listStorageBuckets).toHaveBeenCalledWith('g1', expect.objectContaining({ after: null }), expect.anything())
    expect([...jobs.value.keys()]).toEqual(['genes'])
    expect(jobs.value.get('genes')).toEqual(RENAMING)
    scope.stop()
  })

  it('reads the steps of other nodes from those nodes, by node and bucket', async () => {
    listStorageBuckets.mockImplementation(async (_group: string, _page: unknown, client: { baseUrl: string }) =>
      client.baseUrl === 'https://node-2'
        ? { buckets: [listed('genes', RENAMING)], next: null }
        : client.baseUrl === 'https://node-3'
          ? Promise.reject(new MockApiError(503))
          : { buckets: [listed('reads')], next: null },
    )
    const { scope, jobs } = setup('g1', ['node-2', 'node-3'])
    await settle()
    await settle()
    expect([...jobs.value.entries()]).toEqual([['node-2/genes', RENAMING]])
    scope.stop()
  })

  it('shows nothing from a node that sends no job field', async () => {
    listStorageBuckets.mockResolvedValue({ buckets: [listed('genes'), listed('reads')], next: null })
    const { scope, jobs } = setup()
    await settle()
    expect(jobs.value.size).toBe(0)
    scope.stop()
  })

  it('reads every page of the group', async () => {
    listStorageBuckets
      .mockResolvedValueOnce({ buckets: [listed('a')], next: 'c1' })
      .mockResolvedValueOnce({ buckets: [listed('b', RENAMING)], next: null })
    const { scope, jobs } = setup()
    await settle()
    expect(listStorageBuckets).toHaveBeenLastCalledWith('g1', expect.objectContaining({ after: 'c1' }), expect.anything())
    expect(jobs.value.has('b')).toBe(true)
    scope.stop()
  })

  it.each([403, 404])('shows nothing and asks no more when the node answers %i', async (status) => {
    listStorageBuckets.mockRejectedValue(new MockApiError(status))
    const { scope, jobs, bucketList } = setup()
    await settle()
    expect(jobs.value.size).toBe(0)
    bucketList.value = [{ name: 'genes' }]
    await settle()
    expect(listStorageBuckets).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('asks again for another group after a refusal', async () => {
    listStorageBuckets.mockRejectedValueOnce(new MockApiError(403))
    const { scope, jobs, groupId } = setup()
    await settle()
    listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', RENAMING)], next: null })
    groupId.value = 'g2'
    await settle()
    expect(listStorageBuckets).toHaveBeenLastCalledWith('g2', expect.anything(), expect.anything())
    expect(jobs.value.has('genes')).toBe(true)
    scope.stop()
  })

  it('reads again with the bucket list', async () => {
    const { scope, jobs, bucketList } = setup()
    await settle()
    listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', RENAMING)], next: null })
    bucketList.value = [{ name: 'genes' }]
    await settle()
    expect(jobs.value.has('genes')).toBe(true)
    scope.stop()
  })

  it('follows a running step and stops once none runs', async () => {
    vi.useFakeTimers()
    listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', RENAMING)], next: null })
    const { scope, jobs } = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(listStorageBuckets).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(listStorageBuckets).toHaveBeenCalledTimes(2)
    listStorageBuckets.mockResolvedValue({ buckets: [listed('genes')], next: null })
    await vi.advanceTimersByTimeAsync(3000)
    expect(jobs.value.size).toBe(0)
    const calls = listStorageBuckets.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(listStorageBuckets.mock.calls.length).toBe(calls)
    scope.stop()
  })

  it('does not poll when no step runs', async () => {
    vi.useFakeTimers()
    const { scope } = setup()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(listStorageBuckets).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('keeps the known jobs when a read fails and tries again', async () => {
    vi.useFakeTimers()
    listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', RENAMING)], next: null })
    const { scope, jobs } = setup()
    await vi.advanceTimersByTimeAsync(0)
    listStorageBuckets.mockRejectedValue(new MockApiError(500))
    await vi.advanceTimersByTimeAsync(3000)
    expect(jobs.value.has('genes')).toBe(true)
    listStorageBuckets.mockResolvedValue({ buckets: [listed('genes')], next: null })
    await vi.advanceTimersByTimeAsync(3000)
    expect(jobs.value.size).toBe(0)
    scope.stop()
  })

  it('asks another node nothing for the old group once its address resolves late', async () => {
    let name!: () => void
    address.known = new Promise((resolve) => (name = resolve))
    const { scope, groupId } = setup('g1', ['n2'])
    await settle()
    groupId.value = 'g2'
    await settle()
    name()
    await settle()

    expect(listStorageBuckets.mock.calls.filter(([group, , client]) => group === 'g1' && (client as { baseUrl: string }).baseUrl === 'https://n2')).toEqual([])
    address.known = Promise.resolve()
    scope.stop()
  })

  it('drops the jobs of the old group and ignores its late answer', async () => {
    let late: (value: unknown) => void = () => {}
    listStorageBuckets.mockReturnValueOnce(new Promise((resolve) => (late = resolve)))
    const { scope, jobs, groupId } = setup()
    listStorageBuckets.mockResolvedValue({ buckets: [listed('other')], next: null })
    groupId.value = 'g2'
    await settle()
    late({ buckets: [listed('genes', RENAMING)], next: null })
    await settle()
    expect(jobs.value.size).toBe(0)
    scope.stop()
  })

  it('stops reading once its scope is gone', async () => {
    vi.useFakeTimers()
    listStorageBuckets.mockResolvedValue({ buckets: [listed('genes', RENAMING)], next: null })
    const { scope } = setup()
    await vi.advanceTimersByTimeAsync(0)
    scope.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(listStorageBuckets).toHaveBeenCalledTimes(1)
  })
})
