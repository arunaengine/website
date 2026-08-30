import { beforeEach, describe, expect, it, vi } from 'vitest'
import { modelSuggestions } from '@/lib/assistant/modelOptions'

const fetchAssistantModels = vi.fn(async () => ({ models: [{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.5' }] }))

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listAssistantProviders: vi.fn(async () => ({ providers: [] })),
  fetchAssistantModels,
}))

const { useAssistantProviders } = await import('./useAssistantProviders')

const openai = {
  id: 'browser-1',
  kind: 'openai_compatible' as const,
  label: 'OpenAI',
  model: 'gpt-5.6-sol',
  baseUrl: 'https://api.openai.com/v1',
  protocol: 'responses' as const,
  apiKey: 'sk-openai',
}

const requests: string[] = []

beforeEach(() => {
  requests.length = 0
  fetchAssistantModels.mockClear()
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    requests.push(String(input))
    return new Response(JSON.stringify({
      data: [{ id: 'gpt-5.6-sol', created: 3 }, { id: 'gpt-4.1', created: 2 }],
    }), { status: 200 })
  })
})

describe('assistant model listing', () => {
  it('lists what a stored key can reach, not only the id it was saved with', async () => {
    // A provider saved without fetching models carries a single stored id.
    const providers = useAssistantProviders()
    const summary = await providers.create(openai)
    expect(summary.models.map((model) => model.id)).toEqual(['gpt-5.6-sol'])

    const listed = await providers.listModels('browser-1')

    expect(listed.map((model) => model.id)).toEqual(['gpt-5.6-sol', 'gpt-4.1'])
    expect(providers.listedModels.value['browser-1']).toEqual(listed)
  })

  it('reads a provider listing once per session', async () => {
    const providers = useAssistantProviders()
    await providers.listModels('browser-1')
    await providers.listModels('browser-1')

    expect(requests).toHaveLength(0)
  })

  it('asks the node for the models of a provider it manages', async () => {
    const providers = useAssistantProviders()
    const listed = await providers.listModels('chatgpt-1')

    expect(fetchAssistantModels).toHaveBeenCalledWith('chatgpt-1', expect.anything())
    expect(listed.map((model) => model.id)).toEqual(['gpt-5.6-sol', 'gpt-5.5'])
  })

  it('offers every chat model an OpenAI key can reach', async () => {
    // The realistic listing: only the non-text families may be dropped.
    const catalog = [
      'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5',
      'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'o3', 'o4-mini', 'chatgpt-4o-latest',
      'text-embedding-3-large', 'whisper-1', 'tts-1', 'dall-e-3', 'gpt-image-1',
      'omni-moderation-latest',
    ]
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      data: catalog.map((id, index) => ({ id, created: catalog.length - index })),
    }), { status: 200 }))
    const providers = useAssistantProviders()
    const summary = await providers.create({ ...openai, id: 'browser-catalog' })

    const listed = await providers.listModels('browser-catalog')
    const choices = modelSuggestions(summary, providers.listedModels.value['browser-catalog'] ?? [])

    expect(listed.map((model) => model.id)).toEqual(catalog.slice(0, 12))
    expect(choices.map((model) => model.id)).toEqual(catalog.slice(0, 12))
  })

  it('keeps the failure so the picker can explain an empty list', async () => {
    fetchAssistantModels.mockRejectedValueOnce(new Error('HTTP 401'))
    const providers = useAssistantProviders()

    expect(await providers.listModels('chatgpt-2')).toEqual([])
    expect(providers.modelErrors.value['chatgpt-2']).toContain('HTTP 401')
  })
})
