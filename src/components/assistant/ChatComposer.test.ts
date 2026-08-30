import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  typeValue,
} from '@/test/clientRender'
import type { AssistantProvider } from '@/lib/api'

const loadModels = vi.fn()
const selectModel = vi.fn()
const selectProvider = vi.fn()
const setApproveWrites = vi.fn()
const send = vi.fn()

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
  busy: ref(false),
  toolsNote: ref<string | null>(null),
  provider: ref<AssistantProvider | null>(openai),
  providers: ref<AssistantProvider[]>([openai]),
  model: ref('gpt-5.6-sol'),
  modelChoices: ref([{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.5' }, { id: 'gpt-4.1' }]),
  modelsError: ref<string | null>(null),
  loadModels,
  approveWrites: ref(true),
  historyReady: ref(true),
  selectProvider,
  selectModel,
  setApproveWrites,
  send,
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
const SwitchStub = defineComponent({
  props: { checked: Boolean },
  emits: ['update:checked'],
  setup: (props, { emit }) => () =>
    h('button', { role: 'switch', 'aria-checked': String(props.checked), onClick: () => emit('update:checked', !props.checked) }),
})
const TextareaStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs, emit }) => () =>
    h('textarea', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
    }),
})
const ComboboxStub = defineComponent({
  props: { modelValue: { type: String, default: '' }, ariaLabel: String, suggestions: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () =>
    h('input', {
      'aria-label': props.ariaLabel,
      value: props.modelValue,
      'data-suggestions': (props.suggestions as Array<{ id: string }>).map((model) => model.id).join(','),
      onInput: (event: { target: { value: unknown } }) => emit('update:modelValue', String(event.target.value ?? '')),
    }),
})
const NoticeStub = defineComponent((_, { slots }) => () => h('div', slots.default?.()))
const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], default: '' } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const ChatComposer = compileClientComponent(new URL('./ChatComposer.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub, useRoute: () => ({ fullPath: '/app/assistant' }) },
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Popover.vue': moduleDefault(PopoverStub),
  '@/components/ui/Select.vue': moduleDefault(SelectStub),
  '@/components/ui/Switch.vue': moduleDefault(SwitchStub),
  '@/components/ui/Textarea.vue': moduleDefault(TextareaStub),
  '@/components/assistant/ModelCombobox.vue': moduleDefault(ComboboxStub),
  '@/composables/useAruna': { useAruna: () => ({ profiles: ref([]) }) },
  '@/composables/useAssistantChat': { useAssistantChat: () => chat },
  '@/composables/useAssistantEditor': { useAssistantEditor: () => ({ bridge: ref(null) }) },
})

function combobox(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'Model')
}

function cogwheel(root: Parameters<typeof content>[0]) {
  return element(root, (node) => node.props['aria-label'] === 'Chat settings')
}

beforeEach(() => {
  loadModels.mockClear()
  selectModel.mockClear()
  selectProvider.mockClear()
  setApproveWrites.mockClear()
  send.mockClear()
  chat.providers.value = [openai]
  chat.modelsError.value = null
})

describe('ChatComposer settings popover', () => {
  it('lists the provider models and asks for them when opened', async () => {
    const { root } = await mountApp(ChatComposer, { props: { size: 'full' } })
    await click(cogwheel(root))

    expect(loadModels).toHaveBeenCalledOnce()
    expect(content(root)).toContain('OpenAI')
    expect(combobox(root).props['data-suggestions']).toBe('gpt-5.6-sol,gpt-5.5,gpt-4.1')
  })

  it('sets the model the picker chose', async () => {
    const { root } = await mountApp(ChatComposer)
    await typeValue(combobox(root), 'gpt-4.1')

    expect(selectModel).toHaveBeenCalledWith('gpt-4.1')
  })

  it('offers the provider list only when a second provider is ready', async () => {
    const second = { ...openai, provider_id: 'browser-2', label: 'Local' }
    chat.providers.value = [openai, second]
    const { root } = await mountApp(ChatComposer)

    await click(button(root, 'Local'))

    expect(selectProvider).toHaveBeenCalledWith('browser-2')
  })

  it('links to the assistant tab of the settings page', async () => {
    const { root } = await mountApp(ChatComposer)
    const link = element(root, (node) => node.tag === 'a')

    expect(JSON.parse(String(link.props['data-to']))).toEqual({ name: 'settings', query: { tab: 'assistant' } })
  })

  it('reports a failed model listing without blocking a typed id', async () => {
    chat.modelsError.value = 'HTTP 401'
    const { root } = await mountApp(ChatComposer)

    expect(content(root)).toContain('HTTP 401')
    await typeValue(combobox(root), 'gpt-5.6-luna')
    expect(selectModel).toHaveBeenCalledWith('gpt-5.6-luna')
  })
})

describe('ChatComposer send', () => {
  it('sends only once a message is typed', async () => {
    const { root } = await mountApp(ChatComposer)
    expect(button(root, 'Send').props.disabled).toBe(true)

    await typeValue(element(root, (node) => node.tag === 'textarea'), 'hi')
    await click(button(root, 'Send'))

    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0]).toBe('hi')
  })
})
