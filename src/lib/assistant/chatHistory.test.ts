import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_ASSISTANT_CHATS,
  MAX_ASSISTANT_STORAGE_CHARS,
  assistantChatScopeKey,
  createAssistantChatStore,
  newAssistantChat,
  type AssistantChatStorage,
} from './chatHistory'

function storage(): AssistantChatStorage & { value: string | null; values: Map<string, string> } {
  return {
    value: null,
    values: new Map(),
    getItem(key) {
      return this.values.get(key) ?? null
    },
    setItem(key, value) {
      this.value = value
      this.values.set(key, value)
    },
  }
}

const scope = (userId: string) => ({
  apiBaseUrl: 'https://api.example.test/api/v1',
  realmId: 'realm-a',
  userId,
})

describe('assistant chat history', () => {
  let backing: ReturnType<typeof storage>

  beforeEach(() => {
    backing = storage()
  })

  it('isolates users, realms, and API bases', () => {
    const first = assistantChatScopeKey(scope('user-a'))
    const second = assistantChatScopeKey(scope('user-b'))
    const third = assistantChatScopeKey({ ...scope('user-a'), realmId: 'realm-b' })
    const fourth = assistantChatScopeKey({ ...scope('user-a'), apiBaseUrl: 'https://other.example.test/api/v1' })

    expect(first).not.toBe(second)
    expect(first).not.toBe(third)
    expect(first).not.toBe(fourth)
  })

  it('restores the active named chat and model context after a reload', () => {
    const firstStore = createAssistantChatStore(scope('user-a'), backing)
    const chat = newAssistantChat('Dataset questions', 10)
    firstStore.save({
      activeChatId: chat.id,
      chats: [{
        ...chat,
        messages: [{ id: 'm1', role: 'user', text: 'Which datasets are public?', calls: [] }],
        history: [{ role: 'user', content: 'Which datasets are public?' }],
      }],
    })

    const restored = createAssistantChatStore(scope('user-a'), backing).load()
    expect(restored.activeChatId).toBe(chat.id)
    expect(restored.chats[0]?.title).toBe('Dataset questions')
    expect(restored.chats[0]?.history).toEqual([{ role: 'user', content: 'Which datasets are public?' }])
  })

  it('bounds the number of chats and serialized storage', () => {
    const chatState = Array.from({ length: MAX_ASSISTANT_CHATS + 8 }, (_, index) => {
      const chat = newAssistantChat(`Chat ${index}`, index)
      return {
        ...chat,
        messages: [{ id: `m-${index}`, role: 'assistant' as const, text: 'x'.repeat(8_000), calls: [] }],
        history: [{ role: 'user' as const, content: 'x'.repeat(60_000) }],
      }
    })
    createAssistantChatStore(scope('user-a'), backing).save({
      activeChatId: chatState[0].id,
      chats: chatState,
    })

    expect(backing.value?.length ?? 0).toBeLessThanOrEqual(MAX_ASSISTANT_STORAGE_CHARS)
    const parsed = JSON.parse(backing.value ?? '{}') as { state?: { activeChatId?: string; chats: Array<{ id: string; title: string }> } }
    expect(parsed.state?.chats.length).toBeLessThanOrEqual(MAX_ASSISTANT_CHATS)
    expect(parsed.state?.chats[0]?.title).toBe(`Chat ${MAX_ASSISTANT_CHATS + 7}`)
    expect(parsed.state?.activeChatId).toBe(parsed.state?.chats[0]?.id)
  })

  it('ignores malformed persisted data', () => {
    const store = createAssistantChatStore(scope('user-a'), backing)
    backing.values.set(store.key, '{not json')
    const malformed = store.load()
    expect(malformed.chats).toHaveLength(1)
    expect(malformed.chats[0]?.title).toBe('New chat')

    const chat = newAssistantChat()
    backing.setItem(store.key, JSON.stringify({
      version: 1,
      state: {
        activeChatId: chat.id,
        chats: [{
          ...chat,
          history: [
            { role: 'wat', content: 'discard this' },
            { role: 'user', content: 'keep this' },
          ],
        }],
      },
    }))
    const restored = store.load()
    expect(restored.chats).toHaveLength(1)
    expect(restored.chats[0]?.history).toEqual([{ role: 'user', content: 'keep this' }])
  })
})
