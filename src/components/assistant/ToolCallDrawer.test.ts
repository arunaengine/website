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
    expect(text).toContain('Run this tool?')
  })

  it('stays folded while a call waits for an answer', async () => {
    const { root } = await drawer([call('a', 'done'), call('b', 'approval')])

    expect(cards(root)).toBe(0)
    expect(stackRow(root).props['aria-expanded']).toBe(false)
    expect(content(root)).toContain('Run this tool?')
  })

  it('opens and closes on the row alone', async () => {
    const { root } = await drawer([call('a', 'done'), call('b', 'running')])
    expect(cards(root)).toBe(0)

    await click(stackRow(root))
    expect(cards(root)).toBe(2)

    await click(stackRow(root))
    expect(cards(root)).toBe(0)
  })

  it('says in plain words what an approved write is doing', async () => {
    const write: ToolCallView = {
      id: 'w', name: 'create_dataset', input: { name: 'Water quality 2024' }, state: 'running',
    }
    const { root } = await drawer([write, call('a', 'done')])

    expect(content(root)).toContain('Creating dataset "Water quality 2024"')
    expect(content(root)).not.toContain('Run this tool?')
    expect(cards(root)).toBe(0)
  })

  it('drops the stack row when it would hide nothing', async () => {
    // One write shows its own summary row; a "1 tool call" row above it repeats it.
    const { root } = await drawer([{ id: 'w', name: 'create_dataset', input: {}, state: 'running' }])

    expect(content(root)).not.toContain('tool call')
    expect(content(root)).toContain('Creating dataset')
  })

  it('answers the approval from the row above the fold', async () => {
    const decisions: boolean[] = []
    const { root } = await mountApp(ToolCallDrawer, {
      props: {
        calls: [call('b', 'approval')],
        onDecide: (approved: boolean) => decisions.push(approved),
      },
    })

    await click(button(root, 'Approve'))
    expect(decisions).toEqual([true])
  })
})
