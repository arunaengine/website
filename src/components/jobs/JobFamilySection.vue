<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import type { JobFamilyResponse } from '@/lib/jobs'
import { formatBytes, formatDuration, truncateMiddle } from '@/lib/utils'

const props = defineProps<{ family: JobFamilyResponse }>()

const plannerOutcome = computed(() => {
  if (!props.family.placement?.executor_kind) return 'No executor selected'
  return props.family.placement.estimated_transfer_bytes === 0 ? 'Compute-to-data' : 'Data-to-compute'
})

function formatEstimatedTime(ms: number): string {
  return ms < 1000 ? `${ms} ms` : formatDuration(ms)
}

function sealedAt(ms: number): string {
  return new Date(ms).toLocaleString()
}
</script>

<template>
  <section class="space-y-3">
    <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Distributed execution</h3>

    <div class="surface space-y-3 p-3">
      <div class="flex flex-wrap items-center gap-2">
        <JobStateBadge :state="family.logical_state" />
        <Badge v-if="family.cancel_requested" variant="outline" class="text-[10px] text-muted-foreground">
          cancel requested
        </Badge>
      </div>
      <dl class="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <dt class="text-muted-foreground">Canonical execution</dt>
        <dd v-if="family.canonical_execution_id" class="break-all font-mono text-[11px] text-foreground">
          {{ family.canonical_execution_id }}
        </dd>
        <dd v-else class="text-muted-foreground">Not selected yet</dd>
        <dt class="text-muted-foreground">Executions</dt>
        <dd class="text-foreground">{{ family.executions }}</dd>
        <dt class="text-muted-foreground">Duplicate successes</dt>
        <dd class="text-foreground">{{ family.duplicate_successes }}</dd>
        <dt class="text-muted-foreground">Known aliases</dt>
        <dd class="text-foreground">{{ family.alias_count }}</dd>
        <dt class="text-muted-foreground">Known family conflicts</dt>
        <dd class="text-foreground">{{ family.conflict_count }}</dd>
      </dl>
      <p class="text-[11px] text-muted-foreground">
        Projection revision {{ family.revision }} · digest
        <span class="font-mono" :title="family.projection_digest">{{ truncateMiddle(family.projection_digest) }}</span>
      </p>
    </div>

    <div class="space-y-2">
      <div>
        <h4 class="text-xs font-medium text-foreground">Canonical outputs</h4>
        <p class="text-[11px] text-muted-foreground">
          These are the canonical execution's outputs. They can differ from the object's current S3 head.
        </p>
      </div>
      <div v-if="family.outputs.length" class="overflow-x-auto rounded-md border border-border">
        <table class="w-full min-w-[44rem] text-left text-[11px]">
          <thead class="bg-muted/50 text-muted-foreground">
            <tr>
              <th scope="col" class="px-3 py-2 font-medium">Bucket</th>
              <th scope="col" class="px-3 py-2 font-medium">Key</th>
              <th scope="col" class="px-3 py-2 font-medium">Version ID</th>
              <th scope="col" class="px-3 py-2 font-medium">Execution ID</th>
              <th scope="col" class="px-3 py-2 text-right font-medium">Size</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="output in family.outputs" :key="`${output.execution_id}:${output.version_id}`">
              <td class="px-3 py-2 font-mono text-foreground">{{ output.bucket }}</td>
              <td class="max-w-64 break-all px-3 py-2 font-mono text-foreground">{{ output.key }}</td>
              <td class="px-3 py-2 font-mono text-muted-foreground" :title="output.version_id">
                {{ truncateMiddle(output.version_id) }}
              </td>
              <td class="px-3 py-2 font-mono text-muted-foreground" :title="output.execution_id">
                {{ truncateMiddle(output.execution_id) }}
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-right text-foreground">{{ formatBytes(output.size) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-xs text-muted-foreground">No canonical outputs have been recorded.</p>
    </div>

    <div v-if="family.placement" class="surface space-y-3 p-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 class="text-xs font-medium text-foreground">Planner estimate</h4>
          <p class="text-[11px] text-muted-foreground">Estimated at planning time. These are not measured transfer values.</p>
        </div>
        <Badge variant="secondary">{{ plannerOutcome }}</Badge>
      </div>
      <dl class="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <dt class="text-muted-foreground">Executor kind</dt>
        <dd class="text-foreground">{{ family.placement.executor_kind || 'No executor selected' }}</dd>
        <dt class="text-muted-foreground">Estimated transfer bytes</dt>
        <dd class="text-foreground">{{ formatBytes(family.placement.estimated_transfer_bytes) }}</dd>
        <dt class="text-muted-foreground">Estimated transfer time</dt>
        <dd class="text-foreground">{{ formatEstimatedTime(family.placement.estimated_transfer_ms) }}</dd>
        <dt class="text-muted-foreground">Alternative candidates</dt>
        <dd class="text-foreground">{{ family.placement.alternatives }}</dd>
        <dt class="text-muted-foreground">Rejected candidates</dt>
        <dd class="text-foreground">{{ family.placement.rejected }}</dd>
        <dt class="text-muted-foreground">Omitted candidates</dt>
        <dd class="text-foreground">{{ family.placement.omitted }}</dd>
        <dt class="text-muted-foreground">Plan sealed</dt>
        <dd class="text-foreground" :title="new Date(family.placement.sealed_at_ms).toISOString()">
          {{ sealedAt(family.placement.sealed_at_ms) }}
        </dd>
      </dl>
    </div>
    <p v-else class="text-xs text-muted-foreground">Planned on another node</p>

    <div class="space-y-1.5">
      <div class="flex flex-wrap gap-1.5" aria-label="Responder-local caveats">
        <Badge
          v-if="family.eventually_consistent"
          variant="outline"
          class="text-[10px] text-muted-foreground"
        >Eventually consistent</Badge>
        <Badge v-if="family.partial" variant="outline" class="text-[10px] text-muted-foreground">
          Partial responder view
        </Badge>
        <Badge v-if="family.locally_exhausted" variant="outline" class="text-[10px] text-muted-foreground">
          Locally exhausted
        </Badge>
      </div>
      <p v-if="family.eventually_consistent" class="text-[11px] text-muted-foreground">
        This responder's view can change as replicated records converge.
      </p>
      <p v-if="family.partial" class="text-[11px] text-muted-foreground">
        This responder could not reduce every family record.
      </p>
      <p v-if="family.locally_exhausted" class="text-[11px] text-muted-foreground">
        Known executions are terminal here and no local retry is armed. This does not establish a permanent failure.
      </p>
    </div>
  </section>
</template>
