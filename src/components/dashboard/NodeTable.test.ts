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

const NodeTable = compileClientComponent(new URL('./NodeTable.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: LinkStub, useRouter: () => ({ push }) },
  '@/components/ui/Badge.vue': moduleDefault(Plain),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Pagination.vue': moduleDefault(PagerStub),
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

describe('the realm node table', () => {
  it('states each fact once per row: role, location, stored, CPU, activity and one state word', async () => {
    const mounted = await mountApp(NodeTable, { props: { nodes: many(5) } })
    const row = (name: string) => content(element(mounted.root, (node) => node.tag === 'tr' && content(node).includes(name)))

    expect(row('Giessen storage 0')).toContain('Marburgmanagement')
    expect(row('Giessen storage 3').replace(/\s+/g, '')).toContain('Giessenstorage3KB30%Importing,2jobsonline')
    expect(row('Giessen storage 4')).toContain('offline')
    // A CPU above 70% turns its meter amber.
    expect(nodes(mounted.root).some((node) => String(node.props.class ?? '').includes('bg-amber-500'))).toBe(false)
    mounted.app.unmount()
  })

  it('names the place first, then a location label that says more, never "default"', async () => {
    const mounted = await mountApp(NodeTable, { props: { nodes: [
      realmNode(1, { place: 'Giessen', placement: { location: 'default', weight: 100, full: false, draining: false } }),
      realmNode(2, { place: 'Giessen', placement: { location: 'rack-b', weight: 1, full: false, draining: false } }),
      realmNode(3, { place: 'Giessen', placement: { location: 'Giessen', weight: 1, full: false, draining: false } }),
    ] } })
    const cell = (name: string) => content(element(mounted.root, (node) => node.tag === 'tr' && content(node).includes(name)).children[1]).trim()

    expect(cell('Giessen storage 1')).toBe('Giessen')
    expect(cell('Giessen storage 2')).toBe('Giessenrack-b')
    expect(cell('Giessen storage 3')).toBe('Giessen')
    mounted.app.unmount()
  })

  it('fits a narrow card: role, location and work fold under the name, the state column always stays', async () => {
    const mounted = await mountApp(NodeTable, { props: { nodes: [realmNode(3, { place: 'Giessen' })] } })
    const headers = nodes(mounted.root).filter((node) => node.tag === 'th')
    const header = (label: string) => String(headers.find((node) => content(node).trim() === label)!.props.class)

    expect(nodes(mounted.root).some((node) => String(node.props.class ?? '').startsWith('@container'))).toBe(true)
    expect(header('Role')).toContain('hidden')
    expect(header('Role')).toContain('@min-[48rem]:table-cell')
    expect(header('Location')).toContain('@min-[40rem]:table-cell')
    expect(header('Activity')).toContain('@min-[32rem]:table-cell')
    for (const always of ['Node', 'Stored', 'CPU', 'State']) expect(header(always)).not.toContain('hidden')
    const table = element(mounted.root, (node) => node.tag === 'table')
    expect(String(table.props.class)).toBe('data-table')
    expect(String(element(mounted.root, (node) => node.tag === 'thead').props.class ?? '')).not.toContain('uppercase')
    expect(header('Stored')).toContain('num')

    // The folded line under the name says what the hidden columns would.
    const name = element(mounted.root, (node) => node.tag === 'td' && content(node).includes('Giessen storage 3'))
    const folded = name.children.find((node) => String(node.props.class ?? '').includes('@min-[48rem]:hidden'))!
    expect(content(folded).replace(/\s+/g, ' ')).toContain('storage, Giessen')
    expect(content(folded)).toContain('Importing, 2 jobs')
    mounted.app.unmount()
  })

  it('puts this computer first and opens a node page from its row', async () => {
    const computer = realmNode(9, { node_id: 'laptop', kind: 'user', display_name: 'Microbiology laptop', connection_status: 'seen', present: false })
    const mounted = await mountApp(NodeTable, { props: { nodes: many(3), computer } })

    expect(names(mounted.root)[0]).toBe('Microbiology laptop')
    expect(content(element(mounted.root, (node) => node.tag === 'tr' && content(node).includes('Microbiology laptop')))).toContain('this computerdevice')
    await click(element(mounted.root, (node) => node.tag === 'tr' && content(node).includes('Giessen storage 2')))
    expect(push).toHaveBeenCalledWith({ name: 'node', params: { nodeId: 'node-2' } })
    mounted.app.unmount()
  })

  it('shows eight rows a page with the portal pager, and a search only past eight', async () => {
    const few = await mountApp(NodeTable, { props: { nodes: many(8) } })
    expect(nodes(few.root).some((node) => node.tag === 'input')).toBe(false)
    expect(content(few.root)).not.toContain('page 1 of')
    few.app.unmount()

    const mounted = await mountApp(NodeTable, { props: { nodes: many(20) } })
    expect(names(mounted.root)).toHaveLength(8)
    expect(content(mounted.root)).toContain('page 1 of 3')
    await click(element(mounted.root, (node) => node.tag === 'button' && content(node) === 'Next'))
    expect(names(mounted.root)[0]).toBe('Giessen storage 8')

    // A search starts again on its first page.
    ;(element(mounted.root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('storage 1')
    await flush()
    expect(names(mounted.root)).toEqual(Array.from({ length: 8 }, (_, index) => `Giessen storage ${index ? 9 + index : 1}`))
    ;(element(mounted.root, (node) => node.tag === 'input').props['onUpdate:modelValue'] as (value: string) => void)('marburg')
    await flush()
    expect(names(mounted.root).every((name) => Number(name.split(' ').pop()) % 2 === 0)).toBe(true)
    mounted.app.unmount()
  })

  it('turns a busy CPU meter amber', async () => {
    const mounted = await mountApp(NodeTable, { props: { nodes: [realmNode(8)] } })
    expect(nodes(mounted.root).some((node) => String(node.props.class ?? '').includes('bg-amber-500'))).toBe(true)
    mounted.app.unmount()
  })
})
