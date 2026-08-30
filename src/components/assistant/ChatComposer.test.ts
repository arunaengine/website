import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
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
  draft: ref(''),
  toolsNote: ref<string | null>(null),
  provider: ref<AssistantProvider | null>(openai),
  model: ref('gpt-5.6-sol'),
  historyReady: ref(true),
  loadModels,
  send,
}

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const NoticeStub = defineComponent((_, { slots }) => () => h('div', { 'data-notice': '' }, slots.default?.()))
const SettingsStub = defineComponent((_, { slots }) => () => h('div', { 'data-settings': '' }, slots.default?.()))
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
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const ChatComposer = compileClientComponent(new URL('./ChatComposer.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { useRoute: () => ({ fullPath: '/app/assistant' }) },
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/Notice.vue': moduleDefault(NoticeStub),
  '@/components/ui/Textarea.vue': moduleDefault(TextareaStub),
  '@/components/assistant/AssistantSettings.vue': moduleDefault(SettingsStub),
  '@/composables/useAruna': { useAruna: () => ({ profiles: ref([]) }) },
  '@/composables/useAssistantChat': { useAssistantChat: () => chat },
  '@/composables/useAssistantEditor': { useAssistantEditor: () => ({ bridge: ref(null) }) },
})

function control(root: Parameters<typeof content>[0], label: string) {
  return element(root, (node) => node.props['aria-label'] === label)
}

beforeEach(() => {
  loadModels.mockClear()
  send.mockClear()
  chat.draft.value = ''
  chat.toolsNote.value = null
  chat.busy.value = false
})

describe('ChatComposer', () => {
  it('sends only once a message is typed', async () => {
    const { root } = await mountApp(ChatComposer, { props: { size: 'full' } })
    expect(control(root, 'Send').props.disabled).toBe(true)

    await typeValue(control(root, 'Message'), 'hi')
    await click(control(root, 'Send'))

    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0]).toBe('hi')
    expect(chat.draft.value).toBe('')
  })

  it('keeps the shared draft while a turn is running', async () => {
    chat.busy.value = true
    chat.draft.value = 'half a question'
    const { root } = await mountApp(ChatComposer)

    expect(control(root, 'Message').props.value).toBe('half a question')
    await click(control(root, 'Send'))

    expect(send).not.toHaveBeenCalled()
  })

  it('asks for the model list when the cogwheel opens the settings', async () => {
    const { root } = await mountApp(ChatComposer)
    await click(control(root, 'Chat settings'))

    expect(loadModels).toHaveBeenCalledOnce()
  })

  it('explains the tool state and the send keys on the page', async () => {
    chat.toolsNote.value = 'The node tools are unavailable.'
    const { root } = await mountApp(ChatComposer, { props: { size: 'full' } })

    expect(content(root)).toContain('The node tools are unavailable.')
    expect(content(root)).toContain('Enter sends, Shift+Enter starts a new line.')
  })
})
