import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import * as Api from '@/lib/api'
import type { BucketEncryptionResponse, BucketHolderEntry, BucketHoldersResponse } from '@/lib/api'
import { listedRecovery, recoveryAfter, useBucketHolders } from './useBucketHolders'

const listBucketHolders = vi.fn()
const removeBucketHolder = vi.fn()
const grantBucketHolder = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  listBucketHolders: (...args: unknown[]) => listBucketHolders(...args),
  removeBucketHolder: (...args: unknown[]) => removeBucketHolder(...args),
  grantBucketHolder: (...args: unknown[]) => grantBucketHolder(...args),
}))

function holder(userId: string, overrides: Partial<BucketHolderEntry> = {}): BucketHolderEntry {
  return {
    user_id: userId,
    origin: 'explicit',
    state: 'ready',
    has_recovery: false,
    granted_by: null,
    granted_at_ms: null,
    ...overrides,
  }
}

function listing(entries: BucketHolderEntry[], revision = 'rev-1'): BucketHoldersResponse {
  return {
    holders: entries,
    complete: true,
    unresolved: 0,
    recovery: { state: 'met', ready_holders: 2, ready_with_recovery: 0 },
    revision,
  }
}

const NODE = { baseUrl: 'https://b.test/api/v1', token: 't' }
let current = true
const shown = ref<BucketEncryptionResponse | null>({ bucket_id: 'B1', key_generation: 2 } as BucketEncryptionResponse)
const revision = ref(0)
const source = {
  client: () => NODE,
  binder: () => () => current,
  load: vi.fn(async () => {
    revision.value += 1
  }),
  status: shown,
  revision,
}
let scope = effectScope()

function holdersOf(bucket = 'reef') {
  return scope.run(() => useBucketHolders(source, ref(bucket)))!
}

function refusal(code: string) {
  return new Api.ApiError(409, 'conflict', code)
}

beforeEach(() => {
  current = true
  shown.value = { bucket_id: 'B1', key_generation: 2 } as BucketEncryptionResponse
  source.load.mockClear()
  listBucketHolders.mockReset().mockResolvedValue(listing([holder('A'), holder('B')]))
  removeBucketHolder.mockReset().mockResolvedValue(undefined)
  grantBucketHolder.mockReset().mockResolvedValue(holder('C', { state: 'pending' }))
})

afterEach(() => {
  scope.stop()
  scope = effectScope()
})

describe('bucket key holders', () => {
  it('foresees a removal that breaks recovery', () => {
    const after = (entries: BucketHolderEntry[], complete = true) =>
      recoveryAfter({ ...listing(entries), complete }, 'A')
    expect(after([holder('A'), holder('B')])).toBe('unmet')
    expect(after([holder('A'), holder('B'), holder('C')])).toBe('kept')
    expect(after([holder('A'), holder('B', { has_recovery: true })])).toBe('kept')
    expect(after([holder('A'), holder('B'), holder('C', { state: 'pending' })])).toBe('unmet')
    expect(after([holder('A'), holder('B', { has_recovery: null })])).toBe('unknown')
    expect(after([holder('A'), holder('B')], false)).toBe('unknown')
    expect(after([holder('A'), holder('B'), holder('C')], false)).toBe('kept')
  })

  it('reads recovery from a partial list as unknown unless its resolved holders meet it', () => {
    const degraded = { state: 'degraded' as const, ready_holders: 1, ready_with_recovery: 0 }
    const partial = { ...listing([holder('A')]), complete: false, unresolved: 2 }

    expect(listedRecovery({ ...partial, recovery: degraded }).state).toBe('unknown')
    expect(listedRecovery(partial).state).toBe('met')
    expect(listedRecovery({ ...listing([holder('A')]), recovery: degraded }).state).toBe('degraded')
  })

  it('drops a holder list that arrives after the bucket changed', async () => {
    current = false
    const holders = holdersOf()

    await holders.load()

    expect(listBucketHolders).toHaveBeenCalledTimes(2)
    expect(holders.holders.value).toBeNull()
    expect(holders.state.value).toBe('loading')
  })

  it('asks for confirmation when the node says the removal breaks recovery', async () => {
    const holders = holdersOf()
    await vi.waitFor(() => expect(holders.state.value).toBe('ready'))
    removeBucketHolder.mockRejectedValueOnce(refusal('recovery_confirmation_required'))

    expect(await holders.remove('A', false, 'rev-1')).toBe('confirm')
    expect(await holders.remove('A', true, 'rev-1')).toBe('removed')

    expect(removeBucketHolder.mock.calls.map((call) => call.slice(0, 4))).toEqual([
      ['reef', 'A', 'rev-1', false],
      ['reef', 'A', 'rev-1', true],
    ])
    expect(source.load).toHaveBeenCalledOnce()
  })

  it('reloads a holder set that changed meanwhile instead of removing from it', async () => {
    const holders = holdersOf()
    await vi.waitFor(() => expect(holders.state.value).toBe('ready'))
    removeBucketHolder.mockRejectedValueOnce(refusal('stale_holders'))
    listBucketHolders.mockResolvedValue(listing([holder('A'), holder('B'), holder('C')], 'rev-2'))

    await expect(holders.remove('A', false, 'rev-1')).rejects.toThrow('changed meanwhile')

    await vi.waitFor(() => expect(holders.holders.value?.revision).toBe('rev-2'))
  })

  it('grants a holder and reads both the list and the bucket status again', async () => {
    const holders = holdersOf()
    await vi.waitFor(() => expect(holders.state.value).toBe('ready'))

    await holders.grant('C')

    expect(grantBucketHolder.mock.calls[0].slice(0, 2)).toEqual(['reef', 'C'])
    expect(source.load).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(listBucketHolders).toHaveBeenCalledTimes(2))
  })

  it('starts empty for another key generation and drops the list of the old one', async () => {
    const holders = holdersOf()
    await vi.waitFor(() => expect(holders.state.value).toBe('ready'))
    const answers: ((value: BucketHoldersResponse) => void)[] = []
    listBucketHolders.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
    revision.value += 1
    await vi.waitFor(() => expect(answers).toHaveLength(1))

    shown.value = { bucket_id: 'B1', key_generation: 3 } as BucketEncryptionResponse
    await vi.waitFor(() => expect(answers).toHaveLength(2))
    expect(holders.holders.value).toBeNull()
    answers[0](listing([holder('OLD')]))
    await Promise.resolve()
    expect(holders.holders.value).toBeNull()
    answers[1](listing([holder('NEW')]))
    await vi.waitFor(() => expect(holders.state.value).toBe('ready'))

    expect(holders.holders.value?.holders.map((entry) => entry.user_id)).toEqual(['NEW'])
  })
})
