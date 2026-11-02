import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_ASSISTANT_CHATS,
  MAX_ASSISTANT_STORAGE_CHARS,
  assistantChatScopeKey,
  createAssistantChatStore,
  newAssistantChat,
  type AssistantChatKeys,
} from './chatHistory'

function storage(): AssistantChatKeys & { value: string | null; values: Map<string, string>; largest: number } {
  return {
    value: null,
    values: new Map(),
    largest: 0,
    getItem(key) {
      return this.values.get(key) ?? null
    },
    setItem(key, value) {
      this.value = value
      this.largest = Math.max(this.largest, value.length)
      this.values.set(key, value)
    },
    removeItem(key) {
      this.values.delete(key)
    },
    get length() {
      return this.values.size
    },
    key(index) {
      return [...this.values.keys()][index] ?? null
    },
  }
}

/** An in-memory stand-in for navigator.locks: one holder per name, in request order. */
function memoryLocks() {
  const tails = new Map<string, Promise<unknown>>()
  return {
    request(name: string, callback: () => unknown): Promise<unknown> {
      const run = (tails.get(name) ?? Promise.resolve()).then(() => callback())
      tails.set(name, run.catch(() => {}))
      return run
    },
  }
}

/** Characters the chat history of a scope holds across all its keys. */
function usedChars(backing: ReturnType<typeof storage>, base: string): number {
  let total = 0
  for (const [key, value] of backing.values) if (key === base || key.startsWith(`${base}:`)) total += value.length
  return total
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
    const store = createAssistantChatStore(scope('user-a'), backing)
    store.save({
      activeChatId: chatState[0].id,
      chats: chatState,
    })

    expect(usedChars(backing, store.key)).toBeLessThanOrEqual(MAX_ASSISTANT_STORAGE_CHARS)
    expect(backing.largest).toBeLessThanOrEqual(MAX_ASSISTANT_STORAGE_CHARS)
    const restored = createAssistantChatStore(scope('user-a'), backing).load()
    expect(restored.chats.length).toBeLessThanOrEqual(MAX_ASSISTANT_CHATS)
    expect(restored.chats[0]?.title).toBe(`Chat ${MAX_ASSISTANT_CHATS + 7}`)
    expect(restored.activeChatId).toBe(chatState[0].id)
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

  function chat(id: string, turns: string[], updatedAt = 10, title = id) {
    return {
      ...newAssistantChat(title, 1),
      id,
      updatedAt,
      messages: turns.flatMap((turn, index) => [
        { id: turn, role: 'user' as const, text: `${turn} asked`, calls: [], at: index * 10 + 1 },
        { id: `${turn}-a`, role: 'assistant' as const, text: `${turn} answered`, calls: [], at: index * 10 + 2 },
      ]),
      history: [],
    }
  }

  function saved() {
    return createAssistantChatStore(user, backing).load().chats
  }

  function tabs() {
    const tabA = createAssistantChatStore(user, backing)
    const tabB = createAssistantChatStore(user, backing)
    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1']), chat('c-2', ['t2'])] })
    tabA.load()
    tabB.load()
    return { tabA, tabB }
  }

  it('keeps the chats two tabs create at the same time', () => {
    const { tabA, tabB } = tabs()

    tabA.save({ activeChatId: 'a-1', chats: [chat('a-1', ['ta'], 20), chat('c-1', ['t1']), chat('c-2', ['t2'])] }, ['a-1'])
    tabB.save({ activeChatId: 'b-1', chats: [chat('b-1', ['tb'], 30), chat('c-1', ['t1']), chat('c-2', ['t2'])] }, ['b-1'])

    expect(saved().map((entry) => entry.id).sort()).toEqual(['a-1', 'b-1', 'c-1', 'c-2'])
  })

  it('keeps a deletion while another tab saves a different chat', () => {
    const { tabA, tabB } = tabs()

    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1'])] }, ['c-2'])
    tabB.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1', 't3'], 30), chat('c-2', ['t2'])] }, ['c-1'])

    expect(saved().map((entry) => entry.id)).toEqual(['c-1'])
  })

  it('keeps an answer another tab completed when this tab renames a different chat', () => {
    const { tabA, tabB } = tabs()

    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1', 't4'], 20), chat('c-2', ['t2'])] }, ['c-1'])
    tabB.save({ activeChatId: 'c-2', chats: [chat('c-1', ['t1']), chat('c-2', ['t2'], 30, 'Renamed')] }, ['c-2'])

    const stored = saved()
    expect(stored.find((entry) => entry.id === 'c-1')?.messages.map((message) => message.id)).toEqual(['t1', 't1-a', 't4', 't4-a'])
    expect(stored.find((entry) => entry.id === 'c-2')?.title).toBe('Renamed')
  })

  it('writes one chat as a whole and keeps its turn order', () => {
    // Two tabs writing the same chat: the last one wins, in its own order.
    const { tabA, tabB } = tabs()

    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1', 'tb'], 20), chat('c-2', ['t2'])] }, ['c-1'])
    const kept = tabB.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1', 'ta'], 30), chat('c-2', ['t2'])] }, ['c-1'])

    const order = ['t1', 't1-a', 'ta', 'ta-a']
    expect(kept.chats.find((entry) => entry.id === 'c-1')?.messages.map((message) => message.id)).toEqual(order)
    expect(saved().find((entry) => entry.id === 'c-1')?.messages.map((message) => message.id)).toEqual(order)
  })

  it('moves the old single-key history into one key per chat once', () => {
    const store = createAssistantChatStore(user, backing)
    backing.setItem(store.key, JSON.stringify({
      version: 1,
      state: { activeChatId: 'c-2', chats: [chat('c-1', ['t1']), chat('c-2', ['t2'], 20)] },
    }))

    const restored = store.load()

    expect(restored.activeChatId).toBe('c-2')
    expect(restored.chats.map((entry) => entry.id)).toEqual(['c-2', 'c-1'])
    expect(backing.values.has(store.key)).toBe(false)
    expect([...backing.values.keys()].filter((key) => key.includes(':chat:'))).toHaveLength(2)
    expect(saved().map((entry) => entry.id)).toEqual(['c-2', 'c-1'])
  })

  it('trims whole chats, oldest first, to stay under the size cap', () => {
    const big = (id: string, updatedAt: number) => ({
      ...chat(id, [], updatedAt),
      messages: [{ id: `${id}-m`, role: 'assistant' as const, text: 'x'.repeat(7_000), calls: [], at: 1 }],
      history: [{ role: 'user' as const, content: 'x'.repeat(250_000) }],
    })
    const { tabA, tabB } = tabs()
    tabA.save({ activeChatId: 'a-1', chats: [big('a-1', 20), big('a-2', 21)] })

    tabB.save({ activeChatId: 'b-1', chats: [big('b-1', 30), big('b-2', 31)] }, ['b-1', 'b-2'])

    const kept = saved().map((entry) => entry.id)
    expect(kept).toEqual(['b-2', 'b-1', 'a-2'])
    expect(usedChars(backing, createAssistantChatStore(user, backing).key)).toBeLessThanOrEqual(MAX_ASSISTANT_STORAGE_CHARS)
    expect(backing.largest).toBeLessThanOrEqual(MAX_ASSISTANT_STORAGE_CHARS)
  })
})

