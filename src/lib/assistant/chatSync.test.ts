import { describe, expect, it } from 'vitest'
import { chatsDiffer, mergeChats } from './chatSync'
import { newAssistantChat, type AssistantChatRecord, type AssistantChatState } from './chatHistory'

function chat(id: string, updatedAt: number, title = id): AssistantChatRecord {
  return { ...newAssistantChat(title), id, updatedAt }
}

function state(chats: AssistantChatRecord[], activeChatId = chats[0]?.id ?? ''): AssistantChatState {
  return { activeChatId, chats }
}

describe('mergeChats', () => {
  it('keeps the newer side of a chat both browsers know', () => {
    const local = state([chat('a', 200, 'local edit'), chat('b', 50)])
    const remote = state([chat('a', 100, 'older'), chat('c', 300)])

    const merged = mergeChats(local, remote)

    expect(merged.chats.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
    expect(merged.chats.find((entry) => entry.id === 'a')?.title).toBe('local edit')
  })

  it('loses no chat either side has', () => {
    const merged = mergeChats(state([chat('a', 10)]), state([chat('b', 20)]))

    expect(merged.chats).toHaveLength(2)
  })

  it('keeps the open chat open, and falls back when it is gone', () => {
    const local = state([chat('a', 10)], 'a')
    expect(mergeChats(local, state([chat('b', 20)])).activeChatId).toBe('a')

    const missing = { activeChatId: 'gone', chats: [] }
    expect(mergeChats(missing, state([chat('b', 20)])).activeChatId).toBe('b')
  })
})

describe('chatsDiffer', () => {
  it('sees a chat added or written since', () => {
    expect(chatsDiffer(state([chat('a', 10)]), state([chat('a', 10)]))).toBe(false)
    expect(chatsDiffer(state([chat('a', 20)]), state([chat('a', 10)]))).toBe(true)
    expect(chatsDiffer(state([chat('a', 10), chat('b', 5)]), state([chat('a', 10)]))).toBe(true)
  })
})
