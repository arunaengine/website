import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  type HostNode,
} from '@/test/clientRender'
import type { ChatMessage, ToolCallView } from '@/lib/assistant/types'
import { relativeTime } from '@/lib/utils'

const PassthroughStub = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })
const stubs = [
  '@/components/assistant/cards/ArtifactCard.vue',
  '@/components/assistant/cards/ChartCard.vue',
  '@/components/assistant/cards/CodeCard.vue',
  '@/components/assistant/cards/CrateCard.vue',
  '@/components/assistant/cards/DiffCard.vue',
  '@/components/assistant/cards/JobCard.vue',
  '@/components/assistant/cards/ObjectCard.vue',
  '@/components/assistant/cards/StatsCard.vue',
  '@/components/assistant/cards/TableCard.vue',
  '@/components/assistant/cards/TimelineCard.vue',
  '@/components/assistant/cards/TreeCard.vue',
  '@/components/assistant/AssistantMarkdown.vue',
  '@/components/assistant/ToolCallDrawer.vue',
  '@/components/ui/Notice.vue',
  '@/components/ui/Spinner.vue',
]

const modules = { '@/lib/utils': { relativeTime } }
const FoldRow = compileClientComponent(new URL('./FoldRow.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
})

const MessageList = compileClientComponent(new URL('./MessageList.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/assistant/FoldRow.vue': moduleDefault(FoldRow),
  ...Object.fromEntries(stubs.map((path) => [path, moduleDefault(PassthroughStub)])),
  ...modules,
})

const messages: ChatMessage[] = [
  { id: 'm-1', role: 'user', text: 'Hello', calls: [], at: 1_756_000_000_000 },
  { id: 'm-2', role: 'assistant', text: 'Hi', calls: [], at: 1_756_000_000_000 },
]

function scroller(root: HostNode): HostNode {
  return element(root, (node) => String(node.props.class ?? '').includes('overflow-y-auto'))
}

/** The host tree has no layout, so the scroll numbers are set by hand. */
async function scrollTo(node: HostNode, top: number, height = 1000) {
  Object.assign(node, { scrollHeight: height, scrollTop: top, clientHeight: 400 })
  for (const listener of node.listeners.get('scroll') ?? []) listener({ target: node })
  await flush()
}

function endButton(root: HostNode): HostNode | undefined {
  return nodes(root).find((node) => content(node).trim() === 'Scroll to the end')
}

function jumps(node: HostNode): Array<{ top: number }> {
  const seen: Array<{ top: number }> = []
  Object.assign(node, { scrollTo: (options: { top: number }) => seen.push(options) })
  return seen
}

/** One assistant turn whose single tool call the test then moves along. */
async function turn(call: ToolCallView) {
  const calls = ref<ToolCallView[]>([call])
  const Host = defineComponent(() => () =>
    h(MessageList, { messages: [{ id: 'm-1', role: 'assistant', text: '', calls: calls.value }], busy: false }))
  const { root } = await mountApp(Host)
  return { root, calls }
}

describe('MessageList', () => {
  it('offers the way back only after the reader scrolled up', async () => {
    const { root } = await mountApp(MessageList, { props: { messages, busy: false } })
    expect(endButton(root)).toBeUndefined()

    await scrollTo(scroller(root), 0)
    expect(endButton(root)).toBeDefined()

    await scrollTo(scroller(root), 600)
    expect(endButton(root)).toBeUndefined()
  })

  it('jumps to the newest turn when the button is used', async () => {
    const { root } = await mountApp(MessageList, { props: { messages, busy: false } })
    const jumps: Array<{ top: number }> = []
    Object.assign(scroller(root), { scrollTo: (options: { top: number }) => jumps.push(options) })

    await scrollTo(scroller(root), 0)
    await click(button(root, 'Scroll to the end'))

    expect(jumps).toEqual([{ top: 1000 }])
  })

  it('brings an approval into view from anywhere', async () => {
    // An approval blocks the turn, so it must not stay hidden behind the composer.
    const { root, calls } = await turn({ id: 'c-1', name: 'put_object', input: {}, state: 'running' })
    const node = scroller(root)
    const seen = jumps(node)
    await scrollTo(node, 0)

    calls.value = [{ id: 'c-1', name: 'put_object', input: {}, state: 'approval' }]
    await flush()

    expect(seen).toEqual([{ top: 1000 }])
  })

  it('follows a new card only near the end', async () => {
    const { root, calls } = await turn({ id: 'c-1', name: 'stat_object', input: {}, state: 'running' })
    const node = scroller(root)
    const seen = jumps(node)
    await scrollTo(node, 0)

    calls.value = [{ id: 'c-1', name: 'stat_object', input: {}, state: 'done' }]
    await flush()
    expect(seen).toEqual([])

    await scrollTo(node, 600)
    calls.value = [{
      id: 'c-1',
      name: 'stat_object',
      input: {},
      state: 'done',
      view: { kind: 'object', bucket: 'lorem', key: 'notes/hello.txt' },
    }]
    await flush()

    expect(seen).toEqual([{ top: 1000 }])
  })

  it('dates both sides of a turn quietly', async () => {
    const at = Date.now() - 5 * 60_000
    const { root } = await mountApp(MessageList, {
      props: {
        messages: [
          { id: 'm-1', role: 'user', text: 'Hello', calls: [], at },
          { id: 'm-2', role: 'assistant', text: 'Hi', calls: [], at },
        ],
        busy: false,
      },
    })
    const times = nodes(root).filter((node) => node.tag === 'time')

    expect(times).toHaveLength(2)
    expect(times.map((node) => content(node).trim())).toEqual(['5m ago', '5m ago'])
    for (const node of times) expect(String(node.props.title ?? '')).toBe(new Date(at).toLocaleString())
  })

  it('folds a background update like a tool call, not as a bubble', async () => {
    const text = 'Background update: the job 01JOB (read counts) reached the state succeeded.'
    const { root } = await mountApp(MessageList, {
      props: {
        messages: [
          { id: 'm-1', role: 'user', text: 'Hello', calls: [], at: 1_756_000_000_000 },
          { id: 'm-2', role: 'user', text, calls: [], at: 1_756_000_000_000, background: true },
        ],
        busy: false,
      },
    })
    const bubbles = nodes(root).filter((node) => String(node.props.class ?? '').includes('rounded-br-sm'))
    const row = element(root, (node) => node.tag === 'button' && 'aria-expanded' in node.props)

    expect(bubbles).toHaveLength(1)
    expect(content(bubbles[0])).toContain('Hello')
    expect(row.props['aria-expanded']).toBe(false)
    expect(content(row)).toContain(text)
    expect(nodes(root).filter((node) => node.tag === 'time')).toHaveLength(2)

    await click(row)

    expect(row.props['aria-expanded']).toBe(true)
    expect(nodes(root).filter((node) => node.tag === 'p' && content(node).trim() === text)).toHaveLength(1)
  })

  it('drops its scroll listener when it goes away', async () => {
    const { app, root } = await mountApp(MessageList, { props: { messages, busy: false } })
    const node = scroller(root)
    expect(node.listeners.get('scroll')?.size).toBe(1)

    app.unmount()
    expect(node.listeners.get('scroll')?.size).toBe(0)
  })
})
