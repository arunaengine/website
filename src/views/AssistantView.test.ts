import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  click,
  compileClientComponent,
  content,
  element,
  flush,
  moduleDefault,
  mountApp,
  nodes,
} from '@/test/clientRender'
import type { ChatMessage } from '@/lib/assistant/types'

const newChat = vi.fn()
const hidePanel = vi.fn()
const ensureProviders = vi.fn()
const loadModels = vi.fn()
const renameChat = vi.fn()
const stored = new Map<string, string>()

const chat = {
  busy: ref(false),
  draft: ref(''),
  messages: ref<ChatMessage[]>([]),
  pending: ref(null),
  available: ref(true),
  chats: ref([{ id: 'c-1', title: 'Bucket layout', createdAt: 0, updatedAt: 0, messages: [], history: [] }]),
  activeChatId: ref('c-1'),
  historyReady: ref(true),
  provider: ref({ label: 'OpenAI' }),
  model: ref('gpt-5.6-sol'),
  loadModels,
  hidePanel,
  openPanel: vi.fn(),
  newChat,
  renameChat,
  ensureProviders,
}

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const InputStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup: (props, { attrs }) => () => h('input', { ...attrs, value: props.modelValue }),
})
const EmptyStateStub = defineComponent({
  props: { title: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('div', { 'data-empty': '' }, [props.title, slots.default?.()]),
})
const HistoryStub = defineComponent({
  props: { readOnly: { type: Boolean, default: false } },
  setup: (props) => () => h('nav', { 'data-history': String(props.readOnly) }, 'chats'),
})
const SettingsStub = defineComponent((_, { slots }) => () => h('div', { 'data-settings': '' }, slots.default?.()))
const ComposerStub = defineComponent(() => () => h('div', { 'data-composer': '' }, 'composer'))
const MessageListStub = defineComponent(() => () => h('ol', { 'data-messages': '' }, 'messages'))
const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], default: '' } },
  setup: (props, { slots }) => () => h('a', { 'data-to': JSON.stringify(props.to) }, slots.default?.()),
})
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const AssistantView = compileClientComponent(new URL('./AssistantView.vue', import.meta.url), {
  vue: VueRuntime,
  'vue-router': { RouterLink: RouterLinkStub, useRouter: () => ({ back: vi.fn(), push: vi.fn() }) },
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/assistant/AssistantHistory.vue': moduleDefault(HistoryStub),
  '@/components/assistant/AssistantSettings.vue': moduleDefault(SettingsStub),
  '@/components/assistant/ChatComposer.vue': moduleDefault(ComposerStub),
  '@/components/assistant/MessageList.vue': moduleDefault(MessageListStub),
  '@/composables/useAssistantChat': { useAssistantChat: () => chat },
  '@/composables/useAssistantEditor': { useAssistantEditor: () => ({ bridge: ref(null) }) },
  '@/composables/useAruna': { useAruna: () => ({ currentUser: ref({ id: 'u-1' }) }) },
  '@/composables/aruna/state': {
    readStored: (key: string) => stored.get(key) ?? '',
    storeValue: (key: string, value: string) => {
      if (value) stored.set(key, value)
      else stored.delete(key)
    },
  },
})

function has(root: Parameters<typeof content>[0], key: string): boolean {
  return nodes(root).some((node) => key in node.props)
}

function control(root: Parameters<typeof content>[0], label: string) {
  return element(root, (node) => node.props['aria-label'] === label)
}

beforeEach(() => {
  newChat.mockClear()
  renameChat.mockClear()
  loadModels.mockClear()
  stored.clear()
  chat.available.value = true
  chat.messages.value = []
  chat.draft.value = ''
})

describe('AssistantView', () => {
  it('fills the view with the chat column and hides the list by default', async () => {
    // The page owns the viewport height; only the message list may scroll.
    const { root } = await mountApp(AssistantView)

    expect(String(root.children[0].props.class)).toContain('h-full')
    expect(has(root, 'data-history')).toBe(false)
    expect(has(root, 'data-composer')).toBe(true)
    expect(has(root, 'data-empty')).toBe(false)
    expect(ensureProviders).toHaveBeenCalled()
  })

  it('greets an empty chat with prompts that fill the message box', async () => {
    const { root } = await mountApp(AssistantView)
    expect(content(root)).toContain('What can I help you with?')
    expect(has(root, 'data-messages')).toBe(false)

    const chips = nodes(root).filter((node) => String(node.props.class ?? '').includes('rounded-full'))
    await click(chips[0])

    expect(chat.draft.value).toBe('Help me describe a dataset I want to publish.')
  })

  it('shows the conversation once a turn exists', async () => {
    chat.messages.value = [{ id: 'm-1', role: 'user', text: 'hi', calls: [] }]
    const { root } = await mountApp(AssistantView)

    expect(has(root, 'data-messages')).toBe(true)
    expect(content(root)).not.toContain('What can I help you with?')
  })

  it('remembers the chat list toggle', async () => {
    const first = await mountApp(AssistantView)
    await click(control(first.root, 'Toggle the chat list'))
    expect(has(first.root, 'data-history')).toBe(true)

    const second = await mountApp(AssistantView)
    expect(has(second.root, 'data-history')).toBe(true)

    await click(control(second.root, 'Toggle the chat list'))
    expect(stored.size).toBe(0)
  })

  it('renames the open chat from its title', async () => {
    const { root } = await mountApp(AssistantView)
    expect(content(root)).toContain('Bucket layout')

    await click(element(root, (node) => node.props.title === 'Rename Bucket layout'))
    const field = control(root, 'Chat name')
    expect(field.props.value).toBe('Bucket layout')
    for (const handler of [field.props.onKeydown].flat() as Array<(event: unknown) => void>) {
      handler({ key: 'Enter', preventDefault: () => {} })
    }
    await flush()

    expect(renameChat).toHaveBeenCalledWith('c-1', 'Bucket layout')
  })

  it('keeps the empty provider state and its settings link', async () => {
    chat.available.value = false
    const { root } = await mountApp(AssistantView)

    expect(has(root, 'data-empty')).toBe(true)
    expect(has(root, 'data-composer')).toBe(false)
    expect(content(root)).toContain('No AI provider is ready yet.')
    expect(JSON.parse(String(element(root, (node) => node.tag === 'a').props['data-to'])))
      .toEqual({ name: 'settings', query: { tab: 'assistant' } })
  })

  it('starts a new chat from the list header', async () => {
    stored.set('aruna.assistant.sidebar', 'open')
    const { root } = await mountApp(AssistantView)
    await click(element(root, (node) => node.tag === 'button' && content(node).trim().startsWith('New chat')))

    expect(newChat).toHaveBeenCalledOnce()
  })

  it('asks for the model list from the header pill', async () => {
    const { root } = await mountApp(AssistantView)
    expect(content(control(root, 'Model and provider'))).toContain('gpt-5.6-sol')

    await click(control(root, 'Model and provider'))

    expect(loadModels).toHaveBeenCalledOnce()
  })
})
