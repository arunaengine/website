<script setup lang="ts">
// What the plan decided, as a picture: every input, whether it stayed where it
// was or was copied, and the node that ran the work.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { placementVerdict, type JobPlacementResponse } from '@/lib/jobs'
import { formatBytes, formatDuration } from '@/lib/utils'

const props = defineProps<{ placement?: JobPlacementResponse | null }>()

const verdict = computed(() => placementVerdict(props.placement))
const inputs = computed(() => props.placement?.inputs ?? [])
const moved = computed(() => inputs.value.filter((input) => input.source_node_id !== null))

const flow = computed(() => {
  if (verdict.value.verdict === 'unplaced') return 'unplaced'
  if (!inputs.value.length) return verdict.value.verdict === 'compute-to-data' ? 'all-local' : 'all-moved'
  if (!moved.value.length) return 'all-local'
  return moved.value.length === inputs.value.length ? 'all-moved' : 'mixed'
})

const label = computed(() => {
  switch (flow.value) {
    case 'all-local':
      return 'Compute went to the data'
    case 'all-moved':
      return 'Data moved to the compute'
    case 'mixed':
      return `Mixed: ${moved.value.length} of ${inputs.value.length} moved`
    default:
      return verdict.value.label
  }
})

const variant = computed(() => {
  switch (flow.value) {
    case 'all-local':
      return 'success'
    case 'all-moved':
      return 'sky'
    case 'mixed':
      return 'warn'
    default:
      return 'outline'
  }
})

// Measured inputs win over the plan totals; without them the estimate is all
// this node has.
const movedBytes = computed(() =>
  inputs.value.length
    ? moved.value.reduce((total, input) => total + input.bytes, 0)
    : (props.placement?.estimated_transfer_bytes ?? 0),
)
const movedMs = computed(() =>
  inputs.value.length
    ? moved.value.reduce((total, input) => total + input.transfer_ms, 0)
    : (props.placement?.estimated_transfer_ms ?? 0),
)

function estimatedTime(ms: number): string {
  return ms < 1000 ? `${ms} ms` : formatDuration(ms)
}
function inputWord(count: number): string {
  return `${count} input${count === 1 ? '' : 's'}`
}
function verb(count: number): string {
  return count === 1 ? 'was' : 'were'
}

const summary = computed(() => {
  const total = inputs.value.length
  const count = moved.value.length
  if (flow.value === 'unplaced') return 'No local placement record for this family; the planning node keeps it.'
  if (!total) {
    return movedBytes.value === 0
      ? 'Every input already had a copy on the node that ran the work, so the plan moved no bytes.'
      : `The plan moved ${formatBytes(movedBytes.value)}, about ${estimatedTime(movedMs.value)}, to the node that ran the work.`
  }
  const size = `${formatBytes(movedBytes.value)}, about ${estimatedTime(movedMs.value)}`
  if (!count) return `All ${inputWord(total)} ${verb(total)} already on the node that ran the work. Nothing moved.`
  if (count === total) return `All ${inputWord(total)} (${size}) ${verb(total)} copied to the node that ran the work.`
  return `${count} of ${inputWord(total)} (${size}) ${verb(count)} copied to the node that ran the work.`
})

function storedAt(ms: number): string {
  return new Date(ms).toLocaleString()
}
</script>

