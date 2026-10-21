<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Notice from '@/components/ui/Notice.vue'
import Popover from '@/components/ui/Popover.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import ObjectListBar from '@/components/data/manager/ObjectListBar.vue'
import RowMenu from '@/components/data/manager/RowMenu.vue'
import TransferDialog from '@/components/data/manager/TransferDialog.vue'
import WatchButton from '@/components/watches/WatchButton.vue'
import KeyedReadNotice from '@/components/storage/KeyedReadNotice.vue'
import { useAruna } from '@/composables/useAruna'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { useBrokenFiles } from '@/composables/useBrokenFiles'
import { useLockedBucket } from '@/composables/useLockedBucket'
import { useProviderBucket } from '@/composables/useProviderBucket'
import type { DataManager } from '@/composables/useDataManager'
import {
  useS3,
  type DeletedObjectEntry,
  type FolderEntry,
  type ObjectEntry,
} from '@/composables/useS3'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { PAGE_SIZES } from '@/composables/useListPages'
import type { PublicTarget } from '@/lib/publicAccess'
import { featureEnabled } from '@/lib/config'
import { isNotebookKey } from '@/lib/notebook/document'
import { collectDropFiles } from '@/lib/upload/dropEntries'
import { stateVariant } from '@/lib/stateBadge'
import { fileRows, type RowAction, type SelectionAction } from '@/lib/objectListing'
import type { TransferMode, TransferSource } from '@/lib/objectMove'
import { formatBytes, relativeTime } from '@/lib/utils'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Download,
  Eye,
  FolderPlus,
  Globe,
  KeyRound,
  Link2,
  Lock,
  NotebookPen,
  Plus,
  Settings,
  Trash2,
  Undo2,
} from '@lucide/vue'

const props = defineProps<{ manager: DataManager; notebooks?: boolean }>()
const emit = defineEmits<{
  (e: 'add-data'): void
  (e: 'new-folder'): void
  (e: 'new-notebook'): void
  (e: 'sync-to-node'): void
  (e: 'public-access', targets: PublicTarget[]): void
}>()

const s3 = useS3()
const { isRealmAdmin } = useAruna()
const { getBucketPlacement } = usePlacementPolicies()
const { shown } = usePortalFeatures()
const placementPoliciesEnabled = featureEnabled('placementAdmin')
const {
  router,
  bucket,
  prefix,
  selectedGroupId,
  s3Prefix,
  remoteNodeId,
  realmNodes,
  references,
  referenceStats,
  showReferenceStats,
  referenceGroupLabel,
  referencedFrom,
  prefixReferenceSummary,
  activeGroupId,
  contextFingerprint,
  folders,
  objects,
  visibleFolders,
  visibleObjects,
  nameFilter,
  nextToken,
  page,
  pageSize,
  nextPage,
  previousPage,
  setPageSize,
  listLoading,
  listError,
  listAuthError,
  isEmpty,
  loadObjects,
  navigateTo,
  openFolder,
  openDetails,
  download,
  keyIsSynced,
  bucketSyncCount,
  showSyncButton,
  selectedObjectKeys,
  selectedPrefixes,
  selectedCount,
  selectableListedCount,
  allListedSelected,
  someListedSelected,
  setObjectSelected,
  setFolderSelected,
  setAllListedSelected,
  canWriteCurrentPrefix,
  writeRestrictionMessage,
  watchPathPrefix,
  remoteBlocked,
  remoteEndpointMissing,
  retrySpinning,
  onRetryObjects,
  requestUpload,
  showDeleted,
  deletedRows,
  loadDeleted,
  deletedLoading,
  deletedTruncated,
  deletedError,
  restoringKey,
  restoreObject,
  requestDelete,
  publicAccess,
} = props.manager

const locked = useLockedBucket(bucket, remoteNodeId, activeGroupId, download)
const { reasonOf: brokenReason } = useBrokenFiles(bucket, remoteNodeId, objects)
const providerBucket = useProviderBucket(bucket, activeGroupId, remoteNodeId)
const { lockedOnNode, availableToYou } = locked
// A read waiting in another folder ends with the folder.
watch(prefix, () => locked.cancel())

