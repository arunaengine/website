import { ref } from 'vue'

// Lightweight shell state: loading the portal chrome must not pull in chat
// history, provider storage and the assistant tool runtime.
export const assistantOpen = ref(false)
export const assistantAvailable = ref(false)
