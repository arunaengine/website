<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Notice from '@/components/ui/Notice.vue'
import Popover from '@/components/ui/Popover.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import WatchButton from '@/components/watches/WatchButton.vue'
import { useAruna } from '@/composables/useAruna'
import type { DataManager } from '@/composables/useDataManager'
import {
  useS3,
  type DeletedObjectEntry,
  type FolderEntry,
  type ObjectEntry,
} from '@/composables/useS3'
import { usePlacementPolicies } from '@/composables/usePlacementPolicies'
import { featureEnabled } from '@/lib/config'
import { collectDropFiles } from '@/lib/upload/dropEntries'
import { stateVariant } from '@/lib/stateBadge'
import { selectionNoun } from '@/lib/deletion/request'
import { formatBytes, relativeTime } from '@/lib/utils'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowLeftRight,
  CloudOff,
  Download,
  Eye,
  FolderPlus,
  KeyRound,
  Link2,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
  Undo2,
} from '@lucide/vue'

const props = defineProps<{ manager: DataManager }>()
const emit = defineEmits<{
  (e: 'add-data'): void
  (e: 'new-folder'): void
  (e: 'sync-to-node'): void
}>()

const s3 = useS3()
const { isRealmAdmin } = useAruna()
const { getBucketPlacement } = usePlacementPolicies()
const placementPoliciesEnabled = featureEnabled('placementAdmin')
const {
  router,
  bucket,
  prefix,
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
  folders,
  objects,
  nextToken,
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
  setShowDeleted,
  deletedObjects,
  deletedLoading,
  deletedTruncated,
  deletedError,
  restoringKey,
  restoreObject,
  requestDelete,
} = props.manager

// One entry for everything this bucket stores: its settings page. The dot says
// the bucket carries syncs or placement policies, which only a viewer the node
// lets read bucket placement pays a request for.
const selectionSummary = computed(() =>
  selectionNoun(selectedObjectKeys.value.size, selectedPrefixes.value.size),
)

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

function deleteObject(object: ObjectEntry) {
  requestDelete({
    kind: 'object',
    bucket: bucket.value,
    nodeId: remoteNodeId.value,
    key: object.key,
    headState: 'live',
    bytes: object.size,
  })
}

