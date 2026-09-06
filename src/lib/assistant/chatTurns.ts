// A chat as the node stores it: one turn per user message, holding that
// message, the reply with its tool calls, and the model history of that step.
// Earlier turns never change once written; only the tail is rewritten.
import type { ModelMessage } from 'ai'
import { isModelMessage, normalizeMessage } from './chatHistory'
import type { ChatMessage, RenderView, ToolCallView } from './types'

/** The node refuses a turn payload above this many bytes. */
export const MAX_TURN_BYTES = 256 * 1024
/** A stored tool result is never cut shorter than this many characters. */
export const MAX_RESULT_CHARS = 4_000

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

type ToolResultPart = { type: 'tool-result'; toolCallId: string; toolName: string; output: Record<string, unknown> }

function isToolResult(part: unknown): part is ToolResultPart {
  return isRecord(part) && part.type === 'tool-result' && typeof part.toolCallId === 'string' && isRecord(part.output)
}

/** The result as the text the model read; a json result is written out. */
function resultText(output: Record<string, unknown>): string {
  return typeof output.value === 'string' ? output.value : JSON.stringify(output.value) ?? ''
}

function mapResults(history: ModelMessage[], patch: (part: ToolResultPart) => ToolResultPart): ModelMessage[] {
  return history.map((entry) => {
    if (entry.role !== 'tool' || !Array.isArray(entry.content)) return entry
    const content = entry.content.map((part) => (isToolResult(part) ? patch(part) : part))
    return { ...entry, content } as ModelMessage
  })
}

function textResult(part: ToolResultPart, value: string): ToolResultPart {
  const type = String(part.output.type).startsWith('error') ? 'error-text' : 'text'
  return { ...part, output: { type, value } }
}

// A text result that is JSON is written without whitespace, and every line
// loses its trailing blanks; nothing is cut here.
function minifyResult(part: ToolResultPart): ToolResultPart {
  if (typeof part.output.value !== 'string') return part
  const trimmed = part.output.value.replace(/[ \t]+$/gm, '').trimEnd()
  try {
    return textResult(part, JSON.stringify(JSON.parse(trimmed)))
  } catch {
    return trimmed === part.output.value ? part : textResult(part, trimmed)
  }
}

function cutNote(length: number): string {
  return `[cut, ${length.toLocaleString('en-US')} characters]`
}

function cutResult(part: ToolResultPart): ToolResultPart {
  const text = resultText(part.output)
  if (text.length <= MAX_RESULT_CHARS) return part
  return textResult(part, `${text.slice(0, MAX_RESULT_CHARS)} ${cutNote(text.length)}`)
}

function* results(history: ModelMessage[]): Generator<ToolResultPart> {
  for (const entry of history) {
    if (entry.role !== 'tool' || !Array.isArray(entry.content)) continue
    for (const part of entry.content) if (isToolResult(part)) yield part
  }
}

/** The result ids, largest first; the show_* card tools answer with a few words. */
function resultsBySize(history: ModelMessage[]): string[] {
  const sizes: Array<[string, number]> = []
  for (const part of results(history)) {
    if (!part.toolName.startsWith('show_')) sizes.push([part.toolCallId, resultText(part.output).length])
  }
  return sizes.sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

function patchResult(history: ModelMessage[], callId: string, patch: (part: ToolResultPart) => ToolResultPart) {
  return mapResults(history, (part) => (part.toolCallId === callId ? patch(part) : part))
}

// A stored card is a reference: the bytes and the tab's blob URL stay out,
// and a restored card reads the object again.
function storedView(view: RenderView): RenderView {
  if (view.kind !== 'artifact') return view
  const { text: _text, ...artifact } = view.artifact
  return { ...view, artifact: { ...artifact, url: artifact.url.startsWith('blob:') ? '' : artifact.url } }
}

/** The history holds each result once, so the calls store none. */
function storedMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    calls: message.calls.map(({ output: _output, view, ...call }) => (view ? { ...call, view: storedView(view) } : call)),
  }))
}

function patchCall(messages: ChatMessage[], callId: string, patch: (call: ToolCallView) => ToolCallView): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    calls: message.calls.map((call) => (call.id === callId ? patch(call) : call)),
  }))
}

/**
 * The turn as JSON text under the node's per-turn cap. Tool results are kept
 * once, in the history, and only minified while the turn fits. Over the cap
 * the largest results are cut to a floor, then dropped, then the inputs, the
 * history and the texts go; the cards always stay. The live chat is left as is.
 */
export function encodeTurn(turn: ChatTurn, cap = MAX_TURN_BYTES): string {
  let current: ChatTurn = { messages: storedMessages(turn.messages), history: mapResults(turn.history, minifyResult) }
  let payload = payloadOf(current)
  if (byteLength(payload) <= cap) return payload
  const resultIds = resultsBySize(current.history)
  const callIds = current.messages.flatMap((message) => message.calls.map((call) => call.id))
  const steps: Array<() => void> = [
    ...resultIds.map((id) => () => {
      current = { ...current, history: patchResult(current.history, id, cutResult) }
    }),
    ...resultIds.map((id) => () => {
      current = { ...current, history: patchResult(current.history, id, (part) => textResult(part, DROPPED_NOTE)) }
    }),
    ...callIds.map((id) => () => {
      current = { ...current, messages: patchCall(current.messages, id, (call) => ({ ...call, input: undefined })) }
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
        messages: current.messages.map(({ id, role, at, calls, model }) => ({
          id,
          role,
          text: '',
          at,
          ...(model ? { model } : {}),
          calls: calls.map(({ id: callId, name, state, view }) => ({
            id: callId,
            name,
            input: undefined,
            state,
            ...(view ? { view } : {}),
          })),
        })),
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

/** What each call answered, read from the one copy the history keeps. */
function resultsOf(history: ModelMessage[]): Map<string, unknown> {
  const answers = new Map<string, unknown>()
  for (const part of results(history)) answers.set(part.toolCallId, part.output.value)
  return answers
}

/** Reads a turn payload back; anything unreadable counts as no turn. */
export function decodeTurn(payload: string, at = Date.now()): ChatTurn | null {
  try {
    const parsed = JSON.parse(payload) as unknown
    if (!isRecord(parsed) || !Array.isArray(parsed.messages) || !Array.isArray(parsed.history)) return null
    const history = parsed.history.filter(isModelMessage)
    const results = resultsOf(history)
    const messages = parsed.messages
      .map((message) => normalizeMessage(message, at))
      .filter((message): message is ChatMessage => Boolean(message))
      .map((message) => ({
        ...message,
        calls: message.calls.map((call) =>
          (call.output === undefined && results.has(call.id) ? { ...call, output: results.get(call.id) } : call)),
      }))
    return { messages, history }
  } catch {
    return null
  }
}
