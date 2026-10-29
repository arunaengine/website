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
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import ObjectListBar from '@/components/data/manager/ObjectListBar.vue'
import MetadataSearch from '@/components/data/MetadataSearch.vue'
import RowMenu from '@/components/data/manager/RowMenu.vue'
import SearchHint from '@/components/data/manager/SearchHint.vue'
import SelectionBar from '@/components/data/manager/SelectionBar.vue'
import TransferDialog from '@/components/data/manager/TransferDialog.vue'
import WatchButton from '@/components/watches/WatchButton.vue'
import KeyedReadNotice from '@/components/storage/KeyedReadNotice.vue'
import { useAruna } from '@/composables/useAruna'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import { isDesktop } from '@/lib/desktop'
import { mockEnabled } from '@/lib/distributedMock'
import { exampleMark } from '@/lib/distributedMockData'
import type { BindSource } from '@/lib/bindSource'
import { folderName } from '@/lib/deviceApi'
import { useBrokenFiles } from '@/composables/useBrokenFiles'
import { useBucketUsage, usageText } from '@/composables/useBucketUsage'
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
import type { ObjectSearchHit } from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { isNotebookKey } from '@/lib/notebook/document'
import { collectDropFiles } from '@/lib/upload/dropEntries'
import { stateVariant } from '@/lib/stateBadge'
import { fileRows, pageRange, sortRows, splitName, type ListSort, type RowAction, type SelectionAction, type SortKey } from '@/lib/objectListing'
import type { TransferMode, TransferSource } from '@/lib/objectMove'
import { copyToClipboard, formatBytes, relativeTime } from '@/lib/utils'
import { formatCount } from '@/lib/formatCount'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { parseArunaArn } from '@/lib/sync'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowLeftRight,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Download,
  Eye,
  FolderPlus,
  FolderSync,
  Globe,
  KeyRound,
  Laptop,
  Link2,
  Lock,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Upload,
  Trash2,
  Undo2,
} from '@lucide/vue'

const props = defineProps<{ manager: DataManager; notebooks?: boolean }>()
const emit = defineEmits<{
  (e: 'add-data'): void
  (e: 'new-folder'): void
  (e: 'new-notebook'): void
  (e: 'sync-to-computer', source: BindSource): void
  (e: 'public-access', targets: PublicTarget[]): void
  (e: 'new-bucket'): void
  (e: 'open-hit', hit: ObjectSearchHit): void
}>()

const s3 = useS3()
// Aruna Desktop binds a bucket to a folder; the web only syncs between nodes.
const desktop = isDesktop()
// The desktop never hides toolbar labels; its toolbar wraps instead. A phone keeps only the icons.
const toolbarLabel = desktop ? '' : '@max-[600px]:sr-only'
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
  listStale,
  isEmpty,
  listedOnce,
  loadObjects,
  navigateTo,
  openFolder,
  openDetails,
  download,
  keyIsSynced,
  bucketSyncCount,
  showSyncButton,
  currentBindSource,
  currentLinkedFolder,
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
  syncsForKey,
} = props.manager

const usage = useBucketUsage(bucket, remoteNodeId)
// The other nodes this bucket syncs with, each named once.
const syncPartners = computed(() => {
  const own = remoteNodeId.value ?? realmNodes.localNodeId.value
  const ids = syncsForKey('').map(({ relationship, direction }) =>
    parseArunaArn(direction === 'outgoing' ? relationship.target : relationship.source)?.nodeId ?? null)
  return [...new Set(ids)].filter((id): id is string => Boolean(id) && id !== own).map((id) => ({ id, name: realmNodes.displayName(id) }))
})
const hinting = ref(false)
const hintFolder = computed(() => prefix.value.split('/').at(-1) || bucket.value)

// A link to part of the bucket names that part, so the note never claims the whole bucket.
const linkedPart = computed(() => {
  const prefix = currentLinkedFolder.value?.remote.prefix.replace(/\/+$/, '')
  return prefix ? ` (only ${prefix}/)` : ''
})