// The ticked files and folders, or the open folder when nothing is ticked.
function publicTargets(): PublicTarget[] {
  const picked: PublicTarget[] = [
    ...[...selectedPrefixes.value].map<PublicTarget>((key) => ({ kind: 'folder', bucket: bucket.value, key })),
    ...[...selectedObjectKeys.value].map<PublicTarget>((key) => ({ kind: 'file', bucket: bucket.value, key })),
  ]
  if (picked.length) return picked
  return [
    s3Prefix.value
      ? { kind: 'folder', bucket: bucket.value, key: s3Prefix.value }
      : { kind: 'bucket', bucket: bucket.value, key: '' },
  ]
}

function filePublic(key: string): boolean {
  return publicAccess.isPublic(remoteNodeId.value, { kind: 'file', bucket: bucket.value, key })
}

function folderPublic(prefix: string): boolean {
  return publicAccess.isPublic(remoteNodeId.value, { kind: 'folder', bucket: bucket.value, key: prefix })
}

// With the notebooks flag a notebook row stands out and opens the notebook
// itself; everything else keeps the ordinary file details.
function isNotebook(object: ObjectEntry): boolean {
  return Boolean(props.notebooks) && isNotebookKey(object.key)
}
function openObject(object: ObjectEntry) {
  if (!isNotebook(object)) {
    openDetails(object)
    return
  }
  void router.push({
    name: 'notebook',
    params: { bucketId: bucket.value, key: object.key },
    query: { group: selectedGroupId.value },
  })
}

// One entry for everything this bucket stores: its settings page. The dot says
// the bucket carries syncs or placement policies, which only a viewer the node
// lets read bucket placement pays a request for.
const showStorageButton = computed(() => Boolean(bucket.value))
const bucketPolicyCount = ref(0)
const storageCount = computed(() => bucketSyncCount.value + bucketPolicyCount.value)
const storageLink = computed(() => ({
  name: 'bucket-storage',
  params: { bucketId: bucket.value },
  query: {
    ...(remoteNodeId.value ? { node: remoteNodeId.value } : {}),
    ...(activeGroupId.value ? { group: activeGroupId.value } : {}),
  },
}))

// Only a viewer the node lets read bucket placement pays for this request.
watch(
  [bucket, remoteNodeId, isRealmAdmin],
  async () => {
    bucketPolicyCount.value = 0
    if (!bucket.value || remoteNodeId.value || !placementPoliciesEnabled || !isRealmAdmin.value) return
    const placement = await getBucketPlacement(bucket.value).catch(() => null)
    if (placement && placement.bucket === bucket.value) bucketPolicyCount.value = placement.policies.length
  },
  { immediate: true },
)

function openBucketSettings() {
  void router.push(storageLink.value)
}

const dragActive = ref(false)
const PAGE_SIZE_OPTIONS = PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))

function objectReason(key: string): string | null {
  return s3.canWrite(bucket.value, key, remoteNodeId.value)
    ? null
    : 'This session cannot delete this object.'
}

function folderReason(folderPrefix: string): string | null {
  return s3.canDeletePrefix(bucket.value, folderPrefix, remoteNodeId.value)
    ? null
    : 'This session cannot delete this entire folder.'
}

function deleteObject(object: ObjectEntry, permanent = false) {
  requestDelete({
    ...(permanent ? { option: 'delete-permanently' as const } : {}),
    kind: 'object',
    bucket: bucket.value,
    nodeId: remoteNodeId.value,
    key: object.key,
    headState: 'live',
    bytes: object.size,
  })
}

function deleteFolder(folder: FolderEntry, permanent = false) {
  requestDelete({
    ...(permanent ? { option: 'delete-permanently' as const } : {}),
    kind: 'folder',
    bucket: bucket.value,
    nodeId: remoteNodeId.value,
    key: folder.prefix,
  })
}

function deleteSelection() {
  requestDelete({
    kind: 'selection',
    bucket: bucket.value,
    nodeId: remoteNodeId.value,
    keys: [...selectedObjectKeys.value],
    prefixes: [...selectedPrefixes.value],
  })
}

const transferOpen = ref(false)
const transferMode = ref<TransferMode>('copy')
const transferSources = ref<TransferSource[]>([])

