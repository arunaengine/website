// Background watchers: the portal polls a job or a bucket sync for the
// assistant and continues that chat once the work settles. They are stored
// beside the chat history, so they survive a reload but never leave the browser.
import { assistantChatScopeKey, type AssistantChatScope, type AssistantChatStorage } from './chatHistory'

export const ASSISTANT_WATCH_STORAGE_KEY = 'aruna.assistant.watchers.v1'
export const MAX_ASSISTANT_WATCHES = 8
/** A watcher stops on its own after this long, whatever the work is doing. */
export const WATCH_DEADLINE_MS = 2 * 60 * 60 * 1000
export const WATCH_FIRST_DELAY_MS = 5_000
export const WATCH_MAX_DELAY_MS = 60_000
export const MAX_WATCH_ERRORS = 5

const WATCH_GROWTH = 1.6
const MAX_WATCH_STORAGE_CHARS = 40_000
const MAX_LABEL_LENGTH = 80
const MAX_ID_LENGTH = 200
const MAX_UNREAD_CHATS = 40

export type WatchKind = 'job' | 'sync'

export interface AssistantWatch {
  /** Stable per chat and target, so watching the same thing twice is one watch. */
  id: string
  chatId: string
  kind: WatchKind
  /** Job id or sync relationship id. */
  target: string
  /** Short human name the model gave the work. */
  label: string
  createdAt: number
  deadlineAt: number
  nextPollAt: number
  attempts: number
  errors: number
  /** Signature of the last poll, so a change can be told from a repeat. */
  seen?: string
}

/** What one poll decided: keep waiting, or resume the chat and stop. */
export type WatchPoll =
  | { state: 'pending'; seen?: string }
  | { state: 'final'; text: string }

export interface WatchPayload {
  watches: AssistantWatch[]
  /** Updates that landed in a chat the user has not opened since. */
  unread: Record<string, number>
}

export function watchDelay(attempts: number): number {
  return Math.min(WATCH_MAX_DELAY_MS, Math.round(WATCH_FIRST_DELAY_MS * WATCH_GROWTH ** attempts))
}

export function watchId(chatId: string, kind: WatchKind, target: string): string {
  return `${chatId}|${kind}|${target}`
}

const JOB_TERMINAL = new Set(['succeeded', 'failed', 'cancelled'])

/** `indeterminate` proves nothing, so only the three settled states finish a watch. */
export function jobOutcome(watch: AssistantWatch, state: string): WatchPoll {
  if (!JOB_TERMINAL.has(state)) return state === watch.seen ? { state: 'pending' } : { state: 'pending', seen: state }
  return {
    state: 'final',
    text: `Background update: the job ${watch.target} (${watch.label}) reached the state ${state}.`,
  }
}

export interface SyncSnapshot {
  state: string
  pendingJobs: number
  lastSyncedAt?: string | null
  lastError?: string | null
}

function syncSignature(snapshot: SyncSnapshot): string {
  const at = snapshot.lastSyncedAt ?? ''
  return `${snapshot.state}|${snapshot.pendingJobs}|${at}|${snapshot.lastError ? 'error' : ''}`
}

function syncedAfter(watch: AssistantWatch, snapshot: SyncSnapshot): boolean {
  const at = snapshot.lastSyncedAt ? Date.parse(snapshot.lastSyncedAt) : Number.NaN
  return Number.isFinite(at) && at >= watch.createdAt
}

// A sync has no terminal state: the first poll records a baseline, later polls
// report a failure or an idle relationship that synced since the watch began.
// An error already present at the baseline may predate the watch.
export function syncOutcome(watch: AssistantWatch, snapshot: SyncSnapshot): WatchPoll {
  const signature = syncSignature(snapshot)
  if (signature === watch.seen) return { state: 'pending' }
  const first = watch.seen === undefined
  if (snapshot.state === 'failed' || (!first && Boolean(snapshot.lastError))) {
    return {
      state: 'final',
      text: `Background update: the bucket sync ${watch.target} (${watch.label}) is failing.`,
    }
  }
  if (snapshot.pendingJobs === 0 && syncedAfter(watch, snapshot)) {
    return {
      state: 'final',
      text: `Background update: the bucket sync ${watch.target} (${watch.label}) finished. `
        + `Nothing is queued and it last synced at ${snapshot.lastSyncedAt}.`,
    }
  }
  return { state: 'pending', seen: signature }
}

