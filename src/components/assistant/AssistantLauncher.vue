<script setup lang="ts">
// Sidebar foot button that reopens the assistant panel. Hidden until a provider
// is ready and while the assistant page already shows the chat.
import { computed } from 'vue'
import { Sparkles } from '@lucide/vue'
import { navRowClass } from '@/components/layout/nav'
import { assistantAvailable, assistantOpen, assistantPageOpen, assistantUnread } from '@/composables/assistantState'

// `floating` renders the button fixed above the mobile bar where no sidebar exists.
withDefaults(defineProps<{ collapsed?: boolean; floating?: boolean }>(), { collapsed: false, floating: false })

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
    :title="collapsed || floating ? 'Assistant' : undefined"
    :aria-label="label"
    :aria-pressed="assistantOpen"
    :data-assistant-layer="floating ? '' : undefined"
    :class="floating
      ? 'pointer-events-auto fixed bottom-20 left-4 z-[var(--z-assistant)] md:hidden'
      : [navRowClass(collapsed), 'text-muted-foreground hover:text-foreground']"
    @click="toggle"
  >
    <span
      class="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full shadow-md ring-2 ring-background transition-colors"
      :class="assistantOpen ? 'bg-primary/80 text-primary-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'"
    >
      <Sparkles class="size-4" />
      <span
        v-if="assistantUnread"
        data-unread
        class="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-background"
      />
    </span>
    <span v-if="!collapsed && !floating">Assistant</span>
  </button>
</template>
