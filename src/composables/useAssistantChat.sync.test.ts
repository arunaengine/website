// The chats on the node, end to end against a fake node that keeps heads and
// turns the way the real one does: what is pushed, in which order, and what
// happens on a stale seq, a stale revision, and a deleted chat.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type {
  AssistantChatHead,
  AssistantChatTurn,
  AssistantProvider,
  PutAssistantChatRequest,
  PutAssistantTurnRequest,
  UserInfoResponse,
} from '@/lib/api'

const provider: AssistantProvider = {
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
    listedModels: ref({}),
    modelErrors: ref({}),
    direct: () => undefined,
    load: async () => {},
    listModels: async () => [],
    ensureLoaded: () => {},
  }),
}))

vi.mock('@/lib/assistant/chat', () => ({
  // Answers every prompt with "<prompt> answered", in the transcript and the history.
  runTurn: async (options: { messages: Array<{ content: unknown }>; onText: (delta: string) => void }) => {
    const answer = `${String(options.messages.at(-1)?.content)} answered`
    options.onText(answer)
    return { messages: [{ role: 'assistant', content: answer }], error: null }
  },
}))
vi.mock('@/lib/assistant/models', () => ({ buildModel: () => ({ id: 'm-1' }) }))
vi.mock('@/lib/assistant/browserModels', () => ({ buildBrowserModel: () => ({ id: 'm-1' }) }))
vi.mock('@/lib/assistant/prompt', () => ({ systemPrompt: () => 'system' }))

interface NodeChat {
  head: AssistantChatHead
  turns: Map<number, string>
  deleted: boolean
}

// The fake node. `fail` is filled in once the real ApiError class is loaded.
const node = vi.hoisted(() => ({
  chats: new Map<string, NodeChat>(),
  log: [] as string[],
  listStatus: 200,
  fail: (status: number, message: string): Error => new Error(`${status} ${message}`),
  now: () => new Date().toISOString(),
}))

function liveChat(id: string): NodeChat {
  const chat = node.chats.get(id)
  if (!chat) throw node.fail(404, 'unknown chat')
  if (chat.deleted) throw node.fail(410, 'deleted chat')
  return chat
}

function seedNode(id: string, title: string, payloads: string[], subject: string | null = null) {
  const chat: NodeChat = {
    head: {
      id,
      title,
      subject,
      created_at: node.now(),
      updated_at: node.now(),
      first_seq: 0,
      next_seq: payloads.length,
      bytes: 0,
      revision: payloads.length + 1,
    },
    turns: new Map(payloads.map((payload, seq) => [seq, payload])),
    deleted: false,
  }
  node.chats.set(id, chat)
  return chat
}

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>()
  node.fail = (status, message) => new original.ApiError(status, message)
  return {
    ...original,
    listChats: async () => {
      node.log.push('GET chats')
      if (node.listStatus !== 200) throw node.fail(node.listStatus, 'no such route')
      return { chats: [...node.chats.values()].filter((chat) => !chat.deleted).map((chat) => chat.head) }
    },
    putChat: async (id: string, request: PutAssistantChatRequest) => {
      node.log.push(`PUT chat ${id} rev ${request.revision ?? '-'} ${request.title}`)
      const held = node.chats.get(id)
      if (held?.deleted) throw node.fail(410, 'deleted chat')
      if (!held) return seedNode(id, request.title, [], request.subject ?? null).head
      if (request.revision !== undefined && request.revision !== held.head.revision) throw node.fail(409, 'stale revision')
      held.head = {
        ...held.head,
        title: request.title,
        subject: request.subject ?? null,
        revision: held.head.revision + 1,
        updated_at: node.now(),
      }
      return held.head
    },
    readTurns: async (id: string, after?: number) => {
      node.log.push(`GET turns ${id} after ${after ?? '-'}`)
      const chat = liveChat(id)
      const turns: AssistantChatTurn[] = [...chat.turns]
        .filter(([seq]) => seq > (after ?? -1))
        .sort(([a], [b]) => a - b)
        .map(([seq, payload]) => ({ seq, payload, updated_at: node.now() }))
      return { turns }
    },
    putTurn: async (id: string, seq: number, request: PutAssistantTurnRequest) => {
      node.log.push(`PUT turn ${id}/${seq} rev ${request.revision ?? '-'}`)
      const chat = liveChat(id)
      const next = chat.head.next_seq
      if (seq !== next && seq !== next - 1) throw node.fail(409, `the next seq is ${next}`)
      if (request.revision !== undefined && request.revision !== chat.head.revision) throw node.fail(409, 'stale revision')
      chat.turns.set(seq, request.payload)
      chat.head = { ...chat.head, next_seq: Math.max(next, seq + 1), revision: chat.head.revision + 1, updated_at: node.now() }
      return chat.head
    },
    deleteChat: async (id: string) => {
      node.log.push(`DELETE chat ${id}`)
      const chat = node.chats.get(id)
      if (chat) chat.deleted = true
    },
  }
})

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
const { decodeTurn, encodeTurn } = await import('@/lib/assistant/chatTurns')
const { apiBaseUrl, authToken, userInfo } = await import('./aruna/state')

