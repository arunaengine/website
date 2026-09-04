// The watcher path end to end: a chat asks the portal to follow a job, the
// user moves to another chat, and the finished job continues the first chat on
// its own without touching the one on screen.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { ToolSet } from 'ai'
import type { AssistantProvider, UserInfoResponse } from '@/lib/api'

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

const turns = vi.hoisted(() => ({
  calls: [] as Array<{ messages: unknown[]; tools: ToolSet }>,
  onTurn: null as null | ((call: { messages: unknown[]; tools: ToolSet }) => Promise<void> | void),
}))

vi.mock('@/lib/assistant/chat', () => ({
  runTurn: async (options: { messages: unknown[]; tools: ToolSet }) => {
    turns.calls.push({ messages: options.messages, tools: options.tools })
    await turns.onTurn?.(options)
    return { messages: [{ role: 'assistant', content: 'answered' }], error: null }
  },
}))

vi.mock('@/lib/assistant/models', () => ({ buildModel: () => ({ id: 'm-1' }) }))
vi.mock('@/lib/assistant/browserModels', () => ({ buildBrowserModel: () => ({ id: 'm-1' }) }))
vi.mock('@/lib/assistant/prompt', () => ({ systemPrompt: () => 'system' }))

const jobs = vi.hoisted(() => ({ state: 'running' }))
vi.mock('@/lib/jobs', () => ({ getJob: async () => ({ state: jobs.state }) }))

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
const { WATCH_FIRST_DELAY_MS } = await import('@/lib/assistant/watchers')

const scope = { apiBaseUrl: 'https://node.test', realmId: 'r-1', userId: 'u-1' }

function seed() {
  const first = { ...newAssistantChat('Read counts'), id: 'c-a', updatedAt: 9_000 }
  const second = { ...newAssistantChat('Bucket layout'), id: 'c-b', updatedAt: 1_000 }
  createAssistantChatStore(scope).save({ activeChatId: first.id, chats: [first, second] })
  apiBaseUrl.value = scope.apiBaseUrl
  authToken.value = 'token'
  userInfo.value = {
    user: { user_id: scope.userId },
    realm: { realm_id: scope.realmId, roles: [] },
    groups: [],
  } as unknown as UserInfoResponse
}

let useAssistantChat: typeof import('./useAssistantChat').useAssistantChat

beforeAll(async () => {
  vi.useFakeTimers()
  seed()
  useAssistantChat = (await import('./useAssistantChat')).useAssistantChat
})

/** Lets the queued resume finish its turn; nothing here sleeps on wall time. */
async function settle() {
  await vi.advanceTimersByTimeAsync(WATCH_FIRST_DELAY_MS * 3)
}

// The chat list carries the model history, whose union type is too deep for
// the checker to walk here; only the visible text matters for these tests.
function transcript(chats: unknown, id: string): string {
  const list = chats as Array<{ id: string; messages: Array<{ text: string }> }>
  return (list.find((entry) => entry.id === id)?.messages ?? []).map((message) => message.text).join(' ')
}

/** Calls the portal's own watch tool the way the model would. */
async function watch(tools: ToolSet, jobId: string, callId: string) {
  const entry = tools.watch_progress
  if (!entry?.execute) throw new Error('No watch_progress tool')
  await entry.execute({ kind: 'job', id: jobId, label: 'read counts' } as never, {
    toolCallId: callId,
    messages: [],
    context: undefined,
  })
}

describe('a watcher resuming its own chat', () => {
  it('continues the chat that asked, while another one is on screen', async () => {
    const chat = useAssistantChat()
    chat.selectChat('c-a')
    turns.onTurn = async ({ tools }) => {
      await watch(tools, '01JOB', 't-1')
      turns.onTurn = null
    }

    await chat.send('run the counts', { route: '/compute/run' })
    chat.selectChat('c-b')
    const onScreen = chat.messages.value.length
    jobs.state = 'succeeded'

    await settle()

    const active: string = chat.activeChatId.value
    expect(active).toBe('c-b')
    expect(chat.messages.value).toHaveLength(onScreen)
    expect(transcript(chat.chats.value, 'c-a')).toContain('Background update')
    // The resumed turn ran on the watching chat's own history.
    expect(JSON.stringify(turns.calls.at(-1)?.messages)).toContain('Background update')
    // Only the portal's update carries the mark; the person's words never do.
    const marks = (chat.chats.value as Array<{ id: string; messages: Array<{ text: string; background?: true }> }>)
      .find((entry) => entry.id === 'c-a')?.messages
      .filter((message) => message.text.startsWith('Background update') === Boolean(message.background))
    expect(marks?.length).toBeGreaterThan(1)
    expect(marks?.some((message) => message.background)).toBe(true)
  })

  it('marks the chat unread until it is opened', () => {
    const chat = useAssistantChat()
    expect(chat.unreadChats.value['c-a']).toBe(1)

    chat.selectChat('c-a')

    expect(chat.unreadChats.value['c-a']).toBeUndefined()
  })

  it('drops a watcher when its chat is deleted', async () => {
    const chat = useAssistantChat()
    chat.selectChat('c-b')
    jobs.state = 'running'
    turns.onTurn = async ({ tools }) => {
      await watch(tools, '02JOB', 't-2')
      turns.onTurn = null
    }
    await chat.send('watch the other run', { route: '/compute' })
    chat.deleteChat('c-b')
    jobs.state = 'succeeded'
    const before = turns.calls.length

    await settle()

    expect(turns.calls).toHaveLength(before)
  })

  it('hands the turn back to the person typing without losing the update', async () => {
    const chat = useAssistantChat()
    jobs.state = 'running'
    turns.onTurn = async ({ tools }) => {
      await watch(tools, '03JOB', 't-3')
      turns.onTurn = null
    }
    await chat.send('watch the third run', { route: '/compute' })

    // The watcher's turn is held open, so the composer must stay usable.
    let release = () => {}
    turns.onTurn = () => new Promise<void>((resolve) => {
      release = resolve
    })
    jobs.state = 'succeeded'
    await settle()
    expect(chat.busy.value).toBe(false)

    turns.onTurn = null
    await chat.send('never mind, what else is queued?', { route: '/compute' })
    release()
    await settle()

    const text = transcript(chat.chats.value, 'c-a')
    expect(text).toContain('never mind')
    expect(text.lastIndexOf('Background update')).toBeGreaterThan(text.indexOf('never mind'))
  })

  it('stops watching once the job settled', async () => {
    const chat = useAssistantChat()
    const before = turns.calls.length

    await settle()

    expect(turns.calls).toHaveLength(before)
    expect(chat.busy.value).toBe(false)
  })
})
