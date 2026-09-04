<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import JobExecutionsTable from '@/components/jobs/JobExecutionsTable.vue'
import JobPlacementFigure from '@/components/jobs/JobPlacementFigure.vue'
import type { JobFamilyResponse, JobOutputResponse } from '@/lib/jobs'
import { formatBytes, truncateMiddle } from '@/lib/utils'

defineProps<{ family: JobFamilyResponse }>()

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
      <h4 class="text-xs font-medium text-foreground">Placement</h4>
      <JobPlacementFigure :placement="family.placement" />
    </div>

    <div class="space-y-2">
      <h4 class="text-xs font-medium text-foreground">Executions</h4>
      <JobExecutionsTable :family="family" />
    </div>

    <div data-tutorial="job-outputs" class="space-y-2">
      <div>
        <h4 class="text-xs font-medium text-foreground">Result outputs</h4>
        <p class="text-[11px] text-muted-foreground">
          Outputs of the execution that supplied the result, each named by its exact version.
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
      <p v-else class="text-xs text-muted-foreground">No result outputs have been recorded.</p>
    </div>
  </section>
</template>
