<script setup lang="ts">
// The assistant on a page of its own: one full-height column with the chat
// history beside it, sharing conversation, provider and approvals with the
// floating panel.
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import AssistantHistory from '@/components/assistant/AssistantHistory.vue'
import ChatComposer from '@/components/assistant/ChatComposer.vue'
import MessageList from '@/components/assistant/MessageList.vue'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { useAruna } from '@/composables/useAruna'
import { History, MessageSquare, Minimize2, Plus } from '@lucide/vue'

const router = useRouter()
const { currentUser } = useAruna()
const {
  busy,
  messages,
  pending,
  available,
  chats,
  activeChatId,
  historyReady,
  hidePanel,
  openPanel,
  newChat,
  ensureProviders,
} = useAssistantChat()

const historyOpen = ref(true)
const chatName = computed<string>(() => {
  for (const chat of chats.value) if (chat.id === activeChatId.value) return chat.title
  return 'New chat'
})
const deleteCallId = computed(() =>
  (pending.value?.always ? pending.value.request.id : undefined))

onMounted(() => {
  hidePanel()
  if (currentUser.value) ensureProviders()
})

// Back to wherever the chat was opened from, with the panel showing it.
function continueInPanel() {
  openPanel()
  if (window.history.length > 1) router.back()
  else void router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <PageHeader title="Assistant" class="shrink-0">
      <template #breadcrumbs>
        <span aria-hidden="true">·</span>
        <span class="max-w-48 truncate">{{ chatName }}</span>
      </template>
      <template #actions>
        <Button variant="outline" size="sm" :disabled="!available || !historyReady" @click="newChat">
          <Plus class="h-3.5 w-3.5" /> New chat
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :aria-pressed="historyOpen"
          aria-label="Toggle the chat history"
          title="Toggle the chat history"
          @click="historyOpen = !historyOpen"
        >
          <History class="h-3.5 w-3.5" /> Chats
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Continue in the panel"
          title="Continue in the panel"
          @click="continueInPanel"
        >
          <Minimize2 class="size-3.5" />
        </Button>
      </template>
    </PageHeader>

    <div class="container flex min-h-0 flex-1 flex-col gap-4 py-4 md:flex-row">
      <AssistantHistory
        v-if="historyOpen && historyReady"
        :read-only="!available"
        class="max-h-40 shrink-0 md:max-h-none md:w-64"
      />

      <div class="mx-auto flex w-full min-w-0 max-w-3xl min-h-0 flex-1 flex-col">
        <EmptyState
          v-if="!available"
          title="No AI provider is ready yet."
          description="Add a provider under Settings, test it, and the assistant appears here and in the top bar."
        >
          <template #icon><MessageSquare class="h-6 w-6" /></template>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'settings', query: { tab: 'assistant' } }">Open the assistant settings</RouterLink>
          </Button>
        </EmptyState>

        <template v-else-if="historyReady">
          <MessageList
            size="full"
            :messages="messages"
            :busy="busy"
            :delete-call-id="deleteCallId"
            @decide="(approved) => pending?.decide(approved)"
          />
          <div class="shrink-0 pt-3">
            <ChatComposer size="full" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
