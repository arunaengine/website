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

interface TurnCall {
  messages: unknown[]
  tools: ToolSet
  onToolCall?: (call: { id: string; name: string; input: unknown }) => void
}

const turns = vi.hoisted(() => ({
  calls: [] as Array<{ messages: unknown[]; tools: ToolSet }>,
  onTurn: null as null | ((call: TurnCall) => Promise<void> | void),
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

const jobs = vi.hoisted(() => ({ state: 'running', polled: [] as string[] }))
vi.mock('@/lib/jobs', () => ({
  getJob: async (id: string) => {
    jobs.polled.push(id)
    return { state: jobs.state }
  },
}))

// Whether this tab leads the watchers; without Web Locks every tab would.
const lead = vi.hoisted(() => ({ value: true, names: [] as Array<string | undefined> }))
vi.mock('@/lib/assistant/watchLock', () => ({
  WATCH_LOCK_NAME: 'aruna.assistant.watch',
  watchLeadership: (_locks: unknown, name?: string) => {
    lead.names.push(name)
    return { leading: () => lead.value, claim: async () => lead.value, release: () => {} }
  },
}))

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
const { WATCH_DEADLINE_MS, WATCH_FIRST_DELAY_MS, createWatchStore, watchId } = await import('@/lib/assistant/watchers')
const { useNotifications } = await import('./useNotifications')

const scope = { apiBaseUrl: 'https://node.test', realmId: 'r-1', userId: 'u-1' }

function seed() {
  const first = { ...newAssistantChat('Read counts'), id: 'c-a', updatedAt: 9_000 }
  const second = { ...newAssistantChat('Bucket layout'), id: 'c-b', updatedAt: 1_000 }
  createAssistantChatStore(scope).save({ activeChatId: first.id, chats: [first, second] })
  apiBaseUrl.value = scope.apiBaseUrl
  authToken.value = 'token'
  userInfo.value = {
    user: { user_id: scope.userId, name: 'Ada', attributes: {} },
    realm: { realm_id: scope.realmId, roles: [] },
    groups: [],
    preferences: {},
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

/** Draws a job card the way the model would: the call lands, then it runs. */
async function showJob(turn: TurnCall, jobId: string, state: string, callId: string) {
  const entry = turn.tools.show_job
  if (!entry?.execute) throw new Error('No show_job tool')
  turn.onToolCall?.({ id: callId, name: 'show_job', input: {} })
  return entry.execute({ job_id: jobId, state, kind: 'execution', title: 'read counts' } as never, {
    toolCallId: callId,
    messages: [],
    context: undefined,
  })
}

function jobCards(messages: unknown, jobId: string) {
  const list = messages as Array<{ calls: Array<{ view?: { kind: string; jobId?: string; state?: string } }> }>
  return list
    .flatMap((message) => message.calls)
    .flatMap((call) => (call.view?.kind === 'job' && call.view.jobId === jobId ? [call.view] : []))
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
    // The person sees the background turn at work in the chat on screen.
    expect(chat.working.value).toBe(true)
    expect(chat.workingLabel.value).toBe('Thinking')

    turns.onTurn = null
    await chat.send('never mind, what else is queued?', { route: '/compute' })
    release()
    await settle()

    const text = transcript(chat.chats.value, 'c-a')
    expect(text).toContain('never mind')
    expect(text.lastIndexOf('Background update')).toBeGreaterThan(text.indexOf('never mind'))
  })

  it('keeps one card for a job however often it is drawn', async () => {
    const chat = useAssistantChat()
    chat.selectChat('c-a')
    jobs.state = 'running'
    let second: unknown
    turns.onTurn = async (turn) => {
      await showJob(turn, '04JOB', 'queued', 's-1')
      second = await showJob(turn, '04JOB', 'running', 's-2')
      turns.onTurn = null
    }

    await chat.send('start the counts', { route: '/compute' })

    const cards = jobCards(chat.messages.value, '04JOB')
    expect(cards).toHaveLength(1)
    expect(cards[0].state).toBe('running')
    expect(second).toMatchObject({ updated: true })
  })

  it('opens a chat for another subject and keeps the one it is about', () => {
    const chat = useAssistantChat()
    chat.selectChat('c-a')
    const started = chat.activeChatId.value

    chat.openWith('Explain this run', 'run 04JOB')
    const opened: string = chat.activeChatId.value
    expect(opened).not.toBe(started)
    expect(chat.draft.value).toBe('Explain this run')

    chat.openWith('And what did it write?', 'run 04JOB')

    expect(chat.activeChatId.value).toBe(opened)
  })

  it('stops watching once the job settled', async () => {
    const chat = useAssistantChat()
    const before = turns.calls.length

    await settle()

    expect(turns.calls).toHaveLength(before)
    expect(chat.busy.value).toBe(false)
  })
})

/** Starts a watch on `jobId` from chat c-a, the way the model would. */
async function startWatch(jobId: string, callId: string) {
  const chat = useAssistantChat()
  chat.selectChat('c-a')
  jobs.state = 'running'
  turns.onTurn = async ({ tools }) => {
    await watch(tools, jobId, callId)
    turns.onTurn = null
  }
  await chat.send(`watch ${jobId}`, { route: '/compute' })
  return chat
}

function polls(jobId: string) {
  return jobs.polled.filter((id) => id === jobId).length
}

describe('a change the node reports', () => {
  it('polls the watched job before the timer would', async () => {
    const chat = await startWatch('05JOB', 't-5')
    jobs.state = 'succeeded'
    const before = turns.calls.length

    // A burst of frames is one poll round, well inside the first 5 s delay.
    useNotifications().dashboardRevision.value++
    useNotifications().dashboardRevision.value++
    await vi.advanceTimersByTimeAsync(WATCH_FIRST_DELAY_MS / 2)

    expect(polls('05JOB')).toBe(1)
    expect(turns.calls.length).toBe(before + 1)
    expect(transcript(chat.chats.value, 'c-a')).toContain('05JOB')
  })

  it('leaves the polling to the tab that leads', async () => {
    await startWatch('06JOB', 't-6')
    jobs.state = 'succeeded'
    lead.value = false

    useNotifications().dashboardRevision.value++
    await vi.advanceTimersByTimeAsync(WATCH_FIRST_DELAY_MS / 2)

    expect(polls('06JOB')).toBe(0)
    lead.value = true
    await settle()
    expect(polls('06JOB')).toBeGreaterThan(0)
  })
})

describe('watches shared between tabs', () => {
  const store = () => createWatchStore(scope)

  it('locks the lead per node and user', () => {
    expect(lead.names.at(-1)).toBe('aruna.assistant.watch:https%3A%2F%2Fnode.test|r-1|u-1')
  })

  /** A watch on chat c-a as another tab would have written it to the store. */
  function theirs(jobId: string) {
    const at = Date.now()
    return {
      id: watchId('c-a', 'job', jobId),
      chatId: 'c-a',
      kind: 'job' as const,
      target: jobId,
      label: 'theirs',
      createdAt: at,
      deadlineAt: at + WATCH_DEADLINE_MS,
      nextPollAt: at,
      attempts: 0,
      errors: 0,
    }
  }

  it('polls a watch another tab put in the store', async () => {
    await startWatch('10JOB', 't-10')
    const held = store().load()
    store().save({ ...held, watches: [...held.watches, theirs('11JOB')] })
    jobs.state = 'succeeded'

    await settle()

    expect(polls('10JOB')).toBeGreaterThan(0)
    expect(polls('11JOB')).toBeGreaterThan(0)
  })

  it('adds beside the leader\'s watches when this tab does not lead', async () => {
    store().save({ ...store().load(), watches: [theirs('12JOB')] })
    lead.value = false

    await startWatch('13JOB', 't-13')

    expect(store().load().watches.map((entry) => entry.target)).toEqual(['12JOB', '13JOB'])

    // The leading tab answered its own watch meanwhile; the follower's is left for it to poll.
    store().save({ ...store().load(), watches: store().load().watches.filter((entry) => entry.target === '13JOB') })
    lead.value = true
    jobs.state = 'succeeded'
    await settle()
    expect(polls('12JOB')).toBe(0)
    expect(polls('13JOB')).toBeGreaterThan(0)
  })
})
