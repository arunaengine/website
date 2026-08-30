/**
 * Direct browser model adapters for the two browser-owned provider boundaries.
 * The caller supplies credentials at runtime; this module never reads or logs
 * environment variables, localStorage, or Aruna provider records.
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { AssistantModel } from '@/lib/api'
import type { BrowserProvider, OpenAICompatibleBrowserProvider } from './browserProviders'

export const ANTHROPIC_DIRECT_BROWSER_HEADER = 'anthropic-dangerous-direct-browser-access'

export interface BrowserModelContext {
  fetch?: typeof globalThis.fetch
}

const NON_TEXT_MODEL_TERMS = [
  'embed',
  'whisper',
  'tts',
  'transcribe',
  'image',
  'dall-e',
  'sora',
  'audio',
  'moderation',
  'realtime',
  'davinci',
  'babbage',
]

function modelsUrl(baseUrl: string): string {
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}models`
}

function textModel(id: string): boolean {
  const lower = id.toLowerCase()
  return !NON_TEXT_MODEL_TERMS.some((term) => lower.includes(term))
}

/** Fetches a provider's model list without sending an Aruna bearer. */
export async function fetchBrowserProviderModels(
  provider: BrowserProvider,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AssistantModel[]> {
  const headers = new Headers(provider.kind === 'anthropic'
    ? {
        'x-api-key': provider.apiKey,
        [ANTHROPIC_DIRECT_BROWSER_HEADER]: 'true',
        'anthropic-version': '2023-06-01',
      }
    : provider.headers)
  if (provider.kind === 'openai_compatible' && provider.apiKey) {
    headers.set('Authorization', `Bearer ${provider.apiKey}`)
  }
  const response = await fetcher(
    provider.kind === 'anthropic' ? 'https://api.anthropic.com/v1/models' : modelsUrl(provider.baseUrl),
    { headers },
  )
  if (response.status === 404 || response.status === 405) return []
  if (!response.ok) throw new Error(`Provider model listing failed (${response.status}).`)
  const payload = await response.json() as unknown
  const entries = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? [
          ...((Array.isArray((payload as Record<string, unknown>).data)
            ? (payload as Record<string, unknown>).data
            : []) as unknown[]),
          ...((Array.isArray((payload as Record<string, unknown>).models)
            ? (payload as Record<string, unknown>).models
            : []) as unknown[]),
        ]
      : []
  return entries
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const item = entry as Record<string, unknown>
      const id = typeof item.id === 'string'
        ? item.id
        : typeof item.slug === 'string'
          ? item.slug
          : typeof item.name === 'string'
            ? item.name
            : ''
      if (!id || !textModel(id)) return []
      const displayName = typeof item.display_name === 'string'
        ? item.display_name
        : typeof item.name === 'string' && item.name !== id
          ? item.name
          : undefined
      const created = typeof item.created === 'number' ? item.created : 0
      return [{ created, model: { id, ...(displayName ? { display_name: displayName } : {}) } }]
    })
    // OpenAI lists in no useful order; newest first keeps the picker relevant.
    .sort((left, right) => right.created - left.created)
    .map((entry) => entry.model)
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
