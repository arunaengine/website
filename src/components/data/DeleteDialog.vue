<script setup lang="ts">
// The one delete dialog. It names the target, asks lib/deletion/options which
// outcomes apply, shows what each one touches, and performs exactly the call
// the chosen outcome names. Nothing else in the Data views deletes.
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import DeletionImpact from '@/components/data/deletion/DeletionImpact.vue'
import DeletionOutcome from '@/components/data/deletion/DeletionOutcome.vue'
import PurgeProgress from '@/components/data/deletion/PurgeProgress.vue'
import VersionPicker from '@/components/data/deletion/VersionPicker.vue'
import { useDeletionPreflight } from '@/components/data/deletion/useDeletionPreflight'
import { usePurgeJob } from '@/components/data/deletion/usePurgeJob'
import {
  prefixDeleteFailure,
  useSelectionDelete,
} from '@/components/data/deletion/useSelectionDelete'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useStagingReferences } from '@/composables/useStagingReferences'
import { s3ErrorMessage, useS3 } from '@/composables/useS3'
import { deletionOptions, type DeletionOption } from '@/lib/deletion/options'
import {
  requestLabel,
  requestName,
  requestNoun,
  requestScope,
  selectionIds,
  type DeleteRequest,
  type DeletionResult,
} from '@/lib/deletion/request'
import {
  createStoragePurgeOperation,
  getStorageDeletionPreflight,
  isStorageDeletionNotFound,
  storageDeletionErrorMessage,
  type StorageDeletionPreflight,
} from '@/lib/storageDeletion'
import { versionStateLabel, type ObjectVersionEntry } from '@/lib/objectVersions'
import { formatBytes, relativeTime } from '@/lib/utils'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ request: DeleteRequest | null; syncApplies?: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'completed', result: DeletionResult): void
}>()

const s3 = useS3()
const { authToken } = useAruna()
const realmNodes = useRealmNodes()
const preflightState = useDeletionPreflight()
const purge = usePurgeJob()
const selection = useSelectionDelete()

const preflight = ref<StorageDeletionPreflight | null>(null)
const preflightBusy = ref(false)
const remaining = ref<StorageDeletionPreflight | null>(null)
const remainingBusy = ref(false)
const remainingMissing = ref(false)
const remainingError = ref<string | null>(null)
const selectedId = ref<string | null>(null)
const typedName = ref('')
const busy = ref(false)
const finished = ref(false)
const error = ref<string | null>(null)
const pickedVersion = ref<ObjectVersionEntry | null>(null)
let requestId = 0

const request = computed(() => props.request)
const scope = computed(() => (request.value ? requestScope(request.value) : null))
const keys = computed(() => request.value?.keys ?? [])
const prefixes = computed(() => request.value?.prefixes ?? [])
// Objects first, then folder prefixes: one id list for the whole selection.
const ids = computed(() => (request.value ? selectionIds(request.value) : []))
const isSelection = computed(() => request.value?.kind === 'selection')

const sourceBucket = computed(() => request.value?.bucket ?? '')
const sourceEnabled = computed(() => Boolean(request.value) && request.value?.nodeId === null)
const sourceReferences = useStagingReferences(sourceBucket, sourceEnabled)
const sourceCount = computed(() => {
  const current = request.value
  if (!current) return 0
  return sourceReferences.entries.value.filter((entry) => {
    if (!entry.referenced) return false
    if (current.kind === 'folder') return entry.key.startsWith(current.key ?? '')
    if (current.kind === 'selection') {
      return (
        keys.value.includes(entry.key) ||
        prefixes.value.some((prefix) => entry.key.startsWith(prefix))
      )
    }
    if (current.kind === 'bucket') return true
    return entry.key === current.key
  }).length
})

const canWrite = computed(() => {
  const current = request.value
  if (!current) return false
  if (current.kind === 'folder') return s3.canDeletePrefix(current.bucket, current.key ?? '', current.nodeId)
  if (current.kind === 'bucket') return s3.canDeletePrefix(current.bucket, '', current.nodeId)
  if (current.kind === 'selection') {
    return (
      keys.value.every((key) => s3.canWrite(current.bucket, key, current.nodeId)) &&
      prefixes.value.every((prefix) => s3.canDeletePrefix(current.bucket, prefix, current.nodeId))
    )
  }
  return s3.canWrite(current.bucket, current.key ?? '', current.nodeId)
})

