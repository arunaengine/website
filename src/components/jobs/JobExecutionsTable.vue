<script setup lang="ts">
// Every execution the responder knows about, canonical one first in meaning:
// a duplicate that also succeeded stays listed rather than being hidden.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import {
  executionCount,
  familyExecutions,
  type JobExecutionResponse,
  type JobFamilyResponse,
  type JobState,
} from '@/lib/jobs'
import { truncateMiddle } from '@/lib/utils'

const props = defineProps<{ family: JobFamilyResponse }>()

const executions = computed(() => familyExecutions(props.family))
const count = computed(() => executionCount(props.family))

function resultOf(execution: JobExecutionResponse): string {
  if (execution.canonical) return 'canonical'
  switch (execution.state) {
    case 'succeeded':
      return 'duplicate'
    case 'failed':
      return 'failed here'
    case 'cancelled':
      return 'cancelled'
    case 'indeterminate':
      return 'no verdict recorded'
    default:
      return 'still running'
  }
}

function timeOf(ms: number | null): string {
  return ms === null ? 'not recorded' : new Date(ms).toLocaleTimeString()
}
function isoOf(ms: number | null): string | undefined {
  return ms === null ? undefined : new Date(ms).toISOString()
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="executions.length" class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[40rem] text-left text-[11px]">
        <thead class="bg-muted/50 text-muted-foreground">
          <tr>
            <th scope="col" class="px-3 py-2 font-medium">Node</th>
            <th scope="col" class="px-3 py-2 font-medium">State</th>
            <th scope="col" class="px-3 py-2 font-medium">Started</th>
            <th scope="col" class="px-3 py-2 font-medium">Last update</th>
            <th scope="col" class="px-3 py-2 font-medium">Result</th>
            <th scope="col" class="px-3 py-2 font-medium">Execution id</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="execution in executions" :key="execution.execution_id">
            <td class="px-3 py-2">
              <NodeLabel :node-id="execution.executor_node_id" size="sm" />
            </td>
            <td class="px-3 py-2"><JobStateBadge :state="execution.state as JobState" /></td>
            <td class="whitespace-nowrap px-3 py-2 text-muted-foreground" :title="isoOf(execution.started_at_ms)">
              {{ timeOf(execution.started_at_ms) }}
            </td>
            <td class="whitespace-nowrap px-3 py-2 text-muted-foreground" :title="isoOf(execution.observed_at_ms)">
              {{ timeOf(execution.observed_at_ms) }}
            </td>
            <td class="px-3 py-2 text-foreground">{{ resultOf(execution) }}</td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-1">
                <span class="font-mono text-muted-foreground" :title="execution.execution_id">
                  {{ truncateMiddle(execution.execution_id) }}
                </span>
                <CopyButton :value="execution.execution_id" label="Copy the execution id" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- An older node serves the count only. -->
    <div v-else class="space-y-1 text-xs">
      <p class="text-foreground">{{ count }} execution{{ count === 1 ? '' : 's' }} recorded.</p>
      <p v-if="family.canonical_execution_id" class="break-all font-mono text-[11px] text-muted-foreground">
        canonical {{ family.canonical_execution_id }}
      </p>
      <p v-else class="text-muted-foreground">No canonical execution selected yet.</p>
    </div>

    <p v-if="family.duplicate_successes" class="text-[11px] text-muted-foreground">
      {{ family.duplicate_successes }} duplicate success{{ family.duplicate_successes === 1 ? '' : 'es' }}.
    </p>

    <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Responder-local caveats">
      <Badge
        v-if="family.partial"
        variant="outline"
        size="sm"
        class="text-muted-foreground"
        title="This responder could not reduce every family record."
      >
        Partial responder view
      </Badge>
      <Badge
        v-if="family.locally_exhausted"
        variant="outline"
        size="sm"
        class="text-muted-foreground"
        title="Known executions are terminal here and no local retry is armed. This does not establish a permanent failure."
      >
        Locally exhausted
      </Badge>
      <span v-if="family.responder_node_id" class="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        answered by node <NodeLabel :node-id="family.responder_node_id" size="sm" />
      </span>
    </div>
  </div>
</template>
