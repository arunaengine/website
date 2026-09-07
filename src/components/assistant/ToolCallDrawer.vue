<script setup lang="ts">
// The tool calls of one assistant message that produced no card, folded into a
// single row that stays closed until the reader opens it. Writes keep a line of
// their own so an approval and what followed it stay in view.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import FoldRow from '@/components/assistant/FoldRow.vue'
import ToolCallCard from '@/components/assistant/ToolCallCard.vue'
import { callSummary, isWriteAction } from '@/lib/assistant/callSummary'
import type { ToolCallView } from '@/lib/assistant/types'
import { Wrench } from '@lucide/vue'

const props = withDefaults(defineProps<{
  calls: ToolCallView[]
  deleteCallId?: string
}>(), { deleteCallId: undefined })
const emit = defineEmits<{ (e: 'decide', approved: boolean): void }>()

// The writes and anything still waiting for an answer, shown above the fold.
const actions = computed(() =>
  props.calls.filter((call) => call.state === 'approval' || isWriteAction(call.name)))
// Applied changes fold into one row; a change still running, failed or waiting
// for an answer stays in view.
const changes = computed(() =>
  actions.value.filter((call) => call.state === 'done' || call.state === 'denied'))
const pinned = computed(() => actions.value.filter((call) => !changes.value.includes(call)))
// The rest fold into one row, which only earns its place while it hides a call.
const folded = computed(() => props.calls.filter((call) => !actions.value.includes(call)))

const counts = computed(() => {
  const tally = { running: 0, error: 0 }
  for (const call of folded.value) {
    if (call.state === 'running') tally.running += 1
    else if (call.state === 'error') tally.error += 1
  }
  return tally
})
const open = ref(false)
const changesOpen = ref(false)

const changesLabel = computed(() => {
  const first = callSummary(changes.value[0].name, changes.value[0].input)
  if (changes.value.length === 1) return first
  return `${changes.value.length} changes, starting with ${first.charAt(0).toLowerCase()}${first.slice(1)}`
})
</script>

<template>
  <div class="space-y-1.5">
    <FoldRow
      v-if="folded.length"
      :open="open"
      :label="`${folded.length} tool call${folded.length === 1 ? '' : 's'}`"
      @toggle="open = !open"
    >
      <template #icon>
        <Wrench class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </template>
      <Badge v-if="counts.running" size="sm" variant="secondary">{{ counts.running }} running</Badge>
      <Badge v-if="counts.error" size="sm" variant="destructive">{{ counts.error }} failed</Badge>
    </FoldRow>

    <template v-if="!open">
      <FoldRow
        v-if="changes.length"
        :open="changesOpen"
        :label="changesLabel"
        @toggle="changesOpen = !changesOpen"
      >
        <template #icon>
          <Wrench class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </template>
      </FoldRow>
      <div v-if="changes.length && changesOpen" class="space-y-1.5">
        <ToolCallCard
          v-for="call in changes"
          :key="call.id"
          :call="call"
          :awaiting-delete="deleteCallId === call.id"
          collapsed
          @decide="(approved) => emit('decide', approved)"
        />
      </div>
      <ToolCallCard
        v-for="call in pinned"
        :key="call.id"
        :call="call"
        :awaiting-delete="deleteCallId === call.id"
        collapsed
        @decide="(approved) => emit('decide', approved)"
      />
    </template>

    <div v-if="open" class="space-y-1.5">
      <ToolCallCard
        v-for="call in calls"
        :key="call.id"
        :call="call"
        :awaiting-delete="deleteCallId === call.id"
        collapsed
        @decide="(approved) => emit('decide', approved)"
      />
    </div>
  </div>
</template>
