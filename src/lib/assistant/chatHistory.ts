import type { ModelMessage } from 'ai'
import { joinTurns, splitTurns, turnKey, type ChatTurn } from './chatTurns'
import type { ChatMessage, ToolCallView } from './types'

// Transcripts are kept in this browser and, where the node serves the routes,
// pushed to it turn by turn so they follow the user. Provider credentials are
// deliberately not part of a persisted chat record or its scope.
export const ASSISTANT_CHAT_STORAGE_KEY = 'aruna.assistant.chat-history.v1'
export const MAX_ASSISTANT_CHATS = 20
export const MAX_ASSISTANT_MESSAGES = 120
export const MAX_ASSISTANT_HISTORY_MESSAGES = 120
export const MAX_ASSISTANT_STORAGE_CHARS = 900_000

const MAX_TITLE_LENGTH = 80
const MAX_TEXT_LENGTH = 8_000
/** Web pages kept per answer; a search rarely cites more. */
const MAX_SOURCES = 50
/** How long a deleted chat's id is kept, so a tab open that long cannot write it back. */
const TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000

export interface AssistantChatScope {
  apiBaseUrl: string
  realmId: string
  userId: string
}

/** What the node last confirmed for a chat, so a reload reads on from there. */
export interface AssistantChatCursor {
  revision: number
  nextSeq: number
  /** The key of the turn at `nextSeq - 1`, which places the local turns. */
  tailKey: string
}

export interface AssistantChatRecord {
  id: string
  title: string
  /** What the chat is about, as the Ask AI button named it; a different one starts a new chat. */
  subject?: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  history: ModelMessage[]
  /** Kept in this browser only; never part of what goes to the node. */
  remote?: AssistantChatCursor
}

export interface AssistantChatState {
  activeChatId: string
  chats: AssistantChatRecord[]
}

export interface AssistantChatStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface PersistedPayload {
  version: 1
  state: AssistantChatState
  /** Ids of chats a tab deleted, with the time. */
  deleted?: Record<string, number>
}

