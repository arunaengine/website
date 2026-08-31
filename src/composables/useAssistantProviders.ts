// Browser providers are session-scoped direct connections. Node-managed
// provider summaries are merged with the local direct providers.
import { computed, ref, watch } from 'vue'
import {
  apiErrorMessage,
  deleteAssistantProvider,
  fetchAssistantModels,
  listAssistantProviders,
  type AssistantModel,
  type AssistantProvider,
} from '@/lib/api'
import {
  createBrowserProviderStore,
  missingBrowserKey,
  validateBrowserProvider,
  type BrowserProvider,
} from '@/lib/assistant/browserProviders'
import { errorMessage } from '@/lib/utils'
import { apiBaseUrl, authToken, sessionEpoch, userInfo } from './aruna/state'
import { assistantAvailable } from './assistantState'

export interface BrowserProviderTestResponse {
  ok: boolean
  message: string
}

const KEY_GONE = 'Enter the key again in settings to list models.'

const browserStore = createBrowserProviderStore()
const nodeProviders = ref<AssistantProvider[]>([])
const providers = ref<AssistantProvider[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
const listedModels = ref<Record<string, AssistantModel[]>>({})
const modelErrors = ref<Record<string, string>>({})
const modelLoads = new Map<string, Promise<AssistantModel[]>>()
let nodeGeneration = 0
let inFlight: { epoch: number; generation: number; identity: string; promise: Promise<void> } | null = null

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function directSummary(provider: BrowserProvider): AssistantProvider {
  const base = {
    provider_id: provider.id,
    kind: provider.kind,
    label: provider.label,
    models: provider.models?.length ? provider.models : [{ id: provider.model }],
    default_model: provider.model,
    status: 'ready' as const,
    // Direct providers have no node creation timestamp; this field is only
    // retained for the existing summary consumers.
    created_at: new Date(0).toISOString(),
  }
  if (provider.kind === 'anthropic') return base
  return {
    ...base,
    base_url: provider.baseUrl,
    header_names: Object.keys(provider.headers ?? {}),
  }
}

function rebuild() {
  providers.value = [
    ...browserStore.state.providers.map(directSummary),
    ...nodeProviders.value,
  ]
  assistantAvailable.value = authenticated() && providers.value.some((provider) => provider.status === 'ready')
}

function direct(providerId: string): BrowserProvider | null {
  return browserStore.state.providers.find((provider) => provider.id === providerId) ?? null
}

function identityKey(): string {
  return userInfo.value?.user.user_id ?? ''
}

function authenticated(): boolean {
  return Boolean(authToken.value.trim() && identityKey())
}

function currentNodeContext(epoch: number, generation: number, identity: string): boolean {
  return epoch === sessionEpoch.value && generation === nodeGeneration && identity === identityKey()
}

async function revalidate(epoch: number, generation: number, identity: string): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const response = await listAssistantProviders(client())
    if (!currentNodeContext(epoch, generation, identity)) return
    nodeProviders.value = response.providers
    rebuild()
    loaded.value = true
  } catch (cause) {
    if (!currentNodeContext(epoch, generation, identity)) return
    nodeProviders.value = []
    rebuild()
    error.value = apiErrorMessage(cause)
  } finally {
    if (currentNodeContext(epoch, generation, identity)) {
      loading.value = false
      if (inFlight?.epoch === epoch && inFlight.generation === generation && inFlight.identity === identity) {
        inFlight = null
      }
    }
  }
}

function resetNodeCache() {
  nodeGeneration += 1
  nodeProviders.value = []
  loaded.value = false
  loading.value = false
  error.value = null
  inFlight = null
  listedModels.value = {}
  modelErrors.value = {}
  modelLoads.clear()
  rebuild()
}

function resetBrowserSession() {
  browserStore.clear()
  resetNodeCache()
}

// Token or node changes clear direct credentials immediately. A user-info-only
// change only invalidates node Codex summaries and in-flight loads.
watch(sessionEpoch, resetBrowserSession, { flush: 'sync' })
watch(() => userInfo.value?.user.user_id ?? '', resetNodeCache)

