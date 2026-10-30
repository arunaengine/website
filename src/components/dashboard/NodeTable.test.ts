import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as NodeDisplay from '@/components/nodes/node-display'
import * as Placement from '@/lib/placement'
import * as Utils from '@/lib/utils'
import { click, compileClientComponent, content, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import type { RealmNodeInfo } from '@/lib/api'

const push = vi.fn()
const Plain = defineComponent((_, { slots }) => () => h('span', slots.default?.()))
const LinkStub = defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()) })
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () => h('input', { ...attrs, value: props.modelValue, 'onUpdate:modelValue': (value: string) => emit('update:modelValue', value) }),
})
// The portal pager, reduced to its page and a Next button.
const PagerStub = defineComponent({
  props: { page: Number, pageCount: Number },
  emits: ['update:page'],
  setup: (props, { emit }) => () => h('nav', [`page ${props.page} of ${props.pageCount}`, h('button', { onClick: () => emit('update:page', (props.page ?? 1) + 1) }, 'Next')]),
})

const ChipsStub = defineComponent({
  props: { modelValue: String, options: Array },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', (props.options as Array<{ value: string; label: string; count: number }>).map((option) =>
      h('button', { 'aria-pressed': option.value === props.modelValue, onClick: () => emit('update:modelValue', option.value) }, `${option.label} ${option.count}`))),
})
const MarkStub = defineComponent({ props: { label: String }, setup: (props) => () => h('span', { 'data-mark': props.label }, props.label) })

const NodeTable = compileClientComponent(new URL('./NodeTable.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub, useRouter: () => ({ push }) },
  '@/components/ui/FilterChips.vue': moduleDefault(ChipsStub),
  '@/components/ui/IconTile.vue': moduleDefault(Plain),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Pagination.vue': moduleDefault(PagerStub),
  '@/components/ui/StatusMark.vue': moduleDefault(MarkStub),
  '@/components/nodes/node-display': NodeDisplay,
  '@/composables/useRealmNodes': { computerName: (node: RealmNodeInfo) => node.display_name ?? 'This computer' },
  '@/lib/placement': Placement,
  '@/lib/utils': Utils,
  '@lucide/vue': new Proxy({}, { get: () => defineComponent(() => () => null) }),
})

const realmNode = (index: number, overrides: Partial<RealmNodeInfo> = {}): RealmNodeInfo => ({
  node_id: `node-${index}`,
  kind: index === 0 ? 'management' : 'server',
  configured: true,
  present: index % 5 !== 4,
  connection_status: 'connected',
  display_name: `Giessen storage ${index}`,
  placement: { location: index % 2 ? 'Giessen' : 'Marburg', weight: 1, full: false, draining: false },
  info: {
    executors: [],
    labels: {},
    urls: {},
    utilization: { storage_bytes_used: 1024 * index, heartbeat_at_ms: 1, load_permille: index * 100, ...(index === 3 ? { imports_running: 2 } : {}) },
    updated_at_ms: 1,
  },
  ...overrides,
})
const many = (count: number) => Array.from({ length: count }, (_, index) => realmNode(index))
const names = (root: Parameters<typeof content>[0]) =>
  nodes(root).filter((node) => node.tag === 'a').map((node) => content(node).trim())

const row = (root: Parameters<typeof content>[0], name: string) =>
  element(root, (node) => node.tag === 'tr' && content(node).includes(name))

