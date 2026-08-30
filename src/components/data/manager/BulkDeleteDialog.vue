<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Spinner from '@/components/ui/Spinner.vue'
import DatasetReferencesPreflightPanel from '@/components/data/DatasetReferencesPreflightPanel.vue'
import { useAruna } from '@/composables/useAruna'
import type { DataManager } from '@/composables/useDataManager'
import { useS3, isS3NetworkError, s3ErrorMessage } from '@/composables/useS3'
import type { BacklinkPreflightStorageOperation } from '@/lib/backlinks'
import {
  createStoragePurgeOperation,
  getStorageDeletionPreflight,
  getStoragePurgeJob,
  isTerminalStoragePurgeJob,
  startStoragePurge,
  storageDeletionErrorMessage,
  type StorageDeletionPreflight,
  type StoragePurgeOperation,
} from '@/lib/storageDeletion'
import { computed, onUnmounted, ref } from 'vue'
import {
  BULK_PREFLIGHT_CONCURRENCY,
  type BulkDeleteIssue,
  type BulkDeleteTarget,
  type DeletionPreflight,
} from './useDeletionPreflight'

const props = defineProps<{ manager: DataManager; preflight: DeletionPreflight }>()

const s3 = useS3()
const { authToken } = useAruna()
const {
  bucket,
  remoteNodeId,
  loadObjects,
  dropPreviewUnder,
  selectedObjectKeys,
  onListingReset,
} = props.manager
const {
  backlinkPreflight,
  backlinkPreflightBusy,
  backlinkPreflightError,
  permanentDeleteApiBase,
  resetBacklinkPreflightState,
  loadBulkBacklinkPreflight,
} = props.preflight

const BULK_DELETE_BATCH_SIZE = 1_000

type BulkDeleteMode = BacklinkPreflightStorageOperation

interface BulkDeleteOutcome {
  committed: string[]
  failed: BulkDeleteIssue[]
  unknown: BulkDeleteIssue[]
}

type BulkDeleteKeyResult =
  | { key: string; status: 'committed' }
  | { key: string; status: 'failed' | 'unknown'; message: string }

interface BulkPurgeScopeState {
  key: string
  operation: StoragePurgeOperation
  preflight: StorageDeletionPreflight | null
  error: string | null
}

const bulkDeleteTarget = ref<BulkDeleteTarget | null>(null)
const bulkDeleteMode = ref<BulkDeleteMode>('latest_version_tombstone')
const bulkDeleteBusy = ref(false)
const bulkDeleteOutcome = ref<BulkDeleteOutcome | null>(null)
const bulkPurgeScopes = ref<BulkPurgeScopeState[]>([])
const bulkPurgePreflightBusy = ref(false)
let bulkDeleteRequestId = 0

const bulkDeleteUnresolvedCount = computed(() =>
  bulkDeleteOutcome.value
    ? bulkDeleteOutcome.value.failed.length + bulkDeleteOutcome.value.unknown.length
    : bulkDeleteTarget.value?.keys.length ?? 0,
)
const bulkDeleteActionLabel = computed(() => {
  if (bulkDeleteOutcome.value) return `Retry ${bulkDeleteUnresolvedCount.value} unresolved`
  const count = bulkDeleteTarget.value?.keys.length ?? 0
  return bulkDeleteMode.value === 'all_versions_purge'
    ? `Permanently purge ${count} selected key${count === 1 ? '' : 's'}`
    : `Delete ${count} selected key${count === 1 ? '' : 's'}`
})
const bulkPurgeInventory = computed(() => {
  const preflights = bulkPurgeScopes.value.flatMap((scope) => scope.preflight ? [scope.preflight] : [])
  return {
    current_heads: preflights.reduce((sum, preflight) => sum + preflight.counts.current_heads, 0),
    noncurrent_versions: preflights.reduce((sum, preflight) => sum + preflight.counts.noncurrent_versions, 0),
    delete_markers: preflights.reduce((sum, preflight) => sum + preflight.counts.delete_markers, 0),
    open_multipart_uploads: preflights.reduce((sum, preflight) => sum + preflight.counts.open_multipart_uploads, 0),
    complete: preflights.length === bulkPurgeScopes.value.length && preflights.every((preflight) => preflight.counts.complete),
  }
})
const bulkPurgePreflightReady = computed(() =>
  bulkPurgeScopes.value.length === (bulkDeleteTarget.value?.keys.length ?? 0) &&
  bulkPurgeScopes.value.every((scope) => scope.preflight?.permissions.purge),
)
const bulkPurgePreflightErrors = computed(() =>
  bulkPurgeScopes.value.flatMap((scope) => scope.error ? [{ key: scope.key, message: scope.error }] : []),
)
const bulkPurgeDeniedKeys = computed(() =>
  bulkPurgeScopes.value.flatMap((scope) => scope.preflight && !scope.preflight.permissions.purge ? [scope.key] : []),
)

