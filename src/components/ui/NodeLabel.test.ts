import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import * as Utils from '@/lib/utils'

const KNOWN_ID = '01NODEALPHA1234567890'
const UNKNOWN_ID = '01NODEGHOST0987654321'

const clipboard = vi.fn()
const CopyButtonStub = defineComponent({
  props: { value: { type: String, required: true }, label: { type: String, default: '' } },
  setup: (props) => () =>
    h('button', { 'aria-label': props.label, onClick: () => clipboard(props.value) }),
})

const realmNodes = {
  nodeById: (nodeId: string) => (nodeId === KNOWN_ID ? { nodeId, label: 'Alpha' } : null),
  displayName: (nodeId: string) =>
    nodeId === KNOWN_ID ? 'Alpha' : Utils.truncateMiddle(nodeId, 8, 6),
}

const NodeLabel = compileClientComponent(new URL('./NodeLabel.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/CopyButton.vue': moduleDefault(CopyButtonStub),
  '@/composables/useRealmNodes': { useRealmNodes: () => realmNodes },
  '@/lib/utils': Utils,
})

async function render(props: Record<string, unknown>): Promise<HostNode> {
  const { root } = await mountApp(NodeLabel, { props })
  return root
}

describe('node label', () => {
  beforeEach(() => clipboard.mockClear())

  it('names a realm node instead of showing its id', async () => {
    const root = await render({ nodeId: KNOWN_ID, size: 'sm' })
    const label = element(root, (node) => node.props.title === KNOWN_ID)

    expect(content(label).trim()).toBe('Alpha')
    expect(String(label.props.class)).toContain('text-[11px]')
    expect(String(label.props.class)).not.toContain('hash')
  })

  it('keeps an unknown id readable and complete on hover', async () => {
    const root = await render({ nodeId: UNKNOWN_ID })
    const label = element(root, (node) => String(node.props.class ?? '').includes('hash'))

    expect(content(label).trim()).toBe(Utils.truncateMiddle(UNKNOWN_ID, 8, 6))
    expect(content(label)).not.toContain(UNKNOWN_ID)
    expect(label.props.title).toBe(UNKNOWN_ID)
    expect(String(label.props.class)).toContain('text-xs')
  })

  it('copies the full id, not the shortened label', async () => {
    const root = await render({ nodeId: KNOWN_ID, copy: true })
    const control = element(root, (node) => node.tag === 'button')

    expect(control.props['aria-label']).toBe('Copy node id')
    await click(control)
    expect(clipboard).toHaveBeenCalledWith(KNOWN_ID)
  })

  it('renders nothing without an id', async () => {
    const root = await render({ nodeId: '' })

    expect(nodes(root).filter((node) => node.kind === 'element')).toHaveLength(0)
    expect(content(root).trim()).toBe('')
  })
})
