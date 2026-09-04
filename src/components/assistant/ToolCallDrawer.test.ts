import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import * as callSummary from '@/lib/assistant/callSummary'
import type { ToolCallState, ToolCallView } from '@/lib/assistant/types'

const BadgeStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('span', attrs, slots.default?.()),
})
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const CardStub = defineComponent({
  props: { call: { type: Object, default: () => ({}) } },
  setup: (props) => () => h('div', { 'data-card': (props.call as ToolCallView).id }),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })
const FoldRow = compileClientComponent(new URL('./FoldRow.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
})

const ToolCallDrawer = compileClientComponent(new URL('./ToolCallDrawer.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/assistant/FoldRow.vue': moduleDefault(FoldRow),
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/assistant/ToolCallCard.vue': moduleDefault(CardStub),
  '@/lib/assistant/callSummary': callSummary,
})

function call(id: string, state: ToolCallState): ToolCallView {
  return { id, name: `tool_${id}`, input: {}, state }
}

function cards(root: HostNode): number {
  return nodes(root).filter((node) => 'data-card' in node.props).length
}

function stackRow(root: HostNode): HostNode {
  return element(root, (node) => node.tag === 'button')
}

async function drawer(calls: ToolCallView[]) {
  return mountApp(ToolCallDrawer, { props: { calls } })
}

describe('ToolCallDrawer', () => {
  it('counts the folded calls and the states worth naming', async () => {
    // The waiting call has a row of its own, so the stack row does not count it.
    const { root } = await drawer([
      call('a', 'done'),
      call('b', 'approval'),
      call('c', 'running'),
      call('d', 'error'),
    ])
    const text = content(root)

    expect(text).toContain('3 tool calls')
    expect(text).not.toContain('waiting')
    expect(text).toContain('1 running')
    expect(text).toContain('1 failed')
    expect(cards(root)).toBe(1)
  })

  it('keeps a waiting call in view as its own card while the stack stays folded', async () => {
    const { root } = await drawer([call('a', 'done'), call('b', 'approval')])

    expect(cards(root)).toBe(1)
    expect(stackRow(root).props['aria-expanded']).toBe(false)
  })

  it('opens and closes on the row alone', async () => {
    const { root } = await drawer([call('a', 'done'), call('b', 'running')])
    expect(cards(root)).toBe(0)

    await click(stackRow(root))
    expect(cards(root)).toBe(2)

    await click(stackRow(root))
    expect(cards(root)).toBe(0)
  })

  it('pins a write as a card of its own above the fold', async () => {
    const write: ToolCallView = {
      id: 'w', name: 'create_dataset', input: { name: 'Water quality 2024' }, state: 'running',
    }
    const { root } = await drawer([write, call('a', 'done')])

    expect(content(root)).toContain('1 tool call')
    expect(cards(root)).toBe(1)
  })

  it('drops the stack row when it would hide nothing', async () => {
    const { root } = await drawer([{ id: 'w', name: 'create_dataset', input: {}, state: 'running' }])

    expect(content(root)).not.toContain('tool call')
    expect(cards(root)).toBe(1)
  })

  it('folds a long run of applied changes and keeps a failed one in view', async () => {
    // Four settled writes fold into one row; the failed fifth stays pinned.
    const writes: ToolCallView[] = ['p', 'q', 'r', 's'].map((id) => ({
      id, name: 'add_profile_entity', input: { type: id === 'p' ? 'Person' : 'File' }, state: 'done',
    }))
    const failed: ToolCallView = { id: 'x', name: 'add_profile_property', input: { name: 'x' }, state: 'error' }
    const { root } = await drawer([...writes, failed])

    expect(content(root)).toContain('4 changes, starting with adding profile entity Person')
    expect(cards(root)).toBe(1)

    await click(element(root, (node) => node.tag === 'button' && String(node.props['aria-label'] ?? '').length === 0))
    expect(cards(root)).toBe(5)
  })
})
