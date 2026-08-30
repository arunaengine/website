import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_DIRECT_BROWSER_HEADER,
  buildBrowserModel,
  fetchBrowserProviderModels,
} from './browserModels'
import type { BrowserProvider } from './browserProviders'

interface FetchCall {
  input: RequestInfo | URL
  init?: RequestInit
}

const PROMPT = [{
  role: 'user' as const,
  content: [{ type: 'text' as const, text: 'hello' }],
}]

interface TestModel {
  modelId: string
  doStream(options: { prompt: typeof PROMPT }): PromiseLike<unknown>
}

function rejectingFetch(calls: FetchCall[]): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init })
    return new Response('provider rejected the test request', { status: 401 })
  }) as typeof globalThis.fetch
}

async function capture(provider: BrowserProvider, context: { arunaBearer?: string } = {}) {
  const calls: FetchCall[] = []
  const model = buildBrowserModel(provider, { ...context, fetch: rejectingFetch(calls) }) as unknown as TestModel
  await expect(model.doStream({ prompt: PROMPT })).rejects.toBeDefined()
  expect(calls).toHaveLength(1)
  return { model, request: calls[0] }
}

function requestHeaders(request: FetchCall): Headers {
  return new Headers(request.init?.headers)
}

describe('browser model builders', () => {
  it('calls Anthropic directly with the required browser opt-in header', async () => {
    const { model, request } = await capture({
      kind: 'anthropic',
      id: 'claude',
      label: 'Claude',
      model: 'claude-sonnet',
      apiKey: 'sk-ant',
    })

    expect(String(request.input)).toBe('https://api.anthropic.com/v1/messages')
    expect(requestHeaders(request).get('x-api-key')).toBe('sk-ant')
    expect(requestHeaders(request).get(ANTHROPIC_DIRECT_BROWSER_HEADER)).toBe('true')
    expect(model.modelId).toBe('claude-sonnet')
  })

  it('uses the exact compatible API root for Chat Completions and permits no key', async () => {
    const { model, request } = await capture({
      kind: 'openai_compatible',
      id: 'local',
      label: 'Local',
      model: 'qwen',
      baseUrl: 'http://127.0.0.1:11434/custom/v1/',
      protocol: 'chat_completions',
      headers: { 'X-Local-Mode': 'fast' },
    })

    expect(String(request.input)).toBe('http://127.0.0.1:11434/custom/v1/chat/completions')
    expect(requestHeaders(request).get('x-local-mode')).toBe('fast')
    expect(requestHeaders(request).get('authorization')).toBeNull()
    expect(model.modelId).toBe('qwen')
  })

  it('supports the Responses protocol with an optional key and custom headers', async () => {
    const { request } = await capture({
      kind: 'openai_compatible',
      id: 'official',
      label: 'OpenAI',
      model: 'gpt-5.6',
      baseUrl: 'https://api.openai.com/v1',
      protocol: 'responses',
      apiKey: 'sk-openai',
      headers: { 'OpenAI-Project': 'project-1' },
    })

    expect(String(request.input)).toBe('https://api.openai.com/v1/responses')
    expect(requestHeaders(request).get('authorization')).toBe('Bearer sk-openai')
    expect(requestHeaders(request).get('openai-project')).toBe('project-1')
  })

  it('removes the generated empty auth header when Responses uses no key', async () => {
    const { request } = await capture({
      kind: 'openai_compatible',
      id: 'local-responses',
      label: 'Local Responses',
      model: 'local',
      baseUrl: 'http://127.0.0.1:9000/v1',
      protocol: 'responses',
    })

    expect(requestHeaders(request).get('authorization')).toBeNull()
  })

})

const OPENAI: BrowserProvider = {
  kind: 'openai_compatible',
  id: 'official',
  label: 'OpenAI',
  model: 'gpt-5.6-sol',
  baseUrl: 'https://api.openai.com/v1',
  protocol: 'responses',
  apiKey: 'sk-openai',
}

function listing(payload: unknown, calls: FetchCall[] = []): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init })
    return new Response(JSON.stringify(payload), { status: 200 })
  }) as typeof globalThis.fetch
}

describe('fetchBrowserProviderModels', () => {
  it('lists the chat models an OpenAI key can reach, newest first', async () => {
    const calls: FetchCall[] = []
    const models = await fetchBrowserProviderModels(OPENAI, listing({
      data: [
        { id: 'gpt-4.1', created: 10 },
        { id: 'text-embedding-3-large', created: 40 },
        { id: 'gpt-5.6-sol', created: 30 },
        { id: 'gpt-4o-transcribe', created: 35 },
        { id: 'dall-e-3', created: 20 },
        { id: 'gpt-5.5', created: 20 },
      ],
    }, calls))

    expect(models.map((model) => model.id)).toEqual(['gpt-5.6-sol', 'gpt-5.5', 'gpt-4.1'])
    expect(String(calls[0].input)).toBe('https://api.openai.com/v1/models')
    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe('Bearer sk-openai')
  })

  it('answers with nothing when the endpoint serves no model list', async () => {
    const empty = (async () => new Response('', { status: 404 })) as typeof globalThis.fetch

    expect(await fetchBrowserProviderModels(OPENAI, empty)).toEqual([])
  })
})
