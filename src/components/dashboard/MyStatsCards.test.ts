import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatBytes } from '@/lib/utils'
import type { UsageResponse } from '@/lib/api'

const aruna = vi.hoisted(() => ({
  myGroups: { value: [] as Array<{ id: string; name: string }> },
  getGroupUsage: vi.fn<(groupId: string) => Promise<UsageResponse>>(),
}))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const notifications = vi.hoisted(() => ({
  available: { value: true },
  unreadCount: { value: 3 },
}))
vi.mock('@/composables/useNotifications', () => ({ useNotifications: () => notifications }))

const { loadMyGroupsUsage } = await import('@/composables/useMyGroupsUsage')
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

async function renderedText(): Promise<string> {
  const html = await renderToString(createSSRApp(MyStatsCards))
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

beforeEach(() => {
  aruna.getGroupUsage.mockReset()
  notifications.available.value = true
  notifications.unreadCount.value = 3
})

describe('personal statistics tiles', () => {
  it('sums the usage of every membership', async () => {
    aruna.myGroups.value = [
      { id: 'sum-1', name: 'Alpha' },
      { id: 'sum-2', name: 'Beta' },
    ]
    aruna.getGroupUsage.mockResolvedValue(usage())
    await loadMyGroupsUsage()

    const text = await renderedText()

    expect(text).toMatch(/Datasets 6/)
    expect(text).toMatch(/Storage used 2 KB/)
    expect(text).toMatch(/Buckets 4/)
    expect(text).toMatch(/Objects 10/)
    expect(text).toMatch(/Groups 2/)
    expect(text).toMatch(/Unread notifications 3/)
  })

  it('never reports physical storage, which has no group dimension', async () => {
    aruna.myGroups.value = [{ id: 'physical-1', name: 'Alpha' }]
    aruna.getGroupUsage.mockResolvedValue(usage())
    await loadMyGroupsUsage()

    const text = await renderedText()

    expect(text).not.toContain('physical')
    expect(text).not.toContain(formatBytes(90_000))
    expect(text).toContain('Counted against your group quotas')
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

    expect(text).toMatch(/Datasets Unknown/)
    expect(text).toMatch(/Storage used Unknown/)
    expect(text).toContain('Totals stay unknown while the storage of Ocean lab cannot be read.')
    expect(text).not.toMatch(/Storage used 0 B/)
  })

  it('badges the worst quota state across the memberships', async () => {
    aruna.myGroups.value = [
      { id: 'worst-1', name: 'Alpha' },
      { id: 'worst-2', name: 'Beta' },
    ]
    aruna.getGroupUsage.mockImplementation(async (groupId) =>
      groupId === 'worst-2'
        ? usage({ realm: { buckets: 1, objects: 1, logical_bytes: 30_000, referenced_bytes: 0 } })
        : usage(),
    )
    await loadMyGroupsUsage()

    const text = await renderedText()

    expect(text).toContain('writes blocked')
  })

  it('leaves the notification tile out where the node serves no notifications', async () => {
    aruna.myGroups.value = [{ id: 'bell-1', name: 'Alpha' }]
    aruna.getGroupUsage.mockResolvedValue(usage())
    notifications.available.value = false
    await loadMyGroupsUsage()

    const text = await renderedText()

    expect(text).not.toContain('Unread notifications')
  })
})
