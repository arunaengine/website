<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import DatasetReferencesPreflightPanel from '@/components/data/DatasetReferencesPreflightPanel.vue'
import BulkDeleteDialog from '@/components/data/manager/BulkDeleteDialog.vue'
import { useAruna } from '@/composables/useAruna'
import type { DataManager } from '@/composables/useDataManager'
import { useStagingReferences } from '@/composables/useStagingReferences'
import { useS3, s3ErrorMessage, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import {
  createStoragePurgeOperation,
  getStorageDeletionPreflight,
  getStoragePurgeJob,
  isStorageDeletionNotFound,
  isTerminalStoragePurgeJob,
  retainStoragePurgeProgress,
  startStoragePurge,
  storageDeletionErrorMessage,
  type StorageDeletionPreflight,
  type StorageDeletionScope,
  type StoragePurgeJobStatus,
  type StoragePurgeOperation,
  type StoragePurgeProgress,
  type StoragePurgeSubmission,
} from '@/lib/storageDeletion'
import { computed, onUnmounted, ref } from 'vue'
import { useDeletionPreflight } from './useDeletionPreflight'

const props = defineProps<{ manager: DataManager }>()

const s3 = useS3()
const { authToken } = useAruna()
const {
  bucket,
  remoteNodeId,
  router,
  shortcuts,
  bucketList,
  references,
  listError,
  loadObjects,
  loadSyncOverview,
  keyIsSynced,
  setObjectSelected,
  pruneSelectedObjectKeys,
  dropPreviewUnder,
  onListingReset,
} = props.manager

const preflight = useDeletionPreflight()
const {
  backlinkPreflight,
  backlinkPreflightBusy,
  backlinkPreflightError,
  permanentDeleteApiBase,
  resetBacklinkPreflightState,
  loadBacklinkPreflight,
} = preflight

const bulkDelete = ref<InstanceType<typeof BulkDeleteDialog> | null>(null)

type DeleteTarget =
  | { type: 'object'; bucket: string; object: ObjectEntry; nodeId: string | null }
  | {
      type: 'folder'
      bucket: string
      folder: FolderEntry
      nodeId: string | null
      /** Object count under the prefix; null while the recursive listing runs. */
      count: number | null
      countTruncated: boolean
    }
const deleteTarget = ref<DeleteTarget | null>(null)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

interface PermanentDeleteTarget {
  type: StorageDeletionScope['kind']
  bucket: string
  nodeId: string | null
  label: string
  apiBase: string
  operation: StoragePurgeOperation
}
const permanentDeleteTarget = ref<PermanentDeleteTarget | null>(null)
const permanentDeletePreflight = ref<StorageDeletionPreflight | null>(null)
const permanentDeletePreflightBusy = ref(false)
const permanentDeleteBusy = ref(false)
const permanentDeleteAttempted = ref(false)
const permanentDeleteError = ref<string | null>(null)
const permanentDeleteSubmission = ref<StoragePurgeSubmission | null>(null)
const permanentDeleteStatus = ref<StoragePurgeJobStatus | null>(null)
const permanentDeleteProgress = ref<StoragePurgeProgress | null>(null)
const permanentDeleteRemaining = ref<StorageDeletionPreflight | null>(null)
const permanentDeleteRemainingBusy = ref(false)
const permanentDeleteRemainingMissing = ref(false)
const permanentDeleteRemainingError = ref<string | null>(null)
let permanentDeleteRequestId = 0

const destructiveScope = computed<StorageDeletionScope | null>(() => {
  const ordinary = deleteTarget.value
  if (ordinary?.type === 'object') {
    return { kind: 'file', bucket: ordinary.bucket, key: ordinary.object.key }
  }
  if (ordinary?.type === 'folder') {
    return { kind: 'prefix', bucket: ordinary.bucket, prefix: ordinary.folder.prefix }
  }
  return permanentDeleteTarget.value?.operation.scope ?? null
})
const destructiveNodeId = computed(() =>
  deleteTarget.value?.nodeId ?? permanentDeleteTarget.value?.nodeId ?? null,
)
const destructiveSourceBucket = computed(() => destructiveScope.value?.bucket ?? '')
const destructiveSourceReferences = useStagingReferences(
  destructiveSourceBucket,
  computed(() => Boolean(destructiveScope.value) && destructiveNodeId.value === null),
)
const destructiveSourceBindings = computed(() => {
  const scope = destructiveScope.value
  if (!scope) return []
  return destructiveSourceReferences.entries.value.filter((entry) => {
    if (!entry.referenced) return false
    if (scope.kind === 'file') return entry.key === scope.key
    if (scope.kind === 'prefix') return entry.key.startsWith(scope.prefix)
    return true
  })
})
const destructiveSyncApplies = computed(() => {
  const scope = destructiveScope.value
  if (!scope || scope.kind === 'bucket' || scope.bucket !== bucket.value) return false
  return keyIsSynced(scope.kind === 'file' ? scope.key : scope.prefix)
})

function openDeleteObject(object: ObjectEntry) {
  if (!s3.canWrite(bucket.value, object.key, remoteNodeId.value)) return
  const target: DeleteTarget = {
    type: 'object',
    bucket: bucket.value,
    object,
    nodeId: remoteNodeId.value,
  }
  deleteError.value = null
  void loadBacklinkPreflight(
    { kind: 'file', bucket: target.bucket, key: target.object.key },
    'latest_version_tombstone',
    target.nodeId,
  )
  deleteTarget.value = target
}

// Folder delete: the confirm dialog shows how many objects the recursive walk
// finds (capped; '+' marks a truncated count) before anything is removed.
const FOLDER_COUNT_LIMIT = 2000
function openDeleteFolder(folder: FolderEntry) {
  if (!s3.canDeletePrefix(bucket.value, folder.prefix, remoteNodeId.value)) return
  const target: DeleteTarget = {
    type: 'folder',
    bucket: bucket.value,
    folder,
    nodeId: remoteNodeId.value,
    count: null,
    countTruncated: false,
  }
  deleteError.value = null
  void loadBacklinkPreflight(
    { kind: 'prefix', bucket: target.bucket, prefix: target.folder.prefix },
    'latest_version_tombstone',
    target.nodeId,
  )
  deleteTarget.value = target
  void resolveFolderCount(folder)
}

function closeDeleteDialog() {
  if (deleteBusy.value) return
  deleteTarget.value = null
  resetBacklinkPreflightState()
}

async function resolveFolderCount(folder: FolderEntry) {
  try {
    const result = await s3.listObjectsRecursive(
      bucket.value,
      folder.prefix,
      FOLDER_COUNT_LIMIT,
      remoteNodeId.value,
    )
    const target = deleteTarget.value
    if (target?.type === 'folder' && target.folder.prefix === folder.prefix) {
      target.count = result.objects.length
      target.countTruncated = result.truncated
    }
  } catch {
    // The count stays unknown; deleting is still possible.
    const target = deleteTarget.value
    if (target?.type === 'folder' && target.folder.prefix === folder.prefix) {
      target.count = -1
    }
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  const target = deleteTarget.value
  const targetKey = target.type === 'object' ? target.object.key : target.folder.prefix
  const deletionAllowed =
    target.type === 'object'
      ? s3.canWrite(target.bucket, targetKey, target.nodeId)
      : s3.canDeletePrefix(target.bucket, targetKey, target.nodeId)
  if (!deletionAllowed) {
    deleteError.value = 'This session no longer allows deleting the selected path.'
    return
  }
  deleteBusy.value = true
  deleteError.value = null
  try {
    if (target.type === 'object') {
      await s3.deleteObject(target.bucket, target.object.key, target.nodeId)
      setObjectSelected(target.object.key, false)
    } else {
      const result = await s3.deletePrefix(target.bucket, target.folder.prefix, target.nodeId)
      // A deleted prefix invalidates any preview under it.
      if (target.bucket === bucket.value) {
        dropPreviewUnder((key) => key.startsWith(target.folder.prefix))
      }
      if (result.errors.length) {
        const first = result.errors[0]
        deleteError.value = `${result.deleted} object${result.deleted === 1 ? '' : 's'} deleted, ${result.errors.length} failed. First failure: ${first.key}: ${first.message}`
        if (target.bucket === bucket.value) await loadObjects()
        return
      }
      pruneSelectedObjectKeys(
        { kind: 'prefix', bucket: target.bucket, prefix: target.folder.prefix },
        target.nodeId,
      )
    }
    deleteTarget.value = null
    resetBacklinkPreflightState()
    if (target.bucket === bucket.value) await loadObjects()
    if (target.type === 'folder') void references.reload()
  } catch (err) {
    deleteError.value = s3ErrorMessage(err)
  } finally {
    deleteBusy.value = false
  }
}

function permanentDeleteAllowed(target: PermanentDeleteTarget | null): boolean {
  if (!target) return false
  const scope = target.operation.scope
  if (scope.kind === 'file') return s3.canWrite(scope.bucket, scope.key, target.nodeId)
  if (scope.kind === 'prefix') return s3.canDeletePrefix(scope.bucket, scope.prefix, target.nodeId)
  return s3.canDeletePrefix(scope.bucket, '', target.nodeId)
}

const permanentDeleteActionLabel = computed(() => {
  if (permanentDeleteTarget.value?.type === 'file') return 'Permanently delete all versions'
  if (permanentDeleteTarget.value?.type === 'prefix') {
    return 'Permanently delete folder and all versions'
  }
  return 'Delete bucket'
})

function storageInventoryRows(preflight: StorageDeletionPreflight) {
  return [
    { label: 'Current heads', value: preflight.counts.current_heads },
    { label: 'Noncurrent versions', value: preflight.counts.noncurrent_versions },
    { label: 'Delete markers', value: preflight.counts.delete_markers },
    { label: 'Open multipart uploads', value: preflight.counts.open_multipart_uploads },
  ]
}

function resetPermanentDeleteState() {
  ++permanentDeleteRequestId
  resetBacklinkPreflightState()
  permanentDeleteTarget.value = null
  permanentDeletePreflight.value = null
  permanentDeletePreflightBusy.value = false
  permanentDeleteBusy.value = false
  permanentDeleteAttempted.value = false
  permanentDeleteError.value = null
  permanentDeleteSubmission.value = null
  permanentDeleteStatus.value = null
  permanentDeleteProgress.value = null
  permanentDeleteRemaining.value = null
  permanentDeleteRemainingBusy.value = false
  permanentDeleteRemainingMissing.value = false
  permanentDeleteRemainingError.value = null
}

function closePermanentDelete() {
  if (!permanentDeleteBusy.value) resetPermanentDeleteState()
}

function openPermanentDelete(
  scope: StorageDeletionScope,
  nodeId: string | null,
  label: string,
) {
  const apiBase = permanentDeleteApiBase(nodeId)
  if (!apiBase) {
    listError.value = 'The node API endpoint for this storage location is unavailable.'
    return
  }
  resetPermanentDeleteState()
  const target: PermanentDeleteTarget = {
    type: scope.kind,
    bucket: scope.bucket,
    nodeId,
    label,
    apiBase,
    operation: createStoragePurgeOperation(scope),
  }
  void loadBacklinkPreflight(scope, 'all_versions_purge', nodeId)
  permanentDeleteTarget.value = target
  void loadPermanentDeletePreflight(target)
}

function openPermanentDeleteObject(object: ObjectEntry) {
  if (!s3.canWrite(bucket.value, object.key, remoteNodeId.value)) return
  openPermanentDelete(
    { kind: 'file', bucket: bucket.value, key: object.key },
    remoteNodeId.value,
    object.key,
  )
}

function openPermanentDeleteFolder(folder: FolderEntry) {
  if (!s3.canDeletePrefix(bucket.value, folder.prefix, remoteNodeId.value)) return
  openPermanentDelete(
    { kind: 'prefix', bucket: bucket.value, prefix: folder.prefix },
    remoteNodeId.value,
    folder.prefix,
  )
}

// Bucket deletion remains local-only in the existing affordance, but now the
// connected node performs the complete all-version and multipart-aware purge.
function openDeleteBucket(name: string, nodeId: string | null) {
  if (!s3.canDeletePrefix(name, '', nodeId)) return
  openPermanentDelete({ kind: 'bucket', bucket: name }, nodeId, name)
}

function permanentDeleteClient(target: PermanentDeleteTarget) {
  return { baseUrl: target.apiBase, token: authToken.value || undefined }
}

async function loadPermanentDeletePreflight(target = permanentDeleteTarget.value) {
  if (!target) return
  const requestId = ++permanentDeleteRequestId
  permanentDeletePreflightBusy.value = true
  permanentDeletePreflight.value = null
  permanentDeleteError.value = null
  try {
    const response = await getStorageDeletionPreflight(
      target.operation.scope,
      permanentDeleteClient(target),
    )
    if (
      requestId !== permanentDeleteRequestId ||
      permanentDeleteTarget.value?.operation.idempotencyKey !== target.operation.idempotencyKey
    ) return
    permanentDeletePreflight.value = response
  } catch (error) {
    if (requestId !== permanentDeleteRequestId) return
    permanentDeleteError.value = storageDeletionErrorMessage(error)
  } finally {
    if (requestId === permanentDeleteRequestId) permanentDeletePreflightBusy.value = false
  }
}

async function refreshPermanentDeleteRemaining(target: PermanentDeleteTarget) {
  const requestId = permanentDeleteRequestId
  permanentDeleteRemainingBusy.value = true
  permanentDeleteRemaining.value = null
  permanentDeleteRemainingMissing.value = false
  permanentDeleteRemainingError.value = null
  try {
    const response = await getStorageDeletionPreflight(
      target.operation.scope,
      permanentDeleteClient(target),
    )
    if (
      requestId !== permanentDeleteRequestId ||
      permanentDeleteTarget.value?.operation.idempotencyKey !== target.operation.idempotencyKey
    ) return
    permanentDeleteRemaining.value = response
  } catch (error) {
    if (requestId !== permanentDeleteRequestId) return
    if (isStorageDeletionNotFound(error)) {
      permanentDeleteRemainingMissing.value = true
    } else {
      permanentDeleteRemainingError.value = storageDeletionErrorMessage(error)
    }
  } finally {
    if (requestId === permanentDeleteRequestId) permanentDeleteRemainingBusy.value = false
  }
}

async function refreshAfterPermanentDelete(
  target: PermanentDeleteTarget,
  status: StoragePurgeJobStatus,
) {
  await refreshPermanentDeleteRemaining(target)
  if (permanentDeleteTarget.value?.operation.idempotencyKey !== target.operation.idempotencyKey) {
    return
  }

  const scope = target.operation.scope
  if (status.state === 'succeeded') pruneSelectedObjectKeys(scope, target.nodeId)

  if (target.type === 'bucket' && status.state === 'succeeded') {
    shortcuts.remove(target.bucket, target.nodeId)
    const wasOpen = bucket.value === target.bucket && remoteNodeId.value === target.nodeId
    if (wasOpen) await router.push({ name: 'buckets' })
    await bucketList.refresh()
    void loadSyncOverview()
    return
  }

  if (bucket.value === target.bucket && remoteNodeId.value === target.nodeId) {
    await loadObjects()
    dropPreviewUnder(
      (key) =>
        (scope.kind === 'file' && key === scope.key) ||
        (scope.kind === 'prefix' && key.startsWith(scope.prefix)),
    )
  }
  if (target.type === 'bucket') await bucketList.refresh()
}

async function pollPermanentDelete(
  target: PermanentDeleteTarget,
  jobId: string,
  requestId: number,
) {
  for (;;) {
    const status = await getStoragePurgeJob(jobId, permanentDeleteClient(target))
    if (requestId !== permanentDeleteRequestId) return
    if (status.kind !== 'storage_purge') {
      throw new Error(`System job ${jobId} is not a storage purge.`)
    }
    permanentDeleteStatus.value = status
    permanentDeleteProgress.value = retainStoragePurgeProgress(
      permanentDeleteProgress.value,
      status.progress,
    )
    if (isTerminalStoragePurgeJob(status.state)) {
      if (status.state === 'failed') {
        permanentDeleteError.value = status.error?.message ?? 'The purge failed.'
      } else if (status.state === 'cancelled') {
        permanentDeleteError.value = 'The purge was cancelled.'
      }
      await refreshAfterPermanentDelete(target, status)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    if (requestId !== permanentDeleteRequestId) return
  }
}

async function confirmPermanentDelete() {
  const target = permanentDeleteTarget.value
  if (
    !target ||
    !permanentDeletePreflight.value?.permissions.purge
  ) return
  if (!permanentDeleteAllowed(target)) {
    permanentDeleteError.value = 'This session no longer allows deleting the selected scope.'
    return
  }

  const requestId = ++permanentDeleteRequestId
  permanentDeleteBusy.value = true
  permanentDeleteAttempted.value = true
  permanentDeleteError.value = null
  permanentDeleteStatus.value = null
  try {
    const submission = await startStoragePurge(
      target.operation,
      permanentDeleteClient(target),
    )
    if (requestId !== permanentDeleteRequestId) return
    permanentDeleteSubmission.value = submission
    await pollPermanentDelete(target, submission.job_id, requestId)
  } catch (error) {
    if (requestId !== permanentDeleteRequestId) return
    permanentDeleteError.value = storageDeletionErrorMessage(error)
  } finally {
    if (requestId === permanentDeleteRequestId) permanentDeleteBusy.value = false
  }
}

onListingReset(() => {
  deleteTarget.value = null
})

onUnmounted(() => {
  ++permanentDeleteRequestId
  resetBacklinkPreflightState()
})

defineExpose({
  openDeleteObject,
  openDeleteFolder,
  openPermanentDeleteObject,
  openPermanentDeleteFolder,
  openDeleteBucket,
  openBulkDelete: () => bulkDelete.value?.openBulkDelete(),
})
</script>

<template>
  <BulkDeleteDialog ref="bulkDelete" :manager="props.manager" :preflight="preflight" />

  <Dialog :open="deleteTarget !== null" @update:open="(v: boolean) => { if (!v) closeDeleteDialog() }">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>{{ deleteTarget?.type === 'folder' ? 'Delete folder' : 'Delete object' }}</DialogTitle>
        <DialogDescription v-if="deleteTarget?.type === 'folder'">
           Deletes the folder <span class="font-mono text-xs">{{ deleteTarget.folder.name }}/</span> from
           <span class="font-mono text-xs">{{ deleteTarget.bucket }}</span>. Delete markers are written for current objects; earlier versions stay retrievable by version ID.
        </DialogDescription>
        <DialogDescription v-else>
           Deletes <span class="font-mono text-xs">{{ deleteTarget?.object.key }}</span> from
           <span class="font-mono text-xs">{{ deleteTarget?.bucket }}</span>. A delete marker is written; earlier versions stay retrievable by version ID.
        </DialogDescription>
      </DialogHeader>
      <div v-if="deleteTarget?.type === 'folder'" class="space-y-2 text-xs">
        <Spinner v-if="deleteTarget.count === null" show-label label="Counting objects…" />
        <p v-else-if="deleteTarget.count >= 0" class="text-muted-foreground">
          Contains {{ deleteTarget.count }}{{ deleteTarget.countTruncated ? '+' : '' }} object{{ deleteTarget.count === 1 && !deleteTarget.countTruncated ? '' : 's' }}.
        </p>
        <p v-else class="text-muted-foreground">The object count could not be resolved.</p>
      </div>

      <DatasetReferencesPreflightPanel
        :preflight="backlinkPreflight"
        :busy="backlinkPreflightBusy"
        :error="backlinkPreflightError"
      />

      <section aria-label="Source bindings" class="space-y-1 rounded-md border border-border px-3 py-2 text-xs">
        <h4 class="font-medium text-foreground">Source bindings</h4>
        <Spinner v-if="destructiveSourceReferences.status.value === 'loading'" show-label label="Checking source bindings…" />
        <Notice v-else-if="destructiveSourceReferences.status.value === 'error'" tone="warning">
          <p class="font-medium">Source-binding lookup failed.</p>
          <p>Existing source bindings are unknown.</p>
          <p v-if="destructiveSourceReferences.error.value" class="mt-1 break-all font-mono text-[10px]">{{ destructiveSourceReferences.error.value }}</p>
        </Notice>
        <Notice v-else-if="destructiveSourceReferences.status.value === 'unknown'" tone="warning">
          Source-binding coverage is unknown for this scope.
        </Notice>
        <p v-else-if="destructiveSourceBindings.length" class="text-amber-800 dark:text-amber-300">
          {{ destructiveSourceBindings.length }} source binding{{ destructiveSourceBindings.length === 1 ? '' : 's' }} apply to this scope. Deletion does not detach source bindings.
        </p>
        <p v-else class="text-muted-foreground">No source bindings were found for this scope.</p>
      </section>

      <section
        v-if="destructiveSyncApplies"
        aria-label="Sync relationships"
        class="space-y-1 rounded-md border border-border px-3 py-2 text-xs"
      >
        <h4 class="font-medium text-foreground">Sync relationships</h4>
        <p class="text-muted-foreground">This scope overlaps a sync relationship. Sync state is separate from dataset references and source bindings.</p>
      </section>
      <Notice v-if="deleteError" tone="error">{{ deleteError }}</Notice>
      <DialogFooter>
        <DialogClose as-child><Button variant="outline" :disabled="deleteBusy">Cancel</Button></DialogClose>
        <Button variant="destructive" :disabled="deleteBusy || (deleteTarget?.type === 'object' ? !s3.canWrite(deleteTarget.bucket, deleteTarget.object.key, deleteTarget.nodeId) : deleteTarget?.type === 'folder' ? !s3.canDeletePrefix(deleteTarget.bucket, deleteTarget.folder.prefix, deleteTarget.nodeId) : true)" @click="confirmDelete">{{ deleteBusy ? 'Deleting…' : 'Delete' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog :open="permanentDeleteTarget !== null" @update:open="(v: boolean) => { if (!v) closePermanentDelete() }">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>{{ permanentDeleteActionLabel }}</DialogTitle>
        <DialogDescription v-if="permanentDeleteTarget?.type === 'file'">
          Permanently deletes every version and delete marker for
          <span class="font-mono text-xs">{{ permanentDeleteTarget.label }}</span> from
          <span class="font-mono text-xs">{{ permanentDeleteTarget.bucket }}</span>. This cannot be undone.
        </DialogDescription>
        <DialogDescription v-else-if="permanentDeleteTarget?.type === 'prefix'">
          Permanently deletes the folder
          <span class="font-mono text-xs">{{ permanentDeleteTarget.label }}</span> and every version and delete marker below it. This cannot be undone.
        </DialogDescription>
        <DialogDescription v-else-if="permanentDeleteTarget">
          Permanently deletes the bucket
          <span class="font-mono text-xs">{{ permanentDeleteTarget.bucket }}</span>, every version and delete marker, and every open multipart upload. This cannot be undone.
        </DialogDescription>
      </DialogHeader>

      <div v-if="permanentDeleteTarget" class="space-y-3 text-xs">
        <Spinner v-if="permanentDeletePreflightBusy" show-label label="Loading deletion preflight…" />

        <template v-else-if="permanentDeletePreflight">
          <section class="space-y-2 rounded-md border border-border px-3 py-2">
            <h4 class="font-medium text-foreground">Preflight inventory</h4>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
              <div v-for="row in storageInventoryRows(permanentDeletePreflight)" :key="row.label" class="contents">
                <dt>{{ row.label }}</dt>
                <dd class="text-right font-mono text-foreground">{{ row.value }}</dd>
              </div>
            </dl>
            <p v-if="!permanentDeletePreflight.counts.complete" class="text-amber-800 dark:text-amber-300">
              This inventory is truncated. Total items may be more than shown.
            </p>
            <p v-if="permanentDeletePreflight.truncation.versions_truncated" class="text-muted-foreground">
              The version and delete-marker inventory has another page.
            </p>
            <p v-if="permanentDeletePreflight.truncation.multipart_uploads_truncated" class="text-muted-foreground">
              The multipart-upload inventory has another page.
            </p>
            <p v-if="permanentDeletePreflight.counts.open_multipart_uploads > 0" class="text-muted-foreground">
              Open multipart uploads in this scope will be aborted by the purge.
            </p>
          </section>

          <section class="space-y-1 rounded-md border border-border px-3 py-2">
            <h4 class="font-medium text-foreground">Permissions</h4>
            <p>Read inventory: <span class="font-medium">{{ permanentDeletePreflight.permissions.read ? 'Allowed' : 'Not allowed' }}</span></p>
            <p>Permanent purge: <span class="font-medium">{{ permanentDeletePreflight.permissions.purge ? 'Allowed' : 'Not allowed' }}</span></p>
            <p v-if="!permanentDeletePreflight.permissions.purge" class="text-destructive">
              You can inspect this scope but do not have permission to purge it.
            </p>
          </section>

          <Notice
            v-if="permanentDeleteTarget.type === 'bucket' && permanentDeletePreflight.sync_relationships_apply_to_bucket_delete"
            tone="warning"
            class="space-y-2"
          >
            <h4 class="font-medium">Sync-relationship removal</h4>
            <template v-if="permanentDeletePreflight.sync_relationships.length">
              <p>
                Deleting this bucket also removes {{ permanentDeletePreflight.sync_relationships.length }} sync relationship{{ permanentDeletePreflight.sync_relationships.length === 1 ? '' : 's' }} and repairs the remote mirrors. This confirmed side effect is not a blocker.
              </p>
              <ul class="space-y-1 pl-4">
                <li v-for="relationship in permanentDeletePreflight.sync_relationships" :key="relationship.relationship_id" class="list-disc break-all">
                  {{ relationship.direction }}: {{ relationship.source }} to {{ relationship.target }}
                </li>
              </ul>
            </template>
            <p v-else>No sync relationships will be removed.</p>
          </Notice>

        </template>

        <DatasetReferencesPreflightPanel
          :preflight="backlinkPreflight"
          :busy="backlinkPreflightBusy"
          :error="backlinkPreflightError"
        />

        <section aria-label="Source bindings" class="space-y-1 rounded-md border border-border px-3 py-2">
          <h4 class="font-medium text-foreground">Source bindings</h4>
          <Spinner v-if="destructiveSourceReferences.status.value === 'loading'" show-label label="Checking source bindings…" />
          <Notice v-else-if="destructiveSourceReferences.status.value === 'error'" tone="warning">
            <p class="font-medium">Source-binding lookup failed.</p>
            <p>Existing source bindings are unknown.</p>
            <p v-if="destructiveSourceReferences.error.value" class="mt-1 break-all font-mono text-[10px]">{{ destructiveSourceReferences.error.value }}</p>
          </Notice>
          <Notice v-else-if="destructiveSourceReferences.status.value === 'unknown'" tone="warning">
            Source-binding coverage is unknown for this scope.
          </Notice>
          <p v-else-if="destructiveSourceBindings.length" class="text-amber-800 dark:text-amber-300">
            {{ destructiveSourceBindings.length }} source binding{{ destructiveSourceBindings.length === 1 ? '' : 's' }} apply to this scope. Deletion does not detach source bindings.
          </p>
          <p v-else class="text-muted-foreground">No source bindings were found for this scope.</p>
        </section>

        <section
          v-if="destructiveSyncApplies"
          aria-label="Sync relationships"
          class="space-y-1 rounded-md border border-border px-3 py-2"
        >
          <h4 class="font-medium text-foreground">Sync relationships</h4>
          <p class="text-muted-foreground">This scope overlaps a sync relationship. Sync state is separate from dataset references and source bindings.</p>
        </section>

        <section
          v-if="permanentDeleteSubmission || permanentDeleteProgress"
          class="space-y-1 rounded-md border border-border px-3 py-2"
        >
          <h4 class="font-medium text-foreground">Purge progress</h4>
          <p v-if="permanentDeleteSubmission" class="break-all text-muted-foreground">
            System job {{ permanentDeleteSubmission.job_id }}
          </p>
          <p v-if="permanentDeleteSubmission && !permanentDeleteSubmission.created" class="text-muted-foreground">
            Reusing the existing purge for this retry.
          </p>
          <p v-if="permanentDeleteStatus" class="capitalize">
            State: {{ permanentDeleteStatus.state.replaceAll('_', ' ') }}
          </p>
          <p v-if="permanentDeleteProgress" class="font-medium">
            Committed entries from completed batches:
            {{ permanentDeleteProgress.current }}<template v-if="permanentDeleteProgress.total !== undefined"> of {{ permanentDeleteProgress.total }}</template>
            {{ permanentDeleteProgress.unit }}
          </p>
          <template v-if="permanentDeleteStatus?.result">
            <p>Completed batches: {{ permanentDeleteStatus.result.batches_completed }}</p>
            <p>Versions and markers removed: {{ permanentDeleteStatus.result.versions_removed }}</p>
            <p>Multipart uploads removed: {{ permanentDeleteStatus.result.multipart_uploads_removed }}</p>
          </template>
          <Notice v-if="permanentDeleteStatus?.state === 'failed'" tone="warning">
            The purge stopped after committing the progress shown above. Work committed by completed batches remains deleted.
          </Notice>
        </section>

        <section
          v-if="permanentDeleteRemainingBusy || permanentDeleteRemaining || permanentDeleteRemainingMissing || permanentDeleteRemainingError"
          class="space-y-2 rounded-md border border-border px-3 py-2"
        >
          <h4 class="font-medium text-foreground">Remaining after refresh</h4>
          <Spinner v-if="permanentDeleteRemainingBusy" show-label label="Refreshing the selected scope…" />
          <dl v-else-if="permanentDeleteRemaining" class="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <div v-for="row in storageInventoryRows(permanentDeleteRemaining)" :key="row.label" class="contents">
              <dt>{{ row.label }}</dt>
              <dd class="text-right font-mono text-foreground">{{ row.value }}</dd>
            </div>
          </dl>
          <p v-if="permanentDeleteRemaining && !permanentDeleteRemaining.counts.complete" class="text-amber-800 dark:text-amber-300">
            This remaining inventory is truncated. Total items may be more than shown.
          </p>
          <p v-if="permanentDeleteRemainingMissing" class="text-muted-foreground">The selected scope no longer exists.</p>
          <p v-if="permanentDeleteRemainingError" class="text-destructive">{{ permanentDeleteRemainingError }}</p>
        </section>
      </div>

      <Notice v-if="permanentDeleteError" tone="error">{{ permanentDeleteError }}</Notice>
      <DialogFooter>
        <Button variant="outline" :disabled="permanentDeleteBusy" @click="closePermanentDelete">
          {{ permanentDeleteStatus?.state === 'succeeded' ? 'Close' : 'Cancel' }}
        </Button>
        <Button
          v-if="!permanentDeletePreflight && permanentDeleteError && !permanentDeletePreflightBusy"
          variant="outline"
          :disabled="permanentDeleteBusy"
          @click="loadPermanentDeletePreflight()"
        >Retry preflight</Button>
        <Button
          v-if="permanentDeletePreflight && permanentDeleteStatus?.state !== 'succeeded'"
          variant="destructive"
          :disabled="permanentDeleteBusy || !permanentDeletePreflight.permissions.purge || !permanentDeleteAllowed(permanentDeleteTarget)"
          @click="confirmPermanentDelete"
        >{{ permanentDeleteBusy ? 'Purging…' : permanentDeleteAttempted ? 'Retry purge' : permanentDeleteActionLabel }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