let useAssistantChat: typeof import('./useAssistantChat').useAssistantChat
let REMOTE_SAVE_DELAY_MS: number
let users = 0

/** A fresh scope on a fresh node: a new user id makes the composable load and sync again. */
async function login(seedLocal?: (scope: { apiBaseUrl: string; realmId: string; userId: string }) => void) {
  users += 1
  node.chats.clear()
  node.listStatus = 200
  const scope = { apiBaseUrl: 'https://node.test', realmId: 'r-1', userId: `u-${users}` }
  seedLocal?.(scope)
  apiBaseUrl.value = scope.apiBaseUrl
  authToken.value = 'token'
  userInfo.value = {
    user: { user_id: scope.userId },
    realm: { realm_id: scope.realmId, roles: [] },
    groups: [],
  } as unknown as UserInfoResponse
  await settle(0)
  return scope
}

/** Lets the queued push and everything it starts run; nothing waits on wall time. */
async function settle(ms = REMOTE_SAVE_DELAY_MS + 10) {
  await vi.advanceTimersByTimeAsync(ms)
  for (let round = 0; round < 40; round += 1) await Promise.resolve()
  await vi.advanceTimersByTimeAsync(1)
}

function payload(userId: string, text: string): string {
  return encodeTurn({
    messages: [
      { id: userId, role: 'user', text, calls: [], at: 1 },
      { id: `${userId}-a`, role: 'assistant', text: `${text} answered`, calls: [], at: 2 },
    ],
    history: [{ role: 'user', content: text }, { role: 'assistant', content: `${text} answered` }],
  })
}

// The chat list carries the model history, whose union type is too deep for
// the checker to walk here; only ids, titles and visible text matter.
function chatList(): Array<{ id: string; title: string; messages: Array<{ text: string }> }> {
  return chat.chats.value as ReturnType<typeof chatList>
}

function texts(id: string): string[] {
  return (chatList().find((entry) => entry.id === id)?.messages ?? []).map((message) => message.text)
}

function nodeTexts(id: string): string[] {
  const held = node.chats.get(id)
  if (!held) return []
  return [...held.turns]
    .sort(([a], [b]) => a - b)
    .flatMap(([, stored]) => decodeTurn(stored)?.messages.map((message) => message.text) ?? [])
}

let chat: ReturnType<typeof useAssistantChat>

beforeAll(async () => {
  vi.useFakeTimers()
  const module = await import('./useAssistantChat')
  useAssistantChat = module.useAssistantChat
  REMOTE_SAVE_DELAY_MS = module.REMOTE_SAVE_DELAY_MS
  chat = useAssistantChat()
})

beforeEach(() => {
  node.log.length = 0
})

