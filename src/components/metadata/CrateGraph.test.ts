import { defineComponent, h, ref } from 'vue'
import * as VueRuntime from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as Lucide from '@lucide/vue'
import { button, click, compileClientComponent, content, element, mountApp, moduleDefault, nodes } from '@/test/clientRender'
import type { HostNode } from '@/test/clientRender'
import * as Editor from '@/lib/crate/editor'
import * as Graph from '@/lib/crate/graph'
import * as References from '@/lib/crate/references'
import * as Icons from './editor/icons'

// Vue Flow needs a DOM this suite does not have, so a stub draws one card per
// node through the component's own node slot and relays clicks as Vue Flow
// would. What the cards show and which controls exist is what is under test.
const FlowStub = defineComponent({
  props: { nodes: { type: Array, default: () => [] }, edges: { type: Array, default: () => [] } },
  emits: ['nodeClick', 'nodeDoubleClick', 'paneClick'],
  setup: (props, { slots, emit }) => () =>
    h(
      'div',
      { class: 'flow' },
      (props.nodes as Array<{ id: string; data: unknown }>).map((node) =>
        h(
          'div',
          {
            class: 'flow-node',
            onClick: () => emit('nodeClick', { node }),
            onDblclick: () => emit('nodeDoubleClick', { node }),
          },
          slots['node-crate']?.({ data: node.data, id: node.id }),
        ),
      ),
    ),
})
const HandleStub = defineComponent({
  props: { type: String },
  setup: (props) => () => h('i', { 'data-handle': props.type }),
})
const Empty = defineComponent(() => () => null)
const SpanStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('span', attrs, slots.default?.()),
})
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const CrateGraph = compileClientComponent(new URL('./CrateGraph.vue', import.meta.url), {
  vue: VueRuntime,
  '@vue-flow/core': {
    VueFlow: FlowStub,
    Handle: HandleStub,
    Position: { Top: 'top', Bottom: 'bottom' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    useVueFlow: () => ({ fitView: vi.fn(), onNodesInitialized: vi.fn(), dimensions: ref({ width: 0, height: 0 }) }),
  },
  '@vue-flow/background': { Background: Empty },
  '@vue-flow/controls': { Controls: Empty },
  '@vue-flow/minimap': { MiniMap: Empty },
  '@/components/ui/Badge.vue': moduleDefault(SpanStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  './editor/icons': Icons,
  '@/lib/crate/graph': Graph,
  '@/lib/crate/editor': Editor,
  '@/lib/crate/references': References,
  '@lucide/vue': Lucide,
})

function seeded(): Editor.CrateDraft {
  const named = Editor.updateValue(Editor.newDraft(), './', 'name', 0, 'Example dataset')
  const person = Editor.addEntity(named, { type: 'Person', name: 'Ada Lovelace' })
  const authored = Editor.addValue(person.draft, './', 'author', { kind: 'reference', value: person.entity.id })
  return References.addFilePart(authored, {
    id: 's3://bucket/reads.csv',
    name: 'reads.csv',
    contentSize: '2048',
    encodingFormat: 'text/csv',
  })
}

function crowded(): Editor.CrateDraft {
  let draft = seeded()
  for (let index = 0; index < Graph.CONTEXT_LIMIT; index += 1) {
    const added = Editor.addEntity(draft, { type: 'Person', name: `Person ${index}` })
    draft = Editor.addValue(added.draft, './', 'contributor', { kind: 'reference', value: added.entity.id })
  }
  return draft
}

function cards(root: HostNode): HostNode[] {
  return nodes(root).filter((node) => node.kind === 'element' && node.props.class === 'flow-node')
}

function card(root: HostNode, label: string): HostNode {
  const match = cards(root).find((node) => content(node).includes(label))
  if (!match) throw new Error(`No card for ${label}`)
  return match
}

function handles(root: HostNode): HostNode[] {
  return nodes(root).filter((node) => node.tag === 'i' && node.props['data-handle'])
}

describe('CrateGraph in view mode', () => {
  it('draws every node with icon, name, facts and kind', async () => {
    const { root } = await mountApp(CrateGraph, { props: { source: seeded(), mode: 'view' } })
    const file = card(root, 'reads.csv')

    expect(cards(root)).toHaveLength(3)
    expect(nodes(file).some((node) => node.tag === 'svg')).toBe(true)
    expect(content(file)).toContain('2 KB · text/csv')
    expect(content(file)).toContain('File')
    expect(content(card(root, 'Ada Lovelace'))).toContain('Person')
    expect(content(card(root, 'Example dataset'))).toContain('Root')
  })

  it('reads the crate JSON as well as a draft', async () => {
    const { root } = await mountApp(CrateGraph, { props: { source: Editor.toRoCrate(seeded()), mode: 'view' } })

    expect(cards(root)).toHaveLength(3)
  })

  it('offers no connection handles', async () => {
    const { root } = await mountApp(CrateGraph, { props: { source: seeded(), mode: 'view' } })

    expect(handles(root)).toHaveLength(0)
  })

  it('names itself for assistive technology and shows a legend', async () => {
    const { root } = await mountApp(CrateGraph, { props: { source: seeded(), mode: 'view' } })
    const region = element(root, (node) => node.props.role === 'img')
    const legend = element(root, (node) => node.props['aria-label'] === 'Kinds of node')

    expect(region.props['aria-label']).toBe('Graph of Example dataset: 3 entities, 2 references')
    expect(legend.children.filter((node) => node.tag === 'li').map(content).map((text) => text.trim()))
      .toEqual(['Root', 'Dataset', 'File', 'Contextual', 'External'])
  })

  it('hides contextual entities on request', async () => {
    const { root } = await mountApp(CrateGraph, { props: { source: seeded(), mode: 'view' } })
    const toggle = button(root, 'Show contextual entities')

    expect(toggle.props['aria-pressed']).toBe(true)
    await click(toggle)

    expect(toggle.props['aria-pressed']).toBe(false)
    expect(cards(root).map(content).join()).not.toContain('Ada Lovelace')
    expect(cards(root)).toHaveLength(2)
  })

  it('starts without contextual entities when the crate is large', async () => {
    const { root } = await mountApp(CrateGraph, { props: { source: crowded(), mode: 'view' } })
    const toggle = button(root, 'Show contextual entities')

    expect(toggle.props['aria-pressed']).toBe(false)
    expect(cards(root)).toHaveLength(2)
    await click(toggle)

    expect(cards(root).length).toBeGreaterThan(Graph.CONTEXT_LIMIT)
  })

  it('selects on click and opens on double-click', async () => {
    const select = vi.fn()
    const open = vi.fn()
    const { root } = await mountApp(CrateGraph, {
      props: { source: seeded(), mode: 'view', onSelect: select, onOpen: open },
    })
    const file = card(root, 'reads.csv')

    await click(file)
    expect(select).toHaveBeenCalledWith('s3://bucket/reads.csv')
    expect(file.props.class).not.toContain('opacity-40')

    const onDblclick = file.props.onDblclick as () => void
    onDblclick()
    expect(open).toHaveBeenCalledWith('s3://bucket/reads.csv')
  })

  it('selects a node on focus and opens it with Enter or Space', async () => {
    const select = vi.fn()
    const open = vi.fn()
    const { root } = await mountApp(CrateGraph, {
      props: { source: seeded(), mode: 'view', onSelect: select, onOpen: open },
    })
    const stop = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
    const file = element(card(root, 'reads.csv'), (node) => node.props.tabindex === 0)

    // One handler per key modifier: each sees the event and answers its key.
    const press = (key: string) => {
      for (const handler of file.props.onKeydown as Array<(event: unknown) => void>) handler({ key, ...stop })
    }

    ;(file.props.onFocus as () => void)()
    expect(select).toHaveBeenCalledWith('s3://bucket/reads.csv')

    press('Enter')
    press(' ')
    press('a')
    expect(open).toHaveBeenCalledTimes(2)
    expect(open).toHaveBeenCalledWith('s3://bucket/reads.csv')
    expect(stop.preventDefault).toHaveBeenCalledTimes(2)
  })
})

describe('CrateGraph in edit mode', () => {
  it('keeps the handles the editor connects with', async () => {
    const { root } = await mountApp(CrateGraph, { props: { source: seeded(), mode: 'edit', selected: './' } })

    expect(handles(root).map((node) => node.props['data-handle'])).toEqual(['target', 'source', 'target', 'source', 'target', 'source'])
  })
})
