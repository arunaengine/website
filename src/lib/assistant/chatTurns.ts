// A chat as the node stores it: one turn per user message, holding that
// message, the reply with its tool calls, and the model history of that step.
// Earlier turns never change once written; only the tail is rewritten.
import type { ModelMessage } from 'ai'
import { isModelMessage, normalizeMessage } from './chatHistory'
import type { ChatMessage, ToolCallView } from './types'

/** The node refuses a turn payload above this many bytes. */
export const MAX_TURN_BYTES = 64 * 1024

const CUT_TEXT_LENGTH = 2_000
const DROPPED_NOTE = 'This tool output was left out of the stored chat.'

export interface ChatTurn {
  messages: ChatMessage[]
  history: ModelMessage[]
}

/** The id of the turn's first message, which names the turn across saves. */
export function turnKey(turn: ChatTurn): string {
  return turn.messages[0]?.id ?? ''
}

function answered(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.role === 'assistant' && !message.error)
}

function groupAtUser<T extends { role: string }>(entries: T[]): T[][] {
  const groups: T[][] = []
  for (const entry of entries) {
    if (entry.role === 'user' || !groups.length) groups.push([entry])
    else groups[groups.length - 1].push(entry)
  }
  return groups
}

/**
 * Splits a chat into turns. The history is matched to the turns from the
 * tail: it is trimmed from the front, and a turn whose reply failed or has
 * not finished holds none. History left over at the front joins the first turn.
 */
export function splitTurns(messages: ChatMessage[], history: ModelMessage[]): ChatTurn[] {
  const turns = groupAtUser(messages).map((group) => ({ messages: group, history: [] as ModelMessage[] }))
  const chunks = groupAtUser(history)
  let left = chunks.length
  for (let index = turns.length - 1; index >= 0 && left > 0; index -= 1) {
    if (!answered(turns[index].messages)) continue
    left -= 1
    turns[index].history = chunks[left]
  }
  if (left > 0) {
    const rest = chunks.slice(0, left).flat()
    if (turns.length) turns[0].history = [...rest, ...turns[0].history]
    else turns.push({ messages: [], history: rest })
  }
  return turns
}

export function joinTurns(turns: ChatTurn[]): ChatTurn {
  return {
    messages: turns.flatMap((turn) => turn.messages),
    history: turns.flatMap((turn) => turn.history),
  }
}

/**
 * The local turns with the node's turns folded in. A local turn the node
 * holds is replaced by the node's copy; local turns after the last one the
 * node knows are unsent and go after the node's, to be pushed renumbered.
 */
export function mergeTurns(
  local: ChatTurn[],
  pulled: ChatTurn[],
  known: (key: string) => boolean,
): { turns: ChatTurn[]; unsent: ChatTurn[] } {
  const pulledKeys = new Set(pulled.map(turnKey))
  let last = -1
  local.forEach((turn, index) => {
    const key = turnKey(turn)
    if (pulledKeys.has(key) || known(key)) last = index
  })
  const kept = local.slice(0, last + 1).filter((turn) => !pulledKeys.has(turnKey(turn)))
  const unsent = local.slice(last + 1)
  return { turns: [...kept, ...pulled, ...unsent], unsent }
}

function payloadOf(turn: ChatTurn): string {
  return JSON.stringify({ messages: turn.messages, history: turn.history })
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function dropResult(history: ModelMessage[], callId: string): ModelMessage[] {
  return history.map((entry) => {
    if (entry.role !== 'tool' || !Array.isArray(entry.content)) return entry
    const content = entry.content.map((part) =>
      (part.type === 'tool-result' && part.toolCallId === callId
        ? { ...part, output: { type: 'text' as const, value: DROPPED_NOTE } }
        : part))
    return { ...entry, content } as ModelMessage
  })
}

function patchCalls(
  messages: ChatMessage[],
  callId: string,
  patch: (call: ToolCallView) => ToolCallView,
): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    calls: message.calls.map((call) => (call.id === callId ? patch(call) : call)),
  }))
}

/**
 * The turn as JSON text under the node's per-turn cap. When it is too large,
 * the oldest tool outputs go first, then the oldest cards and inputs, then
 * the model history, then the texts are cut; the chat itself is left as is.
 */
export function encodeTurn(turn: ChatTurn, cap = MAX_TURN_BYTES): string {
  let current: ChatTurn = { messages: turn.messages, history: turn.history }
  let payload = payloadOf(current)
  if (byteLength(payload) <= cap) return payload
  const callIds = current.messages.flatMap((message) => message.calls.map((call) => call.id))
  const steps: Array<() => void> = [
    ...callIds.map((id) => () => {
      current = {
        messages: patchCalls(current.messages, id, ({ output: _output, ...call }) => call),
        history: dropResult(current.history, id),
      }
    }),
    ...callIds.map((id) => () => {
      current = {
        ...current,
        messages: patchCalls(current.messages, id, ({ view: _view, ...call }) => ({ ...call, input: undefined })),
      }
    }),
    () => {
      current = { ...current, history: [] }
    },
    ...current.messages.map((_, index) => () => {
      current = {
        ...current,
        messages: current.messages.map((message, at) =>
          (at === index ? { ...message, text: message.text.slice(0, CUT_TEXT_LENGTH) } : message)),
      }
    }),
    () => {
      current = {
        history: [],
        messages: current.messages.map(({ id, role, at }) => ({ id, role, text: '', calls: [], at })),
      }
    },
  ]
  for (const step of steps) {
    step()
    payload = payloadOf(current)
    if (byteLength(payload) <= cap) break
  }
  return payload
}

/** Reads a turn payload back; anything unreadable counts as no turn. */
export function decodeTurn(payload: string, at = Date.now()): ChatTurn | null {
  try {
    const parsed = JSON.parse(payload) as unknown
    if (!isRecord(parsed) || !Array.isArray(parsed.messages) || !Array.isArray(parsed.history)) return null
    return {
      messages: parsed.messages
        .map((message) => normalizeMessage(message, at))
        .filter((message): message is ChatMessage => Boolean(message)),
      history: parsed.history.filter(isModelMessage),
    }
  } catch {
    return null
  }
}
