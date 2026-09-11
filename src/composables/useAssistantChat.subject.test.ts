// Ask AI on a page the user already asked about continues that page's chat,
// even after the panel was closed and other chats were written meanwhile.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { AssistantProvider, UserInfoResponse } from '@/lib/api'

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

// A turn that only finishes once the test lets it, so a close can land midway.
const turn = vi.hoisted(() => ({ holding: false, release: null as null | (() => void) }))

vi.mock('@/lib/assistant/chat', () => ({
  runTurn: async () => {
    if (turn.holding) await new Promise<void>((resolve) => { turn.release = resolve })
    return { messages: [{ role: 'assistant', content: 'answered' }], error: null }
  },
}))
vi.mock('@/lib/assistant/models', () => ({ buildModel: () => ({ id: 'm-1' }) }))
vi.mock('@/lib/assistant/browserModels', () => ({ buildBrowserModel: () => ({ id: 'm-1' }) }))
vi.mock('@/lib/assistant/prompt', () => ({ systemPrompt: () => 'system' }))

const stored = new Map<string, string>()
vi.stubGlobal('window', {
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
const { apiBaseUrl, authToken, userInfo } = await import('./aruna/state')

const scope = { apiBaseUrl: 'https://node.test', realmId: 'r-1', userId: 'u-1' }

let useAssistantChat: typeof import('./useAssistantChat').useAssistantChat

// Two chats of the user's own, so Ask AI never lands on an empty history.
function seed() {
  const older = { ...newAssistantChat('Bucket layout'), id: 'c-old', updatedAt: 1_000 }
  const newer = { ...newAssistantChat('Crate profile'), id: 'c-new', updatedAt: 9_000 }
  const message = { id: 'm-seed', role: 'user', text: 'hello', at: 1 }
  createAssistantChatStore(scope).save({
    activeChatId: older.id,
    chats: [{ ...older, messages: [message] }, { ...newer, messages: [message] }],
  } as never)
  apiBaseUrl.value = scope.apiBaseUrl
  authToken.value = 'token'
  userInfo.value = {
    user: { user_id: scope.userId, name: 'Ada', attributes: {} },
    realm: { realm_id: scope.realmId, roles: [] },
    groups: [],
    preferences: {},
  } as unknown as UserInfoResponse
}

beforeAll(async () => {
  seed()
  useAssistantChat = (await import('./useAssistantChat')).useAssistantChat
})

describe('openWith', () => {
  it('reopens the chat the page already asked in', async () => {
    const chat = useAssistantChat()
    chat.openWith('Help me set up this run.', 'the run form')
    await chat.send('Help me set up this run.', { route: '/compute/submit' })
    const opened = chat.activeChatId.value

    chat.closePanel()
    chat.openWith('Help me set up this run.', 'the run form')

    expect(chat.activeChatId.value).toBe(opened)
    expect(chat.messages.value.length).toBeGreaterThan(0)
  })

  it('finds that chat when another one was written later', async () => {
    const chat = useAssistantChat()
    chat.openWith('Help me with this notebook.', 'the notebook')
    await chat.send('Help me with this notebook.', { route: '/notebook' })
    const opened = chat.activeChatId.value
    chat.closePanel()

    // An unrelated chat becomes the one written to last.
    chat.selectChat('c-old')
    await chat.send('And what about buckets?', { route: '/buckets' })
    chat.closePanel()

    chat.openWith('Help me with this notebook.', 'the notebook')

    expect(chat.activeChatId.value).toBe(opened)
    expect(chat.messages.value.some((message) => message.text === 'Help me with this notebook.')).toBe(true)
  })

  it('starts a chat for a subject without one', () => {
    const chat = useAssistantChat()
    const before = chat.activeChatId.value

    chat.openWith('Explain this dataset.', 'dataset 01ARZ')

    expect(chat.activeChatId.value).not.toBe(before)
    expect(chat.messages.value).toEqual([])
    expect(chat.draft.value).toBe('Explain this dataset.')
  })
})

describe('closePanel', () => {
  it('keeps the question of a stopped answer', async () => {
    const chat = useAssistantChat()
    chat.openWith('Help me build this profile.', 'the profile form')
    turn.holding = true
    const running = chat.send('Help me build this profile.', { route: '/profiles/new' })
    const opened = chat.activeChatId.value

    chat.closePanel()
    turn.release?.()
    turn.holding = false
    await running

    chat.openWith('Help me build this profile.', 'the profile form')

    expect(chat.activeChatId.value).toBe(opened)
    expect(chat.messages.value.some((message) => message.text === 'Help me build this profile.')).toBe(true)
    expect(chat.messages.value.some((message) => message.error)).toBe(true)
  })
})