function openTransfer(mode: TransferMode, sources: TransferSource[]) {
  transferMode.value = mode
  transferSources.value = sources
  transferOpen.value = true
}

function selectedSources(): TransferSource[] {
  return [
    ...[...selectedPrefixes.value].map((key) => ({ key, folder: true })),
    ...[...selectedObjectKeys.value].map((key) => ({ key, folder: false })),
  ]
}

function onTransferDone(moved: string[]) {
  // A retry after a partial move only tries what is still in its old place.
  transferSources.value = transferSources.value.filter((source) => !moved.includes(source.key))
  for (const key of moved) {
    if (key.endsWith('/')) setFolderSelected(key, false)
    else setObjectSelected(key, false)
  }
  void loadObjects()
  void loadDeleted()
}

// One file after another: a locked bucket reads them through one keyed reader.
// Another bucket, node or session ends the batch; its rows belong to the old one.
let downloadBatch = 0
watch([bucket, remoteNodeId, contextFingerprint], () => ++downloadBatch)
onBeforeUnmount(() => ++downloadBatch)

async function downloadSelected() {
  const batch = ++downloadBatch
  const picked = visibleObjects.value.filter((object) => selectedObjectKeys.value.has(object.key))
  for (const object of picked) {
    if (batch !== downloadBatch) return
    await locked.download(object)
  }
}

function onBarAction(action: SelectionAction) {
  if (action === 'download') void downloadSelected()
  else if (action === 'access') emit('public-access', publicTargets())
  else if (action === 'delete') deleteSelection()
  else openTransfer(action, selectedSources())
}

function onObjectAction(object: ObjectEntry, action: RowAction) {
  const key = object.key
  if (action === 'details') openDetails(object)
  else if (action === 'download') void locked.download(object)
  else if (action === 'access') emit('public-access', [{ kind: 'file', bucket: bucket.value, key }])
  else if (action === 'delete' || action === 'purge') deleteObject(object, action === 'purge')
  else if (action !== 'open') openTransfer(action, [{ key, folder: false }])
}

function onFolderAction(folder: FolderEntry, action: RowAction) {
  const key = folder.prefix
  if (action === 'open') openFolder(folder)
  else if (action === 'details') openDetails({ key, name: `${folder.name}/` })
  else if (action === 'access') emit('public-access', [{ kind: 'folder', bucket: bucket.value, key }])
  else if (action === 'delete' || action === 'purge') deleteFolder(folder, action === 'purge')
  else if (action !== 'download') openTransfer(action, [{ key, folder: true }])
}

// The marker version travels with the request: choosing Restore in the dialog
// deletes exactly that marker.
function deleteRestorable(entry: DeletedObjectEntry) {
  requestDelete({
    kind: 'deleted-object',
    bucket: bucket.value,
    nodeId: remoteNodeId.value,
    key: entry.key,
    versionId: entry.markerVersionId,
    headState: 'marker',
    option: 'delete-permanently',
  })
}

async function onDrop(event: DragEvent) {
  dragActive.value = false
  if (!canWriteCurrentPrefix.value || !bucket.value) return
  const files = await collectDropFiles(event.dataTransfer)
  if (files.length) void requestUpload(files)
}
</script>