function resetBulkDeleteState() {
  ++bulkDeleteRequestId
  resetBacklinkPreflightState()
  bulkDeleteTarget.value = null
  bulkDeleteMode.value = 'latest_version_tombstone'
  bulkDeleteBusy.value = false
  bulkDeleteOutcome.value = null
  bulkPurgeScopes.value = []
  bulkPurgePreflightBusy.value = false
}

function closeBulkDelete() {
  if (!bulkDeleteBusy.value) resetBulkDeleteState()
}

function openBulkDelete() {
  if (!selectedObjectKeys.value.size) return
  const target: BulkDeleteTarget = {
    bucket: bucket.value,
    nodeId: remoteNodeId.value,
    keys: [...selectedObjectKeys.value],
  }
  resetBulkDeleteState()
  void loadBulkBacklinkPreflight(target, 'latest_version_tombstone')
  bulkDeleteTarget.value = target
}

function setBulkDeleteMode(mode: BulkDeleteMode) {
  const target = bulkDeleteTarget.value
  if (!target || bulkDeleteBusy.value || bulkDeleteOutcome.value || mode === bulkDeleteMode.value) return
  ++bulkDeleteRequestId
  bulkDeleteMode.value = mode
  bulkPurgeScopes.value = []
  bulkPurgePreflightBusy.value = false
  void loadBulkBacklinkPreflight(target, mode)
  if (mode === 'all_versions_purge') void loadBulkPurgePreflights(target)
}

async function loadBulkPurgePreflights(target: BulkDeleteTarget) {
  const requestId = ++bulkDeleteRequestId
  const apiBase = permanentDeleteApiBase(target.nodeId)
  const scopes: BulkPurgeScopeState[] = target.keys.map((key) => ({
    key,
    operation: createStoragePurgeOperation({ kind: 'file', bucket: target.bucket, key }),
    preflight: null,
    error: null,
  }))
  bulkPurgeScopes.value = scopes
  bulkPurgePreflightBusy.value = true
  if (!apiBase) {
    bulkPurgeScopes.value = scopes.map((scope) => ({
      ...scope,
      error: 'The node API endpoint for this storage location is unavailable.',
    }))
    bulkPurgePreflightBusy.value = false
    return
  }
  const client = { baseUrl: apiBase, token: authToken.value || undefined }
  try {
    for (let offset = 0; offset < scopes.length; offset += BULK_PREFLIGHT_CONCURRENCY) {
      const batch = scopes.slice(offset, offset + BULK_PREFLIGHT_CONCURRENCY)
      const settled = await Promise.allSettled(
        batch.map((scope) => getStorageDeletionPreflight(scope.operation.scope, client)),
      )
      if (requestId !== bulkDeleteRequestId) return
      settled.forEach((result, index) => {
        const scope = batch[index]
        if (result.status === 'fulfilled') scope.preflight = result.value
        else scope.error = storageDeletionErrorMessage(result.reason)
      })
      bulkPurgeScopes.value = [...scopes]
    }
  } finally {
    if (requestId === bulkDeleteRequestId) bulkPurgePreflightBusy.value = false
  }
}

function bulkDeleteRunKeys(target: BulkDeleteTarget): string[] {
  const outcome = bulkDeleteOutcome.value
  if (!outcome) return target.keys
  const unresolved = new Set([
    ...outcome.failed.map((result) => result.key),
    ...outcome.unknown.map((result) => result.key),
  ])
  return target.keys.filter((key) => unresolved.has(key))
}

function recordBulkDeleteResults(target: BulkDeleteTarget, results: BulkDeleteKeyResult[]) {
  const retained = new Map<string, BulkDeleteKeyResult>()
  const previous = bulkDeleteOutcome.value
  for (const key of previous?.committed ?? []) retained.set(key, { key, status: 'committed' })
  for (const result of previous?.failed ?? []) {
    retained.set(result.key, { ...result, status: 'failed' })
  }
  for (const result of previous?.unknown ?? []) {
    retained.set(result.key, { ...result, status: 'unknown' })
  }
  for (const result of results) retained.set(result.key, result)
  const ordered = target.keys.flatMap((key) => retained.has(key) ? [retained.get(key)!] : [])
  bulkDeleteOutcome.value = {
    committed: ordered.flatMap((result) => result.status === 'committed' ? [result.key] : []),
    failed: ordered.flatMap((result) => result.status === 'failed'
      ? [{ key: result.key, message: result.message }]
      : []),
    unknown: ordered.flatMap((result) => result.status === 'unknown'
      ? [{ key: result.key, message: result.message }]
      : []),
  }

  const nextSelection = new Set(selectedObjectKeys.value)
  for (const result of results) {
    if (result.status === 'committed') nextSelection.delete(result.key)
  }
  selectedObjectKeys.value = nextSelection
}

