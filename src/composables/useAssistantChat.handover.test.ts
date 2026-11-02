// The floating panel and the full page are two views of one chat: switching
// between them keeps the chat on screen, its running answer and the unsent text.
import * as VueRuntime from 'vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantProvider, UserInfoResponse } from '@/lib/api'
import type { ChatMessage } from '@/lib/assistant/types'
import { click, compileClientComponent, content, element, moduleDefault, mountApp } from '@/test/clientRender'

const provider = {
  provider_id: 'p-1',
  kind: 'anthropic',
  label: 'Anthropic',
  models: [{ id: 'm-1' }],
  default_model: 'm-1',
  status: 'ready',
  created_at: new Date(0).toISOString(),
} as AssistantProvider

vi.mock('./useAssistantProviders', () => ({
  useAssistantProviders: () => ({
    ready: ref([provider]),
    providers: ref([provider]),
    listedModels: ref({}),
    modelErrors: ref({}),
    direct: () => undefined,
    load: async () => {},
    listModels: async () => [],
    ensureLoaded: () => {},
  }),
}))

// An answer that streams its first half, then waits until the test opens the gate.
const stream = vi.hoisted(() => ({ gate: null as null | Promise<void>, open: () => {}, tail: null as null | Promise<void> }))

vi.mock('@/lib/assistant/chat', () => ({
  runTurn: async (options: { onText: (delta: string) => void }) => {
    options.onText('first half ')
    if (stream.gate) await stream.gate
    options.onText('second half')
    if (stream.tail) await stream.tail
    return { messages: [{ role: 'assistant', content: 'first half second half' }], error: null }
  },
}))
vi.mock('@/lib/assistant/models', () => ({ buildModel: () => ({ id: 'm-1' }) }))
vi.mock('@/lib/assistant/browserModels', () => ({ buildBrowserModel: () => ({ id: 'm-1' }) }))
vi.mock('@/lib/assistant/prompt', () => ({ systemPrompt: () => 'system' }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  // A node without the chat routes keeps every chat in this browser.
  listChats: async () => {
    throw new Error('no chat routes')
  },
}))

const stored = new Map<string, string>()
vi.stubGlobal('window', {
  history: { length: 2 },
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value)
    },
    removeItem: (key: string) => {
      stored.delete(key)
    },
  },
})

const { createAssistantChatStore, newAssistantChat } = await import('@/lib/assistant/chatHistory')
const aruna = await import('./aruna/state')
const assistant = await import('./useAssistantChat')
const chat = assistant.useAssistantChat()

const router = { push: vi.fn(async () => {}), back: vi.fn() }
const icons = new Proxy({}, { get: () => defineComponent(() => () => h('i')) })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup: (_, { attrs, slots }) => () => h('button', attrs, slots.default?.()),
})
const PassthroughStub = defineComponent((_, { attrs, slots }) => () => h('div', attrs, slots.default?.()))
const MessageListStub = defineComponent({
  props: { messages: { type: Array as () => ChatMessage[], default: () => [] } },
  setup: (props) => () => h('ol', props.messages.map((message) => h('li', `${message.role}: ${message.text}|`))),
})
const shared = {
  vue: VueRuntime,
  'vue-router': { RouterLink: PassthroughStub, useRouter: () => router },
  '@lucide/vue': icons,
  '@/components/ui/Button.vue': moduleDefault(ButtonStub),
  '@/components/assistant/AssistantFileDialog.vue': moduleDefault(PassthroughStub),
  '@/components/assistant/ChatComposer.vue': moduleDefault(PassthroughStub),
  '@/components/assistant/MessageList.vue': moduleDefault(MessageListStub),
  '@/composables/useAssistantChat': { ...assistant, ensureKnownBuckets: () => {} },
}
const AssistantPanel = compileClientComponent(new URL('../components/assistant/AssistantPanel.vue', import.meta.url), shared)
const AssistantView = compileClientComponent(new URL('../views/AssistantView.vue', import.meta.url), {
  ...shared,
  '@/components/ui/EmptyState.vue': moduleDefault(PassthroughStub),
  '@/components/ui/Input.vue': moduleDefault(PassthroughStub),
  '@/components/ui/Sheet.vue': moduleDefault(PassthroughStub),
  '@/components/ui/SheetContent.vue': moduleDefault(PassthroughStub),
  '@/components/ui/DialogTitle.vue': moduleDefault(PassthroughStub),
  '@/components/ui/DocsLink.vue': moduleDefault(PassthroughStub),
  '@/components/assistant/AssistantHistory.vue': moduleDefault(PassthroughStub),
  '@/components/assistant/AssistantSettings.vue': moduleDefault(PassthroughStub),
  '@/composables/useAssistantEditor': { useAssistantEditor: () => ({ bridge: ref(null) }) },
  '@/composables/useAruna': { useAruna: () => ({ currentUser: ref({ id: 'u-1' }) }) },
  '@/composables/usePortalFeatures': { usePortalFeatures: () => ({ shown: () => true }) },
  '@/composables/assistantState': { assistantPageOpen: ref(false) },
  '@/composables/useAssistantObject': { provideLeaveHandler: () => {} },
  '@/composables/aruna/state': aruna,
})

