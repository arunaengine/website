<script setup lang="ts">
// What the plan decided, as one sentence and one bar. The per-input and
// per-candidate rows stay behind buttons: a run may carry hundreds of both.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Pagination from '@/components/ui/Pagination.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { placementVerdict, type JobPlacementResponse } from '@/lib/jobs'
import { formatBytes, formatDuration } from '@/lib/utils'

const PAGE_SIZE = 8

const props = defineProps<{ placement?: JobPlacementResponse | null }>()

const { displayName } = useRealmNodes()

const verdict = computed(() => placementVerdict(props.placement))
const inputs = computed(() => props.placement?.inputs ?? [])
const candidates = computed(() => props.placement?.candidates ?? [])
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

// The per-input record wins over the plan totals; without it the estimate is
// all this node has.
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
const stayedBytes = computed(() =>
  inputs.value.reduce((total, input) => (input.source_node_id ? total : total + input.bytes), 0),
)
const totalBytes = computed(() => stayedBytes.value + movedBytes.value)
const stayedPercent = computed(() => (totalBytes.value ? (stayedBytes.value / totalBytes.value) * 100 : 0))

function estimatedTime(ms: number): string {
  return ms < 1000 ? `${ms} ms` : formatDuration(ms)
}
function inputWord(count: number): string {
  return `${count} input${count === 1 ? '' : 's'}`
}
function verb(count: number): string {
  return count === 1 ? 'was' : 'were'
}

const targetName = computed(() =>
  props.placement?.target_node_id ? displayName(props.placement.target_node_id) : 'the node that ran the work',
)

const summary = computed(() => {
  const total = inputs.value.length
  const count = moved.value.length
  if (flow.value === 'unplaced') return 'No local placement record for this family; the planning node keeps it.'
  if (!total) {
    return movedBytes.value === 0
      ? `Every input already had a copy on ${targetName.value}, so the plan moved no bytes.`
      : `The plan moved ${formatBytes(movedBytes.value)}, about ${estimatedTime(movedMs.value)}, to ${targetName.value}.`
  }
  if (!count) return `All ${inputWord(total)} ${verb(total)} already on ${targetName.value}. Nothing moved.`
  const size = `${formatBytes(movedBytes.value)}, about ${estimatedTime(movedMs.value)}`
  const copied = `${count} of ${inputWord(total)} (${size}) ${verb(count)} copied to ${targetName.value}`
  if (count === total) return `All ${inputWord(total)} (${size}) ${verb(total)} copied to ${targetName.value}.`
  return `${copied}; ${formatBytes(stayedBytes.value)} stayed.`
})

function storedAt(ms: number): string {
  return new Date(ms).toLocaleString()
}

const movementsOpen = ref(false)
const candidatesOpen = ref(false)
const movementsPage = ref(1)
const candidatesPage = ref(1)

function pageOf<T>(rows: T[], page: number): T[] {
  return rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
}
function rangeOf(rows: unknown[], page: number): string {
  const first = (page - 1) * PAGE_SIZE + 1
  return `${first}–${Math.min(page * PAGE_SIZE, rows.length)} of ${rows.length}`
}
function pageCount(rows: unknown[]): number {
  return Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
}

const movementRows = computed(() => pageOf(inputs.value, movementsPage.value))
const candidateRows = computed(() => pageOf(candidates.value, candidatesPage.value))

function candidateVerdict(verdictName: string, rank?: number): string {
  if (verdictName === 'selected') return 'selected'
  if (verdictName === 'ranked') return rank ? `ranked ${rank}` : 'ranked'
  return 'rejected'
}
</script>

