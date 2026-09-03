<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import { placementVerdict, type JobFamilyResponse, type JobOutputResponse } from '@/lib/jobs'
import { formatBytes, formatDuration, truncateMiddle } from '@/lib/utils'

const props = defineProps<{ family: JobFamilyResponse }>()

const verdict = computed(() => placementVerdict(props.family.placement))
const verdictVariant = computed(() =>
  verdict.value.verdict === 'compute-to-data'
    ? 'success'
    : verdict.value.verdict === 'data-to-compute'
      ? 'sky'
      : 'outline',
)

function formatEstimatedTime(ms: number): string {
  return ms < 1000 ? `${ms} ms` : formatDuration(ms)
}

function storedAt(ms: number): string {
  return new Date(ms).toLocaleString()
}

// The exact version on its owning endpoint when that endpoint is known, and
// the bucket-relative URI otherwise. Never a version-less URL: that would
// address whatever is current instead of what this job wrote.
function outputUrl(output: JobOutputResponse): string {
  const versioned = `${output.bucket}/${encodeURIComponent(output.key)}?versionId=${encodeURIComponent(output.version_id)}`
  if (!output.endpoint_url) return `s3://${output.bucket}/${output.key}?versionId=${output.version_id}`
  return `${output.endpoint_url.replace(/\/+$/, '')}/${versioned}`
}
</script>