describe('pushing', () => {
  it('creates the head first, then the turns in seq order', async () => {
    await login()
    const id: string = chat.activeChatId.value

    await chat.send('first question', { route: '/' })
    await chat.send('second question', { route: '/' })
    await settle()

    // Every turn write carries the revision the browser holds at that moment.
    expect(node.log).toEqual([
      'GET chats',
      `PUT chat ${id} rev - first question`,
      `PUT turn ${id}/0 rev 1`,
      `PUT turn ${id}/1 rev 2`,
    ])
    expect(nodeTexts(id)).toEqual(['first question', 'first question answered', 'second question', 'second question answered'])
    expect(node.chats.get(id)?.head.next_seq).toBe(2)
  })

  it('writes only the new turn afterwards, with nothing for an untouched chat', async () => {
    const id: string = chat.activeChatId.value
    node.log.length = 0

    await chat.send('third question', { route: '/' })
    await settle()

    expect(node.log).toEqual([`PUT turn ${id}/2 rev 3`])
    expect(nodeTexts(id)).toHaveLength(6)
  })

  it('renames on the node with the revision it holds, and deletes there', async () => {
    const id: string = chat.activeChatId.value
    const revision = node.chats.get(id)?.head.revision
    node.log.length = 0

    chat.renameChat(id, 'Questions')
    await settle()
    expect(node.log).toEqual([`PUT chat ${id} rev ${revision} Questions`])
    expect(node.chats.get(id)?.head.title).toBe('Questions')

    chat.deleteChat(id)
    await settle()
    expect(node.log.at(-1)).toBe(`DELETE chat ${id}`)
    expect(node.chats.get(id)?.deleted).toBe(true)
  })

  it('never creates an empty chat on the node', async () => {
    await login()
    node.log.length = 0

    chat.newChat()
    chat.renameChat(chat.activeChatId.value, 'Nothing yet')
    await settle()

    expect(node.log).toEqual([])
  })
})

describe('logging in', () => {
  it('takes the node chats, keeps the unsent tail, and pushes local-only chats', async () => {
    await login((scope) => {
      seedNode('n-1', 'From the node', [payload('u1', 'one'), payload('u2', 'two')])
      const held = { ...newAssistantChat('Old title'), id: 'n-1', updatedAt: 5 }
      const local = { ...newAssistantChat('Only here'), id: 'l-1', updatedAt: 6 }
      const one = decodeTurn(payload('u1', 'one'))!
      const late = decodeTurn(payload('u9', 'late'))!
      const mine = decodeTurn(payload('u5', 'mine'))!
      held.messages = [...one.messages, ...late.messages]
      held.history = [...one.history, ...late.history]
      local.messages = mine.messages
      local.history = mine.history
      createAssistantChatStore(scope).save({ activeChatId: held.id, chats: [held, local] })
    })
    await settle()

    expect(texts('n-1')).toEqual(['one', 'one answered', 'two', 'two answered', 'late', 'late answered'])
    expect(chatList().find((entry) => entry.id === 'n-1')?.title).toBe('From the node')
    expect(node.log).toContain('GET turns n-1 after -')
    expect(node.log).toContain('PUT turn n-1/2 rev 3')
    expect(nodeTexts('n-1').slice(-2)).toEqual(['late', 'late answered'])
    expect(node.log.indexOf('PUT chat l-1 rev - Only here')).toBeLessThan(node.log.indexOf('PUT turn l-1/0 rev 1'))
    expect(nodeTexts('l-1')).toEqual(['mine', 'mine answered'])
  })

  it('opens the chat the node wrote to last instead of the empty placeholder', async () => {
    await login(() => seedNode('n-2', 'Restored', [payload('u1', 'restored')]))
    await settle()

    expect(chat.activeChatId.value).toBe('n-2')
    expect(chat.messages.value.map((message) => message.text)).toEqual(['restored', 'restored answered'])
  })

  it('keeps every chat in this browser when the node has no routes', async () => {
    await login(() => {
      node.listStatus = 404
    })

    await chat.send('local only', { route: '/' })
    await settle()

    expect(node.log).toEqual(['GET chats'])
    expect(texts(chat.activeChatId.value)).toEqual(['local only', 'local only answered'])
  })
})

/** The same user again, as after a page load: the local store is kept, the node too. */
async function reload() {
  authToken.value = ''
  await settle(0)
  authToken.value = 'token'
  await settle(0)
}

