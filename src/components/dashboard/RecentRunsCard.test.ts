import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import * as Tes from '@/lib/tes'
import * as Utils from '@/lib/utils'
import { compileClientComponent, content, element, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const LinkStub = defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) })
const Pass = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const HeadingStub = defineComponent({ props: { title: String }, setup: (props, { slots }) => () => h('div', [h('h2', props.title), slots.actions?.()]) })
const MarkStub = defineComponent({ props: { label: String, failed: Boolean }, setup: (props) => () => h('i', { 'data-mark': props.label, 'data-failed': props.failed }) })
const PillStub = defineComponent({ props: { state: String }, setup: (props) => () => h('span', { 'data-pill': props.state }, props.state) })
const RecentRunsCard = compileClientComponent(new URL('./RecentRunsCard.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
  '@/components/ui/Button.vue': moduleDefault(Pass),
  '@/components/ui/SectionHeading.vue': moduleDefault(HeadingStub),
  '@/components/ui/StatusMark.vue': moduleDefault(MarkStub),
  '@/components/ui/StatusPill.vue': moduleDefault(PillStub),
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => (id === 'store-1' ? 'Giessen storage 1' : 'Giessen management'), localNodeId: ref('mgmt') }) },
  '@/lib/tes': Tes,
  '@/lib/utils': Utils,
})

const run = (id: string, name: string, state: string, nodeId: string | null, minutes = 21) => ({
  nodeId,
  task: {
    id,
    name,
    state,
    creation_time: '2026-10-29T09:59:00Z',
    executors: [{ image: 'harbor.example.org/tools/bakta-rs:0.1.1', command: [] }],
    logs: [{ start_time: '2026-10-29T10:00:00Z', end_time: new Date(Date.parse('2026-10-29T10:00:00Z') + minutes * 60_000).toISOString() }],
  },
})

describe('recent runs', () => {
  it('lists at most five runs: a check when completed, a cross when failed, the name a link and icon facts', async () => {
    const runs = Array.from({ length: 7 }, (_, index) => run(`t${index}`, `Annotate genome ${index}`, index === 1 ? 'EXECUTOR_ERROR' : 'COMPLETE', index ? 'store-1' : null))
    const mounted = await mountApp(RecentRunsCard, { props: { runs, state: 'ready' } })
    const rows = nodes(mounted.root).filter((node) => node.tag === 'li')

    expect(rows).toHaveLength(5)
    expect(nodes(rows[0]).some((node) => node.props['data-mark'] === 'Completed')).toBe(true)
    expect(nodes(rows[0]).some((node) => node.props['data-mark'] === 'Completed' && node.props['data-failed'] === false)).toBe(true)
    expect(nodes(rows[1]).some((node) => node.props['data-mark'] === 'Failed' && node.props['data-failed'] === true)).toBe(true)
    expect(nodes(rows[1]).some((node) => node.props['data-pill'])).toBe(false)
    expect(content(rows[0]).replace(/\s+/g, '')).toMatch(/^Annotategenome0bakta-rsGiessenmanagement21m00s.+ago$/)
    const name = element(rows[0], (node) => node.tag === 'a' && content(node).includes('Annotate genome 0'))
    expect(JSON.parse(String(name.props['data-to']))).toEqual({ name: 'task', params: { taskId: 't0' } })
    expect(String(name.props.class)).toContain('line-clamp-2')
    const where = element(rows[1], (node) => node.tag === 'a' && content(node).includes('Giessen storage 1'))
    expect(JSON.parse(String(where.props['data-to']))).toEqual({ name: 'node', params: { nodeId: 'store-1' } })
    expect(content(mounted.root)).toContain('Recent runs')
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

  it('leaves the node out on a page that names it already', async () => {
    const mounted = await mountApp(RecentRunsCard, { props: { runs: [run('t1', 'Annotate my genome with Bakta', 'COMPLETE', 'store-1')], state: 'ready', hideNode: true } })
    expect(content(mounted.root)).not.toContain('Giessen storage 1')
    expect(content(mounted.root)).toContain('bakta-rs')
    mounted.app.unmount()
  })
})
