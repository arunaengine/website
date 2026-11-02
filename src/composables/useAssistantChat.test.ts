import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserInfoResponse } from '@/lib/api'

const s3 = vi.hoisted(() => ({
  hasActiveKey: { value: true },
  ensureSession: vi.fn(async () => {}),
  resolveObjectUrl: vi.fn((_url: string) => null as { nodeId: string | null } | null),
  downloadUrl: vi.fn(async () => 'https://s3.node.test/work/object?signature'),
  getObjectBlob: vi.fn(async () => new Blob([new Uint8Array(1024)], { type: 'image/png' })),
}))

vi.mock('./useS3', () => ({ useS3: () => s3, s3ErrorMessage: (err: unknown) => String(err) }))

const objectUrls = vi.hoisted(() => ({ created: [] as string[], revoked: [] as string[] }))
URL.createObjectURL = vi.fn(() => {
  const url = `blob:aruna/${objectUrls.created.length}`
  objectUrls.created.push(url)
  return url
})
URL.revokeObjectURL = vi.fn((url: string) => {
  objectUrls.revoked.push(url)
})

const stored = new Map<string, string>()

vi.stubGlobal('window', {
  location: { origin: 'https://portal.test' },
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value)
    },
    removeItem: (key: string) => {
      stored.delete(key)
    },
    get length() {
      return stored.size
    },
    key: (index: number) => [...stored.keys()][index] ?? null,
  },
})

const { createAssistantChatStore, newAssistantChat } = await import('@/lib/assistant/chatHistory')
const { apiBaseUrl, authToken, userInfo } = await import('./aruna/state')
const { loadArtifact, useAssistantChat, turnRequest } = await import('./useAssistantChat')

const scope = { apiBaseUrl: 'https://node.test', realmId: 'r-1', userId: 'u-1' }

// A store that answers a range request with that range, or the whole body when it ignores ranges.
function serve(body: Uint8Array<ArrayBuffer>, ranges = true) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const range = /bytes=0-(\d+)/.exec(String((init?.headers as Record<string, string> | undefined)?.Range ?? ''))
    if (!range || !ranges) return new Response(body, { status: 200 })
    const part = body.slice(0, Number(range[1]) + 1)
    return new Response(part, { status: 206, headers: { 'content-range': `bytes 0-${part.length - 1}/${body.length}` } })
  })
}

// Two chats written before the composable sees the scope: the older one is the
// active record, so only selectLatestChat can move the session to the newer.
function seed() {
  const older = { ...newAssistantChat('Bucket layout'), id: 'c-old', updatedAt: 1_000 }
  const newer = { ...newAssistantChat('Crate profile'), id: 'c-new', updatedAt: 9_000 }
  createAssistantChatStore(scope).save({ activeChatId: older.id, chats: [older, newer] })
  apiBaseUrl.value = scope.apiBaseUrl
  authToken.value = 'token'
  userInfo.value = {
    user: { user_id: scope.userId },
    realm: { realm_id: scope.realmId, roles: [] },
    groups: [],
  } as unknown as UserInfoResponse
}

describe('selectLatestChat', () => {
  it('switches to the chat written to last', () => {
    seed()
    const chat = useAssistantChat()
    expect(chat.activeChatId.value).toBe('c-old')

    chat.selectLatestChat()

    expect(chat.activeChatId.value).toBe('c-new')
  })

  it('leaves a running turn on its own chat', () => {
    const chat = useAssistantChat()
    chat.selectChat('c-old')
    chat.busy.value = true

    chat.selectLatestChat()

    expect(chat.activeChatId.value).toBe('c-old')
    chat.busy.value = false
  })
})

describe('reasoningEffort', () => {
  it('round-trips the chosen effort through storage', () => {
    const chat = useAssistantChat()
    chat.setReasoningEffort('high')

    expect(chat.reasoningEffort.value).toBe('high')
    expect(stored.get('aruna.assistant.effort')).toBe('high')
  })

  it('ignores an unknown effort value', () => {
    const chat = useAssistantChat()
    chat.setReasoningEffort('medium')
    chat.setReasoningEffort('turbo')

    expect(chat.reasoningEffort.value).toBe('medium')
  })
})

describe('effortOptions', () => {
  it('offers the default set when no provider is selected', () => {
    const chat = useAssistantChat()
    expect(chat.effortOptions.value).toEqual(['minimal', 'low', 'medium', 'high'])
  })
})

