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
/** Room kept beside the largest single chat for the other keys of its scope. */
const SPARE_CHARS = 1_000

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

/** The storage the chats need: they are listed by going through its keys. */
export interface AssistantChatKeys extends AssistantChatStorage {
  removeItem(key: string): void
  readonly length: number
  key(index: number): string | null
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

function browserStorage(): AssistantChatKeys | null {
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
    if (raw && raw.length <= MAX_ASSISTANT_STORAGE_CHARS - SPARE_CHARS) return { chat: next, raw }
  }
  return null
}

/** The tab's own storage, so each tab keeps its own chat on screen. */
function browserSession(): AssistantChatStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage ?? null
  } catch {
    return null
  }
}

function updatedOf(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as unknown
    return record(parsed) ? numberValue(parsed.updatedAt, 0) : 0
  } catch {
    return 0
  }
}

/**
 * Keeps each chat under its own key and writes at once. A tab writes only the
 * chats it changed or deleted; the same chat changed in two tabs is last-writer-wins.
 */
export function createAssistantChatStore(
  scope: AssistantChatScope,
  storage: AssistantChatKeys | null = browserStorage(),
  session: AssistantChatStorage | null = browserSession(),
) {
  const key = storageKey(scope)
  const chatPrefix = `${key}:chat:`
  const activeKey = `${key}:active`
  const active = session ?? storage
  const chatKey = (id: string) => `${chatPrefix}${encodeURIComponent(id)}`
  // Chats changed here that the browser refused to store; the next save tries them again.
  const unsaved = new Set<string>()

  /** Every value this scope stores, by key, as storage holds it right now; the old key counts too. */
  function stored(): Map<string, string> {
    const values = new Map<string, string>()
    if (!storage) return values
    for (let at = 0; at < storage.length; at += 1) {
      const name = storage.key(at)
      const value = name === key || name?.startsWith(`${key}:`) ? storage.getItem(name) : null
      if (name && value !== null) values.set(name, value)
    }
    return values
  }

  /**
   * Writes the given chats of the state, or removes those it no longer holds,
   * and trims the oldest other chats to stay under the caps. Returns the ids not stored.
   */
  function write(state: AssistantChatState, ids: Iterable<string>, onlyAbsent = false): string[] {
    if (!storage) return []
    // Deletions and the chat on screen first, then the newest, so a full storage keeps those.
    const rank = (id: string) =>
      (id === state.activeChatId ? Infinity : state.chats.find((chat) => chat.id === id)?.updatedAt ?? Infinity)
    const names = [...ids].sort((a, b) => rank(b) - rank(a))
    let values = stored()
    // The chat on screen and the chats this write stores are never trimmed.
    const kept = new Set([state.activeChatId, ...names].map(chatKey))
    const chatNames = () => [...values.keys()].filter((name) => name.startsWith(chatPrefix))
    const used = () => [...values.values()].reduce((sum, value) => sum + value.length, 0)
    const over = () => used() > MAX_ASSISTANT_STORAGE_CHARS || chatNames().length > MAX_ASSISTANT_CHATS
    // Two tabs trimming at once may both remove an old chat; that only frees more room.
    const trimOldest = (): boolean => {
      const oldest = chatNames()
        .filter((name) => !kept.has(name))
        .sort((a, b) => updatedOf(values.get(a) ?? '') - updatedOf(values.get(b) ?? ''))[0]
      if (!oldest) return false
      storage.removeItem(oldest)
      values.delete(oldest)
      return true
    }
    const failed: string[] = []
    for (const id of names) {
      const name = chatKey(id)
      const chat = state.chats.find((entry) => entry.id === id)
      if (!chat) {
        storage.removeItem(name)
        values.delete(name)
        continue
      }
      if (onlyAbsent && values.has(name)) continue
      const fitted = fittedChat(chat)
      if (!fitted) continue
      const previous = values.get(name)
      values.set(name, fitted.raw)
      while (over()) if (!trimOldest()) break
      if (used() > MAX_ASSISTANT_STORAGE_CHARS) {
        // It does not fit beside the chats kept; the stored copy stays and the change waits.
        if (previous === undefined) values.delete(name)
        else values.set(name, previous)
        failed.push(id)
        continue
      }
      try {
        storage.setItem(name, fitted.raw)
      } catch {
        try {
          if (!trimOldest()) throw new Error('nothing left to trim')
          storage.setItem(name, fitted.raw)
        } catch {
          failed.push(id)
        }
      }
      // Another tab may have written meanwhile, so the total is measured again.
      values = stored()
      while (over()) if (!trimOldest()) break
    }
    return failed
  }

  /** Moves the history kept under one key into per-chat keys; returns the chats not moved yet. */
  function migrate(): AssistantChatRecord[] {
    if (!storage || storage.getItem(key) === null) return []
    const parsed = readJson(storage, key)
    const state = parsed?.version === 1 && record(parsed.state) ? normalizeState(parsed.state) : null
    if (state) {
      try {
        if (active && active.getItem(activeKey) === null) active.setItem(activeKey, state.activeChatId)
      } catch {
        // The newest chat shows instead.
      }
      // One chat at a time, the old key gives up each chat right before it is stored on its
      // own, so a chat moved and then deleted cannot come back from it.
      let left = state.chats
      for (const chat of state.chats) {
        const rest = left.filter((entry) => entry.id !== chat.id)
        if (!keepOld(state.activeChatId, rest)) break
        // A chat another tab already stored keeps that copy, which may hold a newer answer.
        if (write({ activeChatId: state.activeChatId, chats: [chat] }, [chat.id], true).length) {
          keepOld(state.activeChatId, left)
        } else left = rest
      }
      return left
    }
    keepOld('', [])
    return []
  }

  /** Rewrites the old key with only the chats not moved yet; false when storage refused it. */
  function keepOld(activeChatId: string, chats: AssistantChatRecord[]): boolean {
    try {
      if (chats.length) storage?.setItem(key, serialize({ version: 1, state: { activeChatId, chats } }) ?? '')
      else storage?.removeItem(key)
      return true
    } catch {
      return false
    }
  }

  /** The state as this tab holds it; the changed chats are in storage when this returns. */
  function save(state: AssistantChatState, changed: Iterable<string> = state.chats.map((chat) => chat.id)) {
    const next = normalizeState(state)
    if (!storage) return next
    try {
      active?.setItem(activeKey, next.activeChatId)
    } catch {
      // The newest chat shows after a reload instead.
    }
    for (const id of changed) unsaved.add(id)
    const failed = write(next, [...unsaved])
    unsaved.clear()
    for (const id of failed) unsaved.add(id)
    return next
  }

  function load(): AssistantChatState {
    if (!storage) return emptyState()
    const pending = migrate()
    const chats: Array<Record<string, unknown> | AssistantChatRecord> = []
    for (const [name, value] of stored()) {
      if (!name.startsWith(chatPrefix)) continue
      try {
        const chat = JSON.parse(value) as unknown
        if (record(chat) && chat.id === decodeURIComponent(name.slice(chatPrefix.length))) chats.push(chat)
      } catch {
        // An unreadable chat is left out.
      }
    }
    for (const chat of pending) if (!chats.some((entry) => entry.id === chat.id)) chats.push(chat)
    let shown = ''
    try {
      shown = active?.getItem(activeKey) ?? ''
    } catch {
      // The newest chat shows instead.
    }
    return normalizeState({ activeChatId: shown, chats })
  }

  return {
    key,
    load,
    save,
    /** True for a storage event that changed a chat of this scope. */
    listChanged: (changed: string | null) => changed === null || changed.startsWith(chatPrefix),
    /** The chats changed here that storage refused so far. */
    unsavedChats: () => new Set(unsaved),
  }
}
