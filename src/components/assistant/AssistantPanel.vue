<script setup lang="ts">
// Floating assistant panel, bottom-right, mounted at the layout like the
// transfers panel. The tool loop runs here in the browser; the node only
// serves the tools and proxies the provider.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import AssistantFileDialog from '@/components/assistant/AssistantFileDialog.vue'
import ChatComposer from '@/components/assistant/ChatComposer.vue'
import MessageList from '@/components/assistant/MessageList.vue'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { Maximize2, MessageSquare, Plus, X } from '@lucide/vue'

const router = useRouter()
const {
  open,
  busy,
  messages,
  pending,
  hidePanel,
  closePanel,
  newChat,
  selectLatestChat,
} = useAssistantChat()

const deleteCallId = computed(() =>
  (pending.value?.always ? pending.value.request.id : undefined))

// The same conversation continues on the page; the panel steps aside.
function openFullView() {
  selectLatestChat()
  hidePanel()
  void router.push({ name: 'assistant' })
}
</script>

<template>
  <!-- Above the modal layer, and clickable again while a modal has switched
       body pointer events off; the marker keeps a click here from dismissing
       the dialog underneath. -->
  <div
    v-if="open"
    data-assistant-layer
    class="pointer-events-auto fixed inset-x-2 bottom-20 z-[var(--z-assistant)] flex h-[min(32rem,calc(100dvh-9.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg md:inset-x-auto md:bottom-6 md:right-6 md:h-[min(32rem,calc(100dvh-6rem))] md:w-96"
    role="dialog"
    aria-label="Aruna assistant"
  >
    <header class="shrink-0 border-b border-border bg-muted/40 px-3 py-2">
      <div class="flex items-center gap-2">
        <MessageSquare class="h-4 w-4 shrink-0 text-primary" />
        <span class="text-xs font-semibold text-foreground">Assistant</span>
        <span class="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Start a new chat" title="Start a new chat" @click="newChat">
            <Plus class="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Open the full view" title="Open the full view" @click="openFullView">
            <Maximize2 class="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close the assistant" @click="closePanel">
            <X class="size-3.5" />
          </Button>
        </span>
      </div>
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

    <AssistantFileDialog raised />
  </div>
</template>
