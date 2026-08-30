// The provider kinds the settings surface offers. Claude and the
// OpenAI-compatible endpoints are held in this browser tab; a ChatGPT
// subscription is signed in on the node and kept there.
import type { AssistantProvider } from '@/lib/api'
import type { StateTone } from '@/lib/stateBadge'
import {
  OPENAI_COMPATIBLE_PRESETS,
  missingBrowserKey,
  type BrowserProvider,
} from '@/lib/assistant/browserProviders'

export type ProviderChoice = 'anthropic' | 'openai' | 'compatible' | 'chatgpt'

export interface ProviderKind {
  id: ProviderChoice
  title: string
  summary: string
  /** Where the credential is kept once the provider exists. */
  managed: 'browser' | 'node'
  keyRequired: boolean
  needsBaseUrl: boolean
}

export const OPENAI_ROOT = OPENAI_COMPATIBLE_PRESETS[0].baseUrl

export const PROVIDER_KINDS: readonly ProviderKind[] = [
  {
    id: 'anthropic',
    title: 'Claude',
    summary: 'An Anthropic API key, called straight from this tab.',
    managed: 'browser',
    keyRequired: true,
    needsBaseUrl: false,
  },
  {
    id: 'openai',
    title: 'OpenAI',
    summary: 'An OpenAI API key against api.openai.com.',
    managed: 'browser',
    keyRequired: true,
    needsBaseUrl: false,
  },
  {
    id: 'compatible',
    title: 'OpenAI-compatible or local',
    summary: 'Any endpoint speaking the OpenAI protocol: Ollama, LM Studio, vLLM, a gateway.',
    managed: 'browser',
    keyRequired: false,
    needsBaseUrl: true,
  },
  {
    id: 'chatgpt',
    title: 'ChatGPT subscription',
    summary: 'Sign in with a ChatGPT plan instead of a key; the node keeps the credential.',
    managed: 'node',
    keyRequired: false,
    needsBaseUrl: false,
  },
]

export function providerKind(choice: ProviderChoice): ProviderKind {
  return PROVIDER_KINDS.find((entry) => entry.id === choice) ?? PROVIDER_KINDS[0]
}

export function isOpenAiRoot(baseUrl: string): boolean {
  return baseUrl.trim().replace(/\/+$/, '') === OPENAI_ROOT
}

/** Which kind a configured provider belongs to, browser-held or node-managed. */
export function providerChoice(
  provider: AssistantProvider,
  local: BrowserProvider | null = null,
): ProviderChoice {
  if (provider.kind === 'chatgpt') return 'chatgpt'
  if (provider.kind === 'anthropic') return 'anthropic'
  if (provider.kind === 'openai') return 'openai'
  const baseUrl = local?.kind === 'openai_compatible' ? local.baseUrl : provider.base_url ?? ''
  return isOpenAiRoot(baseUrl) ? 'openai' : 'compatible'
}

export interface ProviderStatus {
  label: string
  tone: StateTone
}

/** The one status chip a row shows; a pending sign-in reads differently to a pending key. */
export function providerStatus(
  provider: AssistantProvider,
  local: BrowserProvider | null = null,
): ProviderStatus {
  if (local && missingBrowserKey(local)) return { label: 'Needs key', tone: 'attention' }
  if (provider.status === 'ready') return { label: 'Ready', tone: 'done' }
  if (provider.status === 'error') return { label: 'Failed test', tone: 'failed' }
  return provider.kind === 'chatgpt'
    ? { label: 'Pending login', tone: 'progress' }
    : { label: 'Needs key', tone: 'attention' }
}
