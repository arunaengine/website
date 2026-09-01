import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assistantProxyBaseUrl,
  createAssistantProvider,
  deleteAssistantProvider,
  fetchAssistantModels,
  listAssistantProviders,
  patchAssistantProvider,
  pollChatGptLogin,
  startChatGptLogin,
  testAssistantProvider,
} from './assistant'
import {
  createSession,
  listSessions,
  revokeSession,
} from './sessions'

const CLIENT = { baseUrl: 'https://api.test/api/v1', token: 'bearer-1' }

interface Call {
  url: string
  method: string
  body: unknown
  authorization: string | null
}

function stubFetch(payload: unknown, status = 200) {
  const calls: Call[] = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL, init: RequestInit) => {
    const headers = new Headers(init.headers)
    calls.push({
      url: String(input),
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      authorization: headers.get('Authorization'),
    })
    if (status === 204) return new Response(null, { status })
    return new Response(JSON.stringify(payload), { status })
  }))
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('session clients', () => {
  it('mints a session and carries the bearer', async () => {
    const calls = stubFetch({ session_id: 's1', kind: 'assistant', label: 'Chat', token: 't', expires_at: 'x' })

    const response = await createSession({ kind: 'assistant', label: 'Chat' }, CLIENT)

    expect(response.token).toBe('t')
    expect(calls[0].url).toBe('https://api.test/api/v1/access/sessions')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toEqual({ kind: 'assistant', label: 'Chat' })
    expect(calls[0].authorization).toBe('Bearer bearer-1')
  })

  it('lists sessions and revokes one by id', async () => {
    const calls = stubFetch({ sessions: [] })
    await listSessions(CLIENT)
    await revokeSession('01J/ID', CLIENT)

    expect(calls[0].method).toBe('GET')
    expect(calls[1].method).toBe('DELETE')
    // The id is a path segment, so a slash in it must not open a new one.
    expect(calls[1].url).toBe('https://api.test/api/v1/access/sessions/01J%2FID')
  })
})

describe('assistant provider clients', () => {
  it('reaches the provider routes with the expected verbs', async () => {
    const calls = stubFetch({ providers: [] })
    await listAssistantProviders(CLIENT)
    await createAssistantProvider({ kind: 'anthropic', label: 'Work', api_key: 'sk-1' }, CLIENT)
    await patchAssistantProvider('p1', { default_model: 'm1' }, CLIENT)
    await testAssistantProvider('p1', CLIENT)
    await fetchAssistantModels('p1', CLIENT)

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.test/api/v1/system/assistant/providers',
      'POST https://api.test/api/v1/system/assistant/providers',
      'PATCH https://api.test/api/v1/system/assistant/providers/p1',
      'POST https://api.test/api/v1/system/assistant/providers/p1/test',
      'GET https://api.test/api/v1/system/assistant/providers/p1/models',
    ])
    expect(calls[1].body).toEqual({ kind: 'anthropic', label: 'Work', api_key: 'sk-1' })
  })

  it('omits the key from a patch that does not change it', async () => {
    const calls = stubFetch({ provider_id: 'p1' })
    await patchAssistantProvider('p1', { label: 'Renamed' }, CLIENT)

    expect(calls[0].body).toEqual({ label: 'Renamed' })
    expect(Object.keys(calls[0].body as object)).not.toContain('api_key')
  })

  it('accepts an empty delete response', async () => {
    const calls = stubFetch(null, 204)
    await expect(deleteAssistantProvider('p1', CLIENT)).resolves.toBeUndefined()
    expect(calls[0].method).toBe('DELETE')
  })

  it('drives the ChatGPT device login', async () => {
    const calls = stubFetch({ provider_id: 'p2', user_code: 'ABCD', verification_url: 'https://auth', interval_seconds: 5, expires_at: 'x' })
    const start = await startChatGptLogin('My subscription', CLIENT)
    await pollChatGptLogin(start.provider_id, CLIENT)

    expect(calls[0].url).toBe('https://api.test/api/v1/system/assistant/providers/chatgpt/login')
    expect(calls[0].body).toEqual({ label: 'My subscription' })
    expect(calls[1].url).toBe('https://api.test/api/v1/system/assistant/providers/p2/login/poll')
    expect(calls[1].method).toBe('POST')
  })
})

describe('assistantProxyBaseUrl', () => {
  it('builds the proxy base the AI SDK provider is pointed at', () => {
    expect(assistantProxyBaseUrl('https://api.test/api/v1', 'p1'))
      .toBe('https://api.test/api/v1/system/assistant/providers/p1/proxy')
  })

  it('does not double the slash on a trailing-slash base', () => {
    expect(assistantProxyBaseUrl('/api/v1/', 'p1'))
      .toBe('/api/v1/system/assistant/providers/p1/proxy')
  })
})