let idCounter = 0

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  idCounter += 1
  return `chat-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

export function newAssistantChat(title = 'New chat', now = Date.now()): AssistantChatRecord {
  return {
    id: newId(),
    title: title.trim().slice(0, MAX_TITLE_LENGTH) || 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
    history: [],
  }
}

/** API base, realm, and authenticated user are the durable isolation boundary. */
export function assistantChatScopeKey(scope: AssistantChatScope): string {
  return [scope.apiBaseUrl, scope.realmId, scope.userId].map((part) => encodeURIComponent(part)).join('|')
}

function storageKey(scope: AssistantChatScope): string {
  return `${ASSISTANT_CHAT_STORAGE_KEY}:${assistantChatScopeKey(scope)}`
}

function browserStorage(): AssistantChatStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function boundedString(value: unknown, fallback: string, limit: number): string {
  return typeof value === 'string' && value.trim() ? value.slice(0, limit) : fallback
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const TOOL_STATES = new Set<ToolCallView['state']>(['approval', 'running', 'done', 'error', 'denied'])
const MODEL_ROLES = new Set(['system', 'user', 'assistant', 'tool'])

export function isModelMessage(value: unknown): value is ModelMessage {
  return record(value) && typeof value.role === 'string' && MODEL_ROLES.has(value.role) && 'content' in value
}

// A blob URL dies with the tab. The card keeps its record and its text, if
// any, and reads the object again when it has neither the URL nor the text.
function restoredView(view: Record<string, unknown>): ToolCallView['view'] | null {
  if (view.kind !== 'artifact') return view as ToolCallView['view']
  const artifact = record(view.artifact) ? view.artifact : null
  if (!artifact) return null
  const url = artifact.url
  if (typeof url === 'string' && !url.startsWith('blob:')) return view as ToolCallView['view']
  // Only the head of the text is worth a storage slot; the card holds the rest.
  const text = typeof artifact.text === 'string' ? { text: artifact.text.slice(0, MAX_TEXT_LENGTH) } : {}
  return { ...view, artifact: { ...artifact, url: '', ...text } } as ToolCallView['view']
}

function normalizeCall(value: unknown): ToolCallView | null {
  if (!record(value)) return null
  const id = boundedString(value.id, '', 200)
  const name = boundedString(value.name, '', 200)
  if (!id || !name || typeof value.state !== 'string' || !TOOL_STATES.has(value.state as ToolCallView['state'])) return null
  const call: ToolCallView = { id, name, input: value.input, state: value.state as ToolCallView['state'] }
  if ('output' in value) call.output = value.output
  if (typeof value.error === 'string') call.error = value.error.slice(0, MAX_TEXT_LENGTH)
  if (record(value.view) && typeof value.view.kind === 'string') {
    const view = restoredView(value.view)
    if (view) call.view = view
  }
  return call
}

// `fallback` dates a message stored before messages carried their own time.
export function normalizeMessage(value: unknown, fallback: number): ChatMessage | null {
  if (!record(value) || (value.role !== 'user' && value.role !== 'assistant')) return null
  const id = boundedString(value.id, '', 200)
  if (!id) return null
  const calls = Array.isArray(value.calls)
    ? value.calls.slice(-MAX_ASSISTANT_MESSAGES).map(normalizeCall).filter((call): call is ToolCallView => Boolean(call))
    : []
  const message: ChatMessage = {
    id,
    role: value.role,
    text: typeof value.text === 'string' ? value.text.slice(0, MAX_TEXT_LENGTH) : '',
    calls,
    at: numberValue(value.at, fallback),
  }
  if (value.background === true) message.background = true
  if (value.marker === true) message.marker = true
  if (typeof value.error === 'string') message.error = value.error.slice(0, MAX_TEXT_LENGTH)
  if (record(value.model)) {
    const providerId = boundedString(value.model.providerId, '', 200)
    const providerLabel = boundedString(value.model.providerLabel, '', 200)
    const model = boundedString(value.model.model, '', 200)
    if (providerId && model) message.model = { providerId, providerLabel, model }
  }
  if (Array.isArray(value.sources)) {
    const sources = value.sources.slice(0, MAX_SOURCES).flatMap((source) => {
      if (!record(source)) return []
      const url = boundedString(source.url, '', 2_000)
      const title = boundedString(source.title, '', 300)
      return url ? [{ url, ...(title ? { title } : {}) }] : []
    })
    if (sources.length) message.sources = sources
  }
  return message
}

function trimHistory(history: ModelMessage[]): ModelMessage[] {
  if (history.length <= MAX_ASSISTANT_HISTORY_MESSAGES) return history
  let start = history.length - MAX_ASSISTANT_HISTORY_MESSAGES
  while (start < history.length && history[start]?.role !== 'user') start += 1
  return history.slice(start)
}

function normalizeCursor(value: unknown): AssistantChatCursor | null {
  if (!record(value) || typeof value.revision !== 'number' || typeof value.nextSeq !== 'number') return null
  if (typeof value.tailKey !== 'string' || value.revision < 0 || value.nextSeq < 0) return null
  return { revision: value.revision, nextSeq: value.nextSeq, tailKey: value.tailKey }
}

function normalizeChat(value: unknown, now = Date.now()): AssistantChatRecord | null {
  if (!record(value)) return null
  const id = boundedString(value.id, '', 200)
  if (!id) return null
  const remote = normalizeCursor(value.remote)
  const createdAt = numberValue(value.createdAt, now)
  const messages = Array.isArray(value.messages)
    ? value.messages
      .slice(-MAX_ASSISTANT_MESSAGES)
      .map((message) => normalizeMessage(message, createdAt))
      .filter((message): message is ChatMessage => Boolean(message))
    : []
  const history = Array.isArray(value.history)
    ? trimHistory(value.history.slice(-MAX_ASSISTANT_HISTORY_MESSAGES * 2).filter(isModelMessage))
    : []
  const subject = boundedString(value.subject, '', MAX_TITLE_LENGTH)
  return {
    id,
    title: boundedString(value.title, 'New chat', MAX_TITLE_LENGTH),
    ...(subject ? { subject } : {}),
    createdAt,
    updatedAt: numberValue(value.updatedAt, now),
    messages,
    history,
    ...(remote ? { remote } : {}),
  }
}

function emptyState(): AssistantChatState {
  const chat = newAssistantChat()
  return { activeChatId: chat.id, chats: [chat] }
}

function normalizeChats(value: unknown[]): AssistantChatRecord[] {
  const seen = new Set<string>()
  return value
    .map((chat) => normalizeChat(chat))
    .filter((chat): chat is AssistantChatRecord => {
      if (!chat || seen.has(chat.id)) return false
      seen.add(chat.id)
      return true
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ASSISTANT_CHATS)
}

function normalizeState(value: unknown): AssistantChatState {
  if (!record(value) || !Array.isArray(value.chats)) return emptyState()
  const chats = normalizeChats(value.chats)
  if (!chats.length) return emptyState()
  const activeChatId = typeof value.activeChatId === 'string' && chats.some((chat) => chat.id === value.activeChatId)
    ? value.activeChatId
    : chats[0].id
  return { activeChatId, chats }
}

function readPayload(storage: AssistantChatStorage | null, key: string): Record<string, unknown> | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw || raw.length > MAX_ASSISTANT_STORAGE_CHARS * 2) return null
    const parsed = JSON.parse(raw) as unknown
    if (!record(parsed) || parsed.version !== 1 || !record(parsed.state)) return null
    return parsed
  } catch {
    return null
  }
}

function parseState(storage: AssistantChatStorage | null, key: string): AssistantChatState {
  const payload = readPayload(storage, key)
  return payload ? normalizeState(payload.state) : emptyState()
}

function liveTombstones(value: unknown, now: number): Record<string, number> {
  const kept: Record<string, number> = {}
  if (!record(value)) return kept
  for (const [id, at] of Object.entries(value)) if (typeof at === 'number' && now - at < TOMBSTONE_MS) kept[id] = at
  return kept
}

/**
 * This tab's chat with the turns another tab added to the stored copy. A turn
 * this tab held before and dropped stays dropped; the newer record names the chat.
 */
function mergeChat(mine: AssistantChatRecord, stored: AssistantChatRecord, held: Set<string>): AssistantChatRecord {
  const own = splitTurns(mine.messages, mine.history)
  const keys = new Set(own.map(turnKey))
  const added = splitTurns(stored.messages, stored.history)
    .filter((turn) => turnKey(turn) && !keys.has(turnKey(turn)) && !held.has(turnKey(turn)))
  const base = stored.updatedAt > mine.updatedAt ? stored : mine
  if (!added.length) return { ...base, messages: mine.messages, history: mine.history }
  // This tab's order stays; each added turn goes before the first turn that started later.
  const startOf = (turn: ChatTurn) => turn.messages[0]?.at ?? 0
  for (const turn of added) {
    const index = own.findIndex((entry) => startOf(entry) > startOf(turn))
    own.splice(index < 0 ? own.length : index, 0, turn)
  }
  const joined = joinTurns(own)
  return { ...base, messages: joined.messages, history: joined.history }
}

function serialize(payload: PersistedPayload): string | null {
  try {
    return JSON.stringify(payload)
  } catch {
    return null
  }
}

function compactChat(chat: AssistantChatRecord): AssistantChatRecord {
  // This path is only reached for an unusually large tool payload. Keep the
  // transcript usable while dropping nonessential card/call payload bytes.
  return {
    ...chat,
    messages: chat.messages.slice(-8).map((message) => ({ ...message, text: message.text.slice(-2_000), calls: [] })),
    history: chat.history.slice(-8),
  }
}

function boundedState(
  state: AssistantChatState,
  deleted: Record<string, number>,
): { state: AssistantChatState; raw: string | null } {
  let next: AssistantChatState = normalizeState(state)
  let raw = serialize({ version: 1, state: next, deleted })
  while (raw && raw.length > MAX_ASSISTANT_STORAGE_CHARS && next.chats.length > 1) {
    next = { ...next, chats: next.chats.slice(0, -1) }
    if (!next.chats.some((chat) => chat.id === next.activeChatId)) next = { ...next, activeChatId: next.chats[0].id }
    raw = serialize({ version: 1, state: next, deleted })
  }
  if (raw && raw.length > MAX_ASSISTANT_STORAGE_CHARS) {
    next = { ...next, chats: next.chats.map(compactChat) }
    raw = serialize({ version: 1, state: next, deleted })
  }
  // A circular or still oversized model payload should not make chat actions
  // throw. The final fallback retains names and recent visible text only.
  if (!raw || raw.length > MAX_ASSISTANT_STORAGE_CHARS) {
    next = { ...next, chats: next.chats.map((chat) => ({ ...compactChat(chat), history: [] })) }
    raw = serialize({ version: 1, state: next, deleted })
  }
  return { state: next, raw }
}

export function createAssistantChatStore(scope: AssistantChatScope, storage = browserStorage()) {
  const key = storageKey(scope)
  // The chats this tab holds, with the message ids each held, to tell its own
  // deletions from what another tab added since.
  let held = new Map<string, Set<string>>()
  const ids = (chat: AssistantChatRecord) => new Set(chat.messages.map((message) => message.id))
  return {
    key,
    load(): AssistantChatState {
      const state = parseState(storage, key)
      held = new Map(state.chats.map((chat) => [chat.id, ids(chat)]))
      return state
    },
    // Reads the stored chats again right before writing and merges them in, so
    // tabs sharing this storage do not overwrite each other's chats.
    save(state: AssistantChatState): AssistantChatState {
      const now = Date.now()
      const payload = readPayload(storage, key)
      const stored = payload && record(payload.state) && Array.isArray(payload.state.chats)
        ? normalizeChats(payload.state.chats)
        : []
      const deleted = liveTombstones(payload?.deleted, now)
      const mine = new Map(state.chats.map((chat) => [chat.id, chat]))
      for (const id of held.keys()) if (!mine.has(id)) deleted[id] = now
      const chats = state.chats.filter((chat) => !(chat.id in deleted)).map((chat) => {
        const other = stored.find((entry) => entry.id === chat.id)
        return other ? mergeChat(chat, other, held.get(chat.id) ?? new Set()) : chat
      })
      for (const chat of stored) {
        if (!mine.has(chat.id) && !held.has(chat.id) && !(chat.id in deleted) && chat.messages.length) chats.push(chat)
      }
      const bounded = boundedState({ ...state, chats }, deleted)
      held = new Map(bounded.state.chats.map((chat) => [chat.id, ids(mine.get(chat.id) ?? chat)]))
      if (storage && bounded.raw) {
        try {
          storage.setItem(key, bounded.raw)
        } catch {
          // Quota/private-mode failures leave the live in-memory chat usable.
        }
      }
      return bounded.state
    },
  }
}
