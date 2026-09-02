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

const { createAssistantChatStore, newAssistantChat } = await import('@/lib/assistant/chatHistory')
const { apiBaseUrl, authToken, userInfo } = await import('./aruna/state')
const { loadArtifact, useAssistantChat, turnRequest } = await import('./useAssistantChat')

const scope = { apiBaseUrl: 'https://node.test', realmId: 'r-1', userId: 'u-1' }

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
  })

  it('holds a small image in the tab as a blob url', async () => {
    const loaded = await loadArtifact({
      bucket: 'work',
      key: 'results/run-1/chart.png',
      contentType: 'image/png',
      size: 1024,
    })

    expect(s3.getObjectBlob).toHaveBeenCalledWith('work', 'results/run-1/chart.png', null, undefined)
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
    expect(s3.getObjectBlob).toHaveBeenCalledWith('work', 'results/chart.png', 'node-2', 'v-3')
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
  it('carries store:false and the effort on the openai responses branch', () => {
    expect(turnRequest('chatgpt', true, 'high')).toEqual({
      providerOptions: { openai: { store: false, reasoningEffort: 'high' } },
    })
  })

  it('sends the effort alone for openai chat completions', () => {
    expect(turnRequest('openai', false, 'high')).toEqual({
      providerOptions: { openai: { reasoningEffort: 'high' } },
    })
  })

  it('maps anthropic effort to a thinking budget under the output cap', () => {
    expect(turnRequest('anthropic', false, 'high')).toEqual({
      providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 12000 } } },
      maxOutputTokens: 20000,
    })
  })

  it('sends no thinking for anthropic off', () => {
    expect(turnRequest('anthropic', false, 'off')).toEqual({})
  })

  it('passes a reasoning effort for openrouter', () => {
    expect(turnRequest('openrouter', false, 'medium')).toEqual({
      providerOptions: { openrouter: { reasoning: { effort: 'medium' } } },
    })
  })
})
