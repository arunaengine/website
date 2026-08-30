<script setup lang="ts">
// The tool calls of one assistant message that produced no card, folded into a
// single row. It opens itself while a call waits for an answer and, in the
// panel, while one is still running.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import ToolCallCard from '@/components/assistant/ToolCallCard.vue'
import type { ToolCallView } from '@/lib/assistant/types'
import { ChevronRight, Wrench } from '@lucide/vue'

const props = withDefaults(defineProps<{
  calls: ToolCallView[]
  deleteCallId?: string
  size?: 'compact' | 'full'
}>(), { deleteCallId: undefined, size: 'compact' })
const emit = defineEmits<{ (e: 'decide', approved: boolean): void }>()

const counts = computed(() => {
  const tally = { approval: 0, running: 0, error: 0 }
  for (const call of props.calls) {
    if (call.state === 'approval') tally.approval += 1
    else if (call.state === 'running') tally.running += 1
    else if (call.state === 'error') tally.error += 1
  }
  return tally
})
const unsettled = computed(() =>
  counts.value.approval > 0 || (props.size !== 'full' && counts.value.running > 0))

const open = ref(false)
// Opens on its own and stays open; only the row closes it again.
watch(unsettled, (value) => {
  if (value) open.value = true
}, { immediate: true })
</script>

<template>
  <div class="space-y-1.5">
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-left text-[11px]"
      :aria-expanded="open"
      @click="open = !open"
    >
      <ChevronRight :class="['size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90']" />
      <Wrench class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="font-medium text-foreground">
        {{ calls.length }} tool call{{ calls.length === 1 ? '' : 's' }}
      </span>
      <span class="ml-auto flex shrink-0 items-center gap-1">
        <Badge v-if="counts.approval" size="sm" variant="warn">{{ counts.approval }} waiting</Badge>
        <Badge v-if="counts.running" size="sm" variant="secondary">{{ counts.running }} running</Badge>
        <Badge v-if="counts.error" size="sm" variant="destructive">{{ counts.error }} failed</Badge>
      </span>
    </button>

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