function bulkDeleteFailureStatus(error: unknown): 'failed' | 'unknown' {
  if (isS3NetworkError(error)) return 'unknown'
  if (!error || typeof error !== 'object') return 'unknown'
  const response = error as {
    status?: number
    statusCode?: number
    $metadata?: { httpStatusCode?: number }
  }
  return typeof (response.$metadata?.httpStatusCode ?? response.statusCode ?? response.status) === 'number'
    ? 'failed'
    : 'unknown'
}

async function deleteSelectedOrdinary(target: BulkDeleteTarget, keys: string[]) {
  for (let offset = 0; offset < keys.length; offset += BULK_DELETE_BATCH_SIZE) {
    const batch = keys.slice(offset, offset + BULK_DELETE_BATCH_SIZE)
    const permitted = batch.map((key) => s3.canWrite(target.bucket, key, target.nodeId))
    const settled = await Promise.allSettled(
      batch.map((key, index) =>
        permitted[index] ? s3.deleteObject(target.bucket, key, target.nodeId) : Promise.resolve(),
      ),
    )
    const results = settled.map<BulkDeleteKeyResult>((result, index) => {
      const key = batch[index]
      if (!permitted[index]) {
        return {
          key,
          status: 'failed',
          message: 'This session no longer allows deleting this key.',
        }
      }
      if (result.status === 'fulfilled') return { key, status: 'committed' }
      return {
        key,
        status: bulkDeleteFailureStatus(result.reason),
        message: s3ErrorMessage(result.reason),
      }
    })
    recordBulkDeleteResults(target, results)
  }
}

