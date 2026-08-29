/**
 * Browser-owned assistant provider configuration for the direct providers.
 *
 * Provider credentials deliberately live only in this tab's session storage;
 * they are never sent to the Aruna provider routes or written to localStorage.
 */

export const BROWSER_PROVIDER_STORAGE_KEY = 'aruna.assistant.browserProviders'
export const BROWSER_PROVIDER_STATE_VERSION = 1 as const

export type BrowserProviderKind = 'anthropic' | 'openai_compatible'
export type OpenAICompatibleProtocol = 'responses' | 'chat_completions'
export const BROWSER_PROVIDER_KINDS: readonly BrowserProviderKind[] = [
  'anthropic',
  'openai_compatible',
]

export interface OpenAICompatiblePreset {
  id: string
  label: string
  baseUrl: string
  protocol: OpenAICompatibleProtocol
  apiKeyRequired: boolean
}

/** Official OpenAI is an endpoint preset, not a fourth provider kind. */
export const OPENAI_COMPATIBLE_PRESETS: readonly OpenAICompatiblePreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'responses',
    apiKeyRequired: true,
  },
]

interface BrowserProviderBase {
  id: string
  label: string
  model: string
}

export interface AnthropicBrowserProvider extends BrowserProviderBase {
  kind: 'anthropic'
  apiKey: string
}

export interface OpenAICompatibleBrowserProvider extends BrowserProviderBase {
  kind: 'openai_compatible'
  /** Kept exactly as entered; the model adapter owns no URL rewriting. */
  baseUrl: string
  protocol: OpenAICompatibleProtocol
  apiKey?: string
  headers?: Record<string, string>
}

export type BrowserProvider =
  | AnthropicBrowserProvider
  | OpenAICompatibleBrowserProvider

export interface BrowserProviderState {
  version: typeof BROWSER_PROVIDER_STATE_VERSION
  selectedProviderId: string | null
  providers: BrowserProvider[]
}

export class BrowserProviderValidationError extends Error {
  constructor(path: string) {
    super(`Invalid browser provider configuration at ${path}.`)
    this.name = 'BrowserProviderValidationError'
  }
}

function invalid(path: string): never {
  throw new BrowserProviderValidationError(path)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(path)
  return value.trim()
}

function optionalSecret(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') invalid(path)
  const result = value.trim()
  return result || undefined
}

function apiRoot(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value || value.trim() !== value) invalid(path)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    invalid(path)
  }
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.search
    || url.hash
  ) invalid(path)
  return value
}

function headers(value: unknown, path: string): Record<string, string> | undefined {
  if (value === undefined) return undefined
  const input = record(value, path)
  const names = Object.keys(input).sort((left, right) => left.localeCompare(right))
  const seen = new Set<string>()
  const output: Array<[string, string]> = []
  for (const name of names) {
    if (!name || /[\r\n]/.test(name) || seen.has(name.toLowerCase())) invalid(`${path}.${name || '<empty>'}`)
    const headerValue = input[name]
    if (typeof headerValue !== 'string' || /[\r\n]/.test(headerValue)) invalid(`${path}.${name}`)
    seen.add(name.toLowerCase())
    output.push([name, headerValue])
  }
  return names.length ? Object.fromEntries(output) : undefined
}

function base(value: unknown, path: string): BrowserProviderBase {
  const input = record(value, path)
  return {
    id: requiredString(input.id, `${path}.id`),
    label: requiredString(input.label, `${path}.label`),
    model: requiredString(input.model, `${path}.model`),
  }
}

/** Validates and deterministically normalizes one browser-owned provider. */
export function validateBrowserProvider(value: unknown, path = 'provider'): BrowserProvider {
  const input = record(value, path)
  const common = base(input, path)
  switch (input.kind) {
    case 'anthropic':
      return { ...common, kind: 'anthropic', apiKey: requiredString(input.apiKey, `${path}.apiKey`) }
    case 'openai_compatible': {
      const protocol = input.protocol
      if (protocol !== 'responses' && protocol !== 'chat_completions') invalid(`${path}.protocol`)
      const apiKey = optionalSecret(input.apiKey, `${path}.apiKey`)
      const customHeaders = headers(input.headers, `${path}.headers`)
      return {
        ...common,
        kind: 'openai_compatible',
        baseUrl: apiRoot(input.baseUrl, `${path}.baseUrl`),
        protocol,
        ...(apiKey ? { apiKey } : {}),
        ...(customHeaders ? { headers: customHeaders } : {}),
      }
    }
    default:
      invalid(`${path}.kind`)
  }
}

