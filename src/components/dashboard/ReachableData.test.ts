import { computed, createSSRApp, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { GroupReach } from '@/composables/useReachableUsage'

const groups = ref<GroupReach[]>([])
const sum = (list: GroupReach[]) => ({
  stored: list.reduce((total, group) => total + group.stored, 0),
  referenced: list.reduce((total, group) => total + group.referenced, 0),
  objects: list.reduce((total, group) => total + group.objects, 0),
  buckets: list.reduce((total, group) => total + group.buckets, 0),
  unread: list.reduce((total, group) => total + group.unread, 0),
  referencedUnknown: list.reduce((total, group) => total + group.referencedUnknown, 0),
  partial: list.some((group) => group.partial),
})
vi.mock('@/composables/useAruna', () => ({ useAruna: () => ({ myGroups: ref([{ id: 'g1', name: 'Genome Lab' }]) }) }))
vi.mock('@/composables/useReachableUsage', () => ({
  useReachableUsage: () => ({ groups, total: computed(() => sum(groups.value)), loading: ref(false), load: vi.fn() }),
}))

const ReachableData = (await import('./ReachableData.vue')).default

const group = (extra: Partial<GroupReach> = {}): GroupReach => ({
  groupId: 'g1', name: 'Genome Lab', stored: 2048, referenced: 10_294_602, objects: 18, buckets: 3,
  unread: 0, referencedUnknown: 0, partial: false, error: null, missing: false, ...extra,
})

async function html() {
  return renderToString(createSSRApp(ReachableData, { refreshRevision: 0 }))
}

describe('reachable data', () => {
  it('shows stored, referenced and their total next to each other', async () => {
    groups.value = [group()]
    const text = await html()

    expect(text).toContain('Stored')
    expect(text).toContain('Referenced')
    expect(text).toContain('Total')
    expect(text).toContain('A bucket stored on several nodes counts once')
    expect(text).not.toContain('at least')
  })

  it('says a referenced size is unknown and an unread bucket is not counted, instead of zero', async () => {
    groups.value = [group({ referencedUnknown: 2, unread: 1 })]
    const text = await html()

    expect(text).toContain('at least')
    expect(text).toContain('2 buckets do not report')
    expect(text).toContain('could not be read, so it is not counted')
  })

  it('keeps a group whose buckets could not be listed apart', async () => {
    groups.value = [group(), group({ groupId: 'g2', name: 'Broken', error: 'no node answered', buckets: 0, stored: 0, referenced: 0, objects: 0 })]
    const text = await html()

    expect(text).toContain('Unknown: no node answered')
    expect(text).toContain('The buckets of Broken could not be listed')
  })
})
