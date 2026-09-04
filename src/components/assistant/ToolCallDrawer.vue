<script setup lang="ts">
// The tool calls of one assistant message that produced no card, folded into a
// single row that stays closed until the reader opens it. Writes keep a line of
// their own so an approval and what followed it stay in view.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import FoldRow from '@/components/assistant/FoldRow.vue'
import ToolCallCard from '@/components/assistant/ToolCallCard.vue'
import { callSummary, isWriteAction } from '@/lib/assistant/callSummary'
import type { ToolCallView } from '@/lib/assistant/types'
import { Check, Wrench, X } from '@lucide/vue'

const props = withDefaults(defineProps<{
  calls: ToolCallView[]
  deleteCallId?: string
}>(), { deleteCallId: undefined })
const emit = defineEmits<{ (e: 'decide', approved: boolean): void }>()

// The writes and anything still waiting for an answer, shown above the fold.
const actions = computed(() =>
  props.calls.filter((call) => call.state === 'approval' || isWriteAction(call.name)))
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

function summary(call: ToolCallView): string {
  return callSummary(call.name, call.input)
}
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
      <div
        v-for="call in actions"
        :key="call.id"
        class="rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[11px]"
      >
        <div class="flex items-center gap-2">
          <Wrench class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 break-words text-foreground">{{ summary(call) }}</span>
          <Badge v-if="call.state === 'running'" size="sm" variant="secondary">running</Badge>
          <Badge v-else-if="call.state === 'error'" size="sm" variant="destructive">failed</Badge>
        </div>
        <div v-if="call.state === 'approval'" class="mt-1.5 flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">
            {{ deleteCallId === call.id ? 'Remove this entity from the draft?' : 'Run this tool?' }}
          </span>
          <Button size="sm" @click="emit('decide', true)">
            <Check class="size-3.5 shrink-0" aria-hidden="true" /> Approve
          </Button>
          <Button variant="ghost" size="sm" @click="emit('decide', false)">
            <X class="size-3.5 shrink-0" aria-hidden="true" /> Abort
          </Button>
        </div>
        <p v-else-if="call.state === 'denied'" class="mt-1 text-muted-foreground">Aborted, nothing ran.</p>
        <p v-else-if="call.error" class="mt-1 break-words text-destructive">{{ call.error }}</p>
      </div>
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
