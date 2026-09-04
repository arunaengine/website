import * as VueRuntime from 'vue'
import { defineComponent, h, inject, provide } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import { isValidModelId, normalizeModelId } from '@/lib/assistant/modelOptions'
import { cn } from '@/lib/utils'

const CHAT_MODELS = [
  'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5',
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'o3', 'o4-mini', 'chatgpt-4o-latest',
]

// The list is portaled in the browser; here the stubs only keep it mounted
// while the combobox says it is open.
const OPEN = Symbol('popover-open')
const RootStub = defineComponent({
  props: { open: Boolean },
  setup: (props, { slots }) => {
    provide(OPEN, () => props.open)
    return () => h('div', slots.default?.())
  },
})
const PortalStub = defineComponent((_, { slots }) => {
  const isOpen = inject<() => boolean>(OPEN, () => true)
  return () => (isOpen() ? h('div', slots.default?.()) : null)
})
const SlotStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('div', attrs, slots.default?.()),
})

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})

const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
    }),
})

const ModelCombobox = compileClientComponent(new URL('./ModelCombobox.vue', import.meta.url), {
  vue: VueRuntime,
  'radix-vue': {
    PopoverRoot: RootStub,
    PopoverAnchor: SlotStub,
    PopoverPortal: PortalStub,
    PopoverContent: SlotStub,
  },
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/lib/assistant/modelOptions': { isValidModelId, normalizeModelId },
  '@/lib/utils': { cn },
})

async function open(
  modelValue: string,
  suggestions = CHAT_MODELS.map((id) => ({ id })),
  extra: Record<string, unknown> = {},
) {
  const applied: string[] = []
  const { root } = await mountApp(ModelCombobox, {
    props: { modelValue, suggestions, 'onUpdate:modelValue': (id: string) => applied.push(id), ...extra },
  })
  const field = element(root, (node) => node.tag === 'input')
  ;(field.props.onFocus as () => void)()
  ;(field.props.onClick as () => void)()
  await flush()
  return { root, field, applied }
}

async function press(field: HostNode, key: string) {
  ;(field.props.onKeydown as (event: KeyboardEvent) => void)({ key, preventDefault: () => {} } as KeyboardEvent)
  await flush()
}

function options(root: HostNode): string[] {
  return nodes(root)
    .filter((node) => node.props.role === 'option')
    .map((node) => content(node).trim())
}

describe('ModelCombobox', () => {
  it('lists every model the provider offers, not just the selected one', async () => {
    // The selected id sits in the field; it must not act as a search needle.
    const { root } = await open('gpt-5.6-sol')

    expect(options(root)).toEqual(CHAT_MODELS)
  })

  it('narrows only on text the person typed', async () => {
    const { root, field } = await open('gpt-5.6-sol')
    await typeValue(field, 'mini')

    expect(options(root)).toEqual(['gpt-4.1-mini', 'o4-mini'])
  })

  it('keeps a long listing whole and scrollable', async () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ id: `model-${index}` }))
    const { root } = await open('model-0', many)

    expect(options(root)).toHaveLength(40)
    expect(String(element(root, (node) => node.props.role === 'listbox').props.class))
      .toContain('overflow-y-auto')
  })

  it('floats the list in a portal and closes it on Escape', async () => {
    const { root, field } = await open('gpt-5.6-sol')
    expect(element(root, (node) => 'data-portal-list' in node.props)).toBeDefined()

    await press(field, 'Escape')

    expect(options(root)).toEqual([])
  })

  it('holds a typed id back until it is entered', async () => {
    // Every keystroke would otherwise apply a partial id like "gpt".
    const { field, applied } = await open('gpt-5.6-sol')
    await typeValue(field, 'gpt-4.1')
    expect(applied).toEqual([])

    await press(field, 'Enter')
    expect(applied).toEqual(['gpt-4.1'])
  })

  it('applies a picked suggestion', async () => {
    const { root, applied } = await open('gpt-5.6-sol')
    await click(element(root, (node) => node.props.role === 'option' && content(node).trim() === 'gpt-4.1'))

    expect(applied).toEqual(['gpt-4.1'])
  })

  it('applies a changed id when the field is left', async () => {
    const { field, applied } = await open('gpt-5.6-sol')
    await typeValue(field, ' gpt-4.1 ')
    ;(field.props.onBlur as () => void)()
    await flush()

    expect(applied).toEqual(['gpt-4.1'])
  })

  it('leaves the model alone when nothing changed', async () => {
    const { field, applied } = await open('gpt-5.6-sol')
    ;(field.props.onBlur as () => void)()
    await flush()

    expect(applied).toEqual([])
  })

  it('puts the active model back on Escape', async () => {
    const { field, applied } = await open('gpt-5.6-sol')
    await typeValue(field, 'gp')
    await press(field, 'Escape')

    expect(field.props.value).toBe('gpt-5.6-sol')
    expect(applied).toEqual([])
  })

  it('keeps the list closed on focus until it is asked for', async () => {
    // The settings popover focuses the field on open; the list must not pop up with it.
    const drafts: string[] = []
    const { root } = await mountApp(ModelCombobox, {
      props: { modelValue: 'gpt-5.6-sol', suggestions: CHAT_MODELS.map((id) => ({ id })), 'onUpdate:draft': (value: string) => drafts.push(value) },
    })
    const field = element(root, (node) => node.tag === 'input')
    ;(field.props.onFocus as () => void)()
    await flush()
    expect(options(root)).toEqual([])

    await typeValue(field, 'gpt-4')
    expect(options(root).length).toBeGreaterThan(0)
    expect(drafts).toEqual(['gpt-4'])
  })

  it('marks an empty id invalid only where one is required', async () => {
    const { root } = await mountApp(ModelCombobox, { props: { modelValue: '', suggestions: [], required: true } })

    expect(element(root, (node) => node.tag === 'input').props.invalid).toBe('error')
  })
})