describe('what a tab writes', () => {
  const user = scope('user-locks')
  let backing: ReturnType<typeof storage>

  beforeEach(() => {
    backing = storage()
  })

  function chat(id: string, turns: string[], updatedAt = 10, title = id) {
    return {
      ...newAssistantChat(title, 1),
      id,
      updatedAt,
      messages: turns.flatMap((turn, index) => [
        { id: turn, role: 'user' as const, text: `${turn} asked`, calls: [], at: index * 10 + 1 },
        { id: `${turn}-a`, role: 'assistant' as const, text: `${turn} answered`, calls: [], at: index * 10 + 2 },
      ]),
      history: [],
    }
  }

  function big(id: string, updatedAt: number) {
    return {
      ...chat(id, [], updatedAt),
      messages: [{ id: `${id}-m`, role: 'assistant' as const, text: 'x'.repeat(7_000), calls: [], at: 1 }],
      history: [{ role: 'user' as const, content: 'x'.repeat(250_000) }],
    }
  }

  function saved() {
    return createAssistantChatStore(user, backing).load().chats
  }

  function legacy(chats: ReturnType<typeof chat>[]) {
    const store = createAssistantChatStore(user, backing)
    backing.setItem(store.key, JSON.stringify({ version: 1, state: { activeChatId: chats[0].id, chats } }))
    return store.key
  }

  it('writes only the chats a tab says it changed', () => {
    const tabA = createAssistantChatStore(user, backing)
    const tabB = createAssistantChatStore(user, backing)
    tabA.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1']), chat('c-2', ['t2'])] })
    tabA.load()
    tabB.load()

    tabB.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1', 't4'], 20), chat('c-2', ['t2'])] }, ['c-1'])
    // Tab A still shows the old copy of c-1, touched in memory but not changed by it.
    tabA.save({ activeChatId: 'c-2', chats: [chat('c-1', ['t1'], 25), chat('c-2', ['t2'], 30, 'Renamed')] }, ['c-2'])

    const stored = saved()
    expect(stored.find((entry) => entry.id === 'c-1')?.messages.map((message) => message.id)).toEqual(['t1', 't1-a', 't4', 't4-a'])
    expect(stored.find((entry) => entry.id === 'c-2')?.title).toBe('Renamed')
  })

  it('keeps the old history when moving it runs out of room', () => {
    const key = legacy([chat('c-1', ['t1']), chat('c-2', ['t2'])])
    const setItem = backing.setItem.bind(backing)
    let chatWrites = 0
    backing.setItem = (name, value) => {
      if (name.includes(':chat:') && ++chatWrites > 1) throw new Error('QuotaExceededError')
      setItem(name, value)
    }

    const first = createAssistantChatStore(user, backing).load()
    backing.setItem = setItem

    expect(first.chats.map((entry) => entry.id).sort()).toEqual(['c-1', 'c-2'])
    expect(backing.values.has(key)).toBe(true)
    expect(saved().map((entry) => entry.id).sort()).toEqual(['c-1', 'c-2'])
  })

  it('never writes the old history over a chat another tab stored since', () => {
    const key = legacy([chat('c-1', ['t1']), chat('c-2', ['t2'])])
    createAssistantChatStore(user, backing).save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1', 't4'], 20)] }, ['c-1'])

    const tabA = createAssistantChatStore(user, backing).load()
    const tabB = createAssistantChatStore(user, backing).load()

    expect(backing.values.has(key)).toBe(false)
    for (const loaded of [tabA, tabB, { chats: saved() }]) {
      expect(loaded.chats.map((entry) => entry.id).sort()).toEqual(['c-1', 'c-2'])
      expect(loaded.chats.find((entry) => entry.id === 'c-1')?.messages).toHaveLength(4)
    }
  })

  it('stays under the size cap when two tabs save large chats', () => {
    const tabA = createAssistantChatStore(user, backing)
    const tabB = createAssistantChatStore(user, backing)
    tabA.save({ activeChatId: 'a-1', chats: [big('a-1', 10)] })

    tabB.save({ activeChatId: 'b-3', chats: [big('b-1', 20), big('b-2', 21), big('b-3', 22)] })

    expect(usedChars(backing, tabB.key)).toBeLessThanOrEqual(MAX_ASSISTANT_STORAGE_CHARS)
    expect(backing.largest).toBeLessThanOrEqual(MAX_ASSISTANT_STORAGE_CHARS)
    expect(saved().map((entry) => entry.id)).toEqual(['b-3', 'b-2', 'b-1'])
  })

  it('keeps the active chat when the count limit drops older ones', () => {
    const chats = Array.from({ length: MAX_ASSISTANT_CHATS + 1 }, (_, index) => chat(`c-${index}`, [`t${index}`], 100 + index))
    const store = createAssistantChatStore(user, backing)

    const kept = store.save({ activeChatId: 'c-0', chats })

    expect(kept.activeChatId).toBe('c-0')
    expect(kept.chats.map((entry) => entry.id)).toContain('c-0')
    expect(kept.chats).toHaveLength(MAX_ASSISTANT_CHATS)
    expect(saved().map((entry) => entry.id)).toContain('c-0')
  })
})

