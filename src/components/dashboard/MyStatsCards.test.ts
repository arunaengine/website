import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatBytes } from '@/lib/utils'
import type { UsageResponse } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  myGroups: { value: [] as Array<{ id: string; name: string }> },
  getGroupUsage: vi.fn<(groupId: string) => Promise<UsageResponse>>(),
  sessionEpoch: { value: 1 },
  searchBuckets: vi.fn(),
  getBucketUsage: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
// The realm's database list, by owning group.
const databases = vi.hoisted(() => ({
  rows: { value: [] as Array<{ ownerGroup: string }> },
  state: { value: 'idle' },
  complete: { value: true },
  ensure: () => {},
}))
vi.mock('@/composables/useDatabases', () => ({ useDatabases: () => databases }))

const { loadMyGroupsUsage } = await import('@/composables/useMyGroupsUsage')
const { useReachableUsage } = await import('@/composables/useReachableUsage')
const MyStatsCards = (await import('./MyStatsCards.vue')).default

function usage(overrides: Partial<UsageResponse> = {}): UsageResponse {
  return {
    buckets: 1,
    objects: 1,
    stored_blobs: 9,
    stored_bytes: 90_000,
    logical_bytes: 1,
    referenced_bytes: 1,
    realm: {
      buckets: 2,
      objects: 5,
      stored_blobs: 9,
      stored_bytes: 90_000,
      logical_bytes: 1_000,
      referenced_bytes: 1,
    },
    dataset_count: 3,
    profile_count: 1,
    process_run_count: 2,
    quota: { quota_bytes: 10_000, ceiling_bytes: 20_000, warn_threshold_percent: 80, warning: false },
    ...overrides,
  }
}

const hit = (bucket: string, node: string, group: string, set?: string) => ({ arn: '', bucket, node_id: node, group_id: group, created_at: '', set_id: set })
const listing = (hits: ReturnType<typeof hit>[]) => ({ hits, nodes_queried: 2, nodes_failed: 0, failed_nodes: [] })
const bucketUsage = (stored: number, referenced: number | null, objects: number) => ({ logical_bytes: stored, referenced_bytes: referenced, objects, complete: true })

