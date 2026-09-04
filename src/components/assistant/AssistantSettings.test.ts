import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import type { AssistantProvider } from '@/lib/api'
import { effortLabel, isValidModelId, normalizeModelId } from '@/lib/assistant/modelOptions'

const selectModel = vi.fn()
const selectProvider = vi.fn()
const setApproveWrites = vi.fn()
const setReasoningEffort = vi.fn()

const openai: AssistantProvider = {
  provider_id: 'browser-1',
  kind: 'openai_compatible',
  label: 'OpenAI',
  models: [{ id: 'gpt-5.6-sol' }],
  default_model: 'gpt-5.6-sol',
  status: 'ready',
  created_at: '2026-08-01T00:00:00Z',
}

const chat = {
  provider: ref<AssistantProvider | null>(openai),
  providers: ref<AssistantProvider[]>([openai]),
  model: ref('gpt-5.6-sol'),
  modelChoices: ref([{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.5' }, { id: 'gpt-4.1' }]),
  modelsError: ref<string | null>(null),
  approveWrites: ref(true),
  reasoningEffort: ref('medium'),
  effortOptions: ref<string[]>(['minimal', 'low', 'medium', 'high']),
  selectProvider,
  selectModel,
  setApproveWrites,
  setReasoningEffort,
}

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const PopoverStub = defineComponent((_, { slots }) => () =>
  h('div', { 'data-popover': '' }, [slots.default?.(), slots.content?.()]))
const SelectStub = defineComponent({
  props: { modelValue: String, options: { type: Array, default: () => [] }, ariaLabel: String },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('div', { 'aria-label': props.ariaLabel }, (props.options as Array<{ value: string; label: string }>).map(
      (option) => h('button', { onClick: () => emit('update:modelValue', option.value) }, option.label),
    )),
})
// Typing reports a draft; a change event stands in for a pick or Enter.
const ComboboxStub = defineComponent({
  props: {
    modelValue: { type: String, default: '' },
    ariaLabel: String,
    suggestions: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue', 'update:draft'],
  setup: (props, { emit }) => () =>
    h('input', {
      'aria-label': props.ariaLabel,
      value: props.modelValue,
      'data-suggestions': (props.suggestions as Array<{ id: string }>).map((model) => model.id).join(','),
      onInput: (event: { target: { value: unknown } }) => emit('update:draft', String(event.target.value ?? '')),
      onChange: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
    }),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })
const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], default: '' } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})

const AssistantSettings = compileClientComponent(new URL('./AssistantSettings.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub },
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Popover.vue': moduleDefault(PopoverStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/assistant/ModelCombobox.vue': moduleDefault(ComboboxStub),
  '@/composables/useAssistantChat': { useAssistantChat: () => chat },
  '@/lib/assistant/modelOptions': { effortLabel, isValidModelId, normalizeModelId },
  '@lucide/vue': icons,
})

function combobox(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'Model')
}

beforeEach(() => {
  selectModel.mockClear()
  selectProvider.mockClear()
  setApproveWrites.mockClear()
  setReasoningEffort.mockClear()
  chat.providers.value = [openai]
  chat.modelsError.value = null
  chat.effortOptions.value = ['minimal', 'low', 'medium', 'high']
})

describe('AssistantSettings', () => {
  it('offers every model the provider listed', async () => {
    const { root } = await mountApp(AssistantSettings)

    expect(content(root)).toContain('OpenAI')
    expect(combobox(root).props['data-suggestions']).toBe('gpt-5.6-sol,gpt-5.5,gpt-4.1')
  })

  it('sets the model the picker committed', async () => {
    // The field applies an id on an explicit act, never on a keystroke.
    const { root } = await mountApp(AssistantSettings)
    await typeValue(combobox(root), 'gpt-4.1')
    expect(selectModel).not.toHaveBeenCalled()

    ;(combobox(root).props.onChange as (event: unknown) => void)({ target: { value: 'gpt-4.1' } })
    await flush()

    expect(selectModel).toHaveBeenCalledWith('gpt-4.1')
  })

  it('saves a typed id from the footer button once it differs', async () => {
    const { root } = await mountApp(AssistantSettings)
    expect(button(root, 'Save').props.disabled).toBe(true)

    await typeValue(combobox(root), ' gpt-4.1 ')
    expect(button(root, 'Save').props.disabled).toBe(false)

    await click(button(root, 'Save'))

    expect(selectModel).toHaveBeenCalledWith('gpt-4.1')
  })

  it('offers the provider list only when a second provider is ready', async () => {
    chat.providers.value = [openai, { ...openai, provider_id: 'browser-2', label: 'Local' }]
    const { root } = await mountApp(AssistantSettings)

    await click(button(root, 'Local'))

    expect(selectProvider).toHaveBeenCalledWith('browser-2')
  })

  it('reports a failed listing verbatim without blocking a typed id', async () => {
    chat.modelsError.value = 'Enter the key again in settings to list models.'
    const { root } = await mountApp(AssistantSettings)

    expect(content(root)).toContain('Enter the key again in settings to list models.')
    await typeValue(combobox(root), 'gpt-5.6-luna')
    await click(button(root, 'Save'))
    expect(selectModel).toHaveBeenCalledWith('gpt-5.6-luna')
  })

  it('links to the assistant tab of the settings page', async () => {
    const { root } = await mountApp(AssistantSettings)
    const link = element(root, (node) => node.tag === 'a')

    expect(JSON.parse(String(link.props['data-to']))).toEqual({ name: 'settings', query: { tab: 'assistant' } })
  })

  it('names both write modes and picks the automatic one', async () => {
    const { root } = await mountApp(AssistantSettings)

    expect(content(root)).toContain('Approve every write')
    await click(button(root, 'Run writes automatically'))

    expect(setApproveWrites).toHaveBeenCalledWith(false)
  })

  it('sets the reasoning effort the picker chose', async () => {
    const { root } = await mountApp(AssistantSettings)
    await click(button(root, 'High'))

    expect(setReasoningEffort).toHaveBeenCalledWith('high')
  })

  it('offers and selects xhigh when the model advertises it', async () => {
    chat.effortOptions.value = ['minimal', 'low', 'medium', 'high', 'xhigh']
    const { root } = await mountApp(AssistantSettings)

    await click(button(root, 'X-High'))

    expect(setReasoningEffort).toHaveBeenCalledWith('xhigh')
  })
})
