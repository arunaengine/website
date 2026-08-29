<script setup lang="ts">
// The conversation: what was asked, what the model wrote, and the tool calls
// it made along the way.
import ToolCallCard from '@/components/assistant/ToolCallCard.vue'
import Notice from '@/components/ui/Notice.vue'
import type { ChatMessage } from '@/lib/assistant/types'

defineProps<{ messages: ChatMessage[]; busy: boolean; deleteCallId?: string }>()
const emit = defineEmits<{ (e: 'decide', approved: boolean): void }>()
</script>

<template>
  <div class="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-3 py-3">
    <p v-if="!messages.length" class="px-1 text-xs text-muted-foreground">
      Ask about your data, or let the assistant fill in the dataset you have open.
    </p>

    <div v-for="message in messages" :key="message.id" class="space-y-1.5">
      <div
        v-if="message.role === 'user'"
        class="ml-6 rounded-lg bg-primary/10 px-3 py-2 text-xs leading-relaxed text-foreground"
      >{{ message.text }}</div>

      <template v-else>
        <ToolCallCard
          v-for="call in message.calls"
          :key="call.id"
          :call="call"
          :awaiting-delete="deleteCallId === call.id"
          @decide="(approved) => emit('decide', approved)"
        />
        <p
          v-if="message.text"
          class="whitespace-pre-wrap px-1 text-xs leading-relaxed text-foreground"
        >{{ message.text }}</p>
        <Notice v-if="message.error" tone="error">{{ message.error }}</Notice>
      </template>
    </div>

    <p v-if="busy" class="px-1 text-[11px] text-muted-foreground">Working…</p>
  </div>
</template>
