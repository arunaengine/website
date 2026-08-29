<script setup lang="ts">
// The conversation: what was asked, what the model wrote, the tool calls it
// made along the way, and the cards a render tool asked to show.
import ChartCard from '@/components/assistant/cards/ChartCard.vue'
import CrateCard from '@/components/assistant/cards/CrateCard.vue'
import StatsCard from '@/components/assistant/cards/StatsCard.vue'
import TableCard from '@/components/assistant/cards/TableCard.vue'
import ToolCallCard from '@/components/assistant/ToolCallCard.vue'
import Notice from '@/components/ui/Notice.vue'
import type { ChatMessage } from '@/lib/assistant/types'

withDefaults(defineProps<{
  messages: ChatMessage[]
  busy: boolean
  deleteCallId?: string
  /** `full` is the page: larger type, wider bubbles, settled tool calls folded. */
  size?: 'compact' | 'full'
}>(), { deleteCallId: undefined, size: 'compact' })
const emit = defineEmits<{ (e: 'decide', approved: boolean): void }>()
</script>

<template>
  <div
    class="scrollbar-thin flex-1 overflow-y-auto"
    :class="size === 'full' ? 'space-y-5 px-1 py-4' : 'space-y-3 px-3 py-3'"
  >
    <p v-if="!messages.length" class="px-1 text-muted-foreground" :class="size === 'full' ? 'text-sm' : 'text-xs'">
      Ask about your data, or let the assistant fill in the dataset you have open.
    </p>

    <div v-for="message in messages" :key="message.id" :class="size === 'full' ? 'space-y-2.5' : 'space-y-1.5'">
      <div
        v-if="message.role === 'user'"
        class="rounded-lg bg-primary/10 px-3 py-2 leading-relaxed text-foreground"
        :class="size === 'full' ? 'ml-12 text-sm' : 'ml-6 text-xs'"
      >{{ message.text }}</div>

      <template v-else>
        <template v-for="call in message.calls" :key="call.id">
          <TableCard v-if="call.view?.kind === 'table'" v-bind="call.view" />
          <ChartCard v-else-if="call.view?.kind === 'chart'" v-bind="call.view" />
          <StatsCard v-else-if="call.view?.kind === 'stats'" v-bind="call.view" />
          <CrateCard v-else-if="call.view?.kind === 'crate'" :title="call.view.title" :crate="call.view.crate" :document-id="call.view.documentId" />
          <ToolCallCard
            v-else
            :call="call"
            :awaiting-delete="deleteCallId === call.id"
            :collapsed="size === 'full'"
            @decide="(approved) => emit('decide', approved)"
          />
        </template>
        <p
          v-if="message.text"
          class="whitespace-pre-wrap px-1 leading-relaxed text-foreground"
          :class="size === 'full' ? 'text-sm' : 'text-xs'"
        >{{ message.text }}</p>
        <Notice v-if="message.error" tone="error">{{ message.error }}</Notice>
      </template>
    </div>

    <p v-if="busy" class="px-1 text-[11px] text-muted-foreground">Working…</p>
  </div>
</template>
