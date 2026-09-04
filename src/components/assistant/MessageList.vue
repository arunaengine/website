<script setup lang="ts">
// The conversation: what was asked, what the model wrote, the tool calls it
// made along the way, and the cards a render tool asked to show.
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import ArtifactCard from '@/components/assistant/cards/ArtifactCard.vue'
import JobCard from '@/components/assistant/cards/JobCard.vue'
import ChartCard from '@/components/assistant/cards/ChartCard.vue'
import CodeCard from '@/components/assistant/cards/CodeCard.vue'
import CrateCard from '@/components/assistant/cards/CrateCard.vue'
import DiffCard from '@/components/assistant/cards/DiffCard.vue'
import ObjectCard from '@/components/assistant/cards/ObjectCard.vue'
import StatsCard from '@/components/assistant/cards/StatsCard.vue'
import TableCard from '@/components/assistant/cards/TableCard.vue'
import TimelineCard from '@/components/assistant/cards/TimelineCard.vue'
import TreeCard from '@/components/assistant/cards/TreeCard.vue'
import AssistantMarkdown from '@/components/assistant/AssistantMarkdown.vue'
import FoldRow from '@/components/assistant/FoldRow.vue'
import ToolCallDrawer from '@/components/assistant/ToolCallDrawer.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type { ChatMessage } from '@/lib/assistant/types'
import { relativeTime } from '@/lib/utils'
import { ArrowDown, Radar, Sparkles } from '@lucide/vue'

/** How far above the end still counts as reading the newest turn. */
const END_GAP = 160

const props = withDefaults(defineProps<{
  messages: ChatMessage[]
  busy: boolean
  deleteCallId?: string
  /** `full` is the page: larger type, wider bubbles, settled tool calls folded. */
  size?: 'compact' | 'full'
}>(), { deleteCallId: undefined, size: 'compact' })
const emit = defineEmits<{ (e: 'decide', approved: boolean): void }>()

const scroller = ref<HTMLElement | null>(null)
const atEnd = ref(true)
// Background updates the reader unfolded to read in full.
const unfolded = ref(new Set<string>())

function toggleUpdate(id: string) {
  const next = new Set(unfolded.value)
  if (!next.delete(id)) next.add(id)
  unfolded.value = next
}

function shownCards(message: ChatMessage) {
  return message.calls.filter((call) => call.view)
}

function foldedCalls(message: ChatMessage) {
  return message.calls.filter((call) => !call.view)
}

function ago(at: number): string {
  return Number.isFinite(at) ? relativeTime(new Date(at).toISOString()) : ''
}

function exact(at: number): string {
  return Number.isFinite(at) ? new Date(at).toLocaleString() : ''
}

function distanceToEnd(): number {
  const element = scroller.value
  return element ? element.scrollHeight - element.scrollTop - element.clientHeight : 0
}

// Follow the newest turn, but leave a reader who scrolled up where they are.
// Nearness is read before the DOM grows, so a tall card arriving at once
// cannot push the reader out of range before it is measured.
function follow(force: boolean) {
  const near = distanceToEnd() < END_GAP
  void nextTick(() => {
    const element = scroller.value
    if ((force || near) && element && typeof element.scrollTo === 'function') {
      element.scrollTo({ top: element.scrollHeight })
    }
    measure()
  })
}

// An unmeasurable list counts as read to the end, so the button stays away.
function measure() {
  if (scroller.value) atEnd.value = !(distanceToEnd() > END_GAP)
}

function scrollToEnd() {
  follow(true)
}

// What the newest turn's tool calls look like: a row appearing, a call
// settling, or a card arriving all change this key.
function callsKey(): string {
  const calls = props.messages.at(-1)?.calls ?? []
  return calls.map((call) => `${call.id}:${call.state}:${call.view ? 'card' : ''}`).join('|')
}

function awaitingApproval(): boolean {
  return (props.messages.at(-1)?.calls ?? []).some((call) => call.state === 'approval')
}