describe('loadArtifact', () => {
  beforeEach(() => {
    seed()
    objectUrls.created.length = 0
    objectUrls.revoked.length = 0
    s3.resolveObjectUrl.mockReturnValue(null)
    s3.getObjectBlob.mockClear()
    s3.downloadUrl.mockClear()
    vi.stubGlobal('fetch', serve(new Uint8Array(1024)))
  })

  it('reads only the start of a text file and marks it as cut', async () => {
    const fetchMock = serve(new TextEncoder().encode('line\n'.repeat(10_000)))
    vi.stubGlobal('fetch', fetchMock)
    const loaded = await loadArtifact({ bucket: 'work', key: 'logs/run.log', contentType: 'text/plain' })

    expect(s3.getObjectBlob).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('https://s3.node.test/work/object?signature', { headers: { Range: 'bytes=0-16383' } })
    expect(loaded.truncated).toBe(true)
    expect(loaded.text?.length).toBeLessThanOrEqual(16_384)
    // The store states the whole size even though only the start was read.
    expect(loaded.size).toBe(50_000)
  })

  it('reads an empty file as empty text instead of failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 416, headers: { 'content-range': 'bytes */0' } })))
    const loaded = await loadArtifact({ bucket: 'work', key: 'logs/empty.log', contentType: 'text/plain' })

    expect(loaded).toMatchObject({ kind: 'text', text: '', truncated: false, size: 0 })
  })

  it('still fails on a range the store refuses for a file that is not empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 416, headers: { 'content-range': 'bytes */12' } })))

    await expect(loadArtifact({ bucket: 'work', key: 'logs/odd.log', contentType: 'text/plain' })).rejects.toThrow('416')
  })

  it('keeps a file exactly at the read limit whole when the store says it is complete', async () => {
    const body = new TextEncoder().encode(`heading\n${'x'.repeat(16_384 - 'heading\n\nlast line'.length)}\nlast line`)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200, headers: { 'content-length': String(body.length) } })))
    const loaded = await loadArtifact({ bucket: 'work', key: 'notes/exact.txt', contentType: 'text/plain' })

    expect(body.length).toBe(16_384)
    expect(loaded.truncated).toBe(false)
    expect(loaded.text?.endsWith('last line')).toBe(true)
  })

  it('keeps a ranged read whole when its total matches the limit', async () => {
    vi.stubGlobal('fetch', serve(new TextEncoder().encode('a\n'.repeat(8_192))))
    const loaded = await loadArtifact({ bucket: 'work', key: 'notes/exact.txt', contentType: 'text/plain' })

    expect(loaded.truncated).toBe(false)
    expect(loaded.text).toBe('a\n'.repeat(8_192))
  })

  it('reads the start and then more of a text file larger than the cap, since every text read is bounded', async () => {
    const fetchMock = serve(new TextEncoder().encode('line\n'.repeat(50_000)))
    vi.stubGlobal('fetch', fetchMock)
    const ref = { bucket: 'work', key: 'logs/huge.log', contentType: 'text/plain', size: 30 * 1024 * 1024 }
    const first = await loadArtifact(ref)
    const more = await loadArtifact(ref, 200_000)

    expect(first).toMatchObject({ kind: 'text', truncated: true })
    expect(more).toMatchObject({ kind: 'text', truncated: true })
    expect(more.text?.length).toBeGreaterThan(first.text?.length ?? 0)
    expect(fetchMock).toHaveBeenLastCalledWith(expect.any(String), { headers: { Range: 'bytes=0-199999' } })
  })

  it('reads more of a text file only when asked to', async () => {
    const fetchMock = serve(new TextEncoder().encode('line\n'.repeat(10_000)))
    vi.stubGlobal('fetch', fetchMock)
    const loaded = await loadArtifact({ bucket: 'work', key: 'logs/run.log', contentType: 'text/plain' }, 200_000)

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), { headers: { Range: 'bytes=0-199999' } })
    expect(loaded.truncated).toBe(false)
    expect(loaded.text).toBe('line\n'.repeat(10_000))
  })

  it('never holds an image of unknown size beyond the cap, even when ranges are ignored', async () => {
    vi.stubGlobal('fetch', serve(new Uint8Array(26 * 1024 * 1024), false))
    const loaded = await loadArtifact({ bucket: 'work', key: 'results/huge.png', contentType: 'image/png' })

    expect(s3.getObjectBlob).not.toHaveBeenCalled()
    expect(loaded).toMatchObject({ kind: 'download', url: 'https://s3.node.test/work/object?signature' })
  })

  it('names the size of an oversized image only when the store states it', async () => {
    const big = new Uint8Array(25 * 1024 * 1024 + 4096)
    vi.stubGlobal('fetch', serve(big, false))
    const unknown = await loadArtifact({ bucket: 'work', key: 'results/a.png', contentType: 'image/png' })
    vi.stubGlobal('fetch', serve(big))
    const ranged = await loadArtifact({ bucket: 'work', key: 'results/b.png', contentType: 'image/png' })

    expect(unknown).toMatchObject({ kind: 'download' })
    expect(unknown.size).toBeUndefined()
    expect(ranged).toMatchObject({ kind: 'download', size: big.length })
  })

  it('holds a small image in the tab as a blob url', async () => {
    const loaded = await loadArtifact({
      bucket: 'work',
      key: 'results/run-1/chart.png',
      contentType: 'image/png',
      size: 1024,
    })

    expect(s3.downloadUrl).toHaveBeenCalledWith('work', 'results/run-1/chart.png', null, undefined)
    expect(loaded).toEqual({
      url: 'blob:aruna/0',
      contentType: 'image/png',
      kind: 'image',
      name: 'chart.png',
      size: 1024,
    })
  })

  it('links to an artifact above the cap instead of reading it', async () => {
    const loaded = await loadArtifact({
      bucket: 'work',
      key: 'results/run-1/big.png',
      contentType: 'image/png',
      size: 30 * 1024 * 1024,
    })

    expect(s3.getObjectBlob).not.toHaveBeenCalled()
    expect(loaded).toMatchObject({ kind: 'download', url: 'https://s3.node.test/work/object?signature' })
  })

  it('links to a file the browser cannot render', async () => {
    const loaded = await loadArtifact({ bucket: 'work', key: 'results/run-1/reads.bam', size: 20 })

    expect(s3.getObjectBlob).not.toHaveBeenCalled()
    expect(loaded).toMatchObject({ kind: 'download', contentType: 'application/octet-stream', name: 'reads.bam' })
  })

  it('reads from the node the output names', async () => {
    s3.resolveObjectUrl.mockReturnValue({ nodeId: 'node-2' })

    await loadArtifact({
      bucket: 'work',
      key: 'results/chart.png',
      endpointUrl: 'https://s3.node.test/',
      versionId: 'v-3',
    })

    expect(s3.resolveObjectUrl).toHaveBeenCalledWith('https://s3.node.test/work/results/chart.png')
    expect(s3.downloadUrl).toHaveBeenCalledWith('work', 'results/chart.png', 'node-2', 'v-3')
  })

  it('keeps a blob url across a chat switch', async () => {
    // The card stays in the other chat's messages, so its bytes must too.
    const chat = useAssistantChat()
    chat.selectChat('c-old')
    const loaded = await loadArtifact({ bucket: 'work', key: 'results/chart.png', contentType: 'image/png' })

    chat.selectChat('c-new')
    chat.selectChat('c-old')

    expect(objectUrls.revoked).not.toContain(loaded.url)
  })

  it('frees the oldest blob url beyond the cap', async () => {
    const first = await loadArtifact({ bucket: 'work', key: 'results/first.png', contentType: 'image/png' })
    for (let index = 0; index < 24; index += 1) {
      await loadArtifact({ bucket: 'work', key: `results/${index}.png`, contentType: 'image/png' })
    }

    expect(objectUrls.revoked).toContain(first.url)
    expect(objectUrls.revoked).not.toContain(objectUrls.created.at(-1))
  })
})

