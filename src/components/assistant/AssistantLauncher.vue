<script setup lang="ts">
// Round bottom right button that opens the assistant panel. Hidden until a
// provider is ready, while the panel or the assistant page shows the chat.
import { computed } from 'vue'
import { Sparkles } from '@lucide/vue'
import { assistantAvailable, assistantOpen, assistantPageOpen, assistantUnread } from '@/composables/assistantState'
import { uploadQueueItems } from '@/composables/uploadQueueState'

const label = computed(() =>
  assistantUnread.value
    ? `Assistant, ${assistantUnread.value} background ${assistantUnread.value === 1 ? 'update' : 'updates'}`
    : 'Assistant',
)
// The transfers panel owns the corner while uploads run: step left of it, hide on phones.
const transfers = computed(() => uploadQueueItems.value.length > 0)

// Lazy so the chat module stays out of the shell chunk.
function open() {
  void import('@/composables/useAssistantChat').then(({ useAssistantChat }) => useAssistantChat().openPanel())
}
</script>

<template>
  <button
    v-if="assistantAvailable && !assistantOpen && !assistantPageOpen"
    type="button"
    title="Assistant"
    :aria-label="label"
    data-assistant-layer
    class="pointer-events-auto fixed z-[var(--z-assistant)] inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-ring"
    :class="transfers ? 'bottom-6 right-[22.5rem] max-md:hidden' : 'bottom-20 right-4 md:bottom-6 md:right-6'"
    @click="open"
  >
    <Sparkles class="size-5" />
    <span
      v-if="assistantUnread"
      data-unread
      class="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-amber-500 ring-2 ring-background"
    />
  </button>
</template>
