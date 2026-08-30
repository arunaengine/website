import { describe, expect, it, vi } from 'vitest'
import type { UserInfoResponse } from '@/lib/api'

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
const { useAssistantChat } = await import('./useAssistantChat')

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