function deadlineText(watch: AssistantWatch): string {
  return `Background update: the ${watch.kind} ${watch.target} (${watch.label}) has still not settled, `
    + 'so the portal stopped watching it.'
}

function errorText(watch: AssistantWatch): string {
  return `Background update: the ${watch.kind} ${watch.target} (${watch.label}) could not be read, `
    + 'so the portal stopped watching it.'
}

// ── Storage ────────────────────────────────────────────────────────────────

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

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : ''
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizeWatch(value: unknown, now: number): AssistantWatch | null {
  if (!record(value)) return null
  const chatId = text(value.chatId, MAX_ID_LENGTH)
  const target = text(value.target, MAX_ID_LENGTH)
  const kind = value.kind === 'job' || value.kind === 'sync' ? value.kind : null
  if (!chatId || !target || !kind) return null
  const deadlineAt = count(value.deadlineAt)
  if (deadlineAt <= now) return null
  return {
    id: watchId(chatId, kind, target),
    chatId,
    kind,
    target,
    label: text(value.label, MAX_LABEL_LENGTH) || target,
    createdAt: count(value.createdAt) || now,
    deadlineAt,
    // A reload polls once shortly after startup rather than resuming the backoff.
    nextPollAt: now + WATCH_FIRST_DELAY_MS,
    attempts: count(value.attempts),
    errors: 0,
    ...(typeof value.seen === 'string' ? { seen: value.seen.slice(0, MAX_ID_LENGTH) } : {}),
  }
}

function normalizeUnread(value: unknown): Record<string, number> {
  if (!record(value)) return {}
  const unread: Record<string, number> = {}
  for (const [chatId, amount] of Object.entries(value).slice(0, MAX_UNREAD_CHATS)) {
    const total = Math.min(99, Math.max(0, Math.floor(count(amount))))
    if (chatId && total) unread[chatId.slice(0, MAX_ID_LENGTH)] = total
  }
  return unread
}

export function createWatchStore(scope: AssistantChatScope, storage = browserStorage()) {
  const key = `${ASSISTANT_WATCH_STORAGE_KEY}:${assistantChatScopeKey(scope)}`
  return {
    key,
    load(now = Date.now()): WatchPayload {
      if (!storage) return { watches: [], unread: {} }
      try {
        const raw = storage.getItem(key)
        if (!raw || raw.length > MAX_WATCH_STORAGE_CHARS * 2) return { watches: [], unread: {} }
        const parsed = JSON.parse(raw) as unknown
        if (!record(parsed) || parsed.version !== 1) return { watches: [], unread: {} }
        const seen = new Set<string>()
        const watches = (Array.isArray(parsed.watches) ? parsed.watches : [])
          .map((entry) => normalizeWatch(entry, now))
          .filter((watch): watch is AssistantWatch => {
            if (!watch || seen.has(watch.id)) return false
            seen.add(watch.id)
            return true
          })
          .slice(0, MAX_ASSISTANT_WATCHES)
        return { watches, unread: normalizeUnread(parsed.unread) }
      } catch {
        return { watches: [], unread: {} }
      }
    },
    save(payload: WatchPayload): void {
      if (!storage) return
      try {
        const raw = JSON.stringify({
          version: 1,
          watches: payload.watches.slice(0, MAX_ASSISTANT_WATCHES),
          unread: normalizeUnread(payload.unread),
        })
        if (raw.length <= MAX_WATCH_STORAGE_CHARS) storage.setItem(key, raw)
      } catch {
        // Quota or private-mode failures leave the live watchers running.
      }
    },
  }
}

