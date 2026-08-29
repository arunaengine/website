<script setup lang="ts">
// The assistant on a page of its own: the same conversation, provider and
// approvals as the floating panel, with room to read.
import { computed, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ChatComposer from '@/components/assistant/ChatComposer.vue'
import ChatControls from '@/components/assistant/ChatControls.vue'
import MessageList from '@/components/assistant/MessageList.vue'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { useAruna } from '@/composables/useAruna'
import { MessageSquare, Minimize2, Plus } from '@lucide/vue'

const router = useRouter()
const { currentUser } = useAruna()
const { busy, messages, pending, available, hidePanel, openPanel, newChat, ensureProviders } = useAssistantChat()

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
  <div class="flex min-h-full flex-col">
    <PageHeader title="Assistant" description="Ask about your data, or let the assistant work on the dataset you have open.">
      <template #actions>
        <Button variant="outline" size="sm" @click="newChat"><Plus class="h-3.5 w-3.5" /> New chat</Button>
        <Button variant="outline" size="sm" @click="continueInPanel"><Minimize2 class="h-3.5 w-3.5" /> Continue in the panel</Button>
      </template>
    </PageHeader>

    <div v-if="!available" class="container py-8">
      <EmptyState
        title="No AI provider is ready yet."
        description="Add a provider under Settings, test it, and the assistant appears here and in the top bar."
      >
        <template #icon><MessageSquare class="h-6 w-6" /></template>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'settings', query: { tab: 'assistant' } }">Open the assistant settings</RouterLink>
        </Button>
      </EmptyState>
    </div>

    <div v-else class="container flex min-h-0 flex-1 flex-col py-6">
      <div class="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col">
        <div class="surface px-4 py-3">
          <ChatControls size="full" />
        </div>
        <MessageList
          size="full"
          :messages="messages"
          :busy="busy"
          :delete-call-id="deleteCallId"
          class="pb-40"
          @decide="(approved) => pending?.decide(approved)"
        />
      </div>
    </div>

    <div v-if="available" class="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
      <div class="container py-3">
        <div class="mx-auto w-full max-w-3xl">
          <ChatComposer size="full" />
        </div>
      </div>
    </div>
  </div>
</template>
