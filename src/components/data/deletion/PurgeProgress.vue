<script setup lang="ts">
// A running purge and what the scope still holds afterwards. Committed batches
// stay deleted even when a later one fails, so the progress is kept on screen.
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type {
  StorageDeletionPreflight,
  StoragePurgeJobStatus,
  StoragePurgeProgress,
  StoragePurgeSubmission,
} from '@/lib/storageDeletion'

const props = defineProps<{
  submission: StoragePurgeSubmission | null
  status: StoragePurgeJobStatus | null
  progress: StoragePurgeProgress | null
  remaining: StorageDeletionPreflight | null
  remainingBusy: boolean
  remainingMissing: boolean
  remainingError: string | null
}>()

function inventoryRows(preflight: StorageDeletionPreflight) {
  return [
    { label: 'Current heads', value: preflight.counts.current_heads },
    { label: 'Noncurrent versions', value: preflight.counts.noncurrent_versions },
    { label: 'Delete markers', value: preflight.counts.delete_markers },
    { label: 'Open multipart uploads', value: preflight.counts.open_multipart_uploads },
  ]
}
</script>

<template>
  <div class="space-y-3 text-xs">
    <section v-if="props.submission || props.progress" class="space-y-1 rounded-md border border-border px-3 py-2">
      <h4 class="font-medium text-foreground">Deletion progress</h4>
      <p v-if="props.submission" class="break-all text-muted-foreground">
        System job {{ props.submission.job_id }}
      </p>
      <p v-if="props.submission && !props.submission.created" class="text-muted-foreground">
        Reusing the existing deletion for this retry.
      </p>
      <p v-if="props.status" class="capitalize">State: {{ props.status.state.replaceAll('_', ' ') }}</p>
      <p v-if="props.progress" class="font-medium">
        Committed entries from completed batches:
        {{ props.progress.current }}<template v-if="props.progress.total !== undefined"> of {{ props.progress.total }}</template>
        {{ props.progress.unit }}
      </p>
      <template v-if="props.status?.result">
        <p>Completed batches: {{ props.status.result.batches_completed }}</p>
        <p>Versions and markers removed: {{ props.status.result.versions_removed }}</p>
        <p>Multipart uploads removed: {{ props.status.result.multipart_uploads_removed }}</p>
      </template>
      <Notice v-if="props.status?.state === 'failed'" tone="warning">
        The deletion stopped after committing the progress shown above. Work committed by completed batches remains deleted.
      </Notice>
    </section>

    <section
      v-if="props.remainingBusy || props.remaining || props.remainingMissing || props.remainingError"
      class="space-y-2 rounded-md border border-border px-3 py-2"
    >
      <h4 class="font-medium text-foreground">Remaining after refresh</h4>
      <Spinner v-if="props.remainingBusy" show-label label="Refreshing the selected scope…" />
      <dl v-else-if="props.remaining" class="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
        <div v-for="row in inventoryRows(props.remaining)" :key="row.label" class="contents">
          <dt>{{ row.label }}</dt>
          <dd class="text-right font-mono text-foreground">{{ row.value }}</dd>
        </div>
      </dl>
      <p v-if="props.remaining && !props.remaining.counts.complete" class="text-amber-800 dark:text-amber-300">
        This remaining inventory is truncated. Total items may be more than shown.
      </p>
      <p v-if="props.remainingMissing" class="text-muted-foreground">The selected scope no longer exists.</p>
      <p v-if="props.remainingError" class="text-destructive">{{ props.remainingError }}</p>
    </section>
  </div>
</template>
