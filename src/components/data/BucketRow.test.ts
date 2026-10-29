import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const Empty = defineComponent(() => () => null)
const Label = defineComponent({
  props: { job: Object },
  setup: (props) => () => h('em', { 'data-testid': 'bucket-job' }, (props.job as { kind: string }).kind),
})
const TooltipStub = defineComponent((_, { slots }) => () => h('div', [slots.default?.(), slots.content?.()]))
const BucketRow = compileClientComponent(new URL('./BucketRow.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()) }) },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/storage/BucketJobLabel.vue': moduleDefault(Label),
  '@/components/ui/Tooltip.vue': moduleDefault(TooltipStub),
  '@/components/ui/Popover.vue': moduleDefault(TooltipStub),
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
})

const JOB = { kind: 'rename', state: 'running', done: 1, failed: 0 }
const labels = (root: Parameters<typeof content>[0]) => nodes(root).filter((node) => node.props['data-testid'] === 'bucket-job')

async function mount(props: Record<string, unknown>, slots: Record<string, () => unknown> = {}) {
  const mounted = await mountApp(defineComponent(() => () => h(BucketRow, { bucket: 'genes', ...props }, slots)))
  if (mounted.errors.length) throw mounted.errors[0]
  return mounted.root
}

describe('BucketRow step label', () => {
  it('shows the running step next to the name', async () => {
    const root = await mount({ job: JOB })
    expect(labels(root)).toHaveLength(1)
    expect(content(root)).toContain('rename')
  })

  it('shows it on a row with a tooltip too', async () => {
    const root = await mount({ job: JOB }, { tooltip: () => 'On home' })
    expect(labels(root)).toHaveLength(1)
  })

  it('shows nothing without a job', async () => {
    expect(labels(await mount({}))).toHaveLength(0)
    expect(labels(await mount({ job: null }, { tooltip: () => 'On home' }))).toHaveLength(0)
  })
})

describe('BucketRow lines and chips', () => {
  it('marks a linked bucket as synced, with its folder in the title, in place of the link button', async () => {
    const root = await mount({ linkedTo: 'test-data' }, { link: () => h('button', { 'aria-label': 'Link a local folder' }) })
    const chip = nodes(root).find((node) => node.props.role === 'img')

    expect(content(chip!).trim()).toBe('synced')
    expect(chip?.props.title).toBe('Linked to test-data')
    expect(chip?.props.tabindex).toBe(0)
    expect(nodes(root).some((node) => node.props['aria-label'] === 'Link a local folder')).toBe(false)
  })

  it('offers the link button on an unlinked row', async () => {
    const root = await mount({ linkedTo: null }, { link: () => h('button', { 'aria-label': 'Link a local folder' }) })
    expect(nodes(root).some((node) => node.props['aria-label'] === 'Link a local folder')).toBe(true)
    expect(nodes(root).some((node) => node.props.role === 'img')).toBe(false)
  })

  it('names the files and the node on one line, the node linked to its page', async () => {
    const root = await mount({ facts: '16 files, 50.2 MB', nodeId: 'node-2' })
    const link = nodes(root).find((node) => node.tag === 'a')

    expect(content(root)).toContain('16 files, 50.2 MB,node-2')
    expect(link?.props.to).toEqual({ name: 'node', params: { nodeId: 'node-2' } })
  })

  it('names the nodes of a distributed bucket in its chip, not on the facts line', async () => {
    const root = await mount({ facts: '68,231 files referenced', nodes: ['n1', 'n2'], placeNode: 'n1', place: 'Giessen 1' })
    const links = nodes(root).filter((node) => node.tag === 'a')

    expect(content(root)).toContain('2 nodes')
    expect(links.map((node) => node.props.to)).toEqual([
      { name: 'node', params: { nodeId: 'n1' } },
      { name: 'node', params: { nodeId: 'n2' } },
    ])
    expect(content(root)).not.toContain('Giessen 1')
  })

  it('shows a description line, and no facts line when nothing is known', async () => {
    const root = await mount({ subtitle: 'Bakta database (light) 6.0', database: true })
    expect(content(root)).toContain('Bakta database (light) 6.0')
    expect(nodes(root).filter((node) => node.tag === 'p')).toHaveLength(1)
  })

  it('pins on a long press and does not open the bucket then', async () => {
    vi.useFakeTimers()
    try {
      const events: string[] = []
      const mounted = await mountApp(defineComponent(() => () => h(BucketRow, { bucket: 'genes', onOpen: () => events.push('open'), onTogglePin: () => events.push('pin') })))
      const row = mounted.root.children[0]
      ;(row.props.onPointerdown as (event: unknown) => void)({ pointerType: 'touch' })
      vi.advanceTimersByTime(600)
      const name = nodes(mounted.root).find((node) => node.tag === 'button' && content(node) === 'genes')!
      ;(name.props.onClick as () => void)()
      ;(name.props.onClick as () => void)()
      expect(events).toEqual(['pin', 'open'])
    } finally {
      vi.useRealTimers()
    }
  })
})
