<script setup lang="ts">
// What the chosen deletion touches: the node's bounded inventory, the sync
// relationships a bucket delete removes, datasets that reference the content,
// source bindings, and the quota a delete marker does not free.
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import DatasetReferencesPreflightPanel from '@/components/data/DatasetReferencesPreflightPanel.vue'
import type { BacklinkPreflightResponse } from '@/lib/backlinks'
import type { StorageDeletionPreflight } from '@/lib/storageDeletion'

const props = defineProps<{
  preflight: StorageDeletionPreflight | null
  preflightBusy: boolean
  /** Bucket scope only: the relationships the delete would remove. */
  showSyncRemoval: boolean
  /** Quota sentence for an option that only writes a delete marker. */
  quotaNote: string | null
  syncApplies: boolean
  sourceStatus: 'unknown' | 'loading' | 'loaded' | 'error'
  sourceError: string | null
  sourceCount: number
  backlinkPreflight: BacklinkPreflightResponse | null
  backlinkBusy: boolean
  backlinkError: string | null
  selection?: boolean
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
    <Spinner v-if="props.preflightBusy" show-label label="Checking what this contains…" />

    <template v-else-if="props.preflight">
      <section class="space-y-2 rounded-md border border-border px-3 py-2">
        <h4 class="font-medium text-foreground">Preflight inventory</h4>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
          <div v-for="row in inventoryRows(props.preflight)" :key="row.label" class="contents">
            <dt>{{ row.label }}</dt>
            <dd class="text-right font-mono text-foreground">{{ row.value }}</dd>
          </div>
        </dl>
        <p v-if="!props.preflight.counts.complete" class="text-amber-800 dark:text-amber-300">
          This inventory is truncated. Total items may be more than shown.
        </p>
        <p v-if="props.preflight.truncation.versions_truncated" class="text-muted-foreground">
          The version and delete-marker inventory has another page.
        </p>
        <p v-if="props.preflight.truncation.multipart_uploads_truncated" class="text-muted-foreground">
          The multipart-upload inventory has another page.
        </p>
        <p v-if="props.preflight.counts.open_multipart_uploads > 0" class="text-muted-foreground">
          Open multipart uploads in this scope are aborted first.
        </p>
      </section>

      <section class="space-y-1 rounded-md border border-border px-3 py-2">
        <h4 class="font-medium text-foreground">Permissions</h4>
        <p>Read inventory: <span class="font-medium">{{ props.preflight.permissions.read ? 'Allowed' : 'Not allowed' }}</span></p>
        <p>Delete permanently: <span class="font-medium">{{ props.preflight.permissions.purge ? 'Allowed' : 'Not allowed' }}</span></p>
        <p v-if="!props.preflight.permissions.purge" class="text-destructive">
          You can inspect this scope but you may not delete it permanently.
        </p>
      </section>

      <Notice
        v-if="props.showSyncRemoval && props.preflight.sync_relationships_apply_to_bucket_delete"
        tone="warning"
        class="space-y-2"
      >
        <h4 class="font-medium">Sync-relationship removal</h4>
        <template v-if="props.preflight.sync_relationships.length">
          <p>
            Deleting this bucket also removes {{ props.preflight.sync_relationships.length }} sync relationship{{ props.preflight.sync_relationships.length === 1 ? '' : 's' }} and repairs the remote mirrors. This confirmed side effect is not a blocker.
          </p>
          <ul class="space-y-1 pl-4">
            <li v-for="relationship in props.preflight.sync_relationships" :key="relationship.relationship_id" class="list-disc break-all">
              {{ relationship.direction }}: {{ relationship.source }} to {{ relationship.target }}
            </li>
          </ul>
        </template>
        <p v-else>No sync relationships will be removed.</p>
      </Notice>
    </template>

    <Notice v-if="props.quotaNote" tone="info">{{ props.quotaNote }}</Notice>

    <DatasetReferencesPreflightPanel
      :preflight="props.backlinkPreflight"
      :busy="props.backlinkBusy"
      :error="props.backlinkError"
      :selection="props.selection"
    />

    <section aria-label="Source bindings" class="space-y-1 rounded-md border border-border px-3 py-2">
      <h4 class="font-medium text-foreground">Source bindings</h4>
      <Spinner v-if="props.sourceStatus === 'loading'" show-label label="Checking source bindings…" />
      <Notice v-else-if="props.sourceStatus === 'error'" tone="warning">
        <p class="font-medium">Source-binding lookup failed.</p>
        <p>Existing source bindings are unknown.</p>
        <p v-if="props.sourceError" class="mt-1 break-all font-mono text-[10px]">{{ props.sourceError }}</p>
      </Notice>
      <Notice v-else-if="props.sourceStatus === 'unknown'" tone="warning">
        Source-binding coverage is unknown for this scope.
      </Notice>
      <p v-else-if="props.sourceCount" class="text-amber-800 dark:text-amber-300">
        {{ props.sourceCount }} source binding{{ props.sourceCount === 1 ? '' : 's' }} apply to this scope. Deletion does not detach source bindings.
      </p>
      <p v-else class="text-muted-foreground">No source bindings were found for this scope.</p>
    </section>

    <section
      v-if="props.syncApplies"
      aria-label="Sync relationships"
      class="space-y-1 rounded-md border border-border px-3 py-2"
    >
      <h4 class="font-medium text-foreground">Sync relationships</h4>
      <p class="text-muted-foreground">This scope overlaps a sync relationship. Sync state is separate from dataset references and source bindings.</p>
    </section>
  </div>
</template>
