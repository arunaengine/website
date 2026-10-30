import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageResponse } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  myGroups: { value: [] as Array<{ id: string; name: string }> },
  getGroupUsage: vi.fn<(groupId: string) => Promise<UsageResponse>>(),
  sessionEpoch: { value: 1 },
  searchBuckets: vi.fn(),
  getBucketUsage: vi.fn(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))
// Links render as anchors naming where they go.
vi.mock('vue-router', async () => {
  const { defineComponent, h } = await import('vue')
  return { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) }) }
})
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
  it('shows the storage total, stored, referenced and objects with each distributed bucket once', async () => {
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

    expect(text).toContain('Storage 9 KiB total 6 KiB stored 3 KiB referenced')
    expect(await renderToString(createSSRApp(MyStatsCards))).toContain('aria-label="Stored data counts against quotas. Referenced data stays at its source."')
    expect(text).toContain('Objects 12 3 buckets')
    expect(text).not.toContain('at least')
  })

  it('uses the singular for one bucket', async () => {
    aruna.myGroups.value = [{ id: 'one-1', name: 'Alpha' }]
    aruna.getGroupUsage.mockResolvedValue(usage({ dataset_count: 0, process_run_count: 1, realm: { buckets: 1, distinct_buckets: 1, objects: 5, logical_bytes: 1_000, referenced_bytes: 1 } }))
    aruna.searchBuckets.mockResolvedValue(listing([hit('a', 'n1', 'one-1')]))
    aruna.getBucketUsage.mockResolvedValue(bucketUsage(10, 0, 1))
    await loadMyGroupsUsage()
    await useReachableUsage().load()

    const text = await renderedText()

    expect(text).toMatch(/Objects 1 1 bucket$/)
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

    expect(text).toContain('Storage at least 10 B total at least 10 B stored at least 0 B referenced')
    expect(text).toContain('could not be read, so it is not counted')
    expect(text).toContain('1 bucket does not report referenced data')
  })

  it('never reports physical storage, which has no group dimension', async () => {
    aruna.myGroups.value = [{ id: 'physical-1', name: 'Alpha' }]
    aruna.getGroupUsage.mockResolvedValue(usage())
    await loadMyGroupsUsage()

    const text = await renderedText()

    expect(text).not.toContain('physical')
    expect(text).not.toContain('87.9 KiB')
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
    aruna.searchBuckets.mockResolvedValue(listing([hit('a', 'n1', 'failed-1')]))
    aruna.getBucketUsage.mockResolvedValue(bucketUsage(10, 0, 1))
    await loadMyGroupsUsage()
    await useReachableUsage().load()

    const text = await renderedText()

    expect(text).toContain('Totals stay unknown while the storage of Ocean lab cannot be read.')
    expect(text).not.toContain('0 buckets')
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
    expect(await renderedText()).toContain('2 buckets 1 database')
  })

  it('opens Data from the Objects card', async () => {
    aruna.myGroups.value = [{ id: 'link-1', name: 'Alpha' }]
    aruna.getGroupUsage.mockResolvedValue(usage())
    aruna.searchBuckets.mockResolvedValue(listing([hit('a', 'n1', 'link-1')]))
    aruna.getBucketUsage.mockResolvedValue(bucketUsage(10, 0, 3))
    await loadMyGroupsUsage()
    await useReachableUsage().load()
    const html = await renderToString(createSSRApp(MyStatsCards))

    expect(html).toMatch(/data-to="\{&quot;name&quot;:&quot;buckets&quot;\}"[^>]*>[\s\S]*?Objects/)
    expect(html).not.toContain('compute')
  })
})