function providerState(value: unknown): BrowserProviderState {
  const input = record(value, 'state')
  if (input.version !== BROWSER_PROVIDER_STATE_VERSION) invalid('state.version')
  if (input.selectedProviderId !== null && input.selectedProviderId !== undefined && typeof input.selectedProviderId !== 'string') {
    invalid('state.selectedProviderId')
  }
  const rawProviders = input.providers
  if (!Array.isArray(rawProviders)) invalid('state.providers')
  const providers = rawProviders.map((provider, index) => validateBrowserProvider(provider, `state.providers[${index}]`))
  const ids = new Set<string>()
  for (const provider of providers) {
    if (ids.has(provider.id)) invalid('state.providers')
    ids.add(provider.id)
  }
  const selectedProviderId = input.selectedProviderId === undefined ? null : input.selectedProviderId
  if (selectedProviderId !== null && !ids.has(selectedProviderId)) invalid('state.selectedProviderId')
  return { version: BROWSER_PROVIDER_STATE_VERSION, selectedProviderId, providers }
}

export function emptyBrowserProviderState(): BrowserProviderState {
  return { version: BROWSER_PROVIDER_STATE_VERSION, selectedProviderId: null, providers: [] }
}

/** Parses storage data and rejects malformed state without exposing secrets. */
export function parseBrowserProviderState(serialized: string | null): BrowserProviderState {
  if (!serialized) return emptyBrowserProviderState()
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    invalid('state')
  }
  return providerState(value)
}

function sessionStore(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function loadBrowserProviderState(storage: Storage | null = sessionStore()): BrowserProviderState {
  if (!storage) return emptyBrowserProviderState()
  try {
    return parseBrowserProviderState(storage.getItem(BROWSER_PROVIDER_STORAGE_KEY))
  } catch {
    // A stale or inaccessible session store must not prevent the portal from loading.
    return emptyBrowserProviderState()
  }
}

export function saveBrowserProviderState(
  state: BrowserProviderState,
  storage: Storage | null = sessionStore(),
): void {
  const validated = providerState(state)
  if (!storage) return
  try {
    storage.setItem(BROWSER_PROVIDER_STORAGE_KEY, JSON.stringify(validated))
  } catch {
    // Keep the in-memory store usable when sessionStorage is unavailable.
  }
}

export interface BrowserProviderStore {
  readonly state: BrowserProviderState
  upsert(provider: BrowserProvider): void
  remove(providerId: string): void
  select(providerId: string | null): void
  clear(): void
}

/** A small session-scoped store; direct-provider credentials never cross the Aruna API boundary. */
export function createBrowserProviderStore(storage: Storage | null = sessionStore()): BrowserProviderStore {
  let current = loadBrowserProviderState(storage)
  const persist = () => saveBrowserProviderState(current, storage)
  return {
    get state() {
      return current
    },
    upsert(provider) {
      const next = validateBrowserProvider(provider)
      const index = current.providers.findIndex((entry) => entry.id === next.id)
      const providers = index < 0
        ? [...current.providers, next]
        : current.providers.map((entry, at) => (at === index ? next : entry))
      current = {
        version: BROWSER_PROVIDER_STATE_VERSION,
        selectedProviderId: current.selectedProviderId ?? next.id,
        providers,
      }
      persist()
    },
    remove(providerId) {
      const providers = current.providers.filter((provider) => provider.id !== providerId)
      current = {
        version: BROWSER_PROVIDER_STATE_VERSION,
        selectedProviderId: current.selectedProviderId === providerId ? null : current.selectedProviderId,
        providers,
      }
      persist()
    },
    select(providerId) {
      if (providerId !== null && !current.providers.some((provider) => provider.id === providerId)) {
        invalid('state.selectedProviderId')
      }
      current = { ...current, selectedProviderId: providerId }
      persist()
    },
    clear() {
      current = emptyBrowserProviderState()
      persist()
    },
  }
}
