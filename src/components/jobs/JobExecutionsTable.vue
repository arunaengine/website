<script setup lang="ts">
// Every execution the responder knows about: a duplicate that also ran stays
// listed rather than being hidden, so a catch-up is visible.
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import {
  executionCount,
  familyExecutions,
  type JobExecutionResponse,
  type JobFamilyResponse,
  type JobState,
} from '@/lib/jobs'
import { formatDuration, truncateMiddle } from '@/lib/utils'

const props = defineProps<{ family: JobFamilyResponse }>()

const executions = computed(() => familyExecutions(props.family))
const count = computed(() => executionCount(props.family))
const decided = computed(() => executions.value.some((execution) => execution.canonical))
// A later execution supplied the result while an earlier one was still open.
const caughtUp = computed(
  () => decided.value && executions.value.some((execution) => !execution.canonical && execution.state !== 'succeeded'),
)

function silentFor(execution: JobExecutionResponse): string {
  if (execution.observed_at_ms === null) return 'silent'
  return `silent for ${formatDuration(Date.now() - execution.observed_at_ms)}`
}

function roleOf(execution: JobExecutionResponse): string {
  if (execution.canonical) return 'the result'
  switch (execution.state) {
    case 'succeeded':
      return 'duplicate'
    case 'failed':
      return 'failed, no retry here'
    case 'cancelled':
      return 'stopped'
    case 'indeterminate':
      return `${decided.value ? 'replaced, ' : ''}${silentFor(execution)}`
    default:
      return decided.value ? 'replaced, still in progress' : 'in progress'
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
    <p class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      A run may execute more than once; one execution supplies the result.
      <DocsLink topic="compute-run" section="Follow the run" />
    </p>

    <Notice v-if="caughtUp" tone="info" class="flex flex-wrap items-center gap-2 text-xs">
      An earlier execution went quiet and a later one supplied the result. Both stay listed.
      <DocsLink topic="compute-run" section="Follow the run" />
    </Notice>

    <div v-if="executions.length" class="overflow-x-auto rounded-md border border-border">
      <table class="w-full min-w-[40rem] text-left text-[11px]">
        <thead class="bg-muted/50 text-muted-foreground">
          <tr>
            <th scope="col" class="px-3 py-2 font-medium">Node</th>
            <th scope="col" class="px-3 py-2 font-medium">State</th>
            <th scope="col" class="px-3 py-2 font-medium">Started</th>
            <th scope="col" class="px-3 py-2 font-medium">Last update</th>
            <th scope="col" class="px-3 py-2 font-medium">Role</th>
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
            <td class="px-3 py-2 text-foreground">{{ roleOf(execution) }}</td>
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
      <p v-if="family.canonical_execution_id" class="break-all text-[11px] text-muted-foreground">
        Result execution <span class="font-mono">{{ family.canonical_execution_id }}</span>
      </p>
      <p v-else class="text-muted-foreground">No execution has supplied the result yet.</p>
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
