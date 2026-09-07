import { beforeEach, describe, expect, it, vi } from 'vitest'
import { modelSuggestions } from '@/lib/assistant/modelOptions'

const fetchAssistantModels = vi.fn(async () => ({ models: [{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.5' }] }))

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listAssistantProviders: vi.fn(async () => ({ providers: [] })),
  fetchAssistantModels,
}))

const { useAssistantProviders } = await import('./useAssistantProviders')
const { assistantRemovedProvider } = await import('./assistantState')

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
  it('refreshes cached models after provider configuration changes', async () => {
    const providers = useAssistantProviders()
    await providers.create({ ...openai, id: 'edited-provider' })
    await providers.listModels('edited-provider')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [{ id: 'new-model' }] }), { status: 200 }))
    await providers.update('edited-provider', { ...openai, id: 'edited-provider', model: 'new-model', baseUrl: 'https://new-provider.example/v1' })
    expect(providers.listedModels.value['edited-provider']).toBeUndefined()
    expect((await providers.listModels('edited-provider')).map(model => model.id)).toContain('new-model')
  })

  it('ignores a model listing from before a provider edit', async () => {
    const providers = useAssistantProviders()
    await providers.create({ ...openai, id: 'changing-provider' })
    let finish = (_response: Response) => {}
    let started = () => {}
    const entered = new Promise<void>(resolve => { started = resolve })
    vi.stubGlobal('fetch', (url: RequestInfo | URL) => { if (!String(url).endsWith('/models')) return Promise.resolve(new Response('{}', { status: 404 })); started(); return new Promise<Response>(resolve => { finish = resolve }) })
    const old = providers.listModels('changing-provider')
    await entered
    await providers.update('changing-provider', { ...openai, id: 'changing-provider', model: 'new-model' })
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [{ id: 'new-model' }] }), { status: 200 }))
    await providers.listModels('changing-provider')
    finish(new Response(JSON.stringify({ data: [{ id: 'old-model' }] }), { status: 200 }))
    await old
    expect(providers.listedModels.value['changing-provider'].map(model => model.id)).toEqual(['new-model'])
  })


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


describe('removing a provider', () => {
  it('announces the provider before the list changes', async () => {
    const providers = useAssistantProviders()
    await providers.create({ ...openai, id: 'browser-gone', label: 'Gone' })
    const seen: Array<{ id: string; label: string } | null> = []
    const stop = (await import('vue')).watch(assistantRemovedProvider, (gone) => {
      seen.push(gone)
      // The chat looks the provider up while it is still listed.
      expect(providers.providers.value.some((entry) => entry.provider_id === 'browser-gone')).toBe(true)
    }, { flush: 'sync' })

    await providers.remove('browser-gone')
    stop()

    expect(seen).toEqual([{ id: 'browser-gone', label: 'Gone' }])
    expect(providers.providers.value.some((entry) => entry.provider_id === 'browser-gone')).toBe(false)
  })
})
