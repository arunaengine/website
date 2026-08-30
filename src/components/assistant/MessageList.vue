<script setup lang="ts">
// The conversation: what was asked, what the model wrote, the tool calls it
// made along the way, and the cards a render tool asked to show.
import { nextTick, onMounted, ref, watch } from 'vue'
import ChartCard from '@/components/assistant/cards/ChartCard.vue'
import CrateCard from '@/components/assistant/cards/CrateCard.vue'
import StatsCard from '@/components/assistant/cards/StatsCard.vue'
import TableCard from '@/components/assistant/cards/TableCard.vue'
import AssistantMarkdown from '@/components/assistant/AssistantMarkdown.vue'
import ToolCallDrawer from '@/components/assistant/ToolCallDrawer.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type { ChatMessage } from '@/lib/assistant/types'
import { Sparkles } from '@lucide/vue'

const props = withDefaults(defineProps<{
  messages: ChatMessage[]
  busy: boolean
  deleteCallId?: string
  /** `full` is the page: larger type, wider bubbles, settled tool calls folded. */
  size?: 'compact' | 'full'
}>(), { deleteCallId: undefined, size: 'compact' })
const emit = defineEmits<{ (e: 'decide', approved: boolean): void }>()

const scroller = ref<HTMLElement | null>(null)

function shownCards(message: ChatMessage) {
  return message.calls.filter((call) => call.view)
}

function foldedCalls(message: ChatMessage) {
  return message.calls.filter((call) => !call.view)
}

// Follow the newest turn, but leave a reader who scrolled up where they are.
function follow(force: boolean) {
  const element = scroller.value
  if (!element || typeof element.scrollTo !== 'function') return
  const near = element.scrollHeight - element.scrollTop - element.clientHeight < 160
  if (force || near) element.scrollTo({ top: element.scrollHeight })
}

// A new turn or another chat jumps to the end; streamed text only follows on.
watch(() => `${props.messages.length}:${props.messages.at(-1)?.id ?? ''}`, () => void nextTick(() => follow(true)))
watch(() => props.messages.at(-1)?.text ?? '', () => void nextTick(() => follow(false)))
onMounted(() => follow(true))
</script>

<template>
  <div ref="scroller" class="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
    <div
      class="mx-auto w-full"
      :class="props.size === 'full' ? 'max-w-[52rem] space-y-6 px-4 py-6' : 'space-y-4 px-3 py-3'"
    >
      <p
        v-if="!messages.length && props.size !== 'full'"
        class="text-xs text-muted-foreground"
      >
        Ask about your data, or let the assistant fill in the dataset you have open.
      </p>

      <div v-for="message in messages" :key="message.id" class="min-w-0">
        <div v-if="message.role === 'user'" class="flex justify-end">
          <div
            class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary/10 px-3.5 py-2 leading-relaxed text-foreground"
            :class="props.size === 'full' ? 'text-sm' : 'text-xs'"
          >{{ message.text }}</div>
        </div>

        <div v-else class="min-w-0" :class="props.size === 'full' ? 'space-y-2.5' : 'space-y-1.5'">
          <p class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Sparkles class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            Assistant
          </p>
          <template v-for="call in shownCards(message)" :key="call.id">
            <TableCard v-if="call.view?.kind === 'table'" v-bind="call.view" />
            <ChartCard v-else-if="call.view?.kind === 'chart'" v-bind="call.view" />
            <StatsCard v-else-if="call.view?.kind === 'stats'" v-bind="call.view" />
            <CrateCard v-else-if="call.view?.kind === 'crate'" :title="call.view.title" :crate="call.view.crate" :document-id="call.view.documentId" />
          </template>
          <ToolCallDrawer
            v-if="foldedCalls(message).length"
            :calls="foldedCalls(message)"
            :delete-call-id="deleteCallId"
            :size="props.size"
            @decide="(approved) => emit('decide', approved)"
          />
          <AssistantMarkdown
            v-if="message.text"
            :text="message.text"
            :size="props.size"
          />
          <Notice v-if="message.error" tone="error">{{ message.error }}</Notice>
        </div>
      </div>

      <Spinner v-if="busy" label="Working…" show-label />
    </div>
  </div>
</template>