const canPurge = computed<boolean | null>(() => {
  if (isSelection.value) {
    if (selectedId.value !== 'delete-permanently') return null
    if (selection.scopesBusy.value || !selection.scopes.value.length) return null
    return selection.purgeReady(ids.value)
  }
  if (preflightBusy.value) return null
  return preflight.value ? preflight.value.permissions.purge : null
})

const counts = computed(() =>
  preflight.value
    ? {
        currentHeads: preflight.value.counts.current_heads,
        noncurrentVersions: preflight.value.counts.noncurrent_versions,
        deleteMarkers: preflight.value.counts.delete_markers,
        openMultipartUploads: preflight.value.counts.open_multipart_uploads,
        complete: preflight.value.counts.complete,
      }
    : null,
)

const options = computed<DeletionOption[]>(() => {
  const current = request.value
  if (!current) return []
  return deletionOptions({
    kind: current.kind,
    headState: current.headState,
    isCurrent: current.isCurrent,
    bytes: current.bytes,
    counts: counts.value,
    permissions: { canWrite: canWrite.value, canPurge: canPurge.value },
    remote: current.nodeId !== null,
    selectionCount: ids.value.length,
  })
})

const selected = computed(
  () => options.value.find((option) => option.id === selectedId.value) ?? options.value[0] ?? null,
)

const nodeName = computed(() =>
  request.value?.nodeId ? realmNodes.displayName(request.value.nodeId) : 'this node',
)
// The heading follows the chosen outcome: not every outcome is a delete.
const title = computed(() => {
  const current = request.value
  if (!current) return 'Delete'
  if (selected.value?.id === 'make-current') return 'Make this version current'
  if (selected.value?.id === 'restore') return 'Restore this object'
  return `Delete ${requestNoun(current)}`
})
const typedTarget = computed(() => (request.value ? requestName(request.value) : ''))
const typedOk = computed(
  () => selected.value?.tier !== 'typed-name' || typedName.value.trim() === typedTarget.value,
)
const quotaNote = computed(() => {
  if (!selected.value || selected.value.irreversible || selected.value.id !== 'delete') return null
  const bytes = request.value?.bytes
  return bytes === undefined
    ? 'A delete marker frees no storage: the data keeps using your quota until it is deleted permanently.'
    : `A delete marker frees no storage: this keeps using ${formatBytes(bytes)} of your quota until it is deleted permanently.`
})
// A whole file names no version, so this outcome asks for one before it runs.
const picksVersion = computed(
  () => selected.value?.id === 'delete-version' && !request.value?.versionId,
)
const targetVersionId = computed(
  () => request.value?.versionId ?? (picksVersion.value ? pickedVersion.value?.versionId : null) ?? null,
)
const versionDetails = computed(() => {
  const current = request.value
  if (!current) return []
  if (current.kind === 'version' || current.kind === 'marker') {
    return [
      { label: 'Version', value: current.versionId ?? '' },
      {
        label: 'State',
        value:
          current.kind === 'marker' ? 'Delete marker' : current.isCurrent ? 'Current' : 'Older',
      },
      ...(current.bytes === undefined ? [] : [{ label: 'Size', value: formatBytes(current.bytes) }]),
    ]
  }
  const picked = picksVersion.value ? pickedVersion.value : null
  if (!picked) return []
  return [
    { label: 'Version', value: picked.versionId },
    { label: 'State', value: versionStateLabel(picked) },
    ...(picked.size === undefined ? [] : [{ label: 'Size', value: formatBytes(picked.size) }]),
    ...(picked.lastModified
      ? [{ label: 'Written', value: relativeTime(picked.lastModified.toISOString()) }]
      : []),
  ]
})
// What removing exactly this version does to the head pointer.
const versionConsequence = computed(() => {
  const current = request.value
  if (!current || selected.value?.id !== 'delete-version') return null
  const picked = picksVersion.value ? pickedVersion.value : null
  if (picksVersion.value && !picked) return null
  const marker = picked ? picked.deleteMarker : current.kind === 'marker'
  const head = picked ? picked.isLatest : Boolean(current.isCurrent)
  if (marker && head) {
    return 'This is the delete marker: removing it makes the version below it current again, so the file is listed once more.'
  }
  if (head) return 'This is the current version: removing it makes the previous version current.'
  return 'This is an older version: the current version stays as it is.'
})

function apiClient() {
  const base = preflightState.permanentDeleteApiBase(request.value?.nodeId ?? null)
  return base ? { baseUrl: base, token: authToken.value || undefined } : null
}

