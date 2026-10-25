import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, content, moduleDefault, mountApp, nodes } from '@/test/clientRender'

const Empty = defineComponent(() => () => null)
const Label = defineComponent({
  props: { job: Object },
  setup: (props) => () => h('em', { 'data-testid': 'bucket-job' }, (props.job as { kind: string }).kind),
})
const TooltipStub = defineComponent((_, { slots }) => () => h('div', [slots.default?.(), slots.content?.()]))
const BucketRow = compileClientComponent(new URL('./BucketRow.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: Empty },
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/storage/BucketJobLabel.vue': moduleDefault(Label),
  '@/components/ui/Tooltip.vue': moduleDefault(TooltipStub),
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

describe('BucketRow link column', () => {
  const column = (root: Parameters<typeof content>[0]) =>
    nodes(root).filter((node) => String(node.props.class ?? '').includes('h-7 w-7'))
  const link = { link: () => h('button', { 'aria-label': 'Link a local folder' }) }

  it('marks a linked bucket with its folder in place of the link button', async () => {
    const root = await mount({ linkedTo: 'test-data' }, link)
    const mark = nodes(root).find((node) => node.props.role === 'img')

    expect(mark?.props['aria-label']).toBe('Linked to test-data')
    expect(nodes(root).some((node) => node.props['aria-label'] === 'Link a local folder')).toBe(false)
  })

  it('keeps the same column on unlinked rows, with the button or empty', async () => {
    const offered = column(await mount({ linkedTo: null }, link))
    const empty = column(await mount({ linkedTo: null }))

    expect(offered).toHaveLength(1)
    expect(nodes(offered[0]).some((node) => node.props['aria-label'] === 'Link a local folder')).toBe(true)
    expect(empty).toHaveLength(1)
    expect(nodes(empty[0]).filter((node) => node.kind === 'element')).toEqual([empty[0]])
  })

  it('adds no column outside the desktop', async () => {
    expect(column(await mount({}, link))).toHaveLength(0)
  })

  it('gives the place a fixed width after the other row marks', async () => {
    const root = await mount({ place: 'This computer', job: JOB, synced: true })
    const place = nodes(root).find((node) => content(node) === 'This computer' && node.tag === 'span')
    const group = nodes(root).find((node) => node.children?.includes(place as never))

    expect(String(place?.props.class)).toContain('w-20')
    expect(group?.children.at(-1)).toBe(place)
  })
})
