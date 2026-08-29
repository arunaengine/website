// --- Assistant providers (/users/assistant/providers) ---
// Bring-your-own AI: every provider record belongs to one user and its secret
// is sealed on the node, never returned. The browser talks to a provider only
// through the node proxy, which injects the real credentials.
import { apiRequest, type ApiClientOptions } from './client'

export type AssistantProviderKind =
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'openai_compatible'
  | 'chatgpt'

export type AssistantProviderStatus = 'ready' | 'pending' | 'error'

export interface AssistantModel {
  id: string
  display_name?: string | null
}

/** What the node serves for a provider; it never contains a secret. */
export interface AssistantProvider {
  provider_id: string
  kind: AssistantProviderKind
  label: string
  base_url?: string | null
  /** Header names only; values stay sealed on the node. */
  header_names?: string[]
  models: AssistantModel[]
  default_model?: string | null
  status: AssistantProviderStatus
  created_at: string
}

export interface ListProvidersResponse {
  providers: AssistantProvider[]
}

export interface CreateProviderRequest {
  kind: AssistantProviderKind
  label: string
  api_key?: string
  base_url?: string
  headers?: Record<string, string>
  default_model?: string
  models?: AssistantModel[]
}

/** Every field is optional; `api_key` is sent only when the user changed it. */
export type PatchProviderRequest = Partial<Omit<CreateProviderRequest, 'kind'>>

export interface ProviderTestResponse {
  ok: boolean
  message: string
}

export interface ProviderModelsResponse {
  models: AssistantModel[]
}

export interface ChatGptLoginResponse {
  provider_id: string
  user_code: string
  verification_url: string
  interval_seconds: number
  expires_at: string
}

export type ChatGptLoginStatus = 'pending' | 'ready' | 'expired' | 'denied'

export interface ChatGptPollResponse {
  status: ChatGptLoginStatus
}

const BASE = '/users/assistant/providers'

function providerPath(providerId: string, suffix = ''): string {
  return `${BASE}/${encodeURIComponent(providerId)}${suffix}`
}

export function listAssistantProviders(
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<ListProvidersResponse> {
  return apiRequest<ListProvidersResponse>(BASE, { signal }, client)
}

export function createAssistantProvider(
  request: CreateProviderRequest,
  client: ApiClientOptions = {},
): Promise<AssistantProvider> {
  return apiRequest<AssistantProvider>(BASE, { method: 'POST', body: JSON.stringify(request) }, client)
}

export function patchAssistantProvider(
  providerId: string,
  request: PatchProviderRequest,
  client: ApiClientOptions = {},
): Promise<AssistantProvider> {
  return apiRequest<AssistantProvider>(
    providerPath(providerId),
    { method: 'PATCH', body: JSON.stringify(request) },
    client,
  )
}

export function deleteAssistantProvider(
  providerId: string,
  client: ApiClientOptions = {},
): Promise<void> {
  return apiRequest<void>(providerPath(providerId), { method: 'DELETE' }, client)
}

export function testAssistantProvider(
  providerId: string,
  client: ApiClientOptions = {},
): Promise<ProviderTestResponse> {
  return apiRequest<ProviderTestResponse>(providerPath(providerId, '/test'), { method: 'POST' }, client)
}

export function fetchAssistantModels(
  providerId: string,
  client: ApiClientOptions = {},
): Promise<ProviderModelsResponse> {
  return apiRequest<ProviderModelsResponse>(providerPath(providerId, '/models'), {}, client)
}

/** Starts the Codex device login; the user enters the code at the returned URL. */
export function startChatGptLogin(
  label: string,
  client: ApiClientOptions = {},
): Promise<ChatGptLoginResponse> {
  return apiRequest<ChatGptLoginResponse>(
    `${BASE}/chatgpt/login`,
    { method: 'POST', body: JSON.stringify({ label }) },
    client,
  )
}

export function pollChatGptLogin(
  providerId: string,
  client: ApiClientOptions = {},
): Promise<ChatGptPollResponse> {
  return apiRequest<ChatGptPollResponse>(providerPath(providerId, '/login/poll'), { method: 'POST' }, client)
}

/**
 * Base URL of the node proxy for one provider. The AI SDK provider is built on
 * it, so no provider credential ever reaches the browser.
 */
export function assistantProxyBaseUrl(apiBaseUrl: string, providerId: string): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}${providerPath(providerId, '/proxy')}`
}

export const PROVIDER_KIND_LABELS: Readonly<Record<AssistantProviderKind, string>> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  openai_compatible: 'OpenAI compatible',
  chatgpt: 'ChatGPT subscription',
}

/** Kinds a person can add by hand; ChatGPT is added by its sign-in flow. */
export const ADDABLE_PROVIDER_KINDS: readonly AssistantProviderKind[] = [
  'anthropic',
  'openai',
  'openrouter',
  'openai_compatible',
]
