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
import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai'
import { errorMessage } from '@/lib/utils'

/** Bound on one turn, so a looping model cannot run away with the session. */
export const MAX_STEPS = 16

export interface TurnHandlers {
  onText: (delta: string) => void
  onToolCall: (call: { id: string; name: string; input: unknown }) => void
  onToolResult: (result: { id: string; output: unknown }) => void
  onToolError: (failure: { id: string; message: string }) => void
}

export interface TurnOptions extends TurnHandlers {
  model: LanguageModel
  system: string
  messages: ModelMessage[]
  tools: ToolSet
  maxSteps?: number
  abortSignal?: AbortSignal
  providerOptions?: { openai?: OpenAILanguageModelResponsesOptions }
}

export interface TurnResult {
  /** Everything the model produced, to append to the conversation. */
  messages: ModelMessage[]
  error?: string
}

/** A provider failure the way the panel shows it: the HTTP code, then why. */
export function providerErrorMessage(error: unknown): string {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ? `${error.statusCode}: ` : ''
    return `${status}${error.message}`
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
  })

  let failure: string | undefined
  try {
    for await (const part of result.stream) {
      if (part.type === 'text-delta') options.onText(part.text)
      else if (part.type === 'tool-call') {
        options.onToolCall({ id: part.toolCallId, name: part.toolName, input: part.input })
      } else if (part.type === 'tool-result') {
        options.onToolResult({ id: part.toolCallId, output: part.output })
      } else if (part.type === 'tool-error') {
        options.onToolError({ id: part.toolCallId, message: providerErrorMessage(part.error) })
      } else if (part.type === 'error') {
        failure ??= providerErrorMessage(part.error)
      }
    }
    return { messages: await result.responseMessages, error: failure }
  } catch (cause) {
    return { messages: [], error: providerErrorMessage(cause) }
  }
}