async function runBulkPurgeScope(
  scope: BulkPurgeScopeState,
  apiBase: string,
  requestId: number,
): Promise<BulkDeleteKeyResult> {
  const client = { baseUrl: apiBase, token: authToken.value || undefined }
  try {
    const submission = await startStoragePurge(scope.operation, client)
    for (;;) {
      if (requestId !== bulkDeleteRequestId) {
        return {
          key: scope.key,
          status: 'unknown',
          message: 'The purge result is no longer being tracked.',
        }
      }
      const status = await getStoragePurgeJob(submission.job_id, client)
      if (status.kind !== 'storage_purge') {
        return {
          key: scope.key,
          status: 'failed',
          message: `System job ${submission.job_id} is not a storage purge.`,
        }
      }
      if (isTerminalStoragePurgeJob(status.state)) {
        if (status.state === 'succeeded') return { key: scope.key, status: 'committed' }
        return {
          key: scope.key,
          status: 'failed',
          message: status.error?.message ?? `The purge was ${status.state}.`,
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  } catch (error) {
    return {
      key: scope.key,
      status: bulkDeleteFailureStatus(error),
      message: storageDeletionErrorMessage(error),
    }
  }
}

async function deleteSelectedPermanently(
  target: BulkDeleteTarget,
  keys: string[],
  requestId: number,
) {
  const apiBase = permanentDeleteApiBase(target.nodeId)
  if (!apiBase) {
    recordBulkDeleteResults(
      target,
      keys.map((key) => ({
        key,
        status: 'failed',
        message: 'The node API endpoint for this storage location is unavailable.',
      })),
    )
    return
  }
  const scopes = new Map(bulkPurgeScopes.value.map((scope) => [scope.key, scope]))
  for (let offset = 0; offset < keys.length; offset += BULK_DELETE_BATCH_SIZE) {
    const batch = keys.slice(offset, offset + BULK_DELETE_BATCH_SIZE)
    const results = await Promise.all(
      batch.map((key) => {
        const scope = scopes.get(key)
        return scope
          ? runBulkPurgeScope(scope, apiBase, requestId)
          : Promise.resolve<BulkDeleteKeyResult>({
              key,
              status: 'failed',
              message: 'The permanent deletion preflight is unavailable for this key.',
            })
      }),
    )
    if (requestId !== bulkDeleteRequestId) return
    recordBulkDeleteResults(target, results)
  }
}

async function confirmBulkDelete() {
  const target = bulkDeleteTarget.value
  if (!target || bulkDeleteBusy.value) return
  const keys = bulkDeleteRunKeys(target)
  if (!keys.length) return
  if (bulkDeleteMode.value === 'all_versions_purge' && !bulkPurgePreflightReady.value) return
  const requestId = ++bulkDeleteRequestId
  bulkDeleteBusy.value = true
  try {
    if (bulkDeleteMode.value === 'all_versions_purge') {
      await deleteSelectedPermanently(target, keys, requestId)
    } else {
      await deleteSelectedOrdinary(target, keys)
    }
    if (requestId !== bulkDeleteRequestId) return
    const committed = new Set(bulkDeleteOutcome.value?.committed ?? [])
    if (target.bucket === bucket.value && target.nodeId === remoteNodeId.value) {
      await loadObjects()
      dropPreviewUnder((key) => committed.has(key))
    }
  } finally {
    if (requestId === bulkDeleteRequestId) bulkDeleteBusy.value = false
  }
}

onListingReset(resetBulkDeleteState)
onUnmounted(() => {
  ++bulkDeleteRequestId
})

defineExpose({ openBulkDelete })
</script>

<template>
  <Dialog :open="bulkDeleteTarget !== null" @update:open="(v: boolean) => { if (!v) closeBulkDelete() }">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>
          Delete {{ bulkDeleteTarget?.keys.length ?? 0 }} selected key{{ bulkDeleteTarget?.keys.length === 1 ? '' : 's' }}
        </DialogTitle>
        <DialogDescription v-if="bulkDeleteTarget">
          Review the exact selected objects in <span class="font-mono text-xs">{{ bulkDeleteTarget.bucket }}</span>, choose the deletion semantics, then confirm once.
        </DialogDescription>
      </DialogHeader>

      <div v-if="bulkDeleteTarget" class="space-y-3 text-xs">
        <section class="space-y-1 rounded-md border border-border px-3 py-2">
          <h4 class="font-medium text-foreground">Selected keys</h4>
          <ul class="max-h-28 space-y-1 overflow-y-auto pl-4 font-mono text-[10px] text-muted-foreground">
            <li v-for="key in bulkDeleteTarget.keys" :key="key" class="list-disc break-all">{{ key }}</li>
          </ul>
        </section>

        <fieldset class="space-y-2" :disabled="bulkDeleteBusy || bulkDeleteOutcome !== null">
          <legend class="font-medium text-foreground">Deletion semantics</legend>
          <label class="flex cursor-pointer gap-2 rounded-md border border-border px-3 py-2">
            <input
              type="radio"
              class="mt-0.5 accent-primary"
              name="bulk-delete-mode"
              value="latest_version_tombstone"
              :checked="bulkDeleteMode === 'latest_version_tombstone'"
              @change="setBulkDeleteMode('latest_version_tombstone')"
            />
            <span>
              <span class="block font-medium text-foreground">Delete markers for {{ bulkDeleteTarget.keys.length }} selected key{{ bulkDeleteTarget.keys.length === 1 ? '' : 's' }}</span>
              <span class="block text-muted-foreground">Writes a version-less delete marker for each selected key. Earlier versions stay retrievable by version ID.</span>
            </span>
          </label>
          <label class="flex cursor-pointer gap-2 rounded-md border border-border px-3 py-2">
            <input
              type="radio"
              class="mt-0.5 accent-primary"
              name="bulk-delete-mode"
              value="all_versions_purge"
              :checked="bulkDeleteMode === 'all_versions_purge'"
              @change="setBulkDeleteMode('all_versions_purge')"
            />
            <span>
              <span class="block font-medium text-foreground">Permanently purge all versions for {{ bulkDeleteTarget.keys.length }} selected key{{ bulkDeleteTarget.keys.length === 1 ? '' : 's' }}</span>
              <span class="block text-muted-foreground">Starts one fenced storage purge per selected key. Every version and delete marker in those file scopes is removed.</span>
            </span>
          </label>
        </fieldset>

        <template v-if="bulkDeleteMode === 'all_versions_purge'">
          <Spinner v-if="bulkPurgePreflightBusy" show-label label="Loading permanent deletion preflights…" />
          <section v-else class="space-y-2 rounded-md border border-border px-3 py-2">
            <h4 class="font-medium text-foreground">Preflight inventory</h4>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
              <dt>Current heads</dt>
              <dd class="text-right font-mono text-foreground">{{ bulkPurgeInventory.current_heads }}</dd>
              <dt>Noncurrent versions</dt>
              <dd class="text-right font-mono text-foreground">{{ bulkPurgeInventory.noncurrent_versions }}</dd>
              <dt>Delete markers</dt>
              <dd class="text-right font-mono text-foreground">{{ bulkPurgeInventory.delete_markers }}</dd>
              <dt>Open multipart uploads</dt>
              <dd class="text-right font-mono text-foreground">{{ bulkPurgeInventory.open_multipart_uploads }}</dd>
            </dl>
            <p v-if="!bulkPurgeInventory.complete" class="text-amber-800 dark:text-amber-300">
              One or more inventories are incomplete or unavailable. Totals may be more than shown.
            </p>
            <div v-if="bulkPurgePreflightErrors.length" class="text-destructive">
              <p class="font-medium">Preflight failures</p>
              <ul class="space-y-1 pl-4">
                <li v-for="failure in bulkPurgePreflightErrors" :key="failure.key" class="list-disc break-all">
                  <span class="font-mono">{{ failure.key }}</span>: {{ failure.message }}
                </li>
              </ul>
            </div>
            <div v-if="bulkPurgeDeniedKeys.length" class="text-destructive">
              <p class="font-medium">Permanent purge is not allowed for these keys</p>
              <ul class="space-y-1 pl-4 font-mono text-[10px]">
                <li v-for="key in bulkPurgeDeniedKeys" :key="key" class="list-disc break-all">{{ key }}</li>
              </ul>
            </div>
          </section>
        </template>

        <DatasetReferencesPreflightPanel
          :preflight="backlinkPreflight"
          :busy="backlinkPreflightBusy"
          :error="backlinkPreflightError"
          selection
        />

        <section v-if="bulkDeleteOutcome" class="space-y-2 rounded-md border border-border px-3 py-2">
          <h4 class="font-medium text-foreground">Deletion outcome</h4>
          <p class="font-medium">
            Committed: {{ bulkDeleteOutcome.committed.length }}. Failed: {{ bulkDeleteOutcome.failed.length }}. Unknown: {{ bulkDeleteOutcome.unknown.length }}.
          </p>
          <div v-if="bulkDeleteOutcome.committed.length" class="space-y-1">
            <p class="font-medium text-emerald-700 dark:text-emerald-300">Committed keys</p>
            <ul class="space-y-1 pl-4 font-mono text-[10px] text-muted-foreground">
              <li v-for="key in bulkDeleteOutcome.committed" :key="key" class="list-disc break-all">{{ key }}</li>
            </ul>
            <p class="text-muted-foreground">Only these confirmed-successful keys were cleared from the selection.</p>
          </div>
          <div v-if="bulkDeleteOutcome.failed.length" class="space-y-1 text-destructive">
            <p class="font-medium">Failed keys</p>
            <ul class="space-y-1 pl-4">
              <li v-for="failure in bulkDeleteOutcome.failed" :key="failure.key" class="list-disc break-all">
                <span class="font-mono text-[10px]">{{ failure.key }}</span>: {{ failure.message }}
              </li>
            </ul>
            <p>Failed keys stay selected for review or retry.</p>
          </div>
          <div v-if="bulkDeleteOutcome.unknown.length" class="space-y-1 text-amber-800 dark:text-amber-300">
            <p class="font-medium">Unknown keys</p>
            <ul class="space-y-1 pl-4">
              <li v-for="failure in bulkDeleteOutcome.unknown" :key="failure.key" class="list-disc break-all">
                <span class="font-mono text-[10px]">{{ failure.key }}</span>: {{ failure.message }}
              </li>
            </ul>
            <p>The transport returned no definitive result. Unknown keys stay selected for review or retry.</p>
          </div>
        </section>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="bulkDeleteBusy" @click="closeBulkDelete">
          {{ bulkDeleteOutcome && bulkDeleteUnresolvedCount === 0 ? 'Close' : 'Cancel' }}
        </Button>
        <Button
          v-if="!bulkDeleteOutcome || bulkDeleteUnresolvedCount > 0"
          variant="destructive"
          :disabled="bulkDeleteBusy || (bulkDeleteMode === 'all_versions_purge' && (bulkPurgePreflightBusy || !bulkPurgePreflightReady))"
          @click="confirmBulkDelete"
        >
          {{ bulkDeleteBusy ? (bulkDeleteMode === 'all_versions_purge' ? 'Purging selected keys…' : 'Deleting selected keys…') : bulkDeleteActionLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