describe('turnRequest', () => {
  it('carries store:false and the effort for chatgpt', () => {
    expect(turnRequest({ kind: 'chatgpt', responses: true, effort: 'high', search: false })).toEqual({
      providerOptions: { openai: { store: false, reasoningEffort: 'high' } },
    })
  })

  it('sends the effort alone for openai chat completions', () => {
    expect(turnRequest({ kind: 'openai', responses: false, effort: 'high', search: false })).toEqual({
      providerOptions: { openai: { reasoningEffort: 'high' } },
    })
  })

  it('maps anthropic effort to a thinking budget under the output cap', () => {
    expect(turnRequest({ kind: 'anthropic', responses: false, effort: 'high', search: true })).toEqual({
      providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 12000 } } },
      maxOutputTokens: 20000,
    })
  })

  it('sends no thinking for anthropic off', () => {
    expect(turnRequest({ kind: 'anthropic', responses: false, effort: 'off', search: false })).toEqual({})
  })

  it('passes a reasoning effort for openrouter', () => {
    expect(turnRequest({ kind: 'openrouter', responses: false, effort: 'medium', search: false })).toEqual({
      providerOptions: { openrouter: { reasoning: { effort: 'medium' } } },
    })
  })

  it('sends a compatible Responses endpoint nothing it did not ask for', () => {
    // store:false makes the SDK add an include field, which an endpoint such
    // as vLLM behind LiteLLM rejects; it goes only beside the search or reasoning.
    const compatible = { kind: 'openai_compatible', responses: true }

    expect(turnRequest({ ...compatible, effort: null, search: false })).toEqual({})
    expect(turnRequest({ ...compatible, effort: null, search: true })).toEqual({
      providerOptions: { openai: { store: false } },
    })
    expect(turnRequest({ ...compatible, effort: 'low', search: false })).toEqual({
      providerOptions: { openai: { store: false, reasoningEffort: 'low' } },
    })
  })

  it('keys a compatible chat completions effort by the adapter name', () => {
    const compatible = { kind: 'openai_compatible', responses: false, search: false }

    expect(turnRequest({ ...compatible, effort: 'medium' })).toEqual({
      providerOptions: { 'openai-compatible': { reasoningEffort: 'medium' } },
    })
    expect(turnRequest({ ...compatible, effort: null })).toEqual({})
  })
})