// A bucket on this computer: its files are already here, so no folder can be linked.
const onThisComputer = computed(
  () =>
    desktop &&
    Boolean(bucket.value) &&
    !remoteNodeId.value &&
    !isWorkspaceBucket(bucket.value) &&
    realmNodes.nodeById(realmNodes.localNodeId.value)?.kind === 'user',
)

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

// The list bar's one box: it filters this folder, and searches the whole bucket on request. The
// bucket results take the folder's place until the user goes back.
const searchText = ref('')
const wholeBucket = ref(false)
const bucketSearch = ref<{ search: () => Promise<void> } | null>(null)
// An open search decides itself what to search for: its chips may stand alone in an empty box.
function searchBucket() {
  if (wholeBucket.value) return void bucketSearch.value?.search()
  if (searchText.value.trim().length >= 2) wholeBucket.value = true
}
function backToFolder() {
  wholeBucket.value = false
  searchText.value = ''
  nameFilter.value = ''
}
// A breadcrumb leaves the bucket search, also the one of the folder already open.
function openCrumb(path: string) {
  backToFolder()
  navigateTo(path)
}
function openHit(hit: ObjectSearchHit) {
  backToFolder()
  emit('open-hit', hit)
}
// Another folder, bucket or node ends the search and its results, and empties the box.
watch([bucket, remoteNodeId, s3Prefix], backToFolder)

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
  else if (action === 'share') void share([...selectedPrefixes.value, ...selectedObjectKeys.value])
  else if (action === 'delete') deleteSelection()
  else openTransfer(action, selectedSources())
}

function onObjectAction(object: ObjectEntry, action: RowAction) {
  const key = object.key
  if (action === 'details') openDetails(object)
  else if (action === 'preview') openDetails(object, 'preview')
  else if (action === 'share') void share([object.key])
  else if (action === 'download') void locked.download(object)
  else if (action === 'access') emit('public-access', [{ kind: 'file', bucket: bucket.value, key }])
  else if (action === 'delete' || action === 'purge') deleteObject(object, action === 'purge')
  else if (action !== 'open') openTransfer(action, [{ key, folder: false }])
}

function onFolderAction(folder: FolderEntry, action: RowAction) {
  const key = folder.prefix
  if (action === 'open') openFolder(folder)
  else if (action === 'details') openDetails({ key, name: `${folder.name}/` })
  else if (action === 'share') void share([key])
  else if (action === 'access') emit('public-access', [{ kind: 'folder', bucket: bucket.value, key }])
  else if (action === 'delete' || action === 'purge') deleteFolder(folder, action === 'purge')
  else if (action !== 'download' && action !== 'preview') openTransfer(action, [{ key, folder: true }])
}

// A page's rows in the chosen order; folders keep their name order on top.
const sort = ref<ListSort>({ key: 'name', descending: false })
function sortBy(key: SortKey) {
  sort.value = { key, descending: sort.value.key === key ? !sort.value.descending : key !== 'name' }
}
// A phone has no column header, so one button names the order and changes it.
const SORTS: { label: string; sort: ListSort }[] = [
  { label: 'Name A to Z', sort: { key: 'name', descending: false } },
  { label: 'Name Z to A', sort: { key: 'name', descending: true } },
  { label: 'Largest first', sort: { key: 'size', descending: true } },
  { label: 'Smallest first', sort: { key: 'size', descending: false } },
  { label: 'Newest first', sort: { key: 'modified', descending: true } },
  { label: 'Oldest first', sort: { key: 'modified', descending: false } },
]
const sameSort = (left: ListSort, right: ListSort) => left.key === right.key && left.descending === right.descending
const sortLabel = computed(() => SORTS.find((option) => sameSort(option.sort, sort.value))?.label ?? 'Sort')
const ariaSort = (key: SortKey) => (sort.value.key === key ? (sort.value.descending ? 'descending' : 'ascending') : undefined)
const folderRows = computed(() =>
  sortRows(visibleFolders.value, { key: 'name', descending: sort.value.key === 'name' && sort.value.descending }, (folder) => folder))
