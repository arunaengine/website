import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  button,
  click,
  compileClientComponent,
  content,
  element,
  moduleDefault,
  mountApp,
  nodes,
} from '@/test/clientRender'
import type { ChatMessage } from '@/lib/assistant/types'

const newChat = vi.fn()
const hidePanel = vi.fn()
const ensureProviders = vi.fn()

const chat = {
  busy: ref(false),
  messages: ref<ChatMessage[]>([]),
  pending: ref(null),
  available: ref(true),
  chats: ref([{ id: 'c-1', title: 'Bucket layout', createdAt: 0, updatedAt: 0, messages: [], history: [] }]),
  activeChatId: ref('c-1'),
  historyReady: ref(true),
  hidePanel,
  openPanel: vi.fn(),
  newChat,
  ensureProviders,
}

const PageHeaderStub = defineComponent({
  props: { title: { type: String, default: '' } },
  setup: (props, { slots }) => () =>
    h('header', {}, [h('h1', props.title), slots.breadcrumbs?.(), slots.actions?.()]),
})
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const EmptyStateStub = defineComponent({
  props: { title: { type: String, default: '' } },
  setup: (props, { slots }) => () => h('div', { 'data-empty': '' }, [props.title, slots.default?.()]),
})
const HistoryStub = defineComponent({
  props: { readOnly: { type: Boolean, default: false } },
  setup: (props) => () => h('nav', { 'data-history': String(props.readOnly) }, 'chats'),
})
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
  '@/components/dashboard/PageHeader.vue': moduleDefault(PageHeaderStub),
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/assistant/AssistantHistory.vue': moduleDefault(HistoryStub),
  '@/components/assistant/ChatComposer.vue': moduleDefault(ComposerStub),
  '@/components/assistant/MessageList.vue': moduleDefault(MessageListStub),
  '@/composables/useAssistantChat': { useAssistantChat: () => chat },
  '@/composables/useAruna': { useAruna: () => ({ currentUser: ref({ id: 'u-1' }) }) },
})

function has(root: Parameters<typeof content>[0], key: string): boolean {
  return nodes(root).some((node) => key in node.props)
}

describe('AssistantView', () => {
  it('fills the view with the conversation and pins the composer', async () => {
    // The page owns the viewport height; only the message list may scroll.
    const { root } = await mountApp(AssistantView)

    expect(element(root, (node) => String(node.props.class ?? '').includes('h-full')).props.class)
      .toContain('flex-col')
    expect(has(root, 'data-messages')).toBe(true)
    expect(has(root, 'data-composer')).toBe(true)
    expect(has(root, 'data-empty')).toBe(false)
    expect(ensureProviders).toHaveBeenCalled()
  })

  it('keeps scoped history visible when providers are unavailable', async () => {
    chat.available.value = false
    const { root } = await mountApp(AssistantView)

    expect(element(root, (node) => node.props['data-history'] !== undefined).props['data-history']).toBe('true')
    expect(has(root, 'data-empty')).toBe(true)
    expect(has(root, 'data-composer')).toBe(false)
    expect(content(root)).toContain('No AI provider is ready yet.')
    chat.available.value = true
  })

  it('names the open chat and toggles the history away', async () => {
    const { root } = await mountApp(AssistantView)
    expect(content(root)).toContain('Bucket layout')

    await click(button(root, 'Chats'))

    expect(has(root, 'data-history')).toBe(false)
  })

  it('starts a new chat from the header', async () => {
    const { root } = await mountApp(AssistantView)
    await click(button(root, 'New chat'))

    expect(newChat).toHaveBeenCalledOnce()
  })
})
