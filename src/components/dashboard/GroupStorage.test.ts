import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import GroupStorage from './GroupStorage.vue'
import type { GroupUsageEntry } from '@/composables/useMyGroupsUsage'

const entry = (quota: number | null, referenced = 0) =>
  ({
    groupId: 'g1',
    name: 'Genome Lab',
    status: 'ready',
    usedBytes: 2_000,
    referencedBytes: referenced,
    quota: { quota_bytes: quota, ceiling_bytes: null, warn_threshold_percent: 80, warning: false },
  }) as unknown as GroupUsageEntry

const render = async (value: GroupUsageEntry) => {
  const html = await renderToString(createSSRApp(GroupStorage, { entry: value }))
  return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
}

describe('group storage line', () => {
  it('draws the bar only for a group with a quota', async () => {
    const limited = await render(entry(10_000, 500))
    expect(limited.text).toContain('2 KB of 9.8 KB, 20%')
    expect(limited.text).toContain('500 B referenced')
    expect(limited.html).toContain('role="meter"')
    // The bar names its share in a tooltip that the keyboard reaches too.
    expect(limited.html).toContain('tabindex="0"')
    expect(limited.html.replace(/\u00a0/g, ' ')).toContain('aria-label="2 KB of 9.8 KB used, 20%"')

    const free = await render(entry(null))
    expect(free.text).toContain('2 KB stored, no quota')
    expect(free.text).not.toContain('referenced')
    expect(free.html).not.toContain('role="meter"')
  })
})
