<script setup lang="ts">
// Floating assistant panel, bottom-right, mounted at the layout like the
// transfers panel. The tool loop runs here in the browser; the node only
// serves the tools and proxies the provider.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import ChatComposer from '@/components/assistant/ChatComposer.vue'
import ChatControls from '@/components/assistant/ChatControls.vue'
import MessageList from '@/components/assistant/MessageList.vue'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { Maximize2, MessageSquare, Plus, X } from '@lucide/vue'

const router = useRouter()
const { open, busy, messages, pending, closePanel, newChat } = useAssistantChat()

const deleteCallId = computed(() =>
  (pending.value?.always ? pending.value.request.id : undefined))

// The same conversation continues on the page; the panel steps aside.
function openFullView() {
  closePanel()
  void router.push({ name: 'assistant' })
}
</script>

<template>
  <div
    v-if="open"
    class="fixed bottom-4 right-4 z-50 flex h-[32rem] max-h-[calc(100vh-2rem)] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg md:bottom-6 md:right-6"
    role="dialog"
    aria-label="Aruna assistant"
  >
    <header class="space-y-2 border-b border-border bg-muted/40 px-3 py-2">
      <div class="flex items-center gap-2">
        <MessageSquare class="h-4 w-4 shrink-0 text-primary" />
        <span class="text-xs font-semibold text-foreground">Assistant</span>
        <span class="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Start a new chat" @click="newChat">
            <Plus class="h-3.5 w-3.5" /> New chat
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Open the full view" title="Open the full view" @click="openFullView">
            <Maximize2 class="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close the assistant" @click="closePanel">
            <X class="size-3.5" />
          </Button>
        </span>
      </div>
      <ChatControls />
    </header>

    <MessageList
      :messages="messages"
      :busy="busy"
      :delete-call-id="deleteCallId"
      @decide="(approved) => pending?.decide(approved)"
    />

    <div class="border-t border-border px-3 py-2">
      <ChatComposer />
    </div>
  </div>
</template>
