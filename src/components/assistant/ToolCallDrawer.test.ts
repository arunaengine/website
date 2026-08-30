import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
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
import type { ToolCallState, ToolCallView } from '@/lib/assistant/types'

const BadgeStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('span', attrs, slots.default?.()),
})
const CardStub = defineComponent({
  props: { call: { type: Object, default: () => ({}) } },
  setup: (props) => () => h('div', { 'data-card': (props.call as ToolCallView).id }),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const ToolCallDrawer = compileClientComponent(new URL('./ToolCallDrawer.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Badge.vue': moduleDefault(BadgeStub),
  '@/components/assistant/ToolCallCard.vue': moduleDefault(CardStub),
})

function call(id: string, state: ToolCallState): ToolCallView {
  return { id, name: `tool_${id}`, input: {}, state }
}

function cards(root: HostNode): number {
  return nodes(root).filter((node) => 'data-card' in node.props).length
}

async function drawer(calls: ToolCallView[], size: 'compact' | 'full' = 'compact') {
  return mountApp(ToolCallDrawer, { props: { calls, size } })
}

describe('ToolCallDrawer', () => {
  it('counts the calls and the states worth naming', async () => {
    const { root } = await drawer([
      call('a', 'done'),
      call('b', 'approval'),
      call('c', 'running'),
      call('d', 'error'),
    ])
    const text = content(root)

    expect(text).toContain('4 tool calls')
    expect(text).toContain('1 waiting')
    expect(text).toContain('1 running')
    expect(text).toContain('1 failed')
  })

  it('opens itself while a call waits for an answer', async () => {
    const { root } = await drawer([call('a', 'done'), call('b', 'approval')], 'full')

    expect(cards(root)).toBe(2)
    expect(element(root, (node) => node.tag === 'button').props['aria-expanded']).toBe(true)
  })

  it('stays folded on the page once every call is settled', async () => {
    const { root } = await drawer([call('a', 'done'), call('b', 'running')], 'full')
    expect(cards(root)).toBe(0)

    await click(element(root, (node) => node.tag === 'button'))
    expect(cards(root)).toBe(2)

    await click(element(root, (node) => node.tag === 'button'))
    expect(cards(root)).toBe(0)
  })

  it('opens in the panel while a call is still running', async () => {
    const { root } = await drawer([call('a', 'running')])

    expect(cards(root)).toBe(1)
    expect(content(root)).toContain('1 tool call')
  })
})
