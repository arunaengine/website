import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { compileClientComponent, content, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const Empty = defineComponent(() => () => null)
const Label = defineComponent({
  props: { job: Object },
  setup: (props) => () => h('em', { 'data-testid': 'bucket-job' }, (props.job as { kind: string }).kind),
})
const TooltipStub = defineComponent((_, { slots }) => () => h('div', [slots.default?.(), slots.content?.()]))
// The popover shows its hover text as a tooltip node and renders its content in place.
const PopoverStub = defineComponent({
  props: { tooltip: String },
  setup: (props, { slots }) => () => h('div', { 'data-mark': true }, [h('span', { role: 'tooltip' }, props.tooltip), slots.default?.(), h('section', slots.content?.())]),
})
const BucketRow = compileClientComponent(new URL('./BucketRow.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: defineComponent({ props: { to: Object }, setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()) }) },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/storage/BucketJobLabel.vue': moduleDefault(Label),
  '@/components/ui/Tooltip.vue': moduleDefault(TooltipStub),
  '@/components/ui/Popover.vue': moduleDefault(PopoverStub),
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

describe('BucketRow lines and marks', () => {
  const marks = (root: Parameters<typeof content>[0]) =>
    nodes(root).filter((node) => node.props['data-mark']).map((node) => content(node.children[0]))
  const links = (root: Parameters<typeof content>[0]) => nodes(root).filter((node) => node.tag === 'a').map((node) => node.props.to)

  it('shows only the name, the description and the files and size as text', async () => {
    const root = await mount({ subtitle: 'Bakta database (light) 6.0', facts: '66 files, 4.1 GB', database: true, nodeId: 'node-2' })
    const text = nodes(root).find((node) => node.props.class === 'min-w-0 flex-1')!
    const lines = text.children.filter((node) => node.tag === 'p').map((node) => content(node))
    expect(lines).toEqual(['Bakta database (light) 6.0', '66 files, 4.1 GB'])
  })

  it('names the node in a server icon whose popover links to the node', async () => {
    const root = await mount({ facts: '16 files, 50.2 MB', place: 'Giessen storage 1', placeNode: 'node-1' })
    expect(marks(root)).toEqual(['Stored on Giessen storage 1'])
    expect(links(root)).toEqual([{ name: 'node', params: { nodeId: 'node-1' } }])
    expect(content(root)).toContain('Giessen storage 1')
  })

  it('names the nodes of a distributed bucket in one network icon instead', async () => {
    const root = await mount({ nodes: ['n1', 'n2'], placeNode: 'n1', place: 'Giessen 1' })
    expect(marks(root)).toEqual(['Spread over n1 and n2'])
    expect(links(root)).toEqual([
      { name: 'node', params: { nodeId: 'n1' } },
      { name: 'node', params: { nodeId: 'n2' } },
    ])
  })

  it('names the partners of a synced bucket before its place', async () => {
    const root = await mount({ synced: true, syncedWith: ['laptop', 'office'], nodeId: 'node-2' })
    expect(marks(root)).toEqual(['Synced with laptop and office', 'Stored on node-2'])
    const same = await mount({ synced: true })
    expect(marks(same)).toEqual(['Synced with another bucket'])
  })

  it('marks a bucket linked to this computer as synced with it, and offers no link button then', async () => {
    const link = { link: () => h('button', { 'aria-label': 'Link a local folder' }) }
    const linked = await mount({ linkedTo: 'test-data' }, link)
    expect(marks(linked)).toEqual(['Synced with this computer'])
    expect(content(linked)).toContain('Folder test-data')
    expect(nodes(linked).some((node) => node.props['aria-label'] === 'Link a local folder')).toBe(false)
    const unlinked = await mount({ linkedTo: null }, link)
    expect(marks(unlinked)).toEqual([])
    expect(nodes(unlinked).some((node) => node.props['aria-label'] === 'Link a local folder')).toBe(true)
  })

  it('marks a public bucket with its own icon before the place', async () => {
    const root = await mount({ isPublic: true, nodeId: 'node-2' })
    expect(marks(root)).toEqual(['Public', 'Stored on node-2'])
    expect(content(root)).toContain('Everyone can read this bucket')
    expect(marks(await mount({ nodeId: 'node-2' }))).toEqual(['Stored on node-2'])
  })

  it('keeps the pin with the row actions, always visible', async () => {
    const root = await mount({ nodeId: 'node-2' })
    const pin = nodes(root).find((node) => node.props['aria-label'] === 'Pin genes')!
    expect(String(pin.parent!.props.class)).not.toContain('opacity-0')
  })

  it('keeps the move handle visible in the action column after the pin', async () => {
    const root = await mount({}, { handle: () => h('button', { 'aria-label': 'Move genes' }) })
    const pin = nodes(root).find((node) => node.props['aria-label'] === 'Pin genes')!
    const column = pin.parent!
    expect(column.children.map((node) => node.props['aria-label']).filter(Boolean)).toEqual(['Pin genes', 'Move genes'])
    expect(String(column.props.class)).not.toContain('opacity-0')
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

describe('BucketRow open row', () => {
  it('scrolls itself into view when it becomes the open bucket, and only then', async () => {
    const active = VueRuntime.ref(false)
    const { root } = await mountApp(defineComponent(() => () => h(BucketRow, { bucket: 'genes', active: active.value })))
    const row = nodes(root).find((node) => node.tag === 'div' && String(node.props.class).includes('border-l-2'))!
    const scroll = vi.fn()
    Object.assign(row, { scrollIntoView: scroll })
    await flush()
    expect(scroll).not.toHaveBeenCalled()

    active.value = true
    await flush()
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  })
})
