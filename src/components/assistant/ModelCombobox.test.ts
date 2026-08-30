import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import {
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
  'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5',
  'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'o3', 'o4-mini', 'chatgpt-4o-latest',
]

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
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/lib/assistant/modelOptions': { isValidModelId, normalizeModelId },
  '@/lib/utils': { cn },
})

async function open(modelValue: string, suggestions = CHAT_MODELS.map((id) => ({ id }))) {
  const { root } = await mountApp(ModelCombobox, { props: { modelValue, suggestions } })
  const field = element(root, (node) => node.tag === 'input')
  ;(field.props.onFocus as () => void)()
  await flush()
  return { root, field }
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

  it('marks an empty id invalid only where one is required', async () => {
    const { root } = await mountApp(ModelCombobox, { props: { modelValue: '', suggestions: [], required: true } })

    expect(element(root, (node) => node.tag === 'input').props.invalid).toBe('error')
  })
})
