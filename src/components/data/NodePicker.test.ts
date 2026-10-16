import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { click, compileClientComponent, content, element, moduleDefault, mountApp, nodes, typeValue } from '@/test/clientRender'

const Empty = defineComponent(() => () => null)
const Passthrough = defineComponent((_, { slots }) => () => h('div', [slots.default?.(), slots.content?.()]))
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})

function node(id: string, extra: Record<string, unknown> = {}) {
  return { nodeId: id, label: id, reachable: true, isLocal: false, ...extra }
}
const realm = ref([
  node('node-4'),
  node('node-5', { reachable: false }),
  node('node-3'),
  node('node-1', { isLocal: true }),
  ...Array.from({ length: 6 }, (_, index) => node(`spare-${index}`)),
])

const NodePicker = compileClientComponent(new URL('./NodePicker.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Popover.vue': moduleDefault(Passthrough),
  '@/components/ui/StatusDot.vue': moduleDefault(Empty),
  '@/composables/useRealmNodes': {
    useRealmNodes: () => ({
      nodes: realm,
      displayName: (id: string) => id,
      nodeById: (id: string) => realm.value.find((entry) => entry.nodeId === id) ?? null,
    }),
  },
})

type Root = Parameters<typeof content>[0]
const options = (root: Root) =>
  nodes(root)
    .filter((entry) => entry.tag === 'button' && entry.props.title)
    .map((entry) => String(entry.props.title))

describe('Node picker', () => {
  it('puts the home node first, then recent nodes, then the rest by name', async () => {
    const { root } = await mountApp(NodePicker, { props: { modelValue: null, recent: ['node-5', 'node-3'] } })

    expect(options(root).slice(0, 4)).toEqual(['node-1', 'node-5', 'node-3', 'node-4'])
    expect(content(root)).toContain('home')
    expect(content(root)).toContain('not reachable')
  })

  it('filters a long list and hands back the chosen node', async () => {
    const picked: (string | null)[] = []
    const { root } = await mountApp(NodePicker, {
      props: { modelValue: null, 'onUpdate:modelValue': (value: string | null) => picked.push(value) },
    })

    await typeValue(element(root, (entry) => entry.props['aria-label'] === 'Find a node'), 'node-4')
    expect(options(root)).toEqual(['node-4'])

    await click(element(root, (entry) => entry.props.title === 'node-4'))
    expect(picked).toEqual(['node-4'])
  })
})
