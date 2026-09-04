// Keeping the chats on the node. The portal is the only reader of the payload:
// it stores its whole chat state as text, and merges what the node holds with
// what this browser holds, newest write per chat winning.
import type { AssistantChatRecord, AssistantChatState } from './chatHistory'
import { MAX_ASSISTANT_CHATS } from './chatHistory'

/**
 * One list of chats out of two. A chat both sides know is taken from the side
 * that wrote it last, so a browser that has been offline cannot undo newer
 * work, and neither side loses a chat the other never saw.
 */
export function mergeChats(
  local: AssistantChatState,
  remote: AssistantChatState,
): AssistantChatState {
  const byId = new Map<string, AssistantChatRecord>()
  for (const chat of remote.chats) byId.set(chat.id, chat)
  for (const chat of local.chats) {
    const held = byId.get(chat.id)
    if (!held || chat.updatedAt >= held.updatedAt) byId.set(chat.id, chat)
  }
  const chats = [...byId.values()]
    .sort((first, second) => second.updatedAt - first.updatedAt)
    .slice(0, MAX_ASSISTANT_CHATS)
  // A fresh browser opens on an empty chat; once the node's chats arrive, the
  // one written to last is the one to show, not the empty placeholder.
  const active = chats.find((chat) => chat.id === local.activeChatId)
  const placeholder = !active || (!active.messages.length && !active.history.length)
  const activeChatId = placeholder
    ? chats.find((chat) => chat.messages.length)?.id ?? active?.id ?? chats[0]?.id ?? local.activeChatId
    : local.activeChatId
  return { activeChatId, chats }
}

/** True when the two states differ in what a save would store. */
export function chatsDiffer(first: AssistantChatState, second: AssistantChatState): boolean {
  if (first.chats.length !== second.chats.length) return true
  const held = new Map(second.chats.map((chat) => [chat.id, chat.updatedAt]))
  return first.chats.some((chat) => held.get(chat.id) !== chat.updatedAt)
}
