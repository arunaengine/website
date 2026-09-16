import { defineComponent, h } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Utils from '@/lib/utils'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  mountApp,
  moduleDefault,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import { namedIcons, referencedContent } from '@/test/deletionImpact'
import type { BacklinkPreflightResponse } from '@/lib/backlinks'

const Slotted = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()),
  })
const PopoverStub = defineComponent({
  setup: (_, { slots }) => () => h('div', [slots.default?.(), h('div', { role: 'dialog' }, slots.content?.())]),
})
const RouterLinkStub = defineComponent({
  props: { to: [String, Object] },
  setup: (props, { slots }) => () => h('a', { to: props.to }, slots.default?.()),
})
const DocsLinkStub = defineComponent({
  props: { topic: String, section: String },
  setup: (props) => () => h('a', { 'data-topic': props.topic, 'data-section': props.section }),
})
const NodeLabelStub = defineComponent({
  props: { nodeId: String, size: String },
  setup: (props) => () => h('span', props.nodeId ?? ''),
})
const SpinnerStub = defineComponent({
  props: { label: String, showLabel: Boolean },
  setup: (props) => () => h('i', props.label ?? ''),
})

const component = compileClientComponent(new URL('./ReferencedBy.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub },
  '@lucide/vue': namedIcons,
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/DocsLink.vue': moduleDefault(DocsLinkStub),
  '@/components/ui/NodeLabel.vue': moduleDefault(NodeLabelStub),
  '@/components/ui/Popover.vue': moduleDefault(PopoverStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/lib/utils': Utils,
})

async function render(
  preflight: BacklinkPreflightResponse | null,
  overrides: Record<string, unknown> = {},
): Promise<HostNode> {
  const { root, errors } = await mountApp(component, {
    props: { preflight, busy: false, error: null, ...overrides },
  })
  expect(errors).toEqual([])
  return root
}

function icons(node: HostNode): string[] {
  return nodes(node)
    .filter((child) => typeof child.props['data-icon'] === 'string')
    .map((child) => String(child.props['data-icon']))
}

function popover(root: HostNode): string {
  return content(element(root, (node) => node.props.role === 'dialog'))
}

function links(root: HostNode): string[] {
  return nodes(root)
    .filter((node) => node.tag === 'a' && node.props.to)
    .map((node) => content(node))
}

describe('referenced by', () => {
  it('lists the referencing datasets behind a complete badge', async () => {
    const root = await render(referencedContent(2))

    expect(links(root)).toEqual(['Reef survey 01', 'Reef survey 02'])
    expect(content(root)).toContain('2 datasets')
    const badge = button(root, 'Complete')
    expect(icons(badge)).toEqual(['Check'])
    expect(popover(root)).toContain('All 1 realm node answered and their indexes are current.')
    expect(popover(root)).toContain('Scope')
    expect(content(root)).not.toContain('Scope: ')
  })

  it('says when no dataset references the file', async () => {
    const root = await render(referencedContent(0))

    expect(content(root)).toContain('No dataset references this file.')
    expect(content(root)).toContain('0 datasets')
  })

  it('marks a partial lookup and says why', async () => {
    const partial = referencedContent(0)
    partial.nodes_queried = 3
    partial.nodes_failed = 1
    partial.complete = false
    partial.coverage.node_freshness = [
      { node_id: 'node-1', index_state: 'current', oldest_status_updated_at_ms: null },
      { node_id: 'node-2', index_state: 'pending', oldest_status_updated_at_ms: null },
    ]
    const root = await render(partial)

    const badge = button(root, 'Partial')
    expect(icons(badge)).toEqual(['TriangleAlert'])
    expect(popover(root)).toContain(
      'References may be missing: 1 node did not answer, 1 index is behind.',
    )
    expect(popover(root)).toContain('2 answered, 1 failed')
    expect(popover(root)).toContain('pending')
    expect(content(root)).toContain('No referencing dataset was found, but the lookup was partial.')
  })

  it('names the forms the lookup skipped', async () => {
    const response = referencedContent(1)
    response.coverage.excluded_forms = [
      { form: 'literal_content_url', reason: 'literal objects are not indexed' },
    ]
    const root = await render(response)

    expect(popover(root)).toContain('Checked forms')
    expect(popover(root)).toContain('content w3id')
    expect(popover(root)).toContain('Not checked: literal content url. literal objects are not indexed')
    const docs = element(root, (node) => node.props['data-topic'] === 'data-and-deletion')
    expect(docs.props['data-section']).toBe('What the reference check covers')
  })

  it('discloses restricted references without naming them', async () => {
    const response = referencedContent(0)
    response.targets[0].hidden_references_exist = true
    const root = await render(response)

    expect(content(root)).toContain('Other restricted datasets reference this file.')
    expect(links(root)).toEqual([])
  })

  it('keeps the badge off a running or failed lookup', async () => {
    const busy = await render(null, { busy: true })
    expect(content(busy)).toContain('Checking the realm indexes')
    expect(content(busy)).not.toContain('Complete')

    const onRetry = vi.fn()
    const failed = await render(null, { error: 'node unreachable', onRetry })
    expect(content(failed)).toContain('node unreachable')
    expect(content(failed)).not.toContain('Complete')
    await click(button(failed, 'Retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