// A new turn or another chat jumps to the end; streamed text only follows on.
watch(() => `${props.messages.length}:${props.messages.at(-1)?.id ?? ''}`, () => follow(true))
watch(() => props.messages.at(-1)?.text ?? '', () => follow(false))
// An approval blocks the turn, so it is brought into view even from further up.
watch(callsKey, () => follow(awaitingApproval()))
// Held apart from the ref, which is already cleared when the hook runs.
let listening: HTMLElement | null = null
onMounted(() => {
  scrollToEnd()
  listening = scroller.value
  listening?.addEventListener('scroll', measure)
})
onUnmounted(() => listening?.removeEventListener('scroll', measure))
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <div ref="scroller" class="chat-scroller scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      <div
        class="mx-auto w-full"
        :class="props.size === 'full' ? 'chat-column space-y-6 py-6' : 'space-y-4 px-3 py-3'"
      >
        <p
          v-if="!messages.length && props.size !== 'full'"
          class="text-xs text-muted-foreground"
        >
          Ask about your data, or let the assistant fill in the dataset you have open.
        </p>

        <div v-for="message in messages" :key="message.id" class="min-w-0">
          <!-- A watcher's update is machinery, folded like a tool call. -->
          <div v-if="message.background" class="space-y-1.5">
            <FoldRow :open="unfolded.has(message.id)" :label="message.text" @toggle="toggleUpdate(message.id)">
              <template #icon>
                <Radar class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </template>
              <time v-if="message.at" class="text-[10px] text-muted-foreground/70" :title="exact(message.at)">
                {{ ago(message.at) }}
              </time>
            </FoldRow>
            <p
              v-if="unfolded.has(message.id)"
              class="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/10 px-2.5 py-1.5 text-[11px] text-muted-foreground"
            >{{ message.text }}</p>
          </div>
          <div v-else-if="message.role === 'user'" class="flex flex-col items-end gap-0.5">
            <div
              class="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary/10 px-3.5 py-2 leading-relaxed text-foreground"
              :class="props.size === 'full' ? 'text-sm' : 'text-xs'"
            >{{ message.text }}</div>
            <time v-if="message.at" class="px-1 text-[10px] text-muted-foreground/70" :title="exact(message.at)">
              {{ ago(message.at) }}
            </time>
          </div>

          <div v-else class="min-w-0" :class="props.size === 'full' ? 'space-y-2.5' : 'space-y-1.5'">
            <p class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Sparkles class="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              Assistant
              <time v-if="message.at" class="font-normal text-muted-foreground/70" :title="exact(message.at)">
                {{ ago(message.at) }}
              </time>
            </p>
            <template v-for="call in shownCards(message)" :key="call.id">
              <TableCard v-if="call.view?.kind === 'table'" v-bind="call.view" />
              <ChartCard v-else-if="call.view?.kind === 'chart'" v-bind="call.view" />
              <StatsCard v-else-if="call.view?.kind === 'stats'" v-bind="call.view" />
              <CrateCard v-else-if="call.view?.kind === 'crate'" :title="call.view.title" :crate="call.view.crate" :document-id="call.view.documentId" />
              <ArtifactCard v-else-if="call.view?.kind === 'artifact'" :title="call.view.title" :caption="call.view.caption" :artifact="call.view.artifact" />
              <JobCard v-else-if="call.view?.kind === 'job'" :view="call.view" />
              <ObjectCard v-else-if="call.view?.kind === 'object'" :view="call.view" />
              <TreeCard v-else-if="call.view?.kind === 'tree'" :view="call.view" />
              <TimelineCard v-else-if="call.view?.kind === 'timeline'" :view="call.view" />
              <CodeCard v-else-if="call.view?.kind === 'code'" :view="call.view" />
              <DiffCard v-else-if="call.view?.kind === 'diff'" :view="call.view" />
            </template>
            <ToolCallDrawer
              v-if="foldedCalls(message).length"
              :calls="foldedCalls(message)"
              :delete-call-id="deleteCallId"
              @decide="(approved) => emit('decide', approved)"
            />
            <AssistantMarkdown
              v-if="message.text"
              :text="message.text"
              :size="props.size"
              :has-card="shownCards(message).length > 0"
            />
            <Notice v-if="message.error" tone="error">{{ message.error }}</Notice>
          </div>
        </div>

        <Spinner v-if="busy" label="Working…" show-label />
      </div>
    </div>

    <button
      v-if="!atEnd"
      type="button"
      class="absolute inset-x-0 bottom-3 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-md hover:bg-muted"
      @click="scrollToEnd"
    >
      <ArrowDown class="size-3.5 shrink-0" aria-hidden="true" />
      Scroll to the end
    </button>
  </div>
</template>