function reset() {
  ++requestId
  preflight.value = null
  preflightBusy.value = false
  remaining.value = null
  remainingBusy.value = false
  remainingMissing.value = false
  remainingError.value = null
  selectedId.value = null
  typedName.value = ''
  pickedVersion.value = null
  busy.value = false
  finished.value = false
  error.value = null
  purge.reset()
  selection.reset()
  preflightState.resetBacklinkPreflightState()
}

function close() {
  if (busy.value) return
  reset()
  emit('close')
}

async function loadPreflight() {
  const target = scope.value
  const client = apiClient()
  // A remote node's API is not reachable from here; the options say so.
  if (!target || !client) return
  const id = requestId
  preflightBusy.value = true
  try {
    const response = await getStorageDeletionPreflight(target, client)
    if (id !== requestId) return
    preflight.value = response
  } catch (caught) {
    if (id !== requestId) return
    error.value = storageDeletionErrorMessage(caught)
  } finally {
    if (id === requestId) preflightBusy.value = false
  }
}

function loadBacklinks(operation: 'latest_version_tombstone' | 'all_versions_purge') {
  const current = request.value
  if (!current) return
  if (current.kind === 'selection') {
    void preflightState.loadBulkBacklinkPreflight(
      {
        bucket: current.bucket,
        nodeId: current.nodeId,
        keys: keys.value,
        prefixes: prefixes.value,
      },
      operation,
    )
    return
  }
  const target = scope.value
  if (target) void preflightState.loadBacklinkPreflight(target, operation, current.nodeId)
}

watch(
  request,
  (current) => {
    reset()
    if (!current) return
    selectedId.value = current.option ?? null
    void loadPreflight()
  },
  { immediate: true },
)

// One stable key per target and chosen outcome: the reference question follows
// the outcome, and a selection purge needs its per-key preflights first.
const outcomeKey = computed(() => {
  const current = request.value
  if (!current) return ''
  return [
    current.kind,
    current.bucket,
    current.key ?? '',
    current.versionId ?? '',
    ids.value.length,
    selected.value?.id ?? '',
  ].join('\n')
})

watch(
  outcomeKey,
  (key) => {
    const current = request.value
    const id = selected.value?.id
    if (!key || !current || !id || finished.value) return
    loadBacklinks(
      id === 'delete-permanently' || id === 'delete-bucket'
        ? 'all_versions_purge'
        : 'latest_version_tombstone',
    )
    if (id === 'delete-permanently' && isSelection.value) {
      void selection.loadScopes(
        current.bucket,
        { keys: keys.value, prefixes: prefixes.value },
        apiClient(),
      )
    }
  },
  { immediate: true },
)

async function refreshRemaining(client: ReturnType<typeof apiClient>) {
  const target = scope.value
  if (!target || !client) return
  const id = requestId
  remainingBusy.value = true
  remaining.value = null
  remainingMissing.value = false
  remainingError.value = null
  try {
    const response = await getStorageDeletionPreflight(target, client)
    if (id !== requestId) return
    remaining.value = response
  } catch (caught) {
    if (id !== requestId) return
    if (isStorageDeletionNotFound(caught)) remainingMissing.value = true
    else remainingError.value = storageDeletionErrorMessage(caught)
  } finally {
    if (id === requestId) remainingBusy.value = false
  }
}

async function runPurge(current: DeleteRequest): Promise<string[]> {
  const client = apiClient()
  if (!client) throw new Error('The node API endpoint for this storage location is unavailable.')
  if (current.kind === 'selection') {
    const pending = selection.pendingKeys(ids.value)
    await selection.purgeKeys(pending, client, ids.value)
    return selection.outcome.value?.committed ?? []
  }
  const target = scope.value
  if (!target) throw new Error('This target has no permanent deletion scope.')
  const status = await purge.run(createStoragePurgeOperation(target), client)
  await refreshRemaining(client)
  if (status?.state === 'failed') throw new Error(status.error?.message ?? 'The deletion failed.')
  if (status?.state === 'cancelled') throw new Error('The deletion was cancelled.')
  return current.key ? [current.key] : []
}

