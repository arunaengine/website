import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageResponse } from '@/lib/api'
import type { GroupUsageEntry } from './useMyGroupsUsage'

const aruna = vi.hoisted(() => ({
  myGroups: { value: [] as Array<{ id: string; name: string }> },
  getGroupUsage: vi.fn<(groupId: string) => Promise<UsageResponse>>(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { aggregateGroupUsage, useMyGroupsUsage } = await import('./useMyGroupsUsage')

function entry(overrides: Partial<GroupUsageEntry> = {}): GroupUsageEntry {
  return {
    groupId: 'group-1',
    name: 'Research group',
    status: 'ready',
    quota: { quota_bytes: 1_000, ceiling_bytes: 2_000, warn_threshold_percent: 80, warning: false },
    usedBytes: 100,
    referencedBytes: 10,
    datasetCount: 2,
    profileCount: 1,
    processRunCount: 3,
    buckets: 4,
    objects: 5,
    ...overrides,
  }
}

function usage(overrides: Partial<UsageResponse> = {}): UsageResponse {
  return {
    buckets: 1,
    objects: 2,
    stored_blobs: 3,
    stored_bytes: 999,
    logical_bytes: 4,
    referenced_bytes: 5,
    realm: {
      buckets: 7,
      objects: 8,
      stored_blobs: 3,
      stored_bytes: 999,
      logical_bytes: 100,
      referenced_bytes: 5,
    },
    dataset_count: 1,
    profile_count: 1,
    process_run_count: 1,
    ...overrides,
  }
}

beforeEach(() => {
  aruna.getGroupUsage.mockReset()
})

describe('my groups aggregate', () => {
  it('sums the counts of every membership', () => {
    const totals = aggregateGroupUsage([
      entry(),
      entry({ groupId: 'group-2', name: 'Ocean lab', usedBytes: 400, datasetCount: 8, buckets: 1, objects: 6 }),
    ])

    expect(totals.groups).toBe(2)
    expect(totals.datasets).toBe(10)
    expect(totals.buckets).toBe(5)
    expect(totals.objects).toBe(11)
    expect(totals.usedBytes).toBe(500)
    expect(totals.failed).toEqual([])
  })

  it('reports the worst quota state across the memberships', () => {
    const totals = aggregateGroupUsage([
      entry(),
      entry({
        groupId: 'group-2',
        name: 'Ocean lab',
        usedBytes: 2_500,
        quota: { quota_bytes: 1_000, ceiling_bytes: 2_000, warn_threshold_percent: 80, warning: true },
      }),
    ])

    expect(totals.worstState).toBe('over-ceiling')
  })

  it('answers unknown instead of zero when a group could not be read', () => {
    const totals = aggregateGroupUsage([
      entry(),
      entry({ groupId: 'group-2', name: 'Ocean lab', status: 'error', error: 'boom' }),
    ])

    expect(totals.datasets).toBeNull()
    expect(totals.buckets).toBeNull()
    expect(totals.objects).toBeNull()
    expect(totals.usedBytes).toBeNull()
    // The unread group may hold the worst state, so no badge is claimed.
    expect(totals.worstState).toBeNull()
    expect(totals.failed).toEqual(['Ocean lab'])
  })

  it('keeps an unreported purpose count out of the dataset total only', () => {
    const totals = aggregateGroupUsage([entry(), entry({ groupId: 'group-2', datasetCount: null })])

    expect(totals.datasets).toBeNull()
    expect(totals.buckets).toBe(8)
    expect(totals.usedBytes).toBe(200)
  })
})

describe('shared my groups usage', () => {
  it('counts logical bytes and never the physical ones', async () => {
    aruna.myGroups.value = [{ id: 'physical-1', name: 'Genomics' }]
    aruna.getGroupUsage.mockResolvedValue(usage())
    const { aggregate, load } = useMyGroupsUsage()

    await load()

    expect(aggregate.value.usedBytes).toBe(100)
    expect(aggregate.value.buckets).toBe(7)
    expect(aggregate.value.objects).toBe(8)
    expect(JSON.stringify(aggregate.value)).not.toContain('999')
    expect(Object.keys(aggregate.value)).not.toContain('storedBytes')
  })

  it('serves concurrent consumers from one round of requests', async () => {
    aruna.myGroups.value = [
      { id: 'shared-1', name: 'Alpha' },
      { id: 'shared-2', name: 'Beta' },
    ]
    aruna.getGroupUsage.mockResolvedValue(usage())
    const { load } = useMyGroupsUsage()

    await Promise.all([load(), load()])
    await load()

    expect(aruna.getGroupUsage).toHaveBeenCalledTimes(2)
  })
})