<template>
  <section class="space-y-3">
    <h3 class="font-display text-sm font-semibold text-aruna-navy">Distributed execution</h3>

    <div class="surface space-y-3 p-3">
      <div class="flex flex-wrap items-center gap-2">
        <JobStateBadge :state="family.logical_state" />
        <Badge v-if="family.cancel_requested" variant="outline" size="sm" class="text-muted-foreground">
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

    <div data-tutorial="job-outputs" class="space-y-2">
      <div>
        <h4 class="text-xs font-medium text-foreground">Canonical outputs</h4>
        <p class="text-[11px] text-muted-foreground">
          These are the canonical execution's outputs, named by their exact version. Reading the same
          key without that version answers whatever is current instead.
        </p>
      </div>
      <div v-if="family.outputs.length" class="overflow-x-auto rounded-md border border-border">
        <table class="w-full min-w-[52rem] text-left text-[11px]">
          <thead class="bg-muted/50 text-muted-foreground">
            <tr>
              <th scope="col" class="px-3 py-2 font-medium">Bucket</th>
              <th scope="col" class="px-3 py-2 font-medium">Key</th>
              <th scope="col" class="px-3 py-2 font-medium">Version ID</th>
              <th scope="col" class="px-3 py-2 font-medium">Execution ID</th>
              <th scope="col" class="px-3 py-2 text-right font-medium">Size</th>
              <th scope="col" class="px-3 py-2 font-medium">Digest</th>
              <th scope="col" class="px-3 py-2 font-medium">Owner endpoint</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="output in family.outputs" :key="`${output.execution_id}:${output.version_id}`">
              <td class="px-3 py-2 font-mono text-foreground">{{ output.bucket }}</td>
              <td class="max-w-64 break-all px-3 py-2 font-mono text-foreground">
                {{ output.key }}
                <span v-if="output.container_path" class="block text-muted-foreground">
                  from {{ output.container_path }}
                </span>
              </td>
              <td class="px-3 py-2 font-mono text-muted-foreground" :title="output.version_id">
                {{ truncateMiddle(output.version_id) }}
              </td>
              <td class="px-3 py-2 font-mono text-muted-foreground" :title="output.execution_id">
                {{ truncateMiddle(output.execution_id) }}
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-right text-foreground">{{ formatBytes(output.size) }}</td>
              <td class="px-3 py-2 font-mono text-muted-foreground">
                <span v-if="output.digest" :title="output.digest">{{ truncateMiddle(output.digest) }}</span>
                <span v-else>not recorded</span>
              </td>
              <td class="px-3 py-2">
                <div class="flex items-center gap-1">
                  <span v-if="output.endpoint_url" class="break-all font-mono text-muted-foreground">
                    {{ output.endpoint_url }}
                  </span>
                  <span
                    v-else
                    class="text-muted-foreground"
                    title="This responder does not know the owning node's endpoint. The version and the owning execution are still exact; retry, or ask a node that holds that advertisement."
                  >Owner endpoint unknown</span>
                  <CopyButton
                    :value="outputUrl(output)"
                    :label="output.endpoint_url ? 'Copy the versioned URL on the owning endpoint' : 'Copy the versioned s3:// URI'"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-xs text-muted-foreground">No canonical outputs have been recorded.</p>
    </div>

    <div class="surface space-y-3 p-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 class="text-xs font-medium text-foreground">Placement</h4>
          <p class="text-[11px] text-muted-foreground">
            Where this run was scheduled, and what the planner expected it to cost.
          </p>
        </div>
        <Badge :variant="verdictVariant">{{ verdict.label }}</Badge>
      </div>
      <p class="text-[11px] text-muted-foreground">
        {{ verdict.explanation }}
        <RouterLink
          :to="{ name: 'docs', params: { topic: 'data-to-compute' } }"
          class="font-medium text-primary hover:underline"
        >Learn more</RouterLink>
      </p>

      <template v-if="family.placement">
        <dl class="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt class="text-muted-foreground">Executor kind</dt>
          <dd class="text-foreground">{{ family.placement.executor_kind || 'No executor selected' }}</dd>
          <dt class="text-muted-foreground">Estimated transfer</dt>
          <dd class="text-foreground">
            {{ formatBytes(family.placement.estimated_transfer_bytes) }} ·
            {{ formatEstimatedTime(family.placement.estimated_transfer_ms) }}
          </dd>
          <dt class="text-muted-foreground">Ranked alternatives</dt>
          <dd
            class="text-foreground"
            title="Other targets the round would have accepted. One round keeps at most 8 ranked alternatives."
          >{{ family.placement.alternatives }}</dd>
          <dt class="text-muted-foreground">Rejected candidates</dt>
          <dd
            class="text-foreground"
            title="Targets the round refused, with the reason recorded. One round keeps at most 32 rejection explanations."
          >{{ family.placement.rejected }}</dd>
          <dt class="text-muted-foreground">Omitted rejections</dt>
          <dd
            class="text-foreground"
            title="Rejections dropped by that audit bound. A non-zero count means the recorded rejections are incomplete, not that the remaining targets agreed."
          >{{ family.placement.omitted }}</dd>
          <dt class="text-muted-foreground">Plan stored</dt>
          <dd class="text-foreground" :title="new Date(family.placement.stored_at_ms).toISOString()">
            {{ storedAt(family.placement.stored_at_ms) }}
          </dd>
        </dl>
        <p class="text-[11px] text-muted-foreground">
          Estimated at planning time, after the last page of executor advertisements was screened.
          These are not measured transfer values.
        </p>
      </template>
      <p v-else class="text-xs text-muted-foreground">
        No local placement record for this family. The plan is kept by the node that made it, so
        another node may hold one.
      </p>
    </div>

    <div class="space-y-1.5">
      <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Responder-local caveats">
        <Badge v-if="family.partial" variant="outline" size="sm" class="text-muted-foreground">
          Partial responder view
        </Badge>
        <Badge v-if="family.locally_exhausted" variant="outline" size="sm" class="text-muted-foreground">
          Locally exhausted
        </Badge>
        <span v-if="family.responder_node_id" class="text-[11px] text-muted-foreground">
          answered by node
          <span class="font-mono" :title="family.responder_node_id">
            {{ truncateMiddle(family.responder_node_id) }}
          </span>
        </span>
      </div>
      <p v-if="family.partial" class="text-[11px] text-muted-foreground">
        This responder could not reduce every family record.
      </p>
      <p v-if="family.locally_exhausted" class="text-[11px] text-muted-foreground">
        Known executions are terminal here and no local retry is armed. This does not establish a permanent failure.
      </p>
    </div>
  </section>
</template>