async function runOption(current: DeleteRequest, option: DeletionOption): Promise<string[]> {
  switch (option.call.operation) {
    case 'write-marker':
      await s3.deleteObject(current.bucket, current.key ?? '', current.nodeId)
      return [current.key ?? '']
    case 'write-markers': {
      if (current.kind === 'selection') {
        const all = ids.value
        const pending = new Set(selection.pendingKeys(all))
        await selection.deleteMarkers(
          current.bucket,
          current.nodeId,
          keys.value.filter((key) => pending.has(key)),
          all,
        )
        await selection.deletePrefixes(
          current.bucket,
          current.nodeId,
          prefixes.value.filter((prefix) => pending.has(prefix)),
          all,
        )
        return selection.outcome.value?.committed ?? []
      }
      const failure = prefixDeleteFailure(
        await s3.deletePrefix(current.bucket, current.key ?? '', current.nodeId),
      )
      if (failure) throw new Error(failure)
      return [current.key ?? '']
    }
    case 'delete-version':
      await s3.deleteObjectVersion(
        current.bucket,
        current.key ?? '',
        targetVersionId.value ?? '',
        current.nodeId,
      )
      return [current.key ?? '']
    case 'copy-version':
      await s3.copyObjectVersion(current.bucket, current.key ?? '', current.versionId ?? '', current.nodeId)
      return [current.key ?? '']
    case 'purge':
      return runPurge(current)
    case 'delete-bucket':
      await s3.deleteBucket(current.bucket, current.nodeId)
      return [current.bucket]
  }
}

// A purge and a selection keep their result on screen; everything else closes
// as soon as it succeeded.
const staysOpen = computed(() => isSelection.value || selected.value?.call.operation === 'purge')
const unresolved = computed(() => {
  const result = selection.outcome.value
  return result ? result.failed.length + result.unknown.length : 0
})
const retrying = computed(() => finished.value || Boolean(error.value))
const showConfirm = computed(
  () => Boolean(selected.value) && (!finished.value || unresolved.value > 0 || Boolean(error.value)),
)

// Every outcome that removes one version needs to know which one.
const confirmBlocked = computed(
  () =>
    Boolean(selected.value?.disabledReason)
    || !typedOk.value
    || (selected.value?.call.operation === 'delete-version' && !targetVersionId.value),
)

async function confirm() {
  const current = request.value
  const option = selected.value
  if (!current || !option || confirmBlocked.value || busy.value) return
  busy.value = true
  error.value = null
  const id = requestId
  try {
    const committed = await runOption(current, option)
    if (id !== requestId) return
    emit('completed', { request: current, option, committed })
    if (staysOpen.value) finished.value = true
    else {
      // close() refuses to act while the dialog is busy, and this is the
      // success path: a second click would write a second deletion.
      busy.value = false
      close()
    }
  } catch (caught) {
    if (id !== requestId) return
    error.value = s3ErrorMessage(caught)
    emit('completed', { request: current, option, committed: selection.outcome.value?.committed ?? [] })
  } finally {
    if (id === requestId) busy.value = false
  }
}

onUnmounted(() => {
  ++requestId
  preflightState.resetBacklinkPreflightState()
})
</script>

