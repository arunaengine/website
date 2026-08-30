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
} from '@/test/clientRender'
import type { AssistantChatRecord } from '@/lib/assistant/chatHistory'
import { relativeTime } from '@/lib/utils'

const selectChat = vi.fn()
const deleteChat = vi.fn()
const renameChat = vi.fn()

function record(id: string, title: string, messages: number): AssistantChatRecord {
  return {
    id,
    title,
    createdAt: 0,
    updatedAt: Date.now() - 120_000,
    messages: Array.from({ length: messages }, (_, index) => ({
      id: `${id}-${index}`,
      role: 'user' as const,
      text: 'hi',
      calls: [],
    })),
    history: [],
  }
}

const chat = {
  chats: ref<AssistantChatRecord[]>([record('c-1', 'Bucket layout', 2), record('c-2', 'Crate profile', 1)]),
  activeChatId: ref('c-1'),
  historyReady: ref(true),
  selectChat,
  deleteChat,
  renameChat,
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
  setup: (props) => () => h('div', { 'data-empty': '' }, props.title),
})
const SpinnerStub = defineComponent(() => () => h('span', { 'data-spinner': '' }))
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })

const AssistantHistory = compileClientComponent(new URL('./AssistantHistory.vue', import.meta.url), {
  vue: VueRuntime,
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/ui/EmptyState.vue': moduleDefault(EmptyStateStub),
  '@/components/ui/Input.vue': moduleDefault(InputStub),
  '@/components/ui/Spinner.vue': moduleDefault(SpinnerStub),
  '@/composables/useAssistantChat': { useAssistantChat: () => chat },
  '@/lib/utils': { relativeTime },
})

beforeEach(() => {
  selectChat.mockClear()
  deleteChat.mockClear()
  renameChat.mockClear()
  chat.chats.value = [record('c-1', 'Bucket layout', 2), record('c-2', 'Crate profile', 1)]
  chat.activeChatId.value = 'c-1'
})

describe('AssistantHistory', () => {
  it('lists every chat with its age and size, active one marked', async () => {
    const { root } = await mountApp(AssistantHistory)
    const text = content(root)

    expect(text).toContain('Bucket layout')
    expect(text).toContain('Crate profile')
    expect(text).toContain('2m ago')
    expect(text).toContain('2 messages')
    expect(text).toContain('1 message')
    expect(element(root, (node) => node.props['aria-current'] === 'page')).toBeDefined()
  })

  it('selects and deletes the chat a row acts on', async () => {
    const { root } = await mountApp(AssistantHistory)
    await click(element(root, (node) => content(node).includes('Crate profile') && node.tag === 'button'))
    expect(selectChat).toHaveBeenCalledWith('c-2')

    await click(element(root, (node) => node.props['aria-label'] === 'Delete Crate profile'))
    expect(deleteChat).toHaveBeenCalledWith('c-2')
  })

  it('renames a chat from the row control', async () => {
    const { root } = await mountApp(AssistantHistory)
    await click(element(root, (node) => node.props['aria-label'] === 'Rename Bucket layout'))
    await click(element(root, (node) => node.props['aria-label'] === 'Save chat name'))

    expect(renameChat).toHaveBeenCalledWith('c-1', 'Bucket layout')
  })

  it('hides the row controls while no provider may write', async () => {
    const { root } = await mountApp(AssistantHistory, { props: { readOnly: true } })

    expect(() => element(root, (node) => node.props['aria-label'] === 'Delete Bucket layout')).toThrow()
    expect(content(root)).toContain('Bucket layout')
  })

  it('shows the empty state when no chat was started', async () => {
    chat.chats.value = []
    const { root } = await mountApp(AssistantHistory)

    expect(element(root, (node) => 'data-empty' in node.props)).toBeDefined()
  })
})
