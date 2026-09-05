// One assistant turn: the model streams, its tool calls run in the browser and
// the loop continues until the model answers without calling anything.
import {
  APICallError,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai'
import type { MessageSource } from '@/lib/assistant/citations'
import { errorMessage } from '@/lib/utils'

export type StreamProviderOptions = Parameters<typeof streamText>[0]['providerOptions']

/** Bound on one turn, so a looping model cannot run away with the session. */
export const MAX_STEPS = 16

export interface TurnHandlers {
  onText: (delta: string) => void
  onToolCall: (call: { id: string; name: string; input: unknown }) => void
  onToolResult: (result: { id: string; output: unknown }) => void
  onToolError: (failure: { id: string; message: string }) => void
  /** A web page the provider's search drew on. */
  onSource?: (source: MessageSource) => void
}

export interface TurnOptions extends TurnHandlers {
  model: LanguageModel
  system: string
  messages: ModelMessage[]
  tools: ToolSet
  maxSteps?: number
  abortSignal?: AbortSignal
  providerOptions?: StreamProviderOptions
  maxOutputTokens?: number
}

export interface TurnResult {
  /** Everything the model produced, to append to the conversation. */
  messages: ModelMessage[]
  error?: string
}

/** How much of a provider's reason is kept; the message is stored with the turn on the node. */
const MAX_REASON_CHARS = 200

// The reason inside a provider's error body, in the OpenAI or the Anthropic
// shape. Only its first line, so an echoed request header is never stored.
function providerReason(body: string | undefined): string {
  if (!body) return ''
  try {
    const parsed: unknown = JSON.parse(body)
    const outer = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    const inner = outer.error && typeof outer.error === 'object' ? (outer.error as Record<string, unknown>) : outer
    return typeof inner.message === 'string' ? (inner.message.split(/\r?\n/)[0] ?? '').slice(0, MAX_REASON_CHARS) : ''
  } catch {
    return ''
  }
}

/** A provider failure the way the panel shows it: the HTTP code, then why. */
export function providerErrorMessage(error: unknown): string {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ? `${error.statusCode}: ` : ''
    const reason = providerReason(error.responseBody)
    return reason && reason !== error.message ? `${status}${error.message}: ${reason}` : `${status}${error.message}`
  }
  return errorMessage(error)
}

export async function runTurn(options: TurnOptions): Promise<TurnResult> {
  const result = streamText({
    model: options.model,
    system: options.system,
    messages: options.messages,
    tools: options.tools,
    stopWhen: stepCountIs(options.maxSteps ?? MAX_STEPS),
    abortSignal: options.abortSignal,
    providerOptions: options.providerOptions,
    maxOutputTokens: options.maxOutputTokens,
  })

  let failure: string | undefined
  // Text the model writes after a tool step is its own block; a blank line keeps
  // it from running into the sentence before the call.
  let written = false
  try {
    for await (const part of result.stream) {
      if (part.type === 'text-start') {
        if (written) options.onText('\n\n')
        written = false
      } else if (part.type === 'text-delta') {
        if (part.text) written = true
        options.onText(part.text)
      } else if (part.type === 'tool-call') {
        options.onToolCall({ id: part.toolCallId, name: part.toolName, input: part.input })
      } else if (part.type === 'tool-result') {
        options.onToolResult({ id: part.toolCallId, output: part.output })
      } else if (part.type === 'tool-error') {
        options.onToolError({ id: part.toolCallId, message: providerErrorMessage(part.error) })
      } else if (part.type === 'source') {
        if (part.sourceType === 'url') options.onSource?.({ url: part.url, ...(part.title ? { title: part.title } : {}) })
      } else if (part.type === 'error') {
        failure ??= providerErrorMessage(part.error)
      }
    }
    return { messages: await result.responseMessages, error: failure }
  } catch (cause) {
    return { messages: [], error: providerErrorMessage(cause) }
  }
}