function deleteFolder(folder: FolderEntry) {
  requestDelete({
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
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <Breadcrumbs :bucket="bucket" :path="prefix" @navigate="navigateTo" />
          <Badge
            v-if="remoteNodeId"
            variant="outline"
            size="sm"
            class="shrink-0"
            :title="remoteNodeId"
          >
            on {{ realmNodes.displayName(remoteNodeId) }}
          </Badge>
          <Spinner v-if="listLoading" label="Loading objects" class="shrink-0" />
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            class="text-destructive hover:text-destructive"
            :disabled="selectedCount === 0"
            :title="selectedCount === 0 ? 'Tick files and folders in the list to delete them.' : `Delete ${selectionSummary}`"
            @click="deleteSelection"
          >
            <Trash2 class="h-4 w-4" /> Delete selected ({{ selectedCount }})
          </Button>
          <WatchButton
            surface="bucket"
            :path-prefix="watchPathPrefix"
            :group-id="activeGroupId"
            :resource-label="`${bucket}/${s3Prefix}`"
            size="sm"
          />
          <!-- A dot instead of a count: the settings page names what it holds. -->
          <span v-if="showStorageButton" data-tour="bucket-settings" class="relative inline-flex">
            <IconButton
              label="Bucket settings"
              variant="outline"
              size="icon"
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
                        v-if="group.connectorId && activeGroupId"
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
          <Button v-if="!remoteBlocked" variant="outline" size="sm" :disabled="!canWriteCurrentPrefix" :title="writeRestrictionMessage ?? 'Create a folder'" @click="emit('new-folder')"><FolderPlus class="h-4 w-4" /> New folder</Button>
          <Button v-if="!remoteNodeId" data-tour="bucket-add-data" size="sm" :disabled="!canWriteCurrentPrefix" :title="writeRestrictionMessage ?? 'Add data'" @click="emit('add-data')"><Plus class="h-4 w-4" /> Add data</Button>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <!-- Deleted keys are listed by the node that holds the bucket, so the
             toggle only applies to a bucket on the connected node. -->
        <label v-if="!remoteNodeId && !remoteBlocked" class="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch :checked="showDeleted" @update:checked="setShowDeleted" />
          Show deleted
        </label>
        <p v-else-if="!remoteBlocked" class="text-xs text-muted-foreground">
          Deleted objects are listed by the node that holds this bucket, so they are unavailable here.
        </p>
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
                  :disabled="selectableListedCount === 0"
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
              v-for="folder in folders"
              :key="folder.prefix"
              class="cursor-pointer border-t border-border hover:bg-muted/50"
              @click="openFolder(folder)"
            >
              <td class="w-10 px-4 py-2.5" @click.stop>
                <input
                  type="checkbox"
                  class="h-3.5 w-3.5 rounded border-border accent-primary"
                  :checked="selectedPrefixes.has(folder.prefix)"
                  :disabled="Boolean(folderReason(folder.prefix))"
                  :title="folderReason(folder.prefix) ?? `Select ${folder.name}`"
                  :aria-label="`Select ${folder.name}`"
                  @change="setFolderSelected(folder.prefix, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td class="px-4 py-2.5">
                <span class="flex items-center gap-2">
                  <ObjectIcon :name="folder.name" folder class="h-4 w-4" /> {{ folder.name }}/
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
                  <IconButton
                    label="Delete folder…"
                    class="text-destructive hover:text-destructive"
                    :disabled-reason="folderReason(folder.prefix)"
                    @click.stop="deleteFolder(folder)"
                  ><Trash2 class="size-3.5" /></IconButton>
                </div>
              </td>
            </tr>
            <!-- Row click opens the file details; the action buttons stop
                 propagation and open the tab they name. -->
            <tr
              v-for="object in objects"
              :key="object.key"
              class="cursor-pointer border-t border-border hover:bg-muted/30"
              @click="openDetails(object)"
            >
              <td class="w-10 px-4 py-2.5" @click.stop>
                <input
                  type="checkbox"
                  class="h-3.5 w-3.5 rounded border-border accent-primary"
                  :checked="selectedObjectKeys.has(object.key)"
                  :disabled="Boolean(objectReason(object.key))"
                  :title="objectReason(object.key) ?? `Select ${object.name}`"
                  :aria-label="`Select ${object.name}`"
                  @change="setObjectSelected(object.key, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td class="px-4 py-2.5">
                <span class="flex items-center gap-2">
                  <ObjectIcon :name="object.name" class="h-4 w-4" /> <span class="truncate">{{ object.name }}</span>
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
                  <IconButton label="Download" @click.stop="download(object)"><Download class="size-3.5" /></IconButton>
                  <IconButton
                    label="Delete…"
                    class="text-destructive hover:text-destructive"
                    :disabled-reason="objectReason(object.key)"
                    @click.stop="deleteObject(object)"
                  ><Trash2 class="size-3.5" /></IconButton>
                  <IconButton label="More about this file" @click.stop="openDetails(object)"><MoreHorizontal class="size-3.5" /></IconButton>
                </div>
              </td>
            </tr>
            <!-- Marker-headed keys: hidden by an ordinary listing, offered back
                 here so a restore never leaves the browser. -->
            <tr
              v-for="entry in showDeleted ? deletedObjects : []"
              :key="`deleted:${entry.key}`"
              class="border-t border-border bg-muted/20 text-muted-foreground"
            >
              <td class="w-10 px-4 py-2.5"></td>
              <td class="px-4 py-2.5">
                <span class="flex items-center gap-2">
                  <ObjectIcon :name="entry.name" class="h-4 w-4 opacity-60" />
                  <span class="truncate line-through">{{ entry.name }}</span>
                  <Badge :variant="stateVariant('deleted')" size="sm">Deleted</Badge>
                </span>
              </td>
              <td class="px-4 py-2.5 text-right font-mono text-xs">-</td>
              <td class="px-4 py-2.5 text-xs">{{ entry.lastModified ? relativeTime(entry.lastModified.toISOString()) : '-' }}</td>
              <td class="px-4 py-2.5">
                <div class="flex items-center justify-end gap-1">
                  <Spinner v-if="restoringKey === entry.key" label="Restoring the object" />
                  <IconButton
                    label="Restore"
                    :disabled-reason="objectReason(entry.key)"
                    @click.stop="restoreObject(entry)"
                  ><Undo2 class="size-3.5" /></IconButton>
                  <IconButton
                    label="Delete permanently…"
                    class="text-destructive hover:text-destructive"
                    :disabled-reason="objectReason(entry.key)"
                    @click.stop="deleteRestorable(entry)"
                  ><Trash2 class="size-3.5" /></IconButton>
                </div>
              </td>
            </tr>
            <tr v-if="isEmpty">
              <td colspan="5" class="px-4 py-10 text-center text-xs text-muted-foreground">
                {{ canWriteCurrentPrefix ? 'This prefix is empty. Drop files here or use Add data.' : 'This prefix is empty. This session is read-only here.' }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="nextToken" class="border-t border-border px-4 py-2">
          <Button variant="ghost" size="sm" :disabled="listLoading" :aria-busy="listLoading" @click="loadObjects(true)">
            <Spinner v-if="listLoading" label="Loading more objects" class="text-current" /> Load more
          </Button>
        </div>
      </div>

      <slot />
      </template>
    </template>

  </div>
</template>