describe('the realm node table', () => {
  it('states each fact once per row: type, location, stored, CPU, activity and the state', async () => {
    const mounted = await mountApp(NodeTable, { props: { nodes: many(5) } })
    const text = (name: string) => content(row(mounted.root, name)).replace(/\s+/g, '')

    expect(text('Giessen storage 0')).toContain('MarburgManagement')
    expect(text('Giessen storage 3')).toContain('Giessenstorage3StorageGiessenImporting,2jobsGiessenStorage3KB30%Importing,2jobsOnline')
    // A node's state is an icon only, never a pill; no bar for the CPU.
    expect(nodes(row(mounted.root, 'Giessen storage 3')).some((node) => node.props['data-mark'] === 'Online')).toBe(true)
    expect(nodes(row(mounted.root, 'Giessen storage 4')).some((node) => node.props['data-mark'] === 'Offline')).toBe(true)
    expect(nodes(mounted.root).some((node) => String(node.props.class ?? '').includes('bg-amber-500'))).toBe(false)
    mounted.app.unmount()
  })

  it('names the place first, then a location label that says more, never "default"', async () => {
    const mounted = await mountApp(NodeTable, { props: { nodes: [
      realmNode(1, { place: 'Giessen', placement: { location: 'default', weight: 100, full: false, draining: false } }),
      realmNode(2, { place: 'Giessen', placement: { location: 'rack-b', weight: 1, full: false, draining: false } }),
      realmNode(3, { place: 'Giessen', placement: { location: 'Giessen', weight: 1, full: false, draining: false } }),
    ] } })
    const cell = (name: string) => content(row(mounted.root, name).children[1]).trim()

    expect(cell('Giessen storage 1')).toBe('Giessen')
    expect(cell('Giessen storage 2')).toBe('Giessen, rack-b')
    expect(cell('Giessen storage 3')).toBe('Giessen')
    mounted.app.unmount()
  })

  it('leaves the location out when every node stands in one place', async () => {
    const giessen = { location: 'Giessen', weight: 1, full: false, draining: false }
    const mounted = await mountApp(NodeTable, { props: { nodes: [realmNode(1, { place: 'Giessen', placement: giessen }), realmNode(2, { place: 'Giessen', placement: giessen })] } })
    const headers = nodes(mounted.root).filter((node) => node.tag === 'th').map((node) => content(node).trim())

    expect(headers).toEqual(['Node', 'Type', 'Stored', 'CPU', 'Activity', 'State'])
    expect(content(row(mounted.root, 'Giessen storage 1'))).not.toContain('Giessen,')
    const table = element(mounted.root, (node) => node.tag === 'table')
    expect(String(table.props.class)).toBe('data-table data-table-tall')
    mounted.app.unmount()
  })

  it('puts this computer first, filters nodes and devices, and opens a node page from its row', async () => {
    const computer = realmNode(9, { node_id: 'laptop', kind: 'user', display_name: 'Microbiology laptop', connection_status: 'seen', present: false })
    const mounted = await mountApp(NodeTable, { props: { nodes: many(3), computer } })

    expect(names(mounted.root)[0]).toBe('Microbiology laptop')
    expect(content(row(mounted.root, 'Microbiology laptop'))).toContain('This computer')
    expect(element(mounted.root, (node) => node.tag === 'input').props.placeholder).toBe('Find a node or device')
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node) === 'Devices 1'))
    expect(names(mounted.root)).toEqual(['Microbiology laptop'])
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node) === 'Nodes 3'))
    expect(names(mounted.root)).toHaveLength(3)
    await click(row(mounted.root, 'Giessen storage 2'))
    expect(push).toHaveBeenCalledWith({ name: 'node', params: { nodeId: 'node-2' } })
    mounted.app.unmount()
  })

  it('offers no device filter on the web', async () => {
    const mounted = await mountApp(NodeTable, { props: { nodes: many(3) } })
    expect(content(mounted.root)).not.toContain('Devices')
    expect(element(mounted.root, (node) => node.tag === 'input').props.placeholder).toBe('Find a node')
    mounted.app.unmount()
  })

  it('shows five rows a page under a search, offline nodes first, with the time they were last seen', async () => {
    const few = await mountApp(NodeTable, { props: { nodes: many(5) } })
    expect(nodes(few.root).some((node) => node.tag === 'input')).toBe(true)
    expect(content(few.root)).not.toContain('page 1 of')
    // Node 4 is offline, so it leads.
    expect(names(few.root)[0]).toBe('Giessen storage 4')
    expect(content(row(few.root, 'Giessen storage 4'))).toContain('Last seen')
    few.app.unmount()

    const mounted = await mountApp(NodeTable, { props: { nodes: many(20).map((node) => ({ ...node, present: true })) } })
    expect(names(mounted.root)).toHaveLength(5)
    expect(content(mounted.root)).toContain('page 1 of 4')
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node) === 'Next'))
    expect(names(mounted.root)[0]).toBe('Giessen storage 5')

    // A search starts again on its first page.
    ;(element(mounted.root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('storage 1')
    await flush()
    expect(names(mounted.root)).toEqual(['Giessen storage 1', 'Giessen storage 10', 'Giessen storage 11', 'Giessen storage 12', 'Giessen storage 13'])
    ;(element(mounted.root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('marburg')
    await flush()
    expect(names(mounted.root).every((name) => Number(name.split(' ').pop()) % 2 === 0)).toBe(true)
    mounted.app.unmount()
  })

  it('lights up the row of the node hovered on the topology and reports its own hover', async () => {
    const mounted = await mountApp(NodeTable, { props: { nodes: many(3), highlight: 'node-1' } })
    expect(String(row(mounted.root, 'Giessen storage 1').props.class)).toContain('bg-muted/60')
    expect(String(row(mounted.root, 'Giessen storage 2').props.class ?? '')).not.toContain('bg-muted/60')
    mounted.app.unmount()

    const onHover = vi.fn()
    const hovering = await mountApp(NodeTable, { props: { nodes: many(3), onHover } })
    ;(row(hovering.root, 'Giessen storage 2').props.onMouseenter as () => void)()
    expect(onHover).toHaveBeenLastCalledWith('node-2')
    ;(row(hovering.root, 'Giessen storage 2').props.onMouseleave as () => void)()
    expect(onHover).toHaveBeenLastCalledWith(null)
    hovering.app.unmount()
  })
})