<template>
  <div class="min-w-0 space-y-4">
    <EmptyState v-if="!bucket" title="Select a bucket to browse its objects." />

    <template v-else>
      <div class="flex flex-nowrap items-center justify-between gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <Breadcrumbs :bucket="bucket" :path="prefix" single-line @navigate="navigateTo" />
          <Badge v-if="lockedOnNode" :variant="stateVariant('locked')" size="sm" class="shrink-0">
            <Lock class="mr-0.5 h-3 w-3" aria-hidden="true" /> Locked on the node
          </Badge>
          <Badge v-if="availableToYou" variant="success" size="sm" class="shrink-0">Available to you</Badge>
          <span v-if="providerBucket" class="min-w-0 truncate text-xs text-muted-foreground">
            Stored in provider bucket <span class="font-mono text-foreground">{{ providerBucket }}</span>
          </span>
          <Spinner v-if="listLoading" label="Loading objects" class="shrink-0" />
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <WatchButton
            surface="bucket"
            :path-prefix="watchPathPrefix"
            :group-id="activeGroupId"
            :resource-label="`${bucket}/${s3Prefix}`"
            bell
          />
          <!-- A dot instead of a count: the settings page names what it holds. -->
          <span v-if="showStorageButton" data-tour="bucket-settings" class="relative inline-flex">
            <IconButton
              label="Bucket settings"
              variant="outline"
              size="icon"
              class="h-8 w-8"
              @click="openBucketSettings"
            >
              <Settings class="h-4 w-4" />
            </IconButton>
            <span
              v-if="storageCount"
              class="pointer-events-none absolute right-1 top-1 size-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
          </span>
          <Popover v-if="showReferenceStats">
            <Button
              variant="outline"
              size="sm"
              :title="`${referenceStats.count} referenced object${referenceStats.count === 1 ? '' : 's'} · ${formatBytes(referenceStats.bytes)}, open per-source breakdown`"
            >
              <Link2 class="h-4 w-4 text-primary" />
              <span class="font-mono text-xs">{{ formatBytes(referenceStats.bytes) }}</span>
              <Badge variant="secondary" size="count" class="ml-1">{{ referenceStats.count }}</Badge>
            </Button>
            <template #content>
              <div class="space-y-2">
                <div>
                  <p class="text-sm font-semibold text-foreground">Referenced data</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    {{ referenceStats.count }} object{{ referenceStats.count === 1 ? '' : 's' }} in this
                    bucket point{{ referenceStats.count === 1 ? 's' : '' }} at data held elsewhere ·
                    {{ formatBytes(referenceStats.bytes) }} in total.
                  </p>
                </div>
                <ul class="space-y-1 border-t border-border pt-2">
                  <li
                    v-for="group in referenceStats.groups"
                    :key="group.key"
                    class="flex items-start justify-between gap-3 text-xs"
                  >
                    <span class="min-w-0 text-foreground">
                      <RouterLink
                        v-if="group.connectorId && activeGroupId && shown('connectors')"
                        :to="{ name: 'group', params: { id: activeGroupId }, query: { tab: 'sources', connector: group.connectorId } }"
                        class="block truncate text-primary hover:underline"
                        :title="`${referenceGroupLabel(group)}, open the connector`"
                      >
                        {{ referenceGroupLabel(group) }}
                      </RouterLink>
                      <RouterLink
                        v-else-if="group.originNodeId"
                        :to="{ name: 'status', query: { node: group.originNodeId } }"
                        class="block truncate text-primary hover:underline"
                        :title="`${referenceGroupLabel(group)}, open the node on the Status page`"
                      >
                        {{ referenceGroupLabel(group) }}
                      </RouterLink>
                      <span v-else class="block truncate" :title="referenceGroupLabel(group)">{{ referenceGroupLabel(group) }}</span>
                      <span v-if="group.sourcePaths.length" class="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" :title="group.sourcePaths.join('\n')">
                        {{ group.sourcePaths.join(', ') }}<template v-if="group.count > group.sourcePaths.length">, …</template>
                      </span>
                    </span>
                    <span class="shrink-0 font-mono text-muted-foreground">
                      {{ group.count }} · {{ formatBytes(group.bytes) }}
                    </span>
                  </li>
                </ul>
              </div>
            </template>
          </Popover>
          <!-- The Add data pipeline always targets the connected node. -->
          <Button v-if="!remoteBlocked" variant="outline" size="sm" :disabled="!canWriteCurrentPrefix"  aria-label="New folder" :title="writeRestrictionMessage ?? 'Create a folder'" @click="emit('new-folder')"><FolderPlus class="h-4 w-4" /><span class="hidden xl:inline">New folder</span></Button>
          <Button v-if="notebooks && !remoteNodeId" variant="outline" size="sm" :disabled="!canWriteCurrentPrefix"  aria-label="New notebook" :title="writeRestrictionMessage ?? 'Create a notebook here'" @click="emit('new-notebook')"><NotebookPen class="h-4 w-4" /><span class="hidden xl:inline">New notebook</span></Button>
          <Button v-if="!remoteNodeId" data-tour="bucket-add-data" size="sm" :disabled="!canWriteCurrentPrefix"  aria-label="Add data" :title="writeRestrictionMessage ?? 'Add data'" @click="emit('add-data')"><Plus class="h-4 w-4" /><span class="hidden xl:inline">Add data</span></Button>
        </div>
      </div>
      <div v-if="deletedLoading || (showDeleted && deletedTruncated)" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Spinner v-if="deletedLoading" label="Loading deleted objects" />
        <p v-if="showDeleted && deletedTruncated" class="text-xs text-muted-foreground">
          Only the first deleted objects of this folder are listed.
        </p>
      </div>
      <Notice v-if="deletedError" tone="warning">{{ deletedError }}</Notice>
      <p v-if="writeRestrictionMessage" class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {{ writeRestrictionMessage }}
      </p>

      <!-- Remote bucket whose endpoint the browser cannot use: an honest
           info panel instead of a broken listing. -->
      <div v-if="remoteBlocked" class="surface p-8 text-center">
        <CloudOff class="mx-auto h-6 w-6 text-muted-foreground" />
        <p class="mt-3 text-sm font-medium text-foreground">
          Hosted on {{ realmNodes.displayName(remoteNodeId) }}, browsing is unavailable from this origin.
        </p>
        <p class="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {{
            remoteEndpointMissing
              ? 'The node does not publish an S3 endpoint, so its objects cannot be listed here.'
              : 'The node’s S3 endpoint is unreachable from this browser, or it does not allow cross-origin browsing.'
          }}
        </p>
        <div class="mt-4 flex justify-center gap-2">
          <RefreshButton v-if="!remoteEndpointMissing" :busy="retrySpinning" label="Try again" @click="onRetryObjects" />
          <Button v-if="showSyncButton" size="sm" @click="emit('sync-to-node')">
            <ArrowLeftRight class="h-3.5 w-3.5" /> Sync to this node…
          </Button>
        </div>
      </div>

      <template v-else>
      <div
        data-tour="bucket-dropzone"
        class="surface overflow-hidden"
        :class="dragActive ? 'ring-2 ring-primary ring-offset-2' : ''"
        @dragover.prevent="dragActive = canWriteCurrentPrefix"
        @dragleave="dragActive = false"
        @drop.prevent="onDrop"
      >
        <ObjectListBar :manager="manager" @action="onBarAction" />
        <Notice v-if="listError && listAuthError" tone="warning" class="rounded-none border-x-0 border-t-0">
          <p>The temporary S3 session was rejected. Close it, then explicitly open this node and group again.</p>
          <p class="mt-1 break-all font-mono text-[10px]">{{ listError }}</p>
          <Button variant="outline" size="sm" class="mt-2" @click="s3.clearSessions()"><KeyRound class="h-3.5 w-3.5" /> Close temporary sessions</Button>
        </Notice>
        <p v-else-if="listError" class="border-b border-border px-4 py-3 text-xs text-destructive">{{ listError }}</p>
        <table class="w-full text-sm">
          <thead class="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th class="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  class="h-3.5 w-3.5 rounded border-border accent-primary"
                  :checked="allListedSelected"
                  :indeterminate="someListedSelected && !allListedSelected"
                  :disabled="selectableListedCount === 0 || listLoading"
                  aria-label="Select all listed folders and files"
                  @change="setAllListedSelected(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th class="px-4 py-2 text-left font-semibold">Name</th>
              <th class="px-4 py-2 text-right font-semibold">Size</th>
              <th class="px-4 py-2 text-left font-semibold">Modified</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="folder in visibleFolders"
              :key="folder.prefix"
              class="cursor-pointer border-t border-border hover:bg-muted/50"
              @click="openFolder(folder)"
            >
              <td class="w-10 px-4 py-2.5" @click.stop>
                <input
                  type="checkbox"
                  class="h-3.5 w-3.5 rounded border-border accent-primary"
                  :checked="selectedPrefixes.has(folder.prefix)"
                  :disabled="Boolean(folderReason(folder.prefix)) || listLoading"
                  :title="folderReason(folder.prefix) ?? `Select ${folder.name}`"
                  :aria-label="`Select ${folder.name}`"
                  @change="setFolderSelected(folder.prefix, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td class="px-4 py-2.5">
                <span class="flex items-center gap-2">
                  <ObjectIcon :name="folder.name" folder class="h-4 w-4" /> {{ folder.name }}/
                  <Badge v-if="folderPublic(folder.prefix)" variant="success" size="sm" class="shrink-0 uppercase" title="Everyone can read this folder">
                    <Globe class="mr-0.5 h-3 w-3" aria-hidden="true" /> public
                  </Badge>
                  <ArrowLeftRight
                    v-if="keyIsSynced(folder.prefix)"
                    class="h-3 w-3 shrink-0 text-primary/40"
                    aria-label="Covered by a sync relationship"
                  />
                  <!-- Tooltip lives on a span: title on inline svg is unreliable. -->
                  <Tooltip v-if="references.prefixHasReferences(folder.prefix)">
                    <span class="shrink-0" tabindex="0">
                      <Link2 class="h-3 w-3 text-primary/40" aria-label="Contains referenced objects" />
                    </span>
                    <template #content>{{ prefixReferenceSummary(folder.prefix) }}</template>
                  </Tooltip>
                </span>
              </td>
              <td class="px-4 py-2.5 text-right text-muted-foreground">-</td>
              <td class="px-4 py-2.5 text-muted-foreground">-</td>
              <td class="px-4 py-2.5">
                <div class="flex items-center justify-end gap-1">
                  <RowMenu
                    :name="`${folder.name}/`"
                    folder
                    :change-reason="folderReason(folder.prefix)"
                    :access="Boolean(activeGroupId)"
                    @pick="(action: RowAction) => onFolderAction(folder, action)"
                  />
                </div>
              </td>
            </tr>
            <!-- Row click opens the file details; the action buttons stop
                 propagation and open the tab they name. -->
            <template
              v-for="{ deleted, entry: object } in fileRows(visibleObjects, deletedRows)"
              :key="`${deleted ? 'deleted:' : ''}${object.key}`"
            >
            <tr
              v-if="!deleted"
              class="cursor-pointer border-t border-border hover:bg-muted/30"
              :class="isNotebook(object) ? 'bg-primary/5' : ''"
              @click="openObject(object)"
            >
              <td class="w-10 px-4 py-2.5" @click.stop>
                <input
                  type="checkbox"
                  class="h-3.5 w-3.5 rounded border-border accent-primary"
                  :checked="selectedObjectKeys.has(object.key)"
                  :disabled="Boolean(objectReason(object.key)) || listLoading"
                  :title="objectReason(object.key) ?? `Select ${object.name}`"
                  :aria-label="`Select ${object.name}`"
                  @change="setObjectSelected(object.key, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td class="px-4 py-2.5">
                <span class="flex items-center gap-2">
                  <ObjectIcon :name="object.name" class="h-4 w-4" />
                  <span
                    class="truncate"
                    :class="brokenReason(object.key) ? 'text-destructive' : isNotebook(object) ? 'font-medium text-primary' : ''"
                    :title="brokenReason(object.key) ?? undefined"
                  >{{ object.name }}</span>
                  <Badge v-if="isNotebook(object)" variant="royal" size="sm" class="shrink-0">Notebook</Badge>
                  <Badge v-if="locked.keyPending(object.key)" variant="warn" size="sm" class="shrink-0">
                    Key pending
                  </Badge>
                  <Badge v-if="filePublic(object.key)" variant="success" size="sm" class="shrink-0 uppercase" title="Everyone can read this file">
                    <Globe class="mr-0.5 h-3 w-3" aria-hidden="true" /> public
                  </Badge>
                  <ArrowLeftRight
                    v-if="keyIsSynced(object.key)"
                    class="h-3 w-3 shrink-0 text-primary/40"
                    aria-label="Covered by a sync relationship"
                  />
                  <Tooltip v-if="references.keyIsReferenced(object.key)">
                    <span class="shrink-0" tabindex="0">
                      <Link2 class="h-3 w-3 text-primary/40" :aria-label="referencedFrom(object.key)" />
                    </span>
                    <template #content>{{ referencedFrom(object.key) }}</template>
                  </Tooltip>
                </span>
              </td>
              <td class="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{{ object.size !== undefined ? formatBytes(object.size) : '-' }}</td>
              <td class="px-4 py-2.5 text-xs text-muted-foreground">{{ object.lastModified ? relativeTime(object.lastModified.toISOString()) : '-' }}</td>
              <td class="px-4 py-2.5">
                <div class="flex items-center justify-end gap-1">
                  <IconButton label="Preview" @click.stop="openDetails(object, 'preview')"><Eye class="size-3.5" /></IconButton>
                  <IconButton label="Download" @click.stop="locked.download(object)"><Download class="size-3.5" /></IconButton>
                  <RowMenu
                    :name="object.name"
                    :change-reason="objectReason(object.key)"
                    :access="Boolean(activeGroupId)"
                    @pick="(action: RowAction) => onObjectAction(object, action)"
                  />
                </div>
              </td>
            </tr>
            <!-- Marker-headed keys: hidden by an ordinary listing, offered back
                 here so a restore never leaves the browser. -->
            <tr
              v-else
              class="border-t border-border bg-muted/20 text-muted-foreground"
            >
              <td class="w-10 px-4 py-2.5"></td>
              <td class="px-4 py-2.5">
                <span class="flex items-center gap-2">
                  <ObjectIcon :name="object.name" class="h-4 w-4 opacity-60" />
                  <span class="truncate line-through">{{ object.name }}</span>
                  <Badge :variant="stateVariant('deleted')" size="sm">Deleted</Badge>
                </span>
              </td>
              <td class="px-4 py-2.5 text-right font-mono text-xs">-</td>
              <td class="px-4 py-2.5 text-xs">{{ object.lastModified ? relativeTime(object.lastModified.toISOString()) : '-' }}</td>
              <td class="px-4 py-2.5">
                <div class="flex items-center justify-end gap-1">
                  <Spinner v-if="restoringKey === object.key" label="Restoring the object" />
                  <IconButton
                    label="Restore"
                    :disabled-reason="objectReason(object.key)"
                    @click.stop="restoreObject(object)"
                  ><Undo2 class="size-3.5" /></IconButton>
                  <IconButton
                    label="Delete permanently…"
                    class="text-destructive hover:text-destructive"
                    :disabled-reason="objectReason(object.key)"
                    @click.stop="deleteRestorable(object)"
                  ><Trash2 class="size-3.5" /></IconButton>
                </div>
              </td>
            </tr>
            </template>
            <tr v-if="isEmpty">
              <td colspan="5" class="px-4 py-10 text-center text-xs text-muted-foreground">
                <template v-if="nameFilter">No names here start with "{{ nameFilter }}".</template>
                <template v-else-if="nextToken || folders.length || objects.length">No matches on this page.</template>
                <template v-else>{{ canWriteCurrentPrefix ? 'This prefix is empty. Drop files here or use Add data.' : 'This prefix is empty. This session is read-only here.' }}</template>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!isEmpty || page > 1 || nextToken" class="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
          <label class="flex items-center gap-2 text-xs text-muted-foreground">
            Per page
            <Select
              :model-value="String(pageSize)"
              :options="PAGE_SIZE_OPTIONS"
              aria-label="Files per page"
              class="h-8 w-20 text-xs text-foreground"
              @update:model-value="(value: string) => setPageSize(Number(value))"
            />
          </label>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" :disabled="page <= 1 || listLoading" @click="previousPage">
              <ChevronLeft class="size-3.5" /> Prev
            </Button>
            <span class="px-1 text-center text-xs tabular-nums text-muted-foreground">Page {{ page }}</span>
            <Button variant="outline" size="sm" :disabled="!nextToken || listLoading" @click="nextPage">
              Next <ChevronRight class="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
      <TransferDialog
        v-model:open="transferOpen"
        :mode="transferMode"
        :bucket="bucket"
        :prefix="s3Prefix"
        :node-id="remoteNodeId"
        :sources="transferSources"
        @done="onTransferDone"
      />
      <KeyedReadNotice :wait="locked.wait.value" action="download" class="max-w-xl" @cancel="locked.cancel()" />

      <slot />
      </template>
    </template>

  </div>
</template>
