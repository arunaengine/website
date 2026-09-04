import type { ModelMessage } from 'ai'
import type { ChatMessage, ToolCallView } from './types'

// Transcripts are local to this browser. Provider credentials are deliberately
// not part of a persisted chat record or its scope.
export const ASSISTANT_CHAT_STORAGE_KEY = 'aruna.assistant.chat-history.v1'
export const MAX_ASSISTANT_CHATS = 20
export const MAX_ASSISTANT_MESSAGES = 120
export const MAX_ASSISTANT_HISTORY_MESSAGES = 120
export const MAX_ASSISTANT_STORAGE_CHARS = 900_000

const MAX_TITLE_LENGTH = 80
const MAX_TEXT_LENGTH = 8_000

export interface AssistantChatScope {
  apiBaseUrl: string
  realmId: string
  userId: string
}

export interface AssistantChatRecord {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  history: ModelMessage[]
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

function isModelMessage(value: unknown): value is ModelMessage {
  return record(value) && typeof value.role === 'string' && MODEL_ROLES.has(value.role) && 'content' in value
}

// A blob URL dies with the tab. A card that carries its text still draws from
// that text, with the dead URL dropped; anything else keeps only its record.
function restoredView(view: Record<string, unknown>): ToolCallView['view'] | null {
  if (view.kind !== 'artifact') return view as ToolCallView['view']
  const artifact = record(view.artifact) ? view.artifact : null
  const url = artifact?.url
  if (typeof url === 'string' && !url.startsWith('blob:')) return view as ToolCallView['view']
  if (!artifact || typeof artifact.text !== 'string' || !artifact.text) return null
  // Only the head of the text is worth a storage slot; the card holds the rest.
  const text = artifact.text.slice(0, MAX_TEXT_LENGTH)
  return { ...view, artifact: { ...artifact, url: '', text } } as ToolCallView['view']
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
function normalizeMessage(value: unknown, fallback: number): ChatMessage | null {
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
  if (typeof value.error === 'string') message.error = value.error.slice(0, MAX_TEXT_LENGTH)
  return message
}

function trimHistory(history: ModelMessage[]): ModelMessage[] {
  if (history.length <= MAX_ASSISTANT_HISTORY_MESSAGES) return history
  let start = history.length - MAX_ASSISTANT_HISTORY_MESSAGES
  while (start < history.length && history[start]?.role !== 'user') start += 1
  return history.slice(start)
}

function normalizeChat(value: unknown, now = Date.now()): AssistantChatRecord | null {
  if (!record(value)) return null
  const id = boundedString(value.id, '', 200)
  if (!id) return null
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
  return {
    id,
    title: boundedString(value.title, 'New chat', MAX_TITLE_LENGTH),
    createdAt,
    updatedAt: numberValue(value.updatedAt, now),
    messages,
    history,
  }
}

function emptyState(): AssistantChatState {
  const chat = newAssistantChat()
  return { activeChatId: chat.id, chats: [chat] }
}

function normalizeState(value: unknown): AssistantChatState {
  if (!record(value) || !Array.isArray(value.chats)) return emptyState()
  const seen = new Set<string>()
  const chats = value.chats
    .map((chat) => normalizeChat(chat))
    .filter((chat): chat is AssistantChatRecord => {
      if (!chat || seen.has(chat.id)) return false
      seen.add(chat.id)
      return true
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ASSISTANT_CHATS)
  if (!chats.length) return emptyState()
  const activeChatId = typeof value.activeChatId === 'string' && chats.some((chat) => chat.id === value.activeChatId)
    ? value.activeChatId
    : chats[0].id
  return { activeChatId, chats }
}

function parseState(storage: AssistantChatStorage | null, key: string): AssistantChatState {
  if (!storage) return emptyState()
  try {
    const raw = storage.getItem(key)
    if (!raw || raw.length > MAX_ASSISTANT_STORAGE_CHARS * 2) return emptyState()
    const parsed = JSON.parse(raw) as unknown
    if (!record(parsed) || parsed.version !== 1 || !record(parsed.state)) return emptyState()
    return normalizeState(parsed.state)
  } catch {
    return emptyState()
  }
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

function boundedState(state: AssistantChatState): { state: AssistantChatState; raw: string | null } {
  let next: AssistantChatState = normalizeState(state)
  let raw = serialize({ version: 1, state: next })
  while (raw && raw.length > MAX_ASSISTANT_STORAGE_CHARS && next.chats.length > 1) {
    next = { ...next, chats: next.chats.slice(0, -1) }
    if (!next.chats.some((chat) => chat.id === next.activeChatId)) next = { ...next, activeChatId: next.chats[0].id }
    raw = serialize({ version: 1, state: next })
  }
  if (raw && raw.length > MAX_ASSISTANT_STORAGE_CHARS) {
    next = { ...next, chats: next.chats.map(compactChat) }
    raw = serialize({ version: 1, state: next })
  }
  // A circular or still oversized model payload should not make chat actions
  // throw. The final fallback retains names and recent visible text only.
  if (!raw || raw.length > MAX_ASSISTANT_STORAGE_CHARS) {
    next = { ...next, chats: next.chats.map((chat) => ({ ...compactChat(chat), history: [] })) }
    raw = serialize({ version: 1, state: next })
  }
  return { state: next, raw }
}

export function createAssistantChatStore(scope: AssistantChatScope, storage = browserStorage()) {
  const key = storageKey(scope)
  return {
    key,
    load(): AssistantChatState {
      return parseState(storage, key)
    },
    save(state: AssistantChatState): AssistantChatState {
      const bounded = boundedState(state)
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