let users = 0

/** A fresh user with an older chat on screen and a newer one beside it. */
function login(active = 'c-old') {
  users += 1
  const scope = { apiBaseUrl: 'https://node.test', realmId: 'r-1', userId: `u-${users}` }
  const said = (text: string): ChatMessage => ({ id: `m-${text}`, role: 'user', text, calls: [], at: 1 })
  createAssistantChatStore(scope).save({
    activeChatId: active,
    chats: [
      { ...newAssistantChat('Buckets'), id: 'c-old', updatedAt: 1_000, messages: [said('old question')] },
      { ...newAssistantChat('Profiles'), id: 'c-new', updatedAt: 9_000, messages: [said('new question')] },
    ],
  })
  aruna.apiBaseUrl.value = scope.apiBaseUrl
  aruna.authToken.value = 'token'
  aruna.userInfo.value = {
    user: { user_id: scope.userId, name: 'Ada', attributes: {} },
    realm: { realm_id: scope.realmId, roles: [] },
    groups: [],
    preferences: {},
  } as unknown as UserInfoResponse
}

function hold() {
  stream.gate = new Promise<void>((resolve) => {
    stream.open = () => {
      stream.gate = null
      resolve()
    }
  })
}

function control(root: Parameters<typeof element>[0], label: string) {
  return element(root, (node) => node.props['aria-label'] === label)
}

/** The panel showing the old chat, as the user left it. */
async function panelOnOldChat() {
  login()
  chat.showPanel()
  const panel = await mountApp(AssistantPanel)
  expect(chat.activeChatId.value).toBe('c-old')
  return panel
}

beforeEach(() => {
  chat.available.value = true
  stream.gate = null
  chat.draft.value = ''
})

