import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import * as Utils from '@/lib/utils'
import type { GroupStatistics } from '@/lib/api'

const stats = (group_id: string, display_name: string, logical_bytes: number, members: number): GroupStatistics => ({
  group_id, display_name, members, admins: 1, buckets: 2, objects: 10, logical_bytes, referenced_bytes: 0, running_jobs: 0,
})
const GROUPS = [stats('g1', 'Beta lab', 500, 2), stats('g2', 'Alpha lab', 100, 9)]
const listGroupStatistics = vi.fn(async (..._args: unknown[]) => ({ groups: GROUPS }))
const getGroupStatistics = vi.fn(async (id: unknown) => ({ ...GROUPS.find((group) => group.group_id === id)!, active_tokens: 4 }))
const Empty = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const DialogStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => () => props.open ? h('div', { 'data-detail': '' }, [slots.header?.(), slots.actions?.(), slots.default?.()]) : null,
})
const StatsStub = defineComponent({
  props: { stats: { type: Object, required: true } },
  setup: (props) => () => h('p', `tokens ${(props.stats as GroupStatistics).active_tokens ?? 'none'}`),
})
const DeleteStub = defineComponent({
  props: { open: Boolean, groupId: String, confirmName: String },
  setup: (props) => () => h('div', { 'data-delete': props.open ? `${props.groupId}:${props.confirmName}` : 'closed' }),
})

const Panel = compileClientComponent(new URL('./AdminGroupsPanel.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/lib/utils': Utils,
  '@/lib/api': { listGroupStatistics, getGroupStatistics },
  '@/composables/aruna/state': { refreshContext: () => ({ epoch: 1, client: {} }), sessionEpoch: ref(1) },
  '@/components/ui/Button.vue': moduleDefault(defineComponent((_, { attrs, slots }) => () => h('button', attrs, slots.default?.()))),
  '@/components/ui/DetailDialog.vue': moduleDefault(DialogStub),
  '@/components/ui/ErrorPanel.vue': moduleDefault(Empty),
  '@/components/ui/SectionHeading.vue': moduleDefault(Passthrough),
  '@/components/ui/Skeleton.vue': moduleDefault(Empty),
  '@/components/ui/QuotaBar.vue': moduleDefault(Empty),
  '@/components/groups/DeleteGroupDialog.vue': moduleDefault(DeleteStub),
  '@/components/groups/GroupStatsGrid.vue': moduleDefault(StatsStub),
})

afterEach(() => vi.clearAllMocks())

function groupOrder(root: Parameters<typeof nodes>[0]): string[] {
  return nodes(root)
    .filter((node) => node.tag === 'tr' && (content(node).includes('Alpha lab') || content(node).includes('Beta lab')))
    .map((node) => (content(node).includes('Alpha lab') ? 'Alpha lab' : 'Beta lab'))
}

describe('admin groups overview', () => {
  it('sorts by name first and by a clicked column after', async () => {
    const mounted = await mountApp(Panel)
    await flush()
    expect(groupOrder(mounted.root)).toEqual(['Alpha lab', 'Beta lab'])
    const header = (label: string) => element(mounted.root, (node) => node.tag === 'button' && content(node).trim() === label)
    await click(header('Stored'))
    expect(groupOrder(mounted.root)).toEqual(['Beta lab', 'Alpha lab'])
    await click(header('Stored'))
    expect(groupOrder(mounted.root)).toEqual(['Alpha lab', 'Beta lab'])
    await click(header('Members'))
    expect(groupOrder(mounted.root)).toEqual(['Alpha lab', 'Beta lab'])
    mounted.app.unmount()
  })

  it('opens the details with the token count and deletes behind the typed group name', async () => {
    const mounted = await mountApp(Panel)
    await flush()
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node) === 'Beta lab'))
    await flush()
    const detail = element(mounted.root, (node) => node.props['data-detail'] !== undefined)
    expect(getGroupStatistics).toHaveBeenCalledWith('g1', {})
    expect(content(detail)).toContain('tokens 4')
    await click(element(detail, (node) => node.tag === 'button' && content(node).includes('Delete group')))
    expect(nodes(mounted.root).some((node) => node.props['data-delete'] === 'g1:Beta lab')).toBe(true)
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })
})
