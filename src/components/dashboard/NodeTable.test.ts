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
