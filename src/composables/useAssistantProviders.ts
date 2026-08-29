// The AI providers configured for this account. Module singleton: the settings
// tab, the chat launcher and the panel all read one list, revalidated in the
// background whenever a surface asks for it (stale-while-revalidate).
import { computed, ref } from 'vue'
import {
  apiErrorMessage,
  createAssistantProvider,
  deleteAssistantProvider,
  fetchAssistantModels,
  listAssistantProviders,
  patchAssistantProvider,
  testAssistantProvider,
  type AssistantModel,
  type AssistantProvider,
  type CreateProviderRequest,
  type PatchProviderRequest,
} from '@/lib/api'
import { apiBaseUrl, authToken } from './aruna/state'

const providers = ref<AssistantProvider[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
let inFlight: Promise<void> | null = null

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function replace(provider: AssistantProvider) {
  const index = providers.value.findIndex((entry) => entry.provider_id === provider.provider_id)
  if (index < 0) providers.value = [...providers.value, provider]
  else providers.value = providers.value.map((entry, at) => (at === index ? provider : entry))
}

async function revalidate(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    providers.value = (await listAssistantProviders(client())).providers
    loaded.value = true
  } catch (cause) {
    error.value = apiErrorMessage(cause)
  } finally {
    loading.value = false
    inFlight = null
  }
}

export function useAssistantProviders() {
  /** Revalidates once; concurrent callers share the request in flight. */
  function load(): Promise<void> {
    if (!authToken.value) return Promise.resolve()
    inFlight ??= revalidate()
    return inFlight
  }

  /** Serves what is cached and refreshes behind it. */
  function ensureLoaded(): void {
    if (loaded.value) {
      void load()
      return
    }
    void load()
  }

  async function create(request: CreateProviderRequest): Promise<AssistantProvider> {
    const provider = await createAssistantProvider(request, client())
    replace(provider)
    return provider
  }

  async function update(providerId: string, request: PatchProviderRequest): Promise<AssistantProvider> {
    const provider = await patchAssistantProvider(providerId, request, client())
    replace(provider)
    return provider
  }

  async function remove(providerId: string): Promise<void> {
    await deleteAssistantProvider(providerId, client())
    providers.value = providers.value.filter((entry) => entry.provider_id !== providerId)
  }

  function check(providerId: string) {
    return testAssistantProvider(providerId, client())
  }

  async function models(providerId: string): Promise<AssistantModel[]> {
    return (await fetchAssistantModels(providerId, client())).models
  }

  return {
    providers,
    loading,
    loaded,
    error,
    ready: computed(() => providers.value.filter((provider) => provider.status === 'ready')),
    load,
    ensureLoaded,
    create,
    update,
    remove,
    check,
    models,
  }
}
