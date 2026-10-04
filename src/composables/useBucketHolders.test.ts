import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as Api from '@/lib/api'
import type { BucketHolderEntry, BucketHoldersResponse } from '@/lib/api'
import { breaksRecovery, useBucketHolders } from './useBucketHolders'

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
  return { holders: entries, recovery: { state: 'met', ready_holders: 2, ready_with_recovery: 0 }, revision }
}

const NODE = { baseUrl: 'https://b.test/api/v1', token: 't' }
let current = true
const source = { client: () => NODE, binder: () => () => current, load: vi.fn(async () => undefined) }

function refusal(code: string) {
  return new Api.ApiError(409, 'conflict', code)
}

beforeEach(() => {
  current = true
  source.load.mockClear()
  listBucketHolders.mockReset().mockResolvedValue(listing([holder('A'), holder('B')]))
  removeBucketHolder.mockReset().mockResolvedValue(undefined)
  grantBucketHolder.mockReset().mockResolvedValue(holder('C', { state: 'pending' }))
})

describe('bucket key holders', () => {
  it('foresees a removal that breaks recovery', () => {
    expect(breaksRecovery([holder('A'), holder('B')], 'A')).toBe(true)
    expect(breaksRecovery([holder('A'), holder('B'), holder('C')], 'A')).toBe(false)
    expect(breaksRecovery([holder('A'), holder('B', { has_recovery: true })], 'A')).toBe(false)
    expect(breaksRecovery([holder('A'), holder('B'), holder('C', { state: 'pending' })], 'A')).toBe(true)
    expect(breaksRecovery([holder('A'), holder('B', { has_recovery: null })], 'A')).toBe(true)
  })

  it('drops a holder list that arrives after the bucket changed', async () => {
    const holders = useBucketHolders(source, ref('reef'))
    current = false

    await holders.load()

    expect(holders.holders.value).toBeNull()
    expect(holders.state.value).toBe('loading')
  })

  it('asks for confirmation when the node says the removal breaks recovery', async () => {
    const holders = useBucketHolders(source, ref('reef'))
    await holders.load()
    removeBucketHolder.mockRejectedValueOnce(refusal('recovery_confirmation_required'))

    expect(await holders.remove('A', false)).toBe('confirm')
    expect(await holders.remove('A', true)).toBe('removed')

    expect(removeBucketHolder.mock.calls.map((call) => call.slice(0, 4))).toEqual([
      ['reef', 'A', 'rev-1', false],
      ['reef', 'A', 'rev-1', true],
    ])
    expect(source.load).toHaveBeenCalledOnce()
  })

  it('reloads a holder set that changed meanwhile instead of removing from it', async () => {
    const holders = useBucketHolders(source, ref('reef'))
    await holders.load()
    removeBucketHolder.mockRejectedValueOnce(refusal('stale_holders'))
    listBucketHolders.mockResolvedValue(listing([holder('A'), holder('B'), holder('C')], 'rev-2'))

    await expect(holders.remove('A', false)).rejects.toThrow('changed meanwhile')

    expect(holders.holders.value?.revision).toBe('rev-2')
  })

  it('grants a holder and reads both the list and the bucket status again', async () => {
    const holders = useBucketHolders(source, ref('reef'))

    await holders.grant('C')

    expect(grantBucketHolder.mock.calls[0].slice(0, 2)).toEqual(['reef', 'C'])
    expect(listBucketHolders).toHaveBeenCalledOnce()
    expect(source.load).toHaveBeenCalledOnce()
  })
})
