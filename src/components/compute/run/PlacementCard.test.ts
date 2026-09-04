import * as VueRuntime from 'vue'
import { computed, defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  input,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
} from '@/test/clientRender'

interface TestNode {
  nodeId: string
  label: string
  executorKinds: string[]
  info: { labels: Record<string, string> }
}

const NODES: TestNode[] = [
  { nodeId: '01ALPHA', label: 'Alpha', executorKinds: ['docker'], info: { labels: { region: 'eu-west', tier: 'fast' } } },
  { nodeId: '01BETA', label: 'Beta', executorKinds: ['kubernetes'], info: { labels: { region: 'eu-west', tier: 'slow' } } },
  { nodeId: '01GAMMA', label: 'Gamma', executorKinds: ['docker'], info: { labels: { region: 'us-east', tier: 'fast' } } },
  { nodeId: '01STORAGE', label: 'Storage only', executorKinds: [], info: { labels: { region: 'eu-west' } } },
]

function scene() {
  const pinnedNode = ref('')
  const executorConstraint = ref('')
  const constraintRows = ref<{ id: number; key: string; value: string }[]>([])
  const advertisedLabels = computed(() => [
    { key: 'region', values: ['eu-west', 'us-east'] },
    { key: 'tier', values: ['fast', 'slow'] },
  ])
  const nodeMatches = computed(() => {
    const reasons = { noExecutor: 0, notPinned: 0, kind: 0, labels: {} as Record<string, number> }
    const matches = NODES.filter((node) => {
      if (!node.executorKinds.length) {
        reasons.noExecutor++
        return false
      }
      if (pinnedNode.value && node.nodeId !== pinnedNode.value) {
        reasons.notPinned++
        return false
      }
      if (executorConstraint.value && !node.executorKinds.includes(executorConstraint.value)) {
        reasons.kind++
        return false
      }
      const failed = constraintRows.value.find(
        (row) => row.key && node.info.labels[row.key] !== row.value,
      )
      if (failed) {
        const name = `${failed.key}=${failed.value}`
        reasons.labels[name] = (reasons.labels[name] ?? 0) + 1
        return false
      }
      return true
    })
    return { matches, reasons, total: NODES.length }
  })
  return {
    runTarget: { local: computed(() => false), available: computed(() => true), target: ref('realm') },
    realmName: computed(() => 'Test realm'),
    pinnedNode,
    executorConstraint,
    executorKindOptions: computed(() => [
      { value: 'docker', label: 'docker' },
      { value: 'kubernetes', label: 'kubernetes' },
    ]),
    constraintRows,
    addConstraint: (key = '', value = '') => constraintRows.value.push({ id: constraintRows.value.length, key, value }),
    removeConstraint: (index: number) => constraintRows.value.splice(index, 1),
    advertisedLabels,
    nodeMatches,
    leftOutReasons: computed(() => {
      const { reasons } = nodeMatches.value
      const lines: string[] = []
      if (reasons.noExecutor) lines.push(`${reasons.noExecutor} nodes have no executor`)
      for (const [label, count] of Object.entries(reasons.labels)) {
        lines.push(`${count} nodes do not advertise ${label}`)
      }
      return lines
    }),
    matchCount: computed(() => nodeMatches.value.matches.length),
    targetProblems: computed(() => [] as string[]),
  }
}

let store: ReturnType<typeof scene>

const EmptyStub = defineComponent(() => () => null)
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})
const SelectStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h(
      'select',
      {
        ...attrs,
        value: props.modelValue,
        onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value)),
      },
      (props.options as Array<{ value: string; label: string }>).map((option) =>
        h('option', { value: option.value }, option.label),
      ),
    ),
})
const RunTileStub = defineComponent({
  props: { label: String, tag: String, value: String, sub: String },
  setup: (props, { slots }) => () =>
    h('div', [h('dt', `${props.label} ${props.tag}`), h('dd', [props.value, props.sub, slots.default?.()])]),
})
const RunSectionStub = defineComponent({
  props: { title: String, complete: Boolean, checkLabel: String },
  setup: (props, { slots }) => () =>
    h('section', [h('h2', props.title), h('div', slots.controls?.()), h('span', props.checkLabel), slots.default?.()]),
})

const PlacementCard = compileClientComponent(new URL('./PlacementCard.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => EmptyStub }),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Notice.vue': moduleDefault(EmptyStub),
  '@/components/ui/DocsLink.vue': moduleDefault(EmptyStub),
  '@/components/compute/run/RunSection.vue': moduleDefault(RunSectionStub),
  '@/components/compute/run/RunTile.vue': moduleDefault(RunTileStub),
  '@/composables/useCustomRun': { MAX_LABEL_CONSTRAINTS: 8, injectCustomRun: () => store },
})

async function mount() {
  const mounted = await mountApp(PlacementCard)
  await click(button(mounted.root, 'Edit'))
  return mounted
}

beforeEach(() => {
  store = scene()
  vi.stubGlobal('document', { getElementById: () => null })
})

describe('placement card', () => {
  it('counts the matching nodes and keeps the list behind the count', async () => {
    const mounted = await mount()

    expect(content(mounted.root)).toContain('3 of 4 nodes match')
    expect(content(mounted.root)).not.toContain('Alpha')

    await click(button(mounted.root, 'Show nodes'))
    expect(content(mounted.root)).toContain('Alpha')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('narrows the matches with an advertised label constraint', async () => {
    const mounted = await mount()

    await click(button(mounted.root, 'Add constraint'))
    await typeValue(
      element(mounted.root, (node) => node.tag === 'select' && node.props['aria-label'] === 'Label value 1'),
      'us-east',
    )

    expect(content(mounted.root)).toContain('1 of 4 nodes match')
    expect(mounted.errors).toEqual([])
    mounted.app.unmount()
  })

  it('offers only the keys and values the nodes advertise, plus Custom', async () => {
    const mounted = await mount()
    await click(button(mounted.root, 'Add constraint'))

    const keySelect = element(
      mounted.root,
      (node) => node.tag === 'select' && node.props['aria-label'] === 'Label key 1',
    )
    expect(nodes(keySelect).filter((node) => node.tag === 'option').map((node) => content(node))).toEqual([
      'region',
      'tier',
      'Custom…',
    ])
    mounted.app.unmount()
  })

  it('names why nodes were left out, on demand', async () => {
    const mounted = await mount()

    expect(content(mounted.root)).toContain('Left out: 1 reason')
    expect(content(mounted.root)).not.toContain('1 nodes have no executor')

    await click(button(mounted.root, 'Left out: 1 reason'))
    expect(content(mounted.root)).toContain('1 nodes have no executor')
    mounted.app.unmount()
  })

  it('pins one node and reports it as the only match', async () => {
    const mounted = await mount()

    await typeValue(input(mounted.root, 'aria-label', 'Node'), '01ALPHA')

    expect(store.pinnedNode.value).toBe('01ALPHA')
    expect(content(mounted.root)).toContain('1 of 4 nodes match')
    mounted.app.unmount()
  })

  it('keeps an executor kind out of the matches', async () => {
    const mounted = await mount()

    await typeValue(
      element(mounted.root, (node) => node.tag === 'select' && node.props['aria-label'] === 'Executor kind'),
      'kubernetes',
    )

    expect(content(mounted.root)).toContain('1 of 4 nodes match')
    mounted.app.unmount()
  })
})