describe('provider configuration changes', () => {
  it('updates the assistant model after the configured default changes', async () => {
    seed()
    const { useAssistantProviders } = await import('./useAssistantProviders')
    const { nextTick } = await import('vue')
    const providers = useAssistantProviders()
    const direct = { id: 'model-refresh', kind: 'openai_compatible' as const, protocol: 'responses' as const, label: 'Model refresh', model: 'old-model', baseUrl: 'https://model.example/v1', apiKey: 'test-key' }
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [{ id: 'new-model' }] }), { status: 200 }))
    await providers.create(direct)
    const chat = useAssistantChat()
    chat.selectProvider(direct.id)
    chat.confirmSwitch()
    chat.selectModel('old-model')
    chat.confirmSwitch()
    expect(chat.model.value).toBe('old-model')
    await providers.update(direct.id, { ...direct, model: 'new-model' })
    await nextTick()
    expect(chat.model.value).toBe('new-model')
    expect(chat.modelChoices.value.map(model => model.id)).toContain('new-model')
    expect(stored.get('aruna.assistant.model')).toBe('new-model')
    await providers.remove(direct.id)
  })
})

describe('realm assistant outage', () => {
  it('keeps the realm assistant chosen while it cannot be reached', async () => {
    seed()
    const { useAssistantProviders } = await import('./useAssistantProviders')
    const providers = useAssistantProviders()
    const own = { provider_id: '01JCNCTR0123456789ABCDEFGH', kind: 'openai', label: 'Own', models: [{ id: 'gpt-5' }], status: 'ready', created_at: '' }
    let centralStatus = 503
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/system/assistant/providers')) return new Response(JSON.stringify({ providers: [own] }), { status: 200 })
      if (url.endsWith('/system/assistant/central') && centralStatus === 200) {
        return new Response(JSON.stringify({ kind: 'openai_compatible', label: 'Realm assistant', models: [{ id: 'm' }], used_today: 0, resets_at: '2026-11-03T00:00:00Z' }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: url.endsWith('/central') ? centralStatus : 404 })
    })
    const chat = useAssistantChat()
    for (const choice of ['central', '']) {
      chat.providerId.value = choice
      await providers.load()
      expect(providers.ready.value.map((entry) => entry.provider_id)).toEqual([own.provider_id])
      expect(chat.provider.value).toBeNull()
    }
    chat.providerId.value = 'central'
    centralStatus = 200
    await providers.refreshCentral()
    expect(chat.provider.value?.provider_id).toBe('central')
    chat.providerId.value = ''
  })
})