const objectRows = computed(() => sortRows(fileRows(visibleObjects.value, deletedRows.value), sort.value, (row) => row.entry))
const fileFacts = (object: ObjectEntry) =>
  [object.size !== undefined ? formatBytes(object.size) : '', object.lastModified ? relativeTime(object.lastModified.toISOString()) : ''].filter(Boolean).join(', ')

// "1 to 25 of 40"; a filter names what it narrowed instead.
const rangeText = computed(() => {
  const listed = folders.value.length + objects.value.length
  const shownCount = visibleFolders.value.length + visibleObjects.value.length
  if (!nameFilter.value && shownCount === listed) return pageRange(page.value, pageSize.value, listed, !nextToken.value)
  return `${formatCount(shownCount)} of ${formatCount(listed)} in ${prefix.value.split('/').at(-1) || bucket.value}`
})

// Share copies the portal links that open the files or folders, one per line.
const shareNote = ref('')
let shareTimer: ReturnType<typeof setTimeout> | undefined
async function share(keys: string[]) {
  const link = (key: string) => {
    const folder = key.endsWith('/')
    const at = folder ? key.slice(0, -1) : key.split('/').slice(0, -1).join('/')
    const query = { ...(at ? { prefix: at } : {}), ...(remoteNodeId.value ? { node: remoteNodeId.value } : {}), ...(activeGroupId.value ? { group: activeGroupId.value } : {}), ...(folder ? {} : { object: key }) }
    return new URL(router.resolve({ name: 'bucket', params: { bucketId: bucket.value }, query }).href, window.location.origin).href
  }
  await copyToClipboard(keys.map(link).join('\n'))
  shareNote.value = keys.length === 1 ? 'Link copied' : `${formatCount(keys.length)} links copied`
  clearTimeout(shareTimer)
  shareTimer = setTimeout(() => (shareNote.value = ''), 2500)
}
onBeforeUnmount(() => clearTimeout(shareTimer))

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
      <div v-if="deletedLoading || (showDeleted && deletedTruncated)" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Spinner v-if="deletedLoading" label="Loading deleted objects" />
        <p v-if="showDeleted && deletedTruncated" class="text-xs text-muted-foreground">
          Only the first deleted objects of this folder are listed.
        </p>
      </div>
      <Notice v-if="deletedError" tone="warning">{{ deletedError }}</Notice>
      <Notice v-if="desktop && currentLinkedFolder" class="flex flex-wrap items-center gap-3" data-testid="linked-folder-note">
        <FolderSync class="h-4 w-4 shrink-0 text-primary" />
        <p class="min-w-0 flex-1">
          <span class="font-medium text-foreground">Linked to {{ folderName(currentLinkedFolder.root) }}{{ linkedPart }}.</span>
          It stays in step with <span class="hash">{{ currentLinkedFolder.root }}</span> on this computer.
        </p>
        <RouterLink
          :to="{ name: 'folder', params: { folderId: currentLinkedFolder.folder_id } }"
          class="text-xs font-medium text-primary hover:underline"
        >
          Open folder
        </RouterLink>
      </Notice>
      <Notice v-if="onThisComputer" class="flex flex-wrap items-center gap-3" data-testid="device-bucket-note">
        <Laptop class="h-4 w-4 shrink-0" />
        <p class="min-w-0 flex-1">
          <span class="font-medium text-foreground">Stored only on this computer.</span>
          Its files are already here, so there is nothing to link.
        </p>
        <Button variant="outline" size="sm" @click="emit('new-bucket')"><Plus class="h-4 w-4" /> New bucket on a realm node</Button>
      </Notice>
      <p v-if="writeRestrictionMessage" class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {{ writeRestrictionMessage }}
      </p>

      <div
        data-tour="bucket-dropzone"
        class="surface overflow-clip"
        :class="dragActive ? 'ring-2 ring-primary ring-offset-2' : ''"
        @dragover.prevent="dragActive = canWriteCurrentPrefix"
        @dragleave="dragActive = false"
        @drop.prevent="onDrop"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted-foreground">
            <span v-if="usage" class="tabular-nums">{{ usageText(usage, true) }}</span>
            <Badge v-if="syncPartners.length" variant="success" size="sm" class="max-w-full gap-1">
              <RefreshCw class="h-3 w-3 shrink-0" aria-hidden="true" />
              <span class="truncate">synced with
                <template v-for="(partner, index) in syncPartners" :key="partner.id"><template v-if="index">, </template><RouterLink :to="{ name: 'node', params: { nodeId: partner.id } }" class="hover:underline">{{ partner.name }}</RouterLink></template>
              </span>
            </Badge>
            <Badge v-if="lockedOnNode" :variant="stateVariant('locked')" size="sm" class="shrink-0">
              <Lock class="mr-0.5 h-3 w-3" aria-hidden="true" /> Locked on the node
            </Badge>
            <Badge v-if="availableToYou" variant="success" size="sm" class="shrink-0">Available to you</Badge>
            <span v-if="providerBucket" class="min-w-0 truncate text-xs">
              Stored in provider bucket <span class="font-mono text-foreground">{{ providerBucket }}</span>
            </span>
            <Popover v-if="showReferenceStats">
              <Button
                variant="outline"
                size="sm"
                :title="`${referenceStats.count} referenced object${referenceStats.count === 1 ? '' : 's'}, ${formatBytes(referenceStats.bytes)}, open per-source breakdown`"
              >
                <Link2 class="h-4 w-4 text-primary" />
                <span class="text-xs">{{ referenceStats.count }} referenced, {{ formatBytes(referenceStats.bytes) }}</span>
              </Button>
              <template #content>
                <div class="space-y-2">
                  <div>
                    <p class="text-sm font-semibold text-foreground">Referenced data</p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {{ referenceStats.count }} object{{ referenceStats.count === 1 ? '' : 's' }} in this
                      bucket point{{ referenceStats.count === 1 ? 's' : '' }} at data held elsewhere,
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
                        {{ group.count }}, {{ formatBytes(group.bytes) }}
                      </span>
                    </li>
                  </ul>
                </div>
              </template>
            </Popover>
          </div>
          <div class="ml-auto flex shrink-0 items-center gap-1.5">
            <WatchButton
              surface="bucket"
              :path-prefix="watchPathPrefix"
              :group-id="activeGroupId"
              :resource-label="`${bucket}/${s3Prefix}`"
              bell
              :label-class="toolbarLabel"
            />
            <!-- A dot instead of a count: the settings page names what it holds. -->
            <span v-if="showStorageButton" data-tour="bucket-settings" class="relative inline-flex">
              <Button variant="outline" size="sm" aria-label="Bucket settings" title="Bucket settings" @click="openBucketSettings">
                <Settings class="h-4 w-4" /><span :class="toolbarLabel">Settings</span>
              </Button>
              <span
                v-if="storageCount"
                class="pointer-events-none absolute right-1 top-1 size-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-2 pt-2.5">
          <div class="flex min-w-0 max-w-full items-center gap-2">
            <Breadcrumbs :bucket="bucket" :path="prefix" single-line @navigate="openCrumb" />
            <Spinner v-if="listLoading" label="Loading objects" class="shrink-0" />
            <span role="status" class="shrink-0 text-xs text-muted-foreground">{{ shareNote }}</span>
          </div>
          <div class="ml-auto flex min-w-[min(100%,300px)] flex-1 items-center justify-end gap-1.5">
            <ObjectListBar
              v-model:text="searchText"
              v-model:hinting="hinting"
              class="max-w-md"
              :manager="manager"
              :whole-bucket="wholeBucket"
              @search-bucket="searchBucket"
              @back="backToFolder"
            />
            <Button v-if="desktop && currentBindSource && !currentLinkedFolder && !remoteBlocked" variant="outline" size="sm" aria-label="Link a local folder" title="Keep a folder on this computer and this bucket in step" @click="emit('sync-to-computer', currentBindSource)"><FolderSync class="h-4 w-4" /><span :class="toolbarLabel">Link a local folder</span></Button>
            <Button v-if="notebooks && !remoteNodeId" variant="outline" size="sm" :disabled="!canWriteCurrentPrefix" aria-label="New notebook" :title="writeRestrictionMessage ?? 'Create a notebook here'" @click="emit('new-notebook')"><NotebookPen class="h-4 w-4" /><span :class="toolbarLabel">New notebook</span></Button>
            <!-- The Add data pipeline always targets the connected node. -->
            <Button v-if="!remoteNodeId" data-tour="bucket-add-data" size="sm" :disabled="!canWriteCurrentPrefix" aria-label="Upload" :title="writeRestrictionMessage ?? 'Upload files or add data from other sources'" @click="emit('add-data')"><Upload class="h-4 w-4" /><span>Upload</span></Button>
            <Button v-if="!remoteBlocked" variant="outline" size="sm" :disabled="!canWriteCurrentPrefix" aria-label="New folder" :title="writeRestrictionMessage ?? 'Create a folder'" @click="emit('new-folder')"><FolderPlus class="h-4 w-4" /><span :class="toolbarLabel">New folder</span></Button>
          </div>
        </div>
        <SearchHint v-if="hinting" :text="searchText" :folder="hintFolder" :bucket="bucket" class="mx-4 mb-2 hidden shadow-none @max-[600px]:block" />
        <MetadataSearch
          v-if="wholeBucket"
          ref="bucketSearch"
          v-model:text="searchText"
          :bucket="bucket"
          :node-id="remoteNodeId"
          @open="openHit"
          @back="backToFolder"
        />
        <!-- Remote bucket whose endpoint the browser cannot use: an honest info panel instead of a
             broken listing. The whole-bucket search goes through the REST API, so it stays. -->
        <div v-else-if="remoteBlocked" class="p-8 text-center">
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
            <Button v-if="showSyncButton && desktop && currentBindSource && !currentLinkedFolder" size="sm" @click="emit('sync-to-computer', currentBindSource)">
              <FolderSync class="h-3.5 w-3.5" /> Link a local folder
            </Button>
          </div>
        </div>
        <template v-else>
        <Notice v-if="listError && listAuthError" tone="warning" class="rounded-none border-x-0 border-t-0">
          <p>The temporary S3 session was rejected. Close it, then explicitly open this node and group again.</p>
          <p class="mt-1 break-all font-mono text-[10px]">{{ listError }}</p>
          <Button variant="outline" size="sm" class="mt-2" @click="s3.clearSessions()"><KeyRound class="h-3.5 w-3.5" /> Close temporary sessions</Button>
        </Notice>
        <p v-else-if="listError" class="border-b border-border px-4 py-3 text-xs text-destructive">{{ listError }}</p>
        <Notice v-else-if="listStale" tone="warning" class="rounded-none border-x-0 border-t-0">
          Some folders are shown from a copy and may be out of date.
        </Notice>
        <div class="hidden px-3 pb-1.5 @max-[600px]:flex">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="sm" :aria-label="`Sort: ${sortLabel}`"><ArrowUpDown class="h-3.5 w-3.5" /> {{ sortLabel }} <ChevronDown class="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem v-for="option in SORTS" :key="option.label" role="menuitemradio" :aria-checked="sameSort(option.sort, sort)" class="pl-8" @click="sort = option.sort">
                <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center"><Check v-if="sameSort(option.sort, sort)" class="h-3.5 w-3.5" /></span>
                {{ option.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <!-- Fixed column widths: a column hidden on a narrow view keeps the actions in their place.
             On a phone the rows become a list with the size and date on a second line. -->
        <table class="w-full table-fixed text-sm @max-[600px]:block">
          <colgroup class="@max-[600px]:hidden">
            <col class="w-11" />
            <col />
            <col class="w-24" />
            <col class="w-24 @max-[960px]:w-0" />
            <col class="w-[132px]" />
          </colgroup>
          <thead class="text-[11px] uppercase tracking-wider text-muted-foreground @max-[600px]:hidden">
            <SelectionBar v-if="selectedCount" :manager="manager" @action="onBarAction" />
            <tr v-else class="border-b border-border">
              <th class="p-0">
                <label class="flex h-11 w-11 items-center justify-center">
                  <input
                    type="checkbox"
                    class="h-3.5 w-3.5 rounded border-border accent-primary"
                    :checked="allListedSelected"
                    :indeterminate="someListedSelected && !allListedSelected"
                    :disabled="selectableListedCount === 0 || listLoading"
                    aria-label="Select all listed folders and files"
                    @change="setAllListedSelected(($event.target as HTMLInputElement).checked)"
                  />
                </label>
              </th>
              <th class="px-3 py-2 text-left font-medium" :aria-sort="ariaSort('name')">
                <button type="button" class="inline-flex items-center gap-1 uppercase hover:text-foreground" @click="sortBy('name')">
                  Name <ChevronDown v-if="sort.key === 'name'" class="h-3 w-3" :class="sort.descending ? 'rotate-180' : ''" />
                </button>
              </th>
              <th class="px-3 py-2 text-right font-medium" :aria-sort="ariaSort('size')">
                <button type="button" class="inline-flex items-center gap-1 uppercase hover:text-foreground" @click="sortBy('size')">
                  Size <ChevronDown v-if="sort.key === 'size'" class="h-3 w-3" :class="sort.descending ? 'rotate-180' : ''" />
                </button>
              </th>
              <th class="overflow-hidden px-3 py-2 text-left font-medium @max-[960px]:p-0" :aria-sort="ariaSort('modified')">
                <button type="button" class="inline-flex items-center gap-1 uppercase hover:text-foreground @max-[960px]:hidden" @click="sortBy('modified')">
                  Modified <ChevronDown v-if="sort.key === 'modified'" class="h-3 w-3" :class="sort.descending ? 'rotate-180' : ''" />
                </button>
              </th>
              <th class="p-0"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody class="@max-[600px]:block">
            <tr
              v-for="folder in folderRows"
              :key="folder.prefix"
              class="group cursor-pointer border-b border-border hover:bg-muted/50 @max-[600px]:flex @max-[600px]:items-center"
              @click="openFolder(folder)"
            >
              <td class="p-0 @max-[600px]:block" @click.stop>
                <label class="flex h-11 w-11 items-center justify-center">
                  <input
                    type="checkbox"
                    class="h-3.5 w-3.5 rounded border-border accent-primary"
                    :checked="selectedPrefixes.has(folder.prefix)"
                    :disabled="Boolean(folderReason(folder.prefix)) || listLoading"
                    :title="folderReason(folder.prefix) ?? `Select ${folder.name}`"
                    :aria-label="`Select ${folder.name}`"
                    @change="setFolderSelected(folder.prefix, ($event.target as HTMLInputElement).checked)"
                  />
                </label>
              </td>
              <td class="px-3 py-2 @max-[600px]:block @max-[600px]:min-w-0 @max-[600px]:flex-1 @max-[600px]:px-1">
                <span class="flex min-w-0 items-center gap-2">
                  <ObjectIcon :name="folder.name" folder class="h-4 w-4" />
                  <button type="button" class="min-w-0 truncate text-left text-foreground hover:underline" :title="`${folder.name}/`" @click.stop="openFolder(folder)">{{ folder.name }}/</button>
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
              <td class="@max-[600px]:hidden"></td>
              <td class="@max-[600px]:hidden"></td>
              <td class="px-2 @max-[600px]:block">
                <div class="flex items-center justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:opacity-100 @max-[600px]:opacity-100">
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
              v-for="{ deleted, entry: object } in objectRows"
              :key="`${deleted ? 'deleted:' : ''}${object.key}`"
            >
            <tr
              v-if="!deleted"
              class="group cursor-pointer border-b border-border hover:bg-muted/30 @max-[600px]:flex @max-[600px]:items-center"
              :class="isNotebook(object) ? 'bg-primary/5' : ''"
              @click="openObject(object)"
            >
              <td class="p-0 @max-[600px]:block" @click.stop>
                <label class="flex h-11 w-11 items-center justify-center">
                  <input
                    type="checkbox"
                    class="h-3.5 w-3.5 rounded border-border accent-primary"
                    :checked="selectedObjectKeys.has(object.key)"
                    :disabled="Boolean(objectReason(object.key)) || listLoading"
                    :title="objectReason(object.key) ?? `Select ${object.name}`"
                    :aria-label="`Select ${object.name}`"
                    @change="setObjectSelected(object.key, ($event.target as HTMLInputElement).checked)"
                  />
                </label>
              </td>
              <td class="px-3 py-2 @max-[600px]:block @max-[600px]:min-w-0 @max-[600px]:flex-1 @max-[600px]:px-1">
                <span class="flex min-w-0 items-center gap-2 @max-[600px]:items-start">
                  <ObjectIcon :name="object.name" class="h-4 w-4" />
                  <span class="min-w-0">
                    <button
                      type="button"
                      class="flex min-w-0 max-w-full text-left hover:underline @max-[600px]:items-end"
                      :class="brokenReason(object.key) ? 'text-destructive' : isNotebook(object) ? 'font-medium text-primary' : 'text-foreground'"
                      :title="brokenReason(object.key) ?? object.name"
                      @click.stop="openObject(object)"
                    >
                      <span class="truncate @max-[600px]:line-clamp-2 @max-[600px]:whitespace-normal @max-[600px]:break-all">{{ splitName(object.name)[0] }}</span><span class="shrink-0 whitespace-nowrap">{{ splitName(object.name)[1] }}</span>
                    </button>
                    <span class="hidden text-xs tabular-nums text-muted-foreground @max-[600px]:block">{{ fileFacts(object) }}</span>
                  </span>
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
                  <Badge v-if="mockEnabled() && exampleMark(bucket, object.key)" :variant="exampleMark(bucket, object.key) === 'Can change at the source' ? 'warn' : 'outline'" size="sm" class="shrink-0">
                    {{ exampleMark(bucket, object.key) }}
                  </Badge>
                  <Tooltip v-if="references.keyIsReferenced(object.key)">
                    <span class="shrink-0" tabindex="0">
                      <Link2 class="h-3 w-3 text-primary/40" :aria-label="referencedFrom(object.key)" />
                    </span>
                    <template #content>{{ referencedFrom(object.key) }}</template>
                  </Tooltip>
                </span>
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground @max-[600px]:hidden">{{ object.size !== undefined ? formatBytes(object.size) : '' }}</td>
              <td class="overflow-hidden whitespace-nowrap px-3 py-2 text-muted-foreground @max-[960px]:p-0 @max-[600px]:hidden">
                <span class="@max-[960px]:hidden">{{ object.lastModified ? relativeTime(object.lastModified.toISOString()) : '' }}</span>
              </td>
              <td class="px-2 @max-[600px]:block">
                <div class="flex items-center justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:opacity-100 @max-[600px]:opacity-100">
                  <IconButton label="Preview" variant="outline" class="@max-[600px]:hidden" @click.stop="openDetails(object, 'preview')"><Eye class="size-3.5" /></IconButton>
                  <IconButton label="Download" variant="outline" class="@max-[600px]:hidden" @click.stop="locked.download(object)"><Download class="size-3.5" /></IconButton>
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
              class="border-b border-border bg-muted/20 text-muted-foreground @max-[600px]:flex @max-[600px]:items-center"
            >
              <td class="w-11 p-0 @max-[600px]:block"></td>
              <td class="px-3 py-2 @max-[600px]:block @max-[600px]:min-w-0 @max-[600px]:flex-1 @max-[600px]:px-1">
                <span class="flex min-w-0 items-center gap-2">
                  <ObjectIcon :name="object.name" class="h-4 w-4 opacity-60" />
                  <span class="truncate line-through" :title="object.name">{{ object.name }}</span>
                  <Badge :variant="stateVariant('deleted')" size="sm">Deleted</Badge>
                </span>
              </td>
              <td class="@max-[600px]:hidden"></td>
              <td class="overflow-hidden whitespace-nowrap px-3 py-2 @max-[960px]:p-0 @max-[600px]:hidden">
                <span class="@max-[960px]:hidden">{{ object.lastModified ? relativeTime(object.lastModified.toISOString()) : '' }}</span>
              </td>
              <td class="px-2 @max-[600px]:block">
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
            <tr v-if="(listLoading || (!listedOnce && !listError)) && !visibleFolders.length && !visibleObjects.length && !deletedRows.length" class="@max-[600px]:block">
              <td colspan="5" class="px-4 py-10 @max-[600px]:block">
                <Spinner show-label label="Loading objects…" class="justify-center" />
              </td>
            </tr>
            <tr v-else-if="isEmpty" class="@max-[600px]:block">
              <td colspan="5" class="px-4 py-10 text-center text-xs text-muted-foreground @max-[600px]:block">
                <template v-if="nameFilter">No names here start with "{{ nameFilter }}".</template>
                <template v-else-if="nextToken || folders.length || objects.length">No matches on this page.</template>
                <template v-else>{{ canWriteCurrentPrefix ? 'This folder is empty. Drop files here or use Upload.' : 'This folder is empty. This session is read-only here.' }}</template>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!isEmpty || page > 1 || nextToken" class="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs text-muted-foreground">
          <span class="tabular-nums">{{ rangeText }}</span>
          <div class="flex items-center gap-2">
            <Select
              :model-value="String(pageSize)"
              :options="PAGE_SIZE_OPTIONS"
              aria-label="Files per page"
              title="Files per page"
              class="h-8 w-20 text-xs text-foreground"
              @update:model-value="(value: string) => setPageSize(Number(value))"
            />
            <IconButton label="Previous page" variant="outline" size="icon" class="h-8 w-8" :disabled="page <= 1 || listLoading" @click="previousPage">
              <ChevronLeft class="size-3.5" />
            </IconButton>
            <IconButton label="Next page" variant="outline" size="icon" class="h-8 w-8" :disabled="!nextToken || listLoading" @click="nextPage">
              <ChevronRight class="size-3.5" />
            </IconButton>
          </div>
        </div>
        <SelectionBar v-if="selectedCount" bottom :manager="manager" class="hidden @max-[600px]:block" @action="onBarAction" />
        </template>
        <button
          v-if="!wholeBucket && searchText.trim().length >= 2"
          type="button"
          class="flex w-full items-center gap-2 border-t border-border px-4 py-2 text-left text-xs text-primary hover:bg-muted/50"
          @click="searchBucket"
        >
          <Search class="h-3.5 w-3.5" /> Search the whole bucket for "{{ searchText.trim() }}"
        </button>
      </div>
      <template v-if="!remoteBlocked">
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
