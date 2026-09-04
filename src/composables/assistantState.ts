import { ref } from 'vue'

// Lightweight shell state: loading the portal chrome must not pull in chat
// history, provider storage and the assistant tool runtime.
export const assistantOpen = ref(false)
export const assistantAvailable = ref(false)
// True while the assistant page shows the active chat, so no update there is unread.
export const assistantPageOpen = ref(false)
// Background updates waiting in chats the user has not opened since.
export const assistantUnread = ref(0)
