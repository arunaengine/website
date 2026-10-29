import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import * as StateBadge from '@/lib/stateBadge'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, element, mountApp, nodes } from '@/test/clientRender'

const LinkStub = defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) })
const RecentRunsCard = compileClientComponent(new URL('./RecentRunsCard.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => (id === 'store-1' ? 'Giessen storage 1' : 'Giessen management'), localNodeId: ref('mgmt') }) },
  '@/lib/stateBadge': StateBadge,
  '@/lib/tes': Tes,
  '@/lib/utils': Utils,
})

const run = (id: string, name: string, state: string, nodeId: string | null, minutes = 21) => ({
  nodeId,
  task: {
    id,
    name,
    state,
    logs: [{ start_time: '2026-10-29T10:00:00Z', end_time: new Date(Date.parse('2026-10-29T10:00:00Z') + minutes * 60_000).toISOString() }],
  },
})

describe('recent runs', () => {
  it('lists at most five runs with what they took, where and their state as one word, each a link', async () => {
    const runs = Array.from({ length: 7 }, (_, index) => run(`t${index}`, `Annotate genome ${index}`, index === 1 ? 'EXECUTOR_ERROR' : 'COMPLETE', index ? 'store-1' : null))
    const mounted = await mountApp(RecentRunsCard, { props: { runs, state: 'ready' } })
    const rows = nodes(mounted.root).filter((node) => node.tag === 'li')

    expect(rows).toHaveLength(5)
    expect(content(rows[0]).replace(/\s+/g, '')).toBe('Annotategenome021m00s,Giessenmanagementcompleted')
    expect(content(rows[1])).toContain('failed')
    const name = element(rows[0], (node) => node.tag === 'a' && content(node).includes('Annotate genome 0'))
    expect(JSON.parse(String(name.props['data-to']))).toEqual({ name: 'task', params: { taskId: 't0' } })
    const where = element(rows[1], (node) => node.tag === 'a' && content(node).includes('Giessen storage 1'))
    expect(JSON.parse(String(where.props['data-to']))).toEqual({ name: 'node', params: { nodeId: 'store-1' } })
    expect(content(mounted.root)).toContain('All runs')
    mounted.app.unmount()
  })

  it('says so while reading, when the read failed, and when there are none', async () => {
    for (const [state, text] of [['loading', 'Reading your runs'], ['failed', 'could not be read'], ['ready', 'No runs yet.']] as const) {
      const mounted = await mountApp(RecentRunsCard, { props: { runs: [], state } })
      expect(content(mounted.root)).toContain(text)
      mounted.app.unmount()
    }
  })

  it('gives the run name its own line, two at most, with what it took and where below', async () => {
    const mounted = await mountApp(RecentRunsCard, { props: { runs: [run('t1', 'Annotate my genome with Bakta', 'COMPLETE', 'store-1')], state: 'ready' } })
    const name = element(mounted.root, (node) => node.tag === 'a' && content(node) === 'Annotate my genome with Bakta')
    expect(String(name.props.class)).toContain('line-clamp-2')
    expect(name.props.title).toBe('Annotate my genome with Bakta')
    const below = name.parent!.children.find((node) => node.tag === 'p')!
    expect(content(below).replace(/\s+/g, ' ').trim()).toBe('21m 00s, Giessen storage 1')
    // The state is one colored word at the right, outside the name's block.
    const row = element(mounted.root, (node) => node.tag === 'li')
    expect(content(row.children.at(-1)!)).toBe('completed')
    expect(nodes(mounted.root).some((node) => node.tag === 'table')).toBe(false)
    mounted.app.unmount()
  })
})
