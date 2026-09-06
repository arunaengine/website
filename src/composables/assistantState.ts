import { ref } from 'vue'

// Lightweight shell state: loading the portal chrome must not pull in chat
// history, provider storage and the assistant tool runtime.
export const assistantOpen = ref(false)
export const assistantAvailable = ref(false)
// True while the assistant page shows the active chat, so no update there is unread.
export const assistantPageOpen = ref(false)
// Background updates waiting in chats the user has not opened since.
export const assistantUnread = ref(0)
// Why the assistant cannot answer right now, shown by the top bar; empty when it can.
export const assistantWarning = ref('')
// The provider being removed, announced before the list changes so the chat
// can drop a selection that named it.
export const assistantRemovedProvider = ref<{ id: string; label: string } | null>(null)