async function renderedText(props: Record<string, unknown> = {}): Promise<string> {
  const html = await renderToString(createSSRApp(MyStatsCards, props))
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

beforeEach(() => {
  aruna.getGroupUsage.mockReset()
  aruna.getBucketUsage.mockReset()
  aruna.searchBuckets.mockReset()
  aruna.sessionEpoch.value++
  databases.rows.value = []
  databases.state.value = 'idle'
})

describe('personal statistics tiles', () => {
  it('shows storage, objects and datasets with each distributed bucket once', async () => {
    aruna.myGroups.value = [
      { id: 'sum-1', name: 'Alpha' },
      { id: 'sum-2', name: 'Beta' },
    ]
    aruna.getGroupUsage.mockResolvedValue(usage())
    // Each group total counts 2 buckets; Alpha's two are the copies of one distributed bucket.
    aruna.searchBuckets.mockImplementation(async (_q: string, options: { groupId: string }) =>
      listing(options.groupId === 'sum-1' ? [hit('shared', 'n1', 'sum-1', 's1'), hit('shared', 'n2', 'sum-1', 's1')] : [hit('a', 'n1', 'sum-2'), hit('b', 'n1', 'sum-2')]),
    )
    aruna.getBucketUsage.mockResolvedValue(bucketUsage(2048, 1024, 4))
    await loadMyGroupsUsage()
    await useReachableUsage().load()

    const text = await renderedText()

    expect(text).toContain(`Storage ${formatBytes(3 * 2048)} stored of ${formatBytes(2 * 10_000)} ${formatBytes(3 * 1024)} referenced`)
    expect(text).toContain('Stored counts against quotas. Referenced data stays at its source.')
    expect(text).toContain('Data 12 objects 3 buckets')
    expect(text).toContain('Work 4 runs 6 datasets')
    expect(text).not.toContain('at least')
  })

  it('uses the singular for one bucket and one process run', async () => {
    aruna.myGroups.value = [{ id: 'one-1', name: 'Alpha' }]
    aruna.getGroupUsage.mockResolvedValue(usage({ dataset_count: 0, process_run_count: 1, realm: { buckets: 1, distinct_buckets: 1, objects: 5, logical_bytes: 1_000, referenced_bytes: 1 } }))
    aruna.searchBuckets.mockResolvedValue(listing([hit('a', 'n1', 'one-1')]))
    aruna.getBucketUsage.mockResolvedValue(bucketUsage(10, 0, 1))
    await loadMyGroupsUsage()
    await useReachableUsage().load()

    const text = await renderedText()

    expect(text).toContain('1 object 1 bucket ')
    expect(text).toMatch(/Work 1 run 0 datasets$/)
  })

  it('shows a lower bound when a bucket could not be read', async () => {
    aruna.myGroups.value = [{ id: 'lower-1', name: 'Alpha' }]
    aruna.getGroupUsage.mockResolvedValue(usage())
    aruna.searchBuckets.mockResolvedValue(listing([hit('a', 'n1', 'lower-1'), hit('b', 'n1', 'lower-1')]))
    aruna.getBucketUsage.mockImplementation(async (bucket: string) => {
      if (bucket === 'b') throw new Error('node unreachable')
      return bucketUsage(10, null, 1)
    })
    await loadMyGroupsUsage()
    await useReachableUsage().load()

    const text = await renderedText()

    expect(text).toContain(`Storage at least 10 B stored of ${formatBytes(10_000)} at least 0 B referenced`)
    expect(text).toContain('could not be read, so it is not counted')
    expect(text).toContain('1 bucket does not report referenced data')
  })

  it('never reports physical storage, which has no group dimension', async () => {
    aruna.myGroups.value = [{ id: 'physical-1', name: 'Alpha' }]
    aruna.getGroupUsage.mockResolvedValue(usage())
    await loadMyGroupsUsage()

    const text = await renderedText()

    expect(text).not.toContain('physical')
    expect(text).not.toContain(formatBytes(90_000))
  })

  it('answers unknown, never zero, when a group could not be read', async () => {
    aruna.myGroups.value = [
      { id: 'failed-1', name: 'Alpha' },
      { id: 'failed-2', name: 'Ocean lab' },
    ]
    aruna.getGroupUsage.mockImplementation(async (groupId) => {
      if (groupId === 'failed-2') throw new Error('node unreachable')
      return usage()
    })
    await loadMyGroupsUsage()

    const text = await renderedText()

    expect(text).toMatch(/Work Unknown runs Unknown datasets/)
    expect(text).toContain('Totals stay unknown while the storage of Ocean lab cannot be read.')
    expect(text).not.toMatch(/Work 0/)
  })

  it('counts the databases of my groups once the database list was read', async () => {
    aruna.myGroups.value = [{ id: 'db-1', name: 'Alpha' }]
    aruna.getGroupUsage.mockResolvedValue(usage({ realm: { buckets: 2, distinct_buckets: 2, objects: 5, logical_bytes: 1_000, referenced_bytes: 1 } }))
    aruna.searchBuckets.mockResolvedValue(listing([hit('a', 'n1', 'db-1'), hit('b', 'n1', 'db-1')]))
    aruna.getBucketUsage.mockResolvedValue(bucketUsage(10, 0, 1))
    await loadMyGroupsUsage()
    await useReachableUsage().load()
    databases.rows.value = [{ ownerGroup: 'db-1' }, { ownerGroup: 'other' }]
    expect(await renderedText()).not.toContain('database')

    databases.state.value = 'ready'
    expect(await renderedText()).toContain('2 buckets, 1 database')
  })

  it('says no quota when no group has one, and how many visible runs run now', async () => {
    aruna.myGroups.value = [{ id: 'free-1', name: 'Alpha' }]
    aruna.getGroupUsage.mockResolvedValue(usage({ quota: { quota_bytes: null, ceiling_bytes: null, warn_threshold_percent: 80, warning: false } }))
    aruna.searchBuckets.mockResolvedValue(listing([hit('a', 'n1', 'free-1')]))
    aruna.getBucketUsage.mockResolvedValue(bucketUsage(10, 0, 1))
    await loadMyGroupsUsage()
    await useReachableUsage().load()

    expect(await renderedText()).toContain('10 B stored, no quota')
    expect(await renderedText({ running: { count: 2, atLeast: false } })).toContain('Work 2 runs 2 running, 3 datasets')
    expect(await renderedText({ running: { count: 0, atLeast: true } })).toContain('at least 0 running')
  })
})
