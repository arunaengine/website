import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '@/lib/api'
import { button, compileClientComponent, content, element, flush, mountApp, moduleDefault, typeValue } from '@/test/clientRender'

const mutateRealmPlacement = vi.fn()
const loadInfo = vi.fn()
const busy = ref(false)
const realmInfo = ref({
  nodes: [
    { node_id: 'n1', placement: { location: 'giessen' }, info: { labels: {} } },
    { node_id: 'n2', placement: { location: 'marburg' }, info: { labels: {} } },
  ],
})

const Empty = defineComponent(() => () => null)
const Slotted = (tag: string) =>
  defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(tag, attrs, slots.default?.()) })
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: string } }) => emit('update:modelValue', event.target.value),
    }),
})

const section = compileClientComponent(new URL('./NodeAttributesSection.vue', import.meta.url), {
  vue: VueRuntime,
  '@/components/ui/Badge.vue': moduleDefault(Slotted('span')),
  '@/components/ui/Button.vue': moduleDefault(Slotted('button')),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Notice.vue': moduleDefault(Slotted('aside')),
  '@/components/ui/RefusalNote.vue': moduleDefault(
    defineComponent({ props: { message: String }, setup: (p) => () => h('aside', p.message) }),
  ),
  '@/components/ui/Select.vue': moduleDefault(Slotted('select')),
  '@/components/ui/Spinner.vue': moduleDefault(defineComponent({ props: { label: String }, setup: (p) => () => h('i', p.label) })),
  '@/composables/useAruna': { useAruna: () => ({ loadInfo, realmInfo }) },
  '@/composables/usePlacement': { usePlacement: () => ({ busy, mutateRealmPlacement }) },
  '@/composables/useRealmNodes': { useRealmNodes: () => ({ displayName: (id: string) => id }) },
  '@/lib/api': Api,
  '@lucide/vue': new Proxy({}, { get: () => Empty }),
})

beforeEach(() => {
  busy.value = false
  mutateRealmPlacement.mockReset()
  loadInfo.mockReset().mockResolvedValue(undefined)
})

describe('NodeAttributesSection', () => {
  it('starts another node without the wait or the result of a save still on its way', async () => {
    mutateRealmPlacement.mockResolvedValueOnce(undefined)
    let read: () => void = () => {}
    loadInfo.mockReturnValueOnce(new Promise<void>((resolve) => (read = resolve)))
    const { root } = await mountApp(section)
    await flush()
    await typeValue(element(root, (node) => node.tag === 'input' && node.props.id === 'node-location'), 'kassel')
    void (button(root, 'Save attributes').props.onClick as () => Promise<void>)()
    await flush()
    expect(button(root, 'Saving the attributes').props['aria-busy']).toBe(true)
    const pick = element(root, (node) => node.tag === 'select')
    ;(pick.props['onUpdate:modelValue'] as (value: string) => void)('n2')
    await flush()
    expect(button(root, 'Save attributes').props['aria-busy']).toBe(false)
    read()
    await flush()
    expect(content(root)).not.toContain('Saved.')
  })

  it('shows the wait on Save attributes for its own save only, sends it once and frees it when it fails', async () => {
    let refuse: (err: unknown) => void = () => {}
    mutateRealmPlacement.mockReturnValueOnce(new Promise((_, reject) => (refuse = reject)))
    const { root } = await mountApp(section)
    await flush()
    // Another placement change disables the button but marks no wait on it.
    busy.value = true
    await flush()
    expect(content(root)).not.toContain('Saving the attributes')
    busy.value = false
    await typeValue(element(root, (node) => node.tag === 'input' && node.props.id === 'node-location'), 'marburg')
    void (button(root, 'Save attributes').props.onClick as () => Promise<void>)()
    await flush()
    const waiting = button(root, 'Saving the attributes')
    expect(waiting.props['aria-busy']).toBe(true)
    expect(waiting.props.disabled).toBe(true)
    await (waiting.props.onClick as () => Promise<void>)()
    expect(mutateRealmPlacement).toHaveBeenCalledTimes(1)
    refuse(new Error('refused'))
    await flush()
    expect(button(root, 'Save attributes').props['aria-busy']).toBe(false)
    expect(button(root, 'Save attributes').props.disabled).toBe(false)
    expect(content(root)).toContain('refused')
  })
})