// ── Registry ───────────────────────────────────────────────────────────────

export interface WatchRegistryOptions {
  poll: (watch: AssistantWatch) => Promise<WatchPoll>
  /** Appends the update to that chat and lets the assistant answer it. */
  resume: (chatId: string, text: string) => void
  hasChat: (chatId: string) => boolean
  load: () => AssistantWatch[]
  save: (watches: AssistantWatch[]) => void
  now?: () => number
}

export interface WatchResult {
  ok: boolean
  message: string
}

export interface WatchRegistry {
  list(): AssistantWatch[]
  add(input: { chatId: string; kind: WatchKind; target: string; label: string }): WatchResult
  dropChat(chatId: string): void
  clear(): void
  tick(): Promise<void>
}

export function createWatchRegistry(options: WatchRegistryOptions): WatchRegistry {
  const now = options.now ?? (() => Date.now())
  let watches = options.load()
  const running = new Set<string>()

  function finish(watch: AssistantWatch, message: string) {
    watches = watches.filter((entry) => entry.id !== watch.id)
    options.resume(watch.chatId, message)
  }

  function reschedule(watch: AssistantWatch) {
    watch.attempts += 1
    watch.nextPollAt = now() + watchDelay(watch.attempts)
  }

  async function poll(watch: AssistantWatch) {
    running.add(watch.id)
    try {
      const outcome = await options.poll(watch)
      if (!watches.includes(watch)) return
      if (outcome.state === 'final') {
        finish(watch, outcome.text)
        return
      }
      watch.errors = 0
      if (outcome.seen !== undefined) watch.seen = outcome.seen
      reschedule(watch)
    } catch {
      if (!watches.includes(watch)) return
      watch.errors += 1
      if (watch.errors >= MAX_WATCH_ERRORS) finish(watch, errorText(watch))
      else reschedule(watch)
    } finally {
      running.delete(watch.id)
    }
  }

  return {
    list: () => [...watches],

    add({ chatId, kind, target, label }) {
      const id = watchId(chatId, kind, target)
      if (watches.some((watch) => watch.id === id)) {
        return { ok: true, message: `Already watching the ${kind} ${target}; this chat continues on its own.` }
      }
      if (watches.length >= MAX_ASSISTANT_WATCHES) {
        return {
          ok: false,
          message: `The portal already watches ${MAX_ASSISTANT_WATCHES} things. Wait for one to settle first.`,
        }
      }
      const at = now()
      watches = [...watches, {
        id,
        chatId,
        kind,
        target,
        label: label.slice(0, MAX_LABEL_LENGTH) || target,
        createdAt: at,
        deadlineAt: at + WATCH_DEADLINE_MS,
        nextPollAt: at + WATCH_FIRST_DELAY_MS,
        attempts: 0,
        errors: 0,
      }]
      options.save(watches)
      return {
        ok: true,
        message: `Watching the ${kind} ${target}. This chat continues on its own when it settles, `
          + 'and the watch stops after two hours. Answer the user now instead of polling.',
      }
    },

    dropChat(chatId) {
      const remaining = watches.filter((watch) => watch.chatId !== chatId)
      if (remaining.length === watches.length) return
      watches = remaining
      options.save(watches)
    },

    clear() {
      if (!watches.length) return
      watches = []
      options.save(watches)
    },

    async tick() {
      const gone = watches.filter((watch) => !options.hasChat(watch.chatId))
      if (gone.length) watches = watches.filter((watch) => options.hasChat(watch.chatId))
      const at = now()
      const due = watches.filter((watch) => !running.has(watch.id) && watch.nextPollAt <= at)
      if (!due.length && !gone.length) return
      for (const watch of due.filter((entry) => at >= entry.deadlineAt)) finish(watch, deadlineText(watch))
      await Promise.all(due.filter((watch) => watches.includes(watch)).map(poll))
      options.save(watches)
    },
  }
}
