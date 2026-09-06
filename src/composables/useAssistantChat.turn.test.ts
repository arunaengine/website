// What one turn sends a browser provider: the web search tool and the request
// extras follow what the model reports, the provider's own choice, and what
// an endpoint refused before.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolSet } from 'ai'
import type { AssistantModel, AssistantProvider, UserInfoResponse } from '@/lib/api'
import type { BrowserProvider } from '@/lib/assistant/browserProviders'

const state = vi.hoisted(() => ({
  provider: null as null | (BrowserProvider & { kind: 'openai_compatible' }),
  ready: null as null | { value: AssistantProvider[] },
  learned: [] as Array<{ providerId: string; modelId: string; patch: Partial<AssistantModel> }>,
  answers: [] as Array<{ error?: string }>,
  calls: [] as Array<{ tools: ToolSet; providerOptions: unknown; model: unknown }>,
  built: [] as string[],
}))

vi.mock('./useAssistantProviders', async () => {
  const { ref } = await import('vue')
  const ready = ref<AssistantProvider[]>([])
  state.ready = ready
  return {
    useAssistantProviders: () => ({
      ready,
      listedModels: ref({}),
      modelErrors: ref({}),
      direct: (id: string) => (state.provider?.id === id ? state.provider : null),
      learnModel: async (providerId: string, modelId: string, patch: Partial<AssistantModel>) => {
        state.learned.push({ providerId, modelId, patch })
      },
      load: async () => {},
      listModels: async () => [],
      ensureLoaded: () => {},
    }),
  }
})

vi.mock('@/lib/assistant/chat', () => ({
  runTurn: async (options: { tools: ToolSet; providerOptions: unknown; model: unknown }) => {
    state.calls.push({ tools: options.tools, providerOptions: options.providerOptions, model: options.model })
    const answer = state.answers.shift() ?? {}
    return answer.error
      ? { messages: [], error: answer.error }
      : { messages: [{ role: 'assistant', content: 'answered' }] }
  },
}))
vi.mock('@/lib/assistant/models', () => ({ buildModel: () => ({ id: 'node' }) }))
vi.mock('@/lib/assistant/browserModels', () => ({
  buildBrowserModel: (provider: { model: string }) => {
    state.built.push(provider.model)
    return { id: provider.model }
  },
}))
vi.mock('@/lib/assistant/prompt', () => ({ systemPrompt: () => 'system' }))

const stored = new Map<string, string>()
vi.stubGlobal('window', {
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value)
    },
    removeItem: (key: string) => {
      stored.delete(key)
    },
  },
})

const { apiBaseUrl, authToken, userInfo } = await import('./aruna/state')
const { useAssistantChat } = await import('./useAssistantChat')

function compatible(models: AssistantModel[], webSearch?: 'on' | 'off'): void {
  state.provider = {
    kind: 'openai_compatible',
    id: 'p-lite',
    label: 'LiteLLM',
    model: models[0].id,
    models,
    baseUrl: 'https://litellm.test/v1',
    protocol: 'responses',
    apiKey: 'sk-lite',
    ...(webSearch ? { webSearch } : {}),
  }
  const summary: AssistantProvider = {
    provider_id: 'p-lite',
    kind: 'openai_compatible',
    label: 'LiteLLM',
    models,
    default_model: models[0].id,
    status: 'ready',
    created_at: new Date(0).toISOString(),
  }
  if (state.ready) state.ready.value = [summary]
}

beforeEach(() => {
  state.learned.length = 0
  state.answers.length = 0
  state.calls.length = 0
  state.built.length = 0
  stored.clear()
  apiBaseUrl.value = 'https://node.test'
  authToken.value = 'token'
  userInfo.value = {
    user: { user_id: 'u-1' },
    realm: { realm_id: 'r-1', roles: [] },
    groups: [],
  } as unknown as UserInfoResponse
})

const INCLUDE_REFUSED = "400: Bad Request: body.include.0: Input should be 'code_interpreter_call.outputs', "
  + "'reasoning.encrypted_content'; input: 'web_search_call.action.sources'"

describe('a turn against a compatible Responses provider', () => {
  it('carries the web search tool and store:false for a model that reports it', async () => {
    compatible([{ id: 'gpt-5.6-sol', web_search: true, reasoning_efforts: [] }])
    const chat = useAssistantChat()
    chat.newChat()

    await chat.send('hello', { route: '/' })

    expect(state.calls).toHaveLength(1)
    expect(Object.keys(state.calls[0].tools)).toContain('web_search')
    expect(state.calls[0].providerOptions).toEqual({ openai: { store: false } })
  })

  it('sends neither the tool nor an include when the provider says off', async () => {
    compatible([{ id: 'gpt-5.6-sol', web_search: true, reasoning_efforts: [] }], 'off')
    const chat = useAssistantChat()
    chat.newChat()

    await chat.send('hello', { route: '/' })

    expect(Object.keys(state.calls[0].tools)).not.toContain('web_search')
    expect(state.calls[0].providerOptions).toBeUndefined()
  })

  it('tries an unknown model once, then runs again without what it refused', async () => {
    compatible([{ id: 'jlu/qwen3.8-27b', reasoning_efforts: [] }])
    state.answers.push({ error: INCLUDE_REFUSED })
    const chat = useAssistantChat()
    chat.newChat()

    await chat.send('hello', { route: '/' })

    expect(state.calls).toHaveLength(2)
    expect(Object.keys(state.calls[0].tools)).toContain('web_search')
    expect(Object.keys(state.calls[1].tools)).not.toContain('web_search')
    expect(state.calls[1].providerOptions).toBeUndefined()
    expect(state.learned).toEqual([{ providerId: 'p-lite', modelId: 'jlu/qwen3.8-27b', patch: { web_search: false } }])
    expect(chat.toolsNote.value).toBe('Web search is not available for this model.')
    expect(chat.messages.value.at(-1)?.error).toBeUndefined()
  })

  it('uses a changed model on the next turn and keeps the choice', async () => {
    compatible([{ id: 'jlu/qwen3.8-27b', web_search: false }, { id: 'gpt-5.6-sol', web_search: false }])
    const chat = useAssistantChat()
    chat.newChat()
    chat.selectModel('gpt-5.6-sol')

    await chat.send('hello', { route: '/' })

    expect(state.built).toEqual(['gpt-5.6-sol'])
    expect(state.calls[0].model).toEqual({ id: 'gpt-5.6-sol' })
    expect(stored.get('aruna.assistant.model')).toBe('gpt-5.6-sol')
    expect(chat.messages.value.at(-1)?.model).toEqual({ providerId: 'p-lite', providerLabel: 'LiteLLM', model: 'gpt-5.6-sol' })
  })
})