<template>
  <div class="space-y-2">
    <div class="overflow-hidden rounded-md border border-border">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted/50 px-3 py-2">
        <Badge :variant="variant">{{ label }}</Badge>
        <p class="text-xs text-foreground">{{ summary }}</p>
      </div>

      <!-- The figure needs the per-input record; without it the plan totals
           still say what happened. -->
      <div
        v-if="placement && inputs.length"
        class="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)] items-center gap-x-3 gap-y-2 p-3"
      >
        <div class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Inputs</div>
        <div class="text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Transfer</div>
        <div class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Runs on</div>
        <template v-for="(input, i) in inputs" :key="`${input.destination_key}:${i}`">
          <div class="surface-inline min-w-0 px-2.5 py-1.5">
            <div class="flex items-baseline justify-between gap-2">
              <span class="truncate font-mono text-[11px] text-foreground">{{ input.destination_key }}</span>
              <span class="shrink-0 text-[11px] text-muted-foreground">{{ formatBytes(input.bytes) }}</span>
            </div>
            <div class="flex items-center gap-1 text-[11px] text-muted-foreground">
              on
              <NodeLabel v-if="input.source_node_id" :node-id="input.source_node_id" size="sm" />
              <NodeLabel v-else-if="placement.target_node_id" :node-id="placement.target_node_id" size="sm" />
              <span v-else>the node that ran the work</span>
            </div>
          </div>
          <div class="relative flex h-6 items-center justify-center">
            <span
              aria-hidden="true"
              class="absolute inset-x-1 top-1/2 border-t"
              :class="input.source_node_id ? 'border-dashed border-aruna-sky' : 'border-emerald-400'"
            />
            <span
              class="relative bg-card px-1.5 text-[11px] font-medium"
              :class="input.source_node_id ? 'text-sky-600 dark:text-aruna-aqua' : 'text-emerald-600 dark:text-emerald-400'"
            >
              <template v-if="input.source_node_id">
                moved {{ formatBytes(input.bytes) }} · ~{{ estimatedTime(input.transfer_ms) }}
              </template>
              <template v-else>stays</template>
            </span>
          </div>
          <div
            v-if="i === 0"
            class="flex flex-col justify-center gap-0.5 rounded-md border-2 border-aruna-navy/70 px-3 py-2 dark:border-aruna-aqua/60"
            :style="{ gridColumn: '3', gridRow: `2 / span ${inputs.length}` }"
          >
            <NodeLabel v-if="placement.target_node_id" :node-id="placement.target_node_id" />
            <span v-else class="text-xs text-muted-foreground">Node not recorded</span>
            <span v-if="placement.executor_kind" class="text-[11px] text-muted-foreground">
              {{ placement.executor_kind }}
            </span>
          </div>
        </template>
      </div>
      <div v-else-if="placement" class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs">
        <span class="text-muted-foreground">
          Executor <span class="text-foreground">{{ placement.executor_kind || 'none selected' }}</span>
        </span>
        <span class="text-muted-foreground">
          Estimated transfer
          <span class="text-foreground">
            {{ formatBytes(placement.estimated_transfer_bytes) }} · {{ estimatedTime(placement.estimated_transfer_ms) }}
          </span>
        </span>
        <span v-if="placement.target_node_id" class="inline-flex items-center gap-1 text-muted-foreground">
          Runs on <NodeLabel :node-id="placement.target_node_id" size="sm" />
        </span>
      </div>
      <p v-else class="p-3 text-xs text-muted-foreground">{{ verdict.explanation }}</p>

      <div
        v-if="placement"
        class="flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground"
      >
        <span v-if="placement.scheduler_node_id" class="inline-flex items-center gap-1">
          Planned by <NodeLabel :node-id="placement.scheduler_node_id" size="sm" />
        </span>
        <span title="Other targets the round would have accepted. One round keeps at most 8 ranked alternatives.">
          Ranked <span class="text-foreground">{{ placement.alternatives }}</span> alternatives
        </span>
        <span title="Targets the round refused, with the reason recorded. One round keeps at most 32 rejection explanations.">
          Rejected <span class="text-foreground">{{ placement.rejected }}</span> candidates
        </span>
        <span
          v-if="placement.omitted"
          title="Rejections dropped by that audit bound. A non-zero count means the recorded rejections are incomplete, not that the remaining targets agreed."
        >
          Omitted <span class="text-foreground">{{ placement.omitted }}</span> rejections
        </span>
        <span :title="new Date(placement.stored_at_ms).toISOString()">Plan stored {{ storedAt(placement.stored_at_ms) }}</span>
      </div>
    </div>

    <div v-if="inputs.length" class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span class="inline-flex items-center gap-1.5">
        <span aria-hidden="true" class="inline-block w-4 border-t border-emerald-400" /> stays where it is
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span aria-hidden="true" class="inline-block w-4 border-t border-dashed border-aruna-sky" />
        copied to the running node before it starts
      </span>
    </div>
    <p class="text-[11px] text-muted-foreground">
      Estimated at planning time, not measured.
      <RouterLink
        :to="{ name: 'docs', params: { topic: 'data-to-compute' } }"
        class="font-medium text-primary hover:underline"
      >Learn more</RouterLink>
    </p>
  </div>
</template>