<template>
  <div class="space-y-2">
    <!-- bg-card keeps the bar and the tables readable wherever this sits. -->
    <div class="overflow-hidden rounded-md border border-border bg-card">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted/50 px-3 py-2">
        <Badge :variant="variant">{{ label }}</Badge>
        <p class="text-xs text-foreground">{{ summary }}</p>
      </div>

      <div v-if="placement" class="space-y-2 p-3">
        <template v-if="totalBytes && inputs.length">
          <div
            class="flex h-1.5 overflow-hidden rounded-full bg-muted"
            role="img"
            :aria-label="`${formatBytes(stayedBytes)} stayed, ${formatBytes(movedBytes)} moved`"
          >
            <div class="bg-emerald-500" :style="{ width: `${stayedPercent}%` }" />
            <div class="bg-aruna-sky" :style="{ width: `${100 - stayedPercent}%` }" />
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span class="inline-flex items-center gap-1.5">
              <span aria-hidden="true" class="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              {{ formatBytes(stayedBytes) }} stayed
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span aria-hidden="true" class="inline-block h-2 w-2 rounded-full bg-aruna-sky" />
              {{ formatBytes(movedBytes) }} moved · ~{{ estimatedTime(movedMs) }}
            </span>
          </div>
        </template>

        <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span v-if="placement.target_node_id" class="inline-flex items-center gap-1">
            Runs on <NodeLabel :node-id="placement.target_node_id" size="sm" />
          </span>
          <span v-if="placement.executor_kind">Executor <span class="text-foreground">{{ placement.executor_kind }}</span></span>
          <span v-if="placement.scheduler_node_id" class="inline-flex items-center gap-1">
            Planned by <NodeLabel :node-id="placement.scheduler_node_id" size="sm" />
          </span>
          <span title="Other targets the round would have accepted, and the ones it refused with a reason recorded.">
            Ranked <span class="text-foreground">{{ placement.alternatives }}</span>, rejected
            <span class="text-foreground">{{ placement.rejected }}</span> candidates
          </span>
          <span
            v-if="placement.omitted"
            title="Rejections dropped by the audit bound. A non-zero count means the recorded rejections are incomplete, not that the remaining targets agreed."
          >
            Omitted <span class="text-foreground">{{ placement.omitted }}</span> rejections
          </span>
          <span :title="new Date(placement.stored_at_ms).toISOString()">Plan stored {{ storedAt(placement.stored_at_ms) }}</span>
        </div>

        <div v-if="inputs.length || candidates.length" class="flex flex-wrap items-center gap-3">
          <Button
            v-if="inputs.length"
            variant="link"
            size="sm"
            class="h-auto px-0"
            @click="movementsOpen = !movementsOpen"
          >
            {{ movementsOpen ? 'Hide' : 'Show' }} movements ({{ inputs.length }})
          </Button>
          <Button
            v-if="candidates.length"
            variant="link"
            size="sm"
            class="h-auto px-0"
            @click="candidatesOpen = !candidatesOpen"
          >
            {{ candidatesOpen ? 'Hide' : 'Show' }} candidates ({{ candidates.length }})
          </Button>
        </div>

        <div v-if="movementsOpen && inputs.length" class="space-y-1.5">
          <div class="overflow-x-auto rounded-md border border-border">
            <table class="w-full min-w-[34rem] text-left text-[11px]">
              <thead class="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" class="px-3 py-2 font-medium">Input</th>
                  <th scope="col" class="px-3 py-2 text-right font-medium">Size</th>
                  <th scope="col" class="px-3 py-2 font-medium">Stored on</th>
                  <th scope="col" class="px-3 py-2 font-medium">Transfer</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="(input, i) in movementRows" :key="`${input.destination_key}:${i}`">
                  <td class="break-all px-3 py-2 font-mono text-foreground">{{ input.destination_key }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">{{ formatBytes(input.bytes) }}</td>
                  <td class="px-3 py-2">
                    <NodeLabel v-if="input.source_node_id" :node-id="input.source_node_id" size="sm" />
                    <NodeLabel v-else-if="placement.target_node_id" :node-id="placement.target_node_id" size="sm" />
                    <span v-else class="text-muted-foreground">the node that ran the work</span>
                  </td>
                  <td
                    class="whitespace-nowrap px-3 py-2"
                    :class="input.source_node_id ? 'text-sky-600 dark:text-aruna-aqua' : 'text-emerald-600 dark:text-emerald-400'"
                  >
                    <template v-if="input.source_node_id">moved · ~{{ estimatedTime(input.transfer_ms) }}</template>
                    <template v-else>stays</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-[11px] text-muted-foreground">{{ rangeOf(inputs, movementsPage) }}</span>
            <Pagination
              :page="movementsPage"
              :page-count="pageCount(inputs)"
              :has-next="movementsPage < pageCount(inputs)"
              @update:page="(page: number) => (movementsPage = page)"
            />
          </div>
        </div>

        <div v-if="candidatesOpen && candidates.length" class="space-y-1.5">
          <div class="overflow-x-auto rounded-md border border-border">
            <table class="w-full min-w-[34rem] text-left text-[11px]">
              <thead class="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" class="px-3 py-2 font-medium">Candidate</th>
                  <th scope="col" class="px-3 py-2 font-medium">Verdict</th>
                  <th scope="col" class="px-3 py-2 font-medium">Why</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="(candidate, i) in candidateRows" :key="`${candidate.node_id}:${i}`">
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap items-center gap-1">
                      <NodeLabel :node-id="candidate.node_id" size="sm" />
                      <span v-if="candidate.executor_kind" class="text-muted-foreground">· {{ candidate.executor_kind }}</span>
                    </div>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2 text-foreground">
                    {{ candidateVerdict(candidate.verdict, candidate.rank) }}
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">{{ candidate.reason || 'no reason recorded' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-[11px] text-muted-foreground">{{ rangeOf(candidates, candidatesPage) }}</span>
            <Pagination
              :page="candidatesPage"
              :page-count="pageCount(candidates)"
              :has-next="candidatesPage < pageCount(candidates)"
              @update:page="(page: number) => (candidatesPage = page)"
            />
          </div>
        </div>
      </div>
      <p v-else class="p-3 text-xs text-muted-foreground">{{ verdict.explanation }}</p>
    </div>

    <p class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      Estimated at planning time, not measured.
      <DocsLink topic="data-to-compute" section="How placement is decided" />
    </p>
  </div>
</template>