export function useAssistantProviders() {
  /** Revalidates the node-managed provider summaries once per concurrent wave. */
  function load(): Promise<void> {
    rebuild()
    if (!authenticated()) return Promise.resolve()
    const epoch = sessionEpoch.value
    const generation = nodeGeneration
    const identity = identityKey()
    if (inFlight?.epoch === epoch && inFlight.generation === generation && inFlight.identity === identity) {
      return inFlight.promise
    }
    const promise = revalidate(epoch, generation, identity)
    inFlight = { epoch, generation, identity, promise }
    return promise
  }

  /** Serves the local direct providers and refreshes node providers behind them. */
  function ensureLoaded(): void {
    if (loaded.value) {
      void load()
      return
    }
    void load()
  }

  async function create(provider: BrowserProvider): Promise<AssistantProvider> {
    const validated = validateBrowserProvider(provider)
    browserStore.upsert(validated)
    rebuild()
    return directSummary(validated)
  }

  async function update(providerId: string, provider: BrowserProvider): Promise<AssistantProvider> {
    const current = direct(providerId)
    if (!current) throw new Error('Only browser-owned providers can be edited here.')
    const validated = validateBrowserProvider({ ...provider, id: providerId })
    browserStore.upsert(validated)
    rebuild()
    return directSummary(validated)
  }

  async function remove(providerId: string): Promise<void> {
    if (direct(providerId)) {
      browserStore.remove(providerId)
      rebuild()
      return
    }
    const nodeProvider = nodeProviders.value.find((provider) => provider.provider_id === providerId)
    if (!nodeProvider) return
    await deleteAssistantProvider(providerId, client())
    nodeProviders.value = nodeProviders.value.filter((provider) => provider.provider_id !== providerId)
    rebuild()
  }

  /** Tests a candidate only; no provider state is changed on success or failure. */
  async function check(provider: BrowserProvider): Promise<BrowserProviderTestResponse> {
    try {
      const validated = validateBrowserProvider(provider)
      const [{ dynamicTool, generateText, jsonSchema }, { buildBrowserModel }] = await Promise.all([
        import('ai'),
        import('@/lib/assistant/browserModels'),
      ])
      const probeToolName = 'assistant_connection_probe'
      const result = await generateText({
        model: buildBrowserModel(validated),
        prompt: `Call ${probeToolName} exactly once to verify that this provider accepts function tools.`,
        tools: {
          [probeToolName]: dynamicTool({
            description: 'A harmless connection test. It accepts no arguments and returns a fixed result.',
            inputSchema: jsonSchema({ type: 'object', properties: {}, additionalProperties: false }),
            execute: async () => ({ ok: true }),
          }),
        },
        toolChoice: { type: 'tool', toolName: probeToolName },
        maxOutputTokens: 128,
        maxRetries: 0,
        providerOptions: validated.kind === 'openai_compatible' && validated.protocol === 'responses'
          ? { openai: { store: false } }
          : undefined,
      })
      if (!result.toolCalls.some((call) => call.toolName === probeToolName)) {
        throw new Error('The provider did not accept the function-tool connection test.')
      }
      return { ok: true, message: 'The provider accepted function tools.' }
    } catch (cause) {
      return { ok: false, message: errorMessage(cause) }
    }
  }

  async function models(provider: BrowserProvider): Promise<AssistantModel[]> {
    const { fetchBrowserProviderModels } = await import('@/lib/assistant/browserModels')
    return fetchBrowserProviderModels(validateBrowserProvider(provider))
  }

  async function fetchModels(providerId: string): Promise<AssistantModel[]> {
    const local = direct(providerId)
    if (local) return models(local)
    const response = await fetchAssistantModels(providerId, client())
    return response.models
  }

  /** Lists what a configured provider offers today, once per session. */
  function listModels(providerId: string): Promise<AssistantModel[]> {
    if (!providerId) return Promise.resolve([])
    const cached = listedModels.value[providerId]
    if (cached) return Promise.resolve(cached)
    const local = direct(providerId)
    // Without the tab-held key the listing cannot run, and the stored id alone
    // would look like the only model this provider offers.
    if (local && missingBrowserKey(local)) {
      modelErrors.value = { ...modelErrors.value, [providerId]: KEY_GONE }
      return Promise.resolve([])
    }
    const running = modelLoads.get(providerId)
    if (running) return running
    const load = fetchModels(providerId)
      .then((listed) => {
        listedModels.value = { ...listedModels.value, [providerId]: listed }
        return listed
      })
      .catch((cause: unknown) => {
        const message = `The model list could not be read: ${apiErrorMessage(cause)}`
        modelErrors.value = { ...modelErrors.value, [providerId]: message }
        return []
      })
      .finally(() => modelLoads.delete(providerId))
    modelLoads.set(providerId, load)
    return load
  }

  rebuild()
  return {
    providers,
    loading,
    loaded,
    error,
    ready: computed(() => authenticated() ? providers.value.filter((provider) => provider.status === 'ready') : []),
    load,
    ensureLoaded,
    create,
    update,
    remove,
    check,
    models,
    listedModels,
    modelErrors,
    listModels,
    direct,
  }
}
