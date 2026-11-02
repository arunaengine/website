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
        messages: [{ id: 'm1', role: 'user', text: 'Which datasets are public?', calls: [], at: 25 }],
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
        messages: [{ id: `m-${index}`, role: 'assistant' as const, text: 'x'.repeat(8_000), calls: [], at: index }],
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

  it('keeps a restored artifact card without its dead blob URL', () => {
    // A blob URL belongs to the tab that made it; the record stays so the
    // card can read the object again.
    const store = createAssistantChatStore(scope('user-a'), backing)
    const chat = newAssistantChat()
    const record = {
      bucket: 'work',
      key: 'out/chart.png',
      versionId: 'v1',
      name: 'chart.png',
      contentType: 'image/png',
      previewKind: 'image',
      size: 4096,
      jobId: 'job-1',
    }
    const calls = [
      {
        id: 'c1',
        name: 'show_artifact',
        input: {},
        state: 'done',
        view: { kind: 'artifact', title: 'chart.png', artifact: { url: 'blob:aruna/chart', ...record } },
      },
      { id: 'c2', name: 'show_table', input: {}, state: 'done', view: { kind: 'table', title: 'Buckets' } },
      {
        id: 'c3',
        name: 'show_artifact',
        input: {},
        state: 'done',
        view: { kind: 'artifact', title: 'notes.txt', artifact: { url: 'blob:aruna/notes', text: 'hello' } },
      },
    ]
    backing.setItem(store.key, JSON.stringify({
      version: 1,
      state: { activeChatId: chat.id, chats: [{ ...chat, messages: [{ id: 'm1', role: 'assistant', text: '', calls }] }] },
    }))

    const restored = store.load().chats[0]?.messages[0]?.calls ?? []

    expect(restored.map((call) => call.view?.kind)).toEqual(['artifact', 'table', 'artifact'])
    const chart = restored[0]?.view
    expect(chart?.kind === 'artifact' && chart.artifact).toEqual({ url: '', ...record })
    const kept = restored[2]?.view
    expect(kept?.kind === 'artifact' && kept.artifact).toMatchObject({ url: '', text: 'hello' })
  })

  it('keeps which model wrote an answer', () => {
    const store = createAssistantChatStore(scope('user-a'), backing)
    const chat = newAssistantChat()
    const model = { providerId: 'p-1', providerLabel: 'OpenAI', model: 'gpt-5.6-sol' }
    store.save({
      activeChatId: chat.id,
      chats: [{
        ...chat,
        messages: [
          { id: 'm1', role: 'user', text: 'Hi', calls: [], at: 5 },
          { id: 'm2', role: 'assistant', text: 'Hello', calls: [], at: 6, model },
          { id: 'm3', role: 'assistant', text: 'Again', calls: [], at: 7, model: { providerId: '', model: 'x' } as never },
          { id: 'm4', role: 'user', text: 'Model changed to x', calls: [], at: 8, marker: true },
        ],
      }],
    })

    const restored = store.load().chats[0]?.messages ?? []

    expect(restored.map((message) => message.model)).toEqual([undefined, model, undefined, undefined])
    expect(restored.map((message) => message.marker)).toEqual([undefined, undefined, undefined, true])
  })

  it('keeps the time of a message across a save and load', () => {
    const store = createAssistantChatStore(scope('user-a'), backing)
    const chat = newAssistantChat('Timing', 10)
    store.save({
      activeChatId: chat.id,
      chats: [{
        ...chat,
        messages: [
          { id: 'm1', role: 'user', text: 'hi', calls: [], at: 1_756_982_700_000 },
          { id: 'm2', role: 'assistant', text: 'hello', calls: [], at: 1_756_982_701_000 },
        ],
      }],
    })

    const restored = createAssistantChatStore(scope('user-a'), backing).load().chats[0]?.messages ?? []
    expect(restored.map((message) => message.at)).toEqual([1_756_982_700_000, 1_756_982_701_000])
  })

  it('keeps the background mark of a watcher update across a save and load', () => {
    const store = createAssistantChatStore(scope('user-a'), backing)
    const chat = newAssistantChat('Watched', 10)
    store.save({
      activeChatId: chat.id,
      chats: [{
        ...chat,
        messages: [
          { id: 'm1', role: 'user', text: 'watch it', calls: [], at: 1 },
          { id: 'm2', role: 'user', text: 'Background update: the job finished.', calls: [], at: 2, background: true },
        ],
      }],
    })

    const restored = createAssistantChatStore(scope('user-a'), backing).load().chats[0]?.messages ?? []
    expect(restored.map((message) => message.background)).toEqual([undefined, true])
  })

  it('keeps the pages an answer cited across a save and load', () => {
    const store = createAssistantChatStore(scope('user-a'), backing)
    const chat = newAssistantChat('Cited', 10)
    store.save({
      activeChatId: chat.id,
      chats: [{
        ...chat,
        messages: [
          { id: 'm1', role: 'user', text: 'where?', calls: [], at: 1 },
          {
            id: 'm2',
            role: 'assistant',
            text: 'Here.',
            calls: [],
            at: 2,
            sources: [{ url: 'https://example.test/a', title: 'Example page' }, { url: 'https://example.test/b' }],
          },
        ],
      }],
    })

    const restored = createAssistantChatStore(scope('user-a'), backing).load().chats[0]?.messages ?? []
    expect(restored[0]?.sources).toBeUndefined()
    expect(restored[1]?.sources).toEqual([{ url: 'https://example.test/a', title: 'Example page' }, { url: 'https://example.test/b' }])
  })

  it('dates a message stored before messages carried a time', () => {
    const store = createAssistantChatStore(scope('user-a'), backing)
    const chat = newAssistantChat('Old', 10)
    backing.setItem(store.key, JSON.stringify({
      version: 1,
      state: {
        activeChatId: chat.id,
        chats: [{ ...chat, createdAt: 4_242, messages: [{ id: 'm1', role: 'user', text: 'hi', calls: [] }] }],
      },
    }))

    expect(store.load().chats[0]?.messages[0]?.at).toBe(4_242)
  })

  it('keeps the node cursor of a chat and drops a broken one', () => {
    const store = createAssistantChatStore(scope('user-a'), backing)
    const synced = { ...newAssistantChat('Synced', 10), remote: { revision: 7, nextSeq: 3, tailKey: 'm-9' } }
    const broken = { ...newAssistantChat('Broken', 20), remote: { revision: 'seven' } }
    store.save({ activeChatId: synced.id, chats: [synced, broken as unknown as typeof synced] })

    const restored = createAssistantChatStore(scope('user-a'), backing).load().chats
    expect(restored.find((chat) => chat.id === synced.id)?.remote).toEqual({ revision: 7, nextSeq: 3, tailKey: 'm-9' })
    expect(restored.find((chat) => chat.id === broken.id)).not.toHaveProperty('remote')
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

// Two tabs share one storage; each saves the chats it holds in memory.
describe('two tabs', () => {
  const user = scope('user-tabs')
  let backing: ReturnType<typeof storage>

  beforeEach(() => {
    backing = storage()
  })

  function chat(id: string, turns: string[], updatedAt = 10) {
    return {
      ...newAssistantChat(id, 1),
      id,
      updatedAt,
      messages: turns.flatMap((turn, index) => [
        { id: turn, role: 'user' as const, text: `${turn} asked`, calls: [], at: index * 10 + 1 },
        { id: `${turn}-a`, role: 'assistant' as const, text: `${turn} answered`, calls: [], at: index * 10 + 2 },
      ]),
      history: turns.flatMap((turn) => [
        { role: 'user' as const, content: `${turn} asked` },
        { role: 'assistant' as const, content: `${turn} answered` },
      ]),
    }
  }

  function saved() {
    return createAssistantChatStore(user, backing).load().chats
  }

  it('keeps a chat another tab created', () => {
    const tabA = createAssistantChatStore(user, backing)
    const tabB = createAssistantChatStore(user, backing)
    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1'])] })
    tabB.load()

    tabA.save({ activeChatId: 'c-2', chats: [chat('c-2', ['t2'], 20), chat('c-1', ['t1'])] })
    tabB.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1'], 30)] })

    expect(saved().map((entry) => entry.id).sort()).toEqual(['c-1', 'c-2'])
  })

  it('keeps a turn another tab added to the same chat', () => {
    const tabA = createAssistantChatStore(user, backing)
    const tabB = createAssistantChatStore(user, backing)
    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1'])] })
    tabB.load()

    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1', 't2'], 20)] })
    const mine = chat('c-1', ['t1', 't3'], 30)
    mine.messages = mine.messages.map((message) => (message.id.startsWith('t3') ? { ...message, at: message.at + 100 } : message))
    tabB.save({ activeChatId: 'c-1', chats: [mine] })

    const merged = saved().find((entry) => entry.id === 'c-1')
    expect(merged?.messages.map((message) => message.id)).toEqual(['t1', 't1-a', 't2', 't2-a', 't3', 't3-a'])
    expect(merged?.history).toHaveLength(6)
  })

  it('does not bring back a chat another tab deleted', () => {
    const tabA = createAssistantChatStore(user, backing)
    const tabB = createAssistantChatStore(user, backing)
    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1']), chat('c-2', ['t2'])] })
    tabB.load()

    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1'], 20)] })
    tabB.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1'], 30), chat('c-2', ['t2'], 30)] })

    expect(saved().map((entry) => entry.id)).toEqual(['c-1'])
  })

  it('does not bring back a turn this tab removed', () => {
    const tabA = createAssistantChatStore(user, backing)
    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1', 't2'])] })

    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1'], 20)] })

    expect(saved()[0].messages.map((message) => message.id)).toEqual(['t1', 't1-a'])
  })
})