<template>
  <Dialog :open="request !== null" @update:open="(v: boolean) => { if (!v) close() }">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="request">
          <span class="break-all font-mono text-xs">{{ request.bucket }}<template v-if="request.kind !== 'bucket'">/{{ requestLabel(request) }}</template></span>
          on {{ nodeName }}.
        </DialogDescription>
      </DialogHeader>

      <div v-if="request" class="scrollbar-thin max-h-[60dvh] space-y-3 overflow-y-auto text-xs">
        <dl v-if="versionDetails.length" class="space-y-1 rounded-md border border-border px-3 py-2">
          <div v-for="detail in versionDetails" :key="detail.label" class="flex items-baseline justify-between gap-3">
            <dt class="text-muted-foreground">{{ detail.label }}</dt>
            <dd class="break-all font-mono text-foreground">{{ detail.value }}</dd>
          </div>
        </dl>

        <ul v-if="request.kind === 'selection'" class="space-y-1 rounded-md border border-border px-3 py-2">
          <li class="font-medium text-foreground">Selected files and folders</li>
          <li class="max-h-28 overflow-y-auto">
            <ul class="space-y-1 pl-4 font-mono text-[10px] text-muted-foreground">
              <li v-for="id in ids" :key="id" class="list-disc break-all">{{ id }}</li>
            </ul>
          </li>
        </ul>

        <fieldset class="space-y-2" :disabled="busy || finished">
          <legend class="font-medium text-foreground">What should happen</legend>
          <label
            v-for="option in options"
            :key="option.id"
            class="flex cursor-pointer gap-2 rounded-md border px-3 py-2"
            :class="option.disabledReason ? 'border-border bg-muted/30' : 'border-border'"
          >
            <input
              type="radio"
              class="mt-0.5 accent-primary"
              name="deletion-outcome"
              :value="option.id"
              :checked="selected?.id === option.id"
              @change="selectedId = option.id"
            />
            <span class="min-w-0">
              <span class="block font-medium text-foreground">{{ option.label }}</span>
              <span class="block text-muted-foreground">{{ option.description }}</span>
              <span v-if="option.disabledReason" class="mt-0.5 block text-destructive">{{ option.disabledReason }}</span>
            </span>
          </label>
        </fieldset>

        <VersionPicker
          v-if="picksVersion && request.key"
          :bucket="request.bucket"
          :object-key="request.key"
          :node-id="request.nodeId"
          :selected="targetVersionId"
          :disabled="busy || finished"
          @select="(entry) => (pickedVersion = entry)"
        />
        <p v-if="versionConsequence" class="text-muted-foreground">{{ versionConsequence }}</p>

        <DeletionImpact
          :preflight="preflight"
          :preflight-busy="preflightBusy"
          :show-sync-removal="request.kind === 'bucket'"
          :quota-note="quotaNote"
          :sync-applies="Boolean(props.syncApplies)"
          :source-status="sourceReferences.status.value"
          :source-error="sourceReferences.error.value"
          :source-count="sourceCount"
          :backlink-preflight="preflightState.backlinkPreflight.value"
          :backlink-busy="preflightState.backlinkPreflightBusy.value"
          :backlink-error="preflightState.backlinkPreflightError.value"
          :selection="request.kind === 'selection'"
        />

        <section v-if="request.kind === 'selection' && selected?.id === 'delete-permanently'" class="space-y-1 rounded-md border border-border px-3 py-2">
          <h4 class="font-medium text-foreground">Per-entry inventory</h4>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <dt>Current heads</dt>
            <dd class="text-right font-mono text-foreground">{{ selection.inventory.value.current_heads }}</dd>
            <dt>Noncurrent versions</dt>
            <dd class="text-right font-mono text-foreground">{{ selection.inventory.value.noncurrent_versions }}</dd>
            <dt>Delete markers</dt>
            <dd class="text-right font-mono text-foreground">{{ selection.inventory.value.delete_markers }}</dd>
            <dt>Open multipart uploads</dt>
            <dd class="text-right font-mono text-foreground">{{ selection.inventory.value.open_multipart_uploads }}</dd>
          </dl>
          <p v-if="!selection.inventory.value.complete" class="text-amber-800 dark:text-amber-300">
            One or more inventories are incomplete or unavailable. Totals may be more than shown.
          </p>
          <div v-if="selection.deniedKeys.value.length" class="text-destructive">
            <p class="font-medium">Permanent deletion is not allowed for these entries</p>
            <ul class="space-y-1 pl-4 font-mono text-[10px]">
              <li v-for="key in selection.deniedKeys.value" :key="key" class="list-disc break-all">{{ key }}</li>
            </ul>
          </div>
          <div v-if="selection.scopeErrors.value.length" class="text-destructive">
            <p class="font-medium">Preflight failures</p>
            <ul class="space-y-1 pl-4">
              <li v-for="failure in selection.scopeErrors.value" :key="failure.key" class="list-disc break-all">
                <span class="font-mono">{{ failure.key }}</span>: {{ failure.message }}
              </li>
            </ul>
          </div>
        </section>

        <PurgeProgress
          :submission="purge.submission.value"
          :status="purge.status.value"
          :progress="purge.progress.value"
          :remaining="remaining"
          :remaining-busy="remainingBusy"
          :remaining-missing="remainingMissing"
          :remaining-error="remainingError"
        />

        <DeletionOutcome v-if="selection.outcome.value" :outcome="selection.outcome.value" />

        <div v-if="selected?.tier === 'typed-name'" class="space-y-1">
          <label class="block font-medium text-foreground" for="deletion-typed-name">
            Type <span class="font-mono">{{ typedTarget }}</span> to confirm
          </label>
          <Input
            id="deletion-typed-name"
            v-model="typedName"
            class="font-mono text-xs"
            :placeholder="typedTarget"
            autocomplete="off"
          />
          <p v-if="!typedOk" class="text-muted-foreground">
            The confirm button stays disabled until the name matches exactly.
          </p>
        </div>
      </div>

      <!-- The sentence is the headline; the node's own wording follows it. -->
      <RefusalNote v-if="error" :message="error" />

      <DialogFooter>
        <Button variant="outline" :disabled="busy" @click="close">{{ finished ? 'Close' : 'Cancel' }}</Button>
        <Button
          v-if="showConfirm && selected"
          variant="destructive"
          :disabled="busy || confirmBlocked"
          @click="confirm"
        >
          {{ busy ? 'Working…' : retrying ? 'Try again' : selected.label }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
