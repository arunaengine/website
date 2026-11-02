import type { ModelMessage } from 'ai'
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
/** Room kept beside the largest single chat for the index. */
const INDEX_ROOM = 20_000

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
  removeItem?(key: string): void
  /** Lets a load find a chat key the index lost. */
  readonly length?: number
  key?(index: number): string | null
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
  // The count limit drops the oldest chats, but never the one on screen.
  const active = chats.find((chat) => chat.id === value.activeChatId)
  chats.splice(MAX_ASSISTANT_CHATS)
  if (active && !chats.includes(active)) chats.splice(MAX_ASSISTANT_CHATS - 1, 1, active)
  if (!chats.length) return emptyState()
  const activeChatId = typeof value.activeChatId === 'string' && chats.some((chat) => chat.id === value.activeChatId)
    ? value.activeChatId
    : chats[0].id
  return { activeChatId, chats }
}

function serialize(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function readJson(storage: AssistantChatStorage, key: string): Record<string, unknown> | null {
  try {
    const raw = storage.getItem(key)
    if (!raw || raw.length > MAX_ASSISTANT_STORAGE_CHARS * 2) return null
    const parsed = JSON.parse(raw) as unknown
    return record(parsed) ? parsed : null
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

/** The chat as stored, compacted until it fits; a circular or still oversized one is not stored. */
function fittedChat(chat: AssistantChatRecord): { chat: AssistantChatRecord; raw: string } | null {
  const compact = compactChat(chat)
  for (const next of [chat, compact, { ...compact, history: [] }]) {
    const raw = serialize(next)
    if (raw && raw.length <= MAX_ASSISTANT_STORAGE_CHARS - INDEX_ROOM) return { chat: next, raw }
  }
  return null
}

interface ChatIndex {
  version: 1
  activeChatId: string
  /** Each stored chat with its time, to trim the oldest first. */
  chats: Record<string, { updatedAt: number }>
}

function readIndex(storage: AssistantChatStorage, key: string): ChatIndex {
  const parsed = readJson(storage, key)
  const chats: ChatIndex['chats'] = {}
  if (parsed && record(parsed.chats)) {
    for (const [id, entry] of Object.entries(parsed.chats)) {
      if (record(entry)) chats[id] = { updatedAt: numberValue(entry.updatedAt, 0) }
    }
  }
  return { version: 1, activeChatId: typeof parsed?.activeChatId === 'string' ? parsed.activeChatId : '', chats }
}

/** The part of navigator.locks the store uses. */
export interface AssistantChatLocks {
  request(name: string, callback: () => unknown): Promise<unknown>
}

function browserLocks(): AssistantChatLocks | null {
  if (typeof window === 'undefined') return null
  return window.navigator?.locks ?? null
}

/**
 * Keeps each chat under its own key beside an index. Every write runs under
 * one lock per scope and stores only the chats this tab changed or deleted.
 */
export function createAssistantChatStore(scope: AssistantChatScope, storage = browserStorage(), locks = browserLocks()) {
  const key = storageKey(scope)
  const indexKey = `${key}:index`
  const chatPrefix = `${key}:chat:`
  const lockName = `aruna-assistant-history:${assistantChatScopeKey(scope)}`
  const chatKey = (id: string) => `${chatPrefix}${encodeURIComponent(id)}`
  // The state last saved here, and the chats it changed that are not stored yet.
  let latest: AssistantChatState | null = null
  const dirty = new Set<string>()
  let queued = false
  let written: Promise<unknown> = Promise.resolve()

  function remove(id: string) {
    try {
      storage?.removeItem?.(chatKey(id))
    } catch {
      // A chat left behind is listed again on the next load.
    }
  }

  /** Every chat id the index or a chat key names. */
  function storedIds(index: ChatIndex): Set<string> {
    const ids = new Set(Object.keys(index.chats))
    if (storage && typeof storage.key === 'function' && typeof storage.length === 'number') {
      for (let at = 0; at < storage.length; at += 1) {
        const name = storage.key(at)
        if (name?.startsWith(chatPrefix)) ids.add(decodeURIComponent(name.slice(chatPrefix.length)))
      }
    }
    return ids
  }

  /** Moves the history kept under one key into per-chat keys; false keeps it for a later try. */
  function migrate(): boolean {
    if (!storage || storage.getItem(key) === null || storage.getItem(indexKey) !== null) return true
    const parsed = readJson(storage, key)
    const state = parsed?.version === 1 && record(parsed.state) ? normalizeState(parsed.state) : null
    const done: string[] = []
    try {
      if (state) {
        const index: ChatIndex = { version: 1, activeChatId: state.activeChatId, chats: {} }
        for (const chat of state.chats) {
          const fitted = fittedChat(chat)
          if (!fitted) continue
          storage.setItem(chatKey(chat.id), fitted.raw)
          done.push(chat.id)
          index.chats[chat.id] = { updatedAt: chat.updatedAt }
        }
        storage.setItem(indexKey, serialize(index) ?? '')
      }
    } catch {
      for (const id of done) remove(id)
      return false
    }
    try {
      storage.removeItem?.(key)
    } catch {
      // With the index written, a load reads the per-chat keys and never this one.
    }
    return true
  }

  /** Stores the changed chats, the index and the trim, from what storage holds right now. */
  function flush() {
    if (!storage || !migrate() || !latest) return
    const state = latest
    const changed = [...dirty]
    dirty.clear()
    const index = readIndex(storage, indexKey)
    const sizes = new Map<string, number>()
    for (const id of storedIds(index)) {
      const raw = storage.getItem(chatKey(id))
      if (raw === null) delete index.chats[id]
      else {
        sizes.set(id, raw.length)
        index.chats[id] ??= { updatedAt: 0 }
      }
    }
    const before = new Set(sizes.keys())
    const writes = new Map<string, string>()
    for (const id of changed) {
      const chat = state.chats.find((entry) => entry.id === id)
      const fitted = chat ? fittedChat(chat) : null
      if (chat && fitted) {
        writes.set(id, fitted.raw)
        sizes.set(id, fitted.raw.length)
        index.chats[id] = { updatedAt: chat.updatedAt }
      } else if (!chat) {
        sizes.delete(id)
        delete index.chats[id]
      }
    }
    index.activeChatId = state.activeChatId
    // Whole chats go, oldest first, until the count and the total fit; the chat on screen stays.
    const oldest = [...sizes.keys()]
      .filter((id) => id !== state.activeChatId)
      .sort((a, b) => (index.chats[a]?.updatedAt ?? 0) - (index.chats[b]?.updatedAt ?? 0))
    const used = () => [...sizes.values()].reduce((sum, size) => sum + size, 0) + (serialize(index)?.length ?? 0)
    for (const id of oldest) {
      if (sizes.size <= MAX_ASSISTANT_CHATS && used() <= MAX_ASSISTANT_STORAGE_CHARS) break
      sizes.delete(id)
      delete index.chats[id]
      writes.delete(id)
    }
    for (const id of before) if (!sizes.has(id)) remove(id)
    for (const [id, raw] of writes) {
      try {
        storage.setItem(chatKey(id), raw)
      } catch {
        // Quota/private-mode failures keep the chat in memory and try it again on the next save.
        dirty.add(id)
        if (!before.has(id)) delete index.chats[id]
      }
    }
    try {
      storage.setItem(indexKey, serialize(index) ?? '')
    } catch {
      // The chats are stored; a load lists them again without the index.
    }
  }

  function schedule() {
    if (!locks) {
      // Without Web Locks, re-reading right before the write is the best a tab can do.
      flush()
      return
    }
    if (queued) return
    queued = true
    written = locks.request(lockName, () => {
      queued = false
      flush()
    }).catch(() => {})
  }

  /** The state as this tab keeps it; only the storage write waits for the lock. */
  function save(state: AssistantChatState, changed: Iterable<string> = state.chats.map((chat) => chat.id)) {
    latest = normalizeState(state)
    for (const id of changed) dirty.add(id)
    if (storage) schedule()
    return latest
  }

  function load(): AssistantChatState {
    if (!storage) return emptyState()
    if (storage.getItem(indexKey) === null && storage.getItem(key) !== null) {
      // Read from the old key until a write under the lock has moved it.
      const parsed = readJson(storage, key)
      schedule()
      return parsed?.version === 1 && record(parsed.state) ? normalizeState(parsed.state) : emptyState()
    }
    const index = readIndex(storage, indexKey)
    const chats: unknown[] = []
    for (const id of storedIds(index)) {
      const chat = readJson(storage, chatKey(id))
      if (chat?.id === id) chats.push(chat)
    }
    return normalizeState({ activeChatId: index.activeChatId, chats })
  }

  return {
    key,
    load,
    save,
    /** True for a storage event that changed this scope's list of chats. */
    indexChanged: (changed: string | null) => changed === null || changed === indexKey,
    /** Settles once the writes queued so far are done. */
    whenWritten: () => written,
  }
}