describe('writing at once', () => {
  const user = scope('user-sync')
  let backing: ReturnType<typeof storage>

  beforeEach(() => {
    backing = storage()
  })

  function chat(id: string, turns: string[], updatedAt = 10) {
    return {
      ...newAssistantChat(id, 1),
      id,
      updatedAt,
      messages: turns.map((turn, index) => ({ id: turn, role: 'user' as const, text: `${turn} asked`, calls: [], at: index + 1 })),
      history: [],
    }
  }

  function saved() {
    return createAssistantChatStore(user, backing).load().chats.map((entry) => entry.id)
  }

  it('stores a save at once, so a reload right after keeps it', () => {
    vi.stubGlobal('window', { navigator: { locks: memoryLocks() } })
    try {
      createAssistantChatStore(user, backing).save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1'])] }, ['c-1'])

      expect(saved()).toEqual(['c-1'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps saving after a refused lock request', async () => {
    vi.stubGlobal('window', { navigator: { locks: { request: () => Promise.reject(new Error('refused')) } } })
    try {
      const store = createAssistantChatStore(user, backing)
      store.save({ activeChatId: 'c-1', chats: [chat('c-1', ['t1'])] }, ['c-1'])
      await Promise.resolve()
      store.save({ activeChatId: 'c-2', chats: [chat('c-2', ['t2'], 20), chat('c-1', ['t1'])] }, ['c-2'])
      await Promise.resolve()

      expect(saved()).toEqual(['c-2', 'c-1'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('makes room for a chat the browser refused once', () => {
    const store = createAssistantChatStore(user, backing)
    store.save({ activeChatId: 'c-2', chats: [chat('c-1', ['t1'], 10), chat('c-2', ['t2'], 20)] })
    const setItem = backing.setItem.bind(backing)
    let refusals = 1
    backing.setItem = (name, value) => {
      if (name.endsWith(':chat:c-3') && refusals-- > 0) throw new Error('QuotaExceededError')
      setItem(name, value)
    }

    store.save({ activeChatId: 'c-3', chats: [chat('c-3', ['t3'], 30), chat('c-2', ['t2'], 20), chat('c-1', ['t1'], 10)] }, ['c-3'])

    expect(saved()).toEqual(['c-3', 'c-2'])
  })

  it('stores a refused chat with the next save', () => {
    const store = createAssistantChatStore(user, backing)
    const setItem = backing.setItem.bind(backing)
    backing.setItem = (name, value) => {
      if (name.endsWith(':chat:c-1')) throw new Error('QuotaExceededError')
      setItem(name, value)
    }
    const state = { activeChatId: 'c-1', chats: [chat('c-1', ['t1'])] }
    store.save(state, ['c-1'])
    expect(saved()).not.toContain('c-1')

    backing.setItem = setItem
    store.save(state, [])

    expect(saved()).toEqual(['c-1'])
  })

  it('stays under the size cap while moving the old history', () => {
    const large = (id: string, updatedAt: number, size: number) => ({
      ...chat(id, ['t'], updatedAt),
      history: [{ role: 'user' as const, content: 'x'.repeat(size) }],
    })
    const chats = [large('m-1', 10, 280_000), large('m-2', 20, 280_000), large('m-3', 30, 280_000)]
    const legacy = () => JSON.stringify({ version: 1, state: { activeChatId: 'm-3', chats } })
    chats[0] = large('m-1', 10, 280_000 + MAX_ASSISTANT_STORAGE_CHARS - 10 - legacy().length)
    const key = createAssistantChatStore(user, backing).key
    backing.setItem(key, legacy())
    expect(legacy().length).toBe(MAX_ASSISTANT_STORAGE_CHARS - 10)

    const restored = createAssistantChatStore(user, backing).load()

    expect(usedChars(backing, key)).toBeLessThanOrEqual(MAX_ASSISTANT_STORAGE_CHARS)
    expect(backing.values.has(key)).toBe(false)
    expect(restored.chats.map((entry) => entry.id)).toContain('m-3')
  })
})

describe('the final store rules', () => {
  const user = scope('user-final')
  let backing: ReturnType<typeof storage>

  beforeEach(() => {
    backing = storage()
  })

  function sized(id: string, updatedAt: number, size: number) {
    return {
      ...newAssistantChat(id, 1),
      id,
      updatedAt,
      messages: [{ id: `${id}-q`, role: 'user' as const, text: `${id} asked`, calls: [], at: 1 }],
      history: [{ role: 'user' as const, content: 'x'.repeat(size) }],
    }
  }

  function refuse(name: string) {
    const setItem = backing.setItem.bind(backing)
    backing.setItem = (key, value) => {
      if (key.endsWith(name)) throw new Error('QuotaExceededError')
      setItem(key, value)
    }
  }

  it('keeps the stored copy and the change of a chat that no longer fits', () => {
    const store = createAssistantChatStore(user, backing)
    const small = sized('b-1', 10, 1_000)
    store.save({ activeChatId: 'a-1', chats: [sized('a-1', 20, 600_000), small] })

    store.save({ activeChatId: 'a-1', chats: [sized('a-1', 20, 600_000), sized('b-1', 30, 500_000)] }, ['b-1'])

    expect(store.unsavedChats().has('b-1')).toBe(true)
    const stored = createAssistantChatStore(user, backing).load().chats.find((entry) => entry.id === 'b-1')
    expect(stored?.updatedAt).toBe(10)
  })

  it('does not bring back a moved chat that was deleted while the move was unfinished', () => {
    const store = createAssistantChatStore(user, backing)
    backing.setItem(store.key, JSON.stringify({
      version: 1,
      state: { activeChatId: 'c-1', chats: [sized('c-1', 20, 10), sized('c-2', 10, 10)] },
    }))
    refuse(':chat:c-2')

    const held = store.load()
    expect(held.chats.map((entry) => entry.id).sort()).toEqual(['c-1', 'c-2'])
    store.save({ ...held, activeChatId: 'c-2', chats: held.chats.filter((entry) => entry.id !== 'c-1') }, ['c-1'])

    expect(createAssistantChatStore(user, backing).load().chats.map((entry) => entry.id)).toEqual(['c-2'])
  })

  it('counts the old history key toward the size cap', () => {
    const store = createAssistantChatStore(user, backing)
    store.save({ activeChatId: 'o-1', chats: [sized('o-1', 5, 300_000)] })
    const held = store.load()
    // History an unfinished move left under the old key.
    backing.setItem(store.key, JSON.stringify({ version: 1, state: { activeChatId: 'l-1', chats: [sized('l-1', 6, 300_000)] } }))

    store.save({ ...held, activeChatId: 'a-1', chats: [sized('a-1', 40, 300_000), ...held.chats] }, ['a-1'])

    expect(usedChars(backing, store.key)).toBeLessThanOrEqual(MAX_ASSISTANT_STORAGE_CHARS)
  })

  it('trims again when another tab wrote while this one was writing', () => {
    const store = createAssistantChatStore(user, backing)
    store.save({ activeChatId: 'o-1', chats: [sized('o-1', 5, 300_000)] })
    const setItem = backing.setItem.bind(backing)
    backing.setItem = (key, value) => {
      // Another tab stores a large chat in the same moment.
      if (key.endsWith(':chat:a-1')) setItem(`${store.key}:chat:b-1`, JSON.stringify(sized('b-1', 50, 350_000)))
      setItem(key, value)
    }

    store.save({ activeChatId: 'a-1', chats: [sized('a-1', 40, 300_000), sized('o-1', 5, 300_000)] }, ['a-1'])

    expect(usedChars(backing, store.key)).toBeLessThanOrEqual(MAX_ASSISTANT_STORAGE_CHARS)
    expect(createAssistantChatStore(user, backing).load().chats.map((entry) => entry.id)).toEqual(['b-1', 'a-1'])
  })
})
