import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { compileClientComponent, element, flush, moduleDefault, mountApp, nodes } from '@/test/clientRender'
import { cn } from '@/lib/utils'

const IconStub = defineComponent((_, { attrs }) => () => h('i', attrs))
const SlotStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()),
})
const RootStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('div', { ...attrs, role: 'root' }, slots.default?.()),
})
// Mirrors the radix-vue rule that made the empty option throw.
const ItemStub = defineComponent({
  props: { value: { type: String, required: true } },
  setup: (props, { slots }) => {
    if (props.value === '') throw new Error('A <SelectItem /> must have a value prop that is not an empty string')
    return () => h('div', { role: 'option', 'data-value': props.value }, slots.default?.())
  },
})

const Select = compileClientComponent(new URL('./Select.vue', import.meta.url), {
  vue: VueRuntime,
  'radix-vue': {
    SelectRoot: RootStub,
    SelectTrigger: SlotStub,
    SelectValue: SlotStub,
    SelectPortal: SlotStub,
    SelectContent: SlotStub,
    SelectViewport: SlotStub,
    SelectItem: ItemStub,
    SelectItemText: SlotStub,
    SelectItemIndicator: SlotStub,
    SelectIcon: SlotStub,
    useForwardPropsEmits: (props: Record<string, unknown>) => VueRuntime.computed(() => ({ ...props })),
  },
  '@lucide/vue': new Proxy({}, { get: () => IconStub }),
  '@/lib/utils': { cn },
})

const options = [
  { value: '', label: 'No profile' },
  { value: 'p1', label: 'Profile one' },
]

describe('Select', () => {
  it('renders an empty option without an empty item value and round-trips it', async () => {
    const updates: string[] = []
    const { root, errors } = await mountApp(Select, {
      props: { options, modelValue: 'p1', 'onUpdate:modelValue': (value: string) => updates.push(value) },
    })
    expect(errors).toEqual([])

    const items = nodes(root).filter((node) => node.props.role === 'option')
    expect(items.map((node) => node.props['data-value'])).toHaveLength(2)
    expect(items.every((node) => node.props['data-value'] !== '')).toBe(true)

    const rootNode = element(root, (node) => node.props.role === 'root')
    const emptyItem = items[0].props['data-value'] as string
    ;(rootNode.props['onUpdate:modelValue'] as (value: string) => void)(emptyItem)
    ;(rootNode.props['onUpdate:modelValue'] as (value: string) => void)('p1')
    await flush()

    expect(updates).toEqual(['', 'p1'])
  })

  it('shows the empty option as selected for an empty model value', async () => {
    const { root, errors } = await mountApp(Select, { props: { options, modelValue: '' } })
    expect(errors).toEqual([])

    const rootNode = element(root, (node) => node.props.role === 'root')
    const emptyItem = element(root, (node) => node.props.role === 'option').props['data-value']
    expect(rootNode.props.modelValue).toBe(emptyItem)
    expect(rootNode.props.modelValue).not.toBe('')
  })
})
