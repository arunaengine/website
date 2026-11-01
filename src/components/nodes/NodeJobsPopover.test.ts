import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as NodeDisplay from './node-display'
import * as FormatCount from '@/lib/formatCount'
import * as Utils from '@/lib/utils'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import type { NodeJobsResponse } from '@/lib/api'

const Empty = defineComponent(() => () => null)
// Opens on the trigger's click and shows the content only while open, as the real popover does.
const PopoverStub = defineComponent({
  props: { open: Boolean, wide: Boolean },
  emits: ['update:open'],
  setup: (props, { emit, slots }) => () =>
    h('div', [
      h('span', { role: 'trigger', onClick: () => emit('update:open', !props.open) }, slots.default?.()),
      props.open ? h('div', { role: 'content', 'data-wide': props.wide }, slots.content?.()) : null,
    ]),
})
const LinkStub = defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) })

const authToken = ref('session')
const getNodeJobs = vi.fn<(...args: unknown[]) => Promise<NodeJobsResponse>>()

const NodeJobsPopover = compileClientComponent(new URL('./NodeJobsPopover.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub },
  '@/components/ui/Popover.vue': moduleDefault(PopoverStub),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (props) => () => h('span', props.label) })),
  '@/composables/aruna/state': { authToken, nodeClient: (nodeId: string) => ({ baseUrl: `https://${nodeId}.test/api/v1`, token: authToken.value }) },
  '@/lib/api': { getNodeJobs },
  '@/lib/formatCount': FormatCount,
  '@/lib/utils': Utils,
  './node-display': NodeDisplay,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
})

const NOW = Date.parse('2026-11-01T12:00:00Z')
const started = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

const adminView: NodeJobsResponse = {
  jobs: [
    { kind: 'import_rocrate', target: { bucket: 'bakrep-reference', path: 'records/part-1/' }, progress: { current: 14402, total: 20000, unit: 'entries' }, started_at: started(41) },
    { kind: 'copy_object', target: { bucket: 'soil-metagenomes', path: 'assemblies/2025/' }, progress: { current: 1932735283, total: 4509715660, unit: 'bytes' }, started_at: started(6) },
    { kind: 'harvest', progress: { current: 1204, unit: 'records' }, started_at: started(3) },
    { kind: 'register_identifiers', target: { dataset_id: '01JABCDEF0123456789ABCDEFG' }, started_at: started(0) },
  ],
  hidden: 0,
}

async function opened(answer: Promise<NodeJobsResponse>) {
  getNodeJobs.mockReturnValueOnce(answer)
  const mounted = await mountApp(NodeJobsPopover, { props: { nodeId: 'node-3', label: 'Importing, 4 jobs' } })
  await click(element(mounted.root, (node) => node.props.role === 'trigger'))
  await flush()
  return mounted
}

type Root = Parameters<typeof content>[0]
const text = (root: Root) => content(root).replace(/\s+/g, ' ')
// Each table row as its cells, so a check reads like the row a person sees.
const rows = (root: Root) =>
  nodes(root)
    .filter((node) => node.tag === 'tr')
    .map((row) => row.children.filter((cell) => cell.kind === 'element').map((cell) => text(cell).trim()).join(' | '))

describe('node jobs popover', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(NOW)
    authToken.value = 'session'
    getNodeJobs.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('asks the node only once opened and lists what each job works on', async () => {
    getNodeJobs.mockResolvedValue(adminView)
    const mounted = await mountApp(NodeJobsPopover, { props: { nodeId: 'node-3', label: 'Importing, 4 jobs' } })
    expect(getNodeJobs).not.toHaveBeenCalled()
    await click(element(mounted.root, (node) => node.props.role === 'trigger'))
    await flush()
    expect(getNodeJobs.mock.calls[0]?.[0]).toEqual({ baseUrl: 'https://node-3.test/api/v1', token: 'session' })

    expect(rows(mounted.root)).toEqual([
      'Job | Works on | Progress | Started',
      'Importing records | bakrep-referencerecords/part-1/ | 72%14,402 of 20,000 entries | 41m ago',
      'Copying data | soil-metagenomesassemblies/2025/ | 42%1.8 GiB of 4.2 GiB | 6m ago',
      'Harvesting records |  | 1,204 records | 3m ago',
      'Registering identifiers | Dataset01JABCDEF0123456789ABCDEFG | Not known | 0s ago',
    ])
    mounted.app.unmount()
  })

  it('folds the jobs of other groups into one line', async () => {
    const mounted = await opened(Promise.resolve({ jobs: adminView.jobs.slice(0, 1), hidden: 2 }))
    expect(text(mounted.root)).toContain('2 jobs in other groups')
    expect(text(mounted.root)).not.toContain('soil-metagenomes')
    mounted.app.unmount()
  })

  it('shows a visitor kinds and counts only', async () => {
    authToken.value = ''
    const kinds = ['copy_object', 'copy_object', 'register_identifiers'].map((kind) => ({ kind }))
    const mounted = await opened(Promise.resolve({ jobs: kinds, hidden: 0 }))
    expect(rows(mounted.root)).toEqual(['Job | Running', 'Copying data | 2', 'Registering identifiers | 1'])
    expect(text(mounted.root)).toContain("Sign in to see what your groups' jobs work on.")
    expect(element(mounted.root, (node) => node.props.role === 'content').props['data-wide']).toBe(false)
    mounted.app.unmount()
  })

  it('says when nothing runs, and when the node does not answer', async () => {
    const idle = await opened(Promise.resolve({ jobs: [], hidden: 0 }))
    expect(text(idle.root)).toContain('No jobs running right now')
    idle.app.unmount()

    const failed = await opened(Promise.reject(new Error('502 Bad Gateway')))
    expect(text(failed.root)).toContain('The node did not answer: 502 Bad Gateway')
    failed.app.unmount()
  })

  it('drops an answer that arrives after the list was closed', async () => {
    let answer!: (value: NodeJobsResponse) => void
    const mounted = await opened(new Promise((resolve) => (answer = resolve)))
    expect(text(mounted.root)).toContain('Loading jobs')
    await click(element(mounted.root, (node) => node.props.role === 'trigger'))
    answer(adminView)
    await flush()
    getNodeJobs.mockReturnValueOnce(new Promise(() => {}))
    await click(element(mounted.root, (node) => node.props.role === 'trigger'))
    expect(text(mounted.root)).toContain('Loading jobs')
    expect(text(mounted.root)).not.toContain('bakrep-reference')
    mounted.app.unmount()
  })
})
