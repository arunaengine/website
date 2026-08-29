<script setup lang="ts">
// Floating assistant panel, bottom-right, mounted at the layout like the
// transfers panel. The tool loop runs here in the browser; the node only
// serves the tools and proxies the provider.
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import MessageList from '@/components/assistant/MessageList.vue'
import { useAssistantChat } from '@/composables/useAssistantChat'
import { useAssistantEditor } from '@/composables/useAssistantEditor'
import { useAruna } from '@/composables/useAruna'
import { MessageSquare, Plus, X } from '@lucide/vue'

const route = useRoute()
const { profiles } = useAruna()
const { bridge } = useAssistantEditor()
const {
  open,
  busy,
  messages,
  error,
  toolsNote,
  pending,
  provider,
  providers,
  model,
  approveWrites,
  selectProvider,
  selectModel,
  setApproveWrites,
  closePanel,
  newChat,
  send,
} = useAssistantChat()

const input = ref('')

const providerOptions = computed(() =>
  providers.value.map((entry) => ({ value: entry.provider_id, label: entry.label })))
const modelOptions = computed(() =>
  (provider.value?.models ?? []).map((entry) => ({ value: entry.id, label: entry.display_name || entry.id })))
const deleteCallId = computed(() =>
  (pending.value?.always ? pending.value.request.id : undefined))

function submit() {
  const text = input.value
  input.value = ''
  void send(text, {
    route: route.fullPath,
    draft: bridge.value?.summary() ?? null,
    profiles: profiles.value.map((profile) => ({ id: profile.id, name: profile.name })),
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  submit()
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
          <Button variant="ghost" size="icon-sm" aria-label="Close the assistant" @click="closePanel">
            <X class="size-3.5" />
          </Button>
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Select
          :model-value="provider?.provider_id ?? ''"
          :options="providerOptions"
          class="h-7 flex-1 text-[11px]"
          aria-label="Provider"
          @update:model-value="selectProvider"
        />
        <Select
          v-if="modelOptions.length"
          :model-value="model"
          :options="modelOptions"
          class="h-7 flex-1 text-[11px]"
          aria-label="Model"
          @update:model-value="selectModel"
        />
      </div>
      <label class="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Switch :checked="approveWrites" @update:checked="setApproveWrites" />
        Approve writes
      </label>
    </header>

    <MessageList
      :messages="messages"
      :busy="busy"
      :delete-call-id="deleteCallId"
      @decide="(approved) => pending?.decide(approved)"
    />

    <div class="space-y-2 border-t border-border px-3 py-2">
      <Notice v-if="toolsNote" tone="info">{{ toolsNote }}</Notice>
      <Notice v-if="error" tone="error">{{ error }}</Notice>
      <div class="flex items-end gap-2">
        <Textarea
          v-model="input"
          rows="2"
          class="min-h-0 flex-1 text-xs"
          placeholder="Ask the assistant"
          aria-label="Message"
          @keydown="onKeydown"
        />
        <Button size="sm" :disabled="busy || !input.trim() || !provider" @click="submit">Send</Button>
      </div>
    </div>
  </div>
</template>
