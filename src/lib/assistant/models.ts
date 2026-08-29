// Builds the AI SDK model for one configured provider. Every request goes
// through the node proxy: the browser holds an Aruna session token and nothing
// else, and the node strips it and injects the real provider credentials.
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { assistantProxyBaseUrl, type AssistantProvider } from '@/lib/api'

/** The proxy never reads a provider key from the browser; this is a marker. */
const PROXIED = 'proxied'

export interface ModelContext {
  apiBaseUrl: string
  /** The Aruna session bearer the proxy authenticates. */
  token: string
  fetch?: typeof globalThis.fetch
}

/** Sends the Aruna bearer, never a provider credential. */
export function proxyFetch(context: ModelContext): typeof globalThis.fetch {
  const base = context.fetch ?? globalThis.fetch
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${context.token}`)
    return base(input, { ...init, headers })
  }
}

/**
 * The model the chat loop talks to. ChatGPT rides the OpenAI responses model
 * because the proxy exposes only `/responses` for it; every other kind speaks
 * its own `/v1` surface behind the proxy.
 */
export function buildModel(
  provider: AssistantProvider,
  modelId: string,
  context: ModelContext,
): LanguageModel {
  const proxy = assistantProxyBaseUrl(context.apiBaseUrl, provider.provider_id)
  const fetch = proxyFetch(context)

  if (provider.kind === 'anthropic') {
    return createAnthropic({ baseURL: `${proxy}/v1`, apiKey: PROXIED, fetch })(modelId)
  }
  if (provider.kind === 'chatgpt') {
    return createOpenAI({ baseURL: proxy, apiKey: PROXIED, fetch }).responses(modelId)
  }
  if (provider.kind === 'openai') {
    return createOpenAI({ baseURL: `${proxy}/v1`, apiKey: PROXIED, fetch }).chat(modelId)
  }
  return createOpenAICompatible({
    baseURL: `${proxy}/v1`,
    name: provider.kind,
    apiKey: PROXIED,
    fetch,
  }).chatModel(modelId)
}
