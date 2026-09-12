<script setup lang="ts">
// Sidebar foot button that reopens the assistant panel. Hidden until a provider
// is ready and while the assistant page already shows the chat.
import { computed } from 'vue'
import { MessageSquare } from '@lucide/vue'
import { navRowClass } from '@/components/layout/nav'
import { assistantAvailable, assistantOpen, assistantPageOpen, assistantUnread } from '@/composables/assistantState'

defineProps<{ collapsed: boolean }>()

const label = computed(() =>
  assistantUnread.value
    ? `Assistant, ${assistantUnread.value} background ${assistantUnread.value === 1 ? 'update' : 'updates'}`
    : 'Assistant',
)

// Lazy so the chat module stays out of the shell chunk.
function toggle() {
  void import('@/composables/useAssistantChat').then(({ useAssistantChat }) => {
    const chat = useAssistantChat()
    if (assistantOpen.value) chat.closePanel()
    else chat.openPanel()
  })
}
</script>

<template>
  <button
    v-if="assistantAvailable && !assistantPageOpen"
    type="button"
    :title="collapsed ? 'Assistant' : undefined"
    :aria-label="label"
    :aria-pressed="assistantOpen"
    :class="[
      navRowClass(collapsed),
      assistantOpen
        ? 'bg-primary/[0.14] text-foreground hover:bg-primary/[0.18]'
        : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
    ]"
    @click="toggle"
  >
    <span class="relative shrink-0">
      <MessageSquare class="h-4 w-4" />
      <span
        v-if="assistantUnread"
        data-unread
        class="absolute -right-1 -top-1 size-2 rounded-full bg-primary ring-2 ring-card"
      />
    </span>
    <span v-if="!collapsed">Assistant</span>
  </button>
</template>