describe('reloading', () => {
  it('reads no turns for a chat whose head did not move, and only the new ones for one that did', async () => {
    const scope = await login()
    const id: string = chat.activeChatId.value
    await chat.send('before the reload', { route: '/' })
    await settle()
    const tailKey = chat.messages.value[0].id
    const held = node.chats.get(id)!
    expect(createAssistantChatStore(scope).load().chats[0]?.remote).toEqual({ revision: 2, nextSeq: 1, tailKey })
    expect(held.turns.get(0)).not.toContain('remote')
    node.log.length = 0

    await reload()
    await settle()

    expect(node.log).toEqual(['GET chats'])
    expect(texts(id)).toEqual(['before the reload', 'before the reload answered'])

    held.turns.set(1, payload('x1', 'theirs'))
    held.head = { ...held.head, next_seq: 2, revision: held.head.revision + 1 }
    node.log.length = 0

    await reload()
    await settle()

    expect(node.log).toEqual(['GET chats', `GET turns ${id} after 0`])
    expect(texts(id)).toEqual(['before the reload', 'before the reload answered', 'theirs', 'theirs answered'])
  })

  it('pushes a turn added before the reload without reading the chat again', async () => {
    const id: string = chat.activeChatId.value
    await chat.send('sent before', { route: '/' })
    await settle()
    // A turn saved in this browser but never pushed, as when the tab closed in time.
    const held = node.chats.get(id)!
    held.turns.delete(2)
    held.head = { ...held.head, next_seq: 2 }
    const store = createAssistantChatStore({ apiBaseUrl: 'https://node.test', realmId: 'r-1', userId: `u-${users}` })
    const state = store.load()
    const record = state.chats.find((entry) => entry.id === id)!
    const revision = held.head.revision
    record.remote = { revision, nextSeq: 2, tailKey: record.messages[2].id }
    store.save(state)
    node.log.length = 0

    await reload()
    await settle()

    expect(node.log).toEqual(['GET chats', `PUT turn ${id}/2 rev ${revision}`])
    expect(nodeTexts(id).slice(-2)).toEqual(['sent before', 'sent before answered'])
  })
})

describe('conflicts', () => {
  it('keeps the node turns on a stale seq and re-appends its own after them', async () => {
    await login(() => seedNode('n-3', 'Shared', [payload('u1', 'one')]))
    await settle()
    chat.selectChat('n-3')
    // Another browser appended two turns since this one read the chat.
    const held = node.chats.get('n-3')!
    held.turns.set(1, payload('x1', 'theirs'))
    held.turns.set(2, payload('x2', 'more'))
    held.head = { ...held.head, next_seq: 3, revision: held.head.revision + 2 }
    node.log.length = 0

    await chat.send('ours', { route: '/' })
    await settle()

    expect(node.log).toEqual(['PUT turn n-3/1 rev 2', 'GET chats', 'GET turns n-3 after 0', 'PUT turn n-3/3 rev 4'])
    expect(texts('n-3')).toEqual([
      'one', 'one answered', 'theirs', 'theirs answered', 'more', 'more answered', 'ours', 'ours answered',
    ])
    expect(nodeTexts('n-3')).toEqual(texts('n-3'))
  })

  it('takes the node revision on a stale head and keeps the local title', async () => {
    node.chats.get('n-3')!.head.revision += 5
    node.log.length = 0

    chat.renameChat('n-3', 'Renamed here')
    await settle()

    expect(node.log[0]).toMatch(/^PUT chat n-3 rev \d+ Renamed here$/)
    expect(node.log.slice(1, 2)).toEqual(['GET chats'])
    expect(node.log.at(-1)).toMatch(/^PUT chat n-3 rev \d+ Renamed here$/)
    expect(node.chats.get('n-3')?.head.title).toBe('Renamed here')
  })

  it('drops a chat the node deleted', async () => {
    node.chats.get('n-3')!.deleted = true

    await chat.send('into the void', { route: '/' })
    await settle()

    expect(chatList().some((entry) => entry.id === 'n-3')).toBe(false)
    expect(chat.activeChatId.value).not.toBe('n-3')
  })

  it('never writes over one turn another browser appended a moment earlier', async () => {
    // The seq alone would pass as a tail rewrite; the stale revision refuses it.
    await login(() => seedNode('n-4', 'Shared', [payload('u1', 'one')]))
    await settle()
    chat.selectChat('n-4')
    const held = node.chats.get('n-4')!
    held.turns.set(1, payload('x1', 'theirs'))
    held.head = { ...held.head, next_seq: 2, revision: held.head.revision + 1 }
    node.log.length = 0

    await chat.send('ours', { route: '/' })
    await settle()

    expect(node.log).toEqual(['PUT turn n-4/1 rev 2', 'GET chats', 'GET turns n-4 after 0', 'PUT turn n-4/2 rev 3'])
    expect(nodeTexts('n-4')).toEqual(['one', 'one answered', 'theirs', 'theirs answered', 'ours', 'ours answered'])
    expect(texts('n-4')).toEqual(nodeTexts('n-4'))
  })
})
