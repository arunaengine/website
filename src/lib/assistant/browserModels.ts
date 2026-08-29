/**
 * Direct browser model adapters for the two browser-owned provider boundaries.
 * The caller supplies credentials at runtime; this module never reads or logs
 * environment variables, localStorage, or Aruna provider records.
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { BrowserProvider, OpenAICompatibleBrowserProvider } from './browserProviders'

export const ANTHROPIC_DIRECT_BROWSER_HEADER = 'anthropic-dangerous-direct-browser-access'

export interface BrowserModelContext {
  fetch?: typeof globalThis.fetch
}

function fetchWithOptionalAuth(
  base: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    // createOpenAI always emits an Authorization header. A compatible
    // endpoint may intentionally use no key, so remove only its empty value.
    const authorization = headers.get('Authorization')
    if (authorization !== null && (!authorization.trim() || authorization.trim() === 'Bearer')) {
      headers.delete('Authorization')
    }
    return base(input, { ...init, headers })
  }
}

function compatibleModel(
  provider: OpenAICompatibleBrowserProvider,
  context: BrowserModelContext,
): LanguageModel {
  const fetch = context.fetch ?? globalThis.fetch
  if (provider.protocol === 'chat_completions') {
    return createOpenAICompatible({
      baseURL: provider.baseUrl,
      name: 'openai-compatible',
      ...(provider.apiKey ? { apiKey: provider.apiKey } : {}),
      ...(provider.headers ? { headers: provider.headers } : {}),
      fetch,
    }).chatModel(provider.model)
  }

  const headers = { ...(provider.headers ?? {}) }
  if (!provider.apiKey && !Object.keys(headers).some((name) => name.toLowerCase() === 'authorization')) {
    headers.Authorization = ''
  }
  return createOpenAI({
    baseURL: provider.baseUrl,
    apiKey: provider.apiKey ?? '',
    headers,
    fetch: fetchWithOptionalAuth(fetch),
  }).responses(provider.model)
}

/** Builds one direct browser model for Anthropic or OpenAI-compatible providers. */
export function buildBrowserModel(
  provider: BrowserProvider,
  context: BrowserModelContext = {},
): LanguageModel {
  if (provider.kind === 'anthropic') {
    return createAnthropic({
      apiKey: provider.apiKey,
      headers: { [ANTHROPIC_DIRECT_BROWSER_HEADER]: 'true' },
      fetch: context.fetch,
    }).messages(provider.model)
  }
  if (provider.kind === 'openai_compatible') return compatibleModel(provider, context)
  throw new Error('Unsupported browser provider kind.')
}
