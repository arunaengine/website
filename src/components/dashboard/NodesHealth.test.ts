import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  click,
  compileClientComponent,
  element,
  moduleDefault,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import * as NodeDisplay from '@/components/nodes/node-display'
import * as StateBadge from '@/lib/stateBadge'
import * as Utils from '@/lib/utils'

const NODE_ID = '01NODEALPHA1234567890'

const SpanStub = defineComponent((_, { attrs, slots }) => () => h('span', attrs, slots.default?.()))
const ChipStub = defineComponent({
  props: { value: { type: String, required: true } },
  setup: (props) => () => h('button', { 'aria-label': `Copy ${props.value}` }, props.value),
})

const NodesHealth = compileClientComponent(new URL('./NodesHealth.vue', import.meta.url), {
  vue: VueRuntime,
  '@vueuse/core': { useNow: () => ref(new Date(0)) },
  '@/components/ui/Badge.vue': moduleDefault(SpanStub),
  '@/components/ui/LabelChip.vue': moduleDefault(ChipStub),
  '@/components/ui/NodeLabel.vue': moduleDefault(SpanStub),
  '@/components/ui/StatusDot.vue': moduleDefault(SpanStub),
  '@/components/nodes/node-display': NodeDisplay,
  '@/lib/stateBadge': StateBadge,
  '@/lib/utils': Utils,
})

function realmNode(labels: Record<string, string>) {
  return {
    node_id: NODE_ID,
    kind: 'server',
    configured: true,
    present: true,
    connection_status: 'connected',
    info: { labels, utilization: { storage_bytes_used: 2048 } },
  }
}

async function render(labels: Record<string, string>, onSelect = vi.fn()): Promise<HostNode> {
  const { root } = await mountApp(NodesHealth, { props: { nodes: [realmNode(labels)], onSelect } })
  return root
}

function ancestors(node: HostNode): HostNode[] {
  const chain: HostNode[] = []
  for (let current = node.parent; current; current = current.parent) chain.push(current)
  return chain
}

describe('node health cards', () => {
  it('opens the node from the card surface', async () => {
    const select = vi.fn()
    const root = await render({}, select)
    const card = element(root, (node) => String(node.props['aria-label'] ?? '').startsWith('View'))

    await click(card)

    expect(select).toHaveBeenCalledWith(NODE_ID)
  })

  it('keeps label chips out of the card button', async () => {
    // A chip is itself a button, so nesting it in the card would be invalid.
    const root = await render({ zone: 'eu-west-1' })
    const card = element(root, (node) => String(node.props['aria-label'] ?? '').startsWith('View'))
    const chip = element(root, (node) => String(node.props['aria-label'] ?? '').startsWith('Copy'))

    expect(card.tag).toBe('button')
    expect(ancestors(chip)).not.toContain(card)
    expect(nodes(card)).not.toContain(chip)
  })
})