describe('panel and full page', () => {
  it('keep the chat on screen when the full page opens', async () => {
    const panel = await panelOnOldChat()

    await click(control(panel.root, 'Open the full view'))
    expect(chat.activeChatId.value).toBe('c-old')
    const page = await mountApp(AssistantView)

    expect(chat.activeChatId.value).toBe('c-old')
    expect(content(page.root)).toContain('old question')
    page.app.unmount()
    panel.app.unmount()
  })

  it('keep a new chat when the old one was written to later', async () => {
    const panel = await panelOnOldChat()
    await click(control(panel.root, 'Start a new chat'))
    const fresh = chat.activeChatId.value
    chat.draft.value = 'unsent text'
    // A watcher's answer or the node's clock can date an older chat later.
    for (const entry of chat.chats.value) if (entry.id !== fresh) entry.updatedAt = Date.now() + 60_000

    await click(control(panel.root, 'Open the full view'))
    const page = await mountApp(AssistantView)

    expect(chat.activeChatId.value).toBe(fresh)
    expect(chat.messages.value).toEqual([])
    expect(chat.draft.value).toBe('unsent text')
    page.app.unmount()
    panel.app.unmount()
  })

  it('keep a streaming answer in its chat both ways', async () => {
    const panel = await panelOnOldChat()
    hold()
    const running = chat.send('a question', { route: '/' })
    await vi.waitFor(() => expect(content(panel.root)).toContain('assistant: first half'))

    await click(control(panel.root, 'Open the full view'))
    const page = await mountApp(AssistantView)
    expect(chat.activeChatId.value).toBe('c-old')
    expect(content(page.root)).toContain('assistant: first half')

    await click(control(page.root, 'Continue in the panel'))
    page.app.unmount()
    stream.open()
    await running

    expect(chat.open.value).toBe(true)
    expect(chat.activeChatId.value).toBe('c-old')
    expect(content(panel.root)).toContain('assistant: first half second half|')
    const saved = createAssistantChatStore({ apiBaseUrl: 'https://node.test', realmId: 'r-1', userId: `u-${users}` })
      .load().chats.find((entry) => entry.id === 'c-old')
    expect(saved?.messages.map((message) => message.text)).toEqual(['old question', 'a question', 'first half second half'])
    panel.app.unmount()
  })

  it('show a new chat started on the page in the panel', async () => {
    const panel = await panelOnOldChat()
    await click(control(panel.root, 'Open the full view'))
    const page = await mountApp(AssistantView)

    await click(control(page.root, 'Start a new chat'))
    const fresh = chat.activeChatId.value
    await click(control(page.root, 'Continue in the panel'))
    page.app.unmount()

    expect(fresh).not.toBe('c-old')
    expect(chat.activeChatId.value).toBe(fresh)
    expect(content(panel.root)).not.toContain('old question')
    panel.app.unmount()
  })
})

describe('a stopped answer', () => {
  it('keeps its question when New chat stops it', async () => {
    const panel = await panelOnOldChat()
    hold()
    const running = chat.send('a question', { route: '/' })
    await vi.waitFor(() => expect(content(panel.root)).toContain('assistant: first half'))

    await click(control(panel.root, 'Start a new chat'))
    stream.open()
    await running
    chat.selectChat('c-old')

    expect(chat.messages.value.map((message) => message.text)).toEqual(['old question', 'a question', 'first half '])
    expect(chat.messages.value.at(-1)?.error).toBeTruthy()
    panel.app.unmount()
  })

  it('keeps its question when another chat is opened', async () => {
    const panel = await panelOnOldChat()
    hold()
    const running = chat.send('a question', { route: '/' })
    await vi.waitFor(() => expect(content(panel.root)).toContain('assistant: first half'))

    chat.selectChat('c-new')
    stream.open()
    await running
    chat.selectChat('c-old')

    expect(chat.messages.value.map((message) => message.text)).toEqual(['old question', 'a question', 'first half '])
    expect(chat.messages.value.at(-1)?.error).toBeTruthy()
    panel.app.unmount()
  })
})

describe('deleting another chat', () => {
  it('keeps the text streamed since the last save', async () => {
    const panel = await panelOnOldChat()
    hold()
    let finish = () => {}
    stream.tail = new Promise<void>((resolve) => {
      finish = resolve
    })
    const running = chat.send('a question', { route: '/' })
    await vi.waitFor(() => expect(content(panel.root)).toContain('assistant: first half'))
    chat.renameChat('c-new', 'Renamed')
    stream.open()
    await vi.waitFor(() => expect(chat.messages.value.at(-1)?.text).toBe('first half second half'))

    chat.deleteChat('c-new')
    stream.tail = null
    finish()
    await running

    expect(chat.messages.value.at(-1)?.text).toBe('first half second half')
    panel.app.unmount()
  })
})

describe('reopening the panel', () => {
  it('keeps the new chat it was closed on', async () => {
    const panel = await panelOnOldChat()
    await click(control(panel.root, 'Start a new chat'))
    const fresh = chat.activeChatId.value
    await click(control(panel.root, 'Close the assistant'))
    for (const entry of chat.chats.value) if (entry.id !== fresh) entry.updatedAt = Date.now() + 60_000

    chat.openPanel()

    expect(chat.activeChatId.value).toBe(fresh)
    expect(chat.messages.value).toEqual([])
    panel.app.unmount()
  })

  it('opens the newest chat when the one it was closed on is gone', async () => {
    login('gone')

    chat.openPanel()

    expect(chat.activeChatId.value).toBe('c-new')
  })
})
