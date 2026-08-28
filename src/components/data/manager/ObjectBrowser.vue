<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import Popover from '@/components/ui/Popover.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import BucketRoutingDialog from '@/components/data/BucketRoutingDialog.vue'
import BucketPolicyDialog from '@/components/residency/BucketPolicyDialog.vue'
import ObjectLocationsDialog from '@/components/data/ObjectLocationsDialog.vue'
import WatchButton from '@/components/watches/WatchButton.vue'
import { useAruna } from '@/composables/useAruna'
import type { DataManager } from '@/composables/useDataManager'
import { useS3, type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { featureEnabled } from '@/lib/config'
import { formatBytes, relativeTime } from '@/lib/utils'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ArrowLeftRight,
  Bomb,
  CloudOff,
  Download,
  Eye,
  FolderPlus,
  HardDrive,
  KeyRound,
  Link2,
  Plus,
  Route,
  ShieldCheck,
  Trash2,
} from '@lucide/vue'

const props = defineProps<{ manager: DataManager }>()
const emit = defineEmits<{
  (e: 'add-data'): void
  (e: 'new-folder'): void
  (e: 'syncs'): void
  (e: 'sync-to-node'): void
  (e: 'bulk-delete'): void
  (e: 'delete-bucket', bucket: string, nodeId: string | null): void
  (e: 'delete-object', object: ObjectEntry): void
  (e: 'delete-folder', folder: FolderEntry): void
  (e: 'purge-object', object: ObjectEntry): void
  (e: 'purge-folder', folder: FolderEntry): void
}>()

const s3 = useS3()
const { isRealmAdmin } = useAruna()
const residencyPoliciesEnabled = featureEnabled('placementAdmin')
const {
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
  openPreview,
  download,
  keyIsSynced,
  bucketSyncCount,
  showSyncButton,
  selectedObjectKeys,
  selectedObjectCount,
  selectableListedObjects,
  allListedObjectsSelected,
  someListedObjectsSelected,
  setObjectSelected,
  setAllListedObjectsSelected,
  canWriteCurrentPrefix,
  writeRestrictionMessage,
  watchPathPrefix,
  remoteBlocked,
  remoteEndpointMissing,
  retrySpinning,
  onRetryObjects,
  requestUpload,
} = props.manager

// Per-bucket storage rules; local buckets only, like the bucket delete
// affordance, because the rules are read and written on the connected node.
const routingDialogOpen = ref(false)
const residencyDialogOpen = ref(false)
// Per-version copy list; the connected node answers for its own objects only.
const locationsKey = ref<string | null>(null)

const dragActive = ref(false)

function onDrop(event: DragEvent) {
  dragActive.value = false
  if (!canWriteCurrentPrefix.value || !bucket.value || !event.dataTransfer?.files.length) return
  void requestUpload(Array.from(event.dataTransfer.files))
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
            :disabled="selectedObjectCount === 0"
            :title="`Delete ${selectedObjectCount} selected key${selectedObjectCount === 1 ? '' : 's'}`"
            @click="emit('bulk-delete')"
          >
            <Trash2 class="h-4 w-4" /> Delete selected ({{ selectedObjectCount }})
          </Button>
          <!-- Same local-only gating as the sidebar delete: remote S3
               endpoints are usually CORS-blocked from this origin. -->
          <Button
            v-if="!remoteNodeId"
            variant="outline"
            size="icon-sm"
            class="h-8 w-8 text-destructive hover:text-destructive"
            :title="`Delete ${bucket}`"
            aria-label="Delete bucket"
            :disabled="!s3.canDeletePrefix(bucket, '', null)"
            @click="emit('delete-bucket', bucket, null)"
          >
            <Trash2 class="h-4 w-4" />
          </Button>
          <WatchButton
            v-if="watchPathPrefix"
            :path-prefix="watchPathPrefix"
            event-kind="data_uploaded"
            :resource-label="`${bucket}/${s3Prefix}`"
            size="sm"
          />
          <Button
            v-if="!remoteNodeId"
            variant="outline"
            size="sm"
            title="Where new files in this bucket are stored"
            @click="routingDialogOpen = true"
          >
            <Route class="h-4 w-4" /> Routing
          </Button>
          <Button
            v-if="!remoteNodeId && residencyPoliciesEnabled && isRealmAdmin"
            variant="outline"
            size="sm"
            title="Residency policies for this bucket"
            @click="residencyDialogOpen = true"
          >
            <ShieldCheck class="h-4 w-4" /> Residency
          </Button>
          <Button
            v-if="showSyncButton"
            variant="outline"
            size="sm"
            :title="bucketSyncCount ? `${bucketSyncCount} sync relationship${bucketSyncCount === 1 ? '' : 's'}, open sync status` : 'Sync relationships for this bucket'"
            @click="emit('syncs')"
          >
            <ArrowLeftRight class="h-4 w-4" :class="bucketSyncCount ? 'text-primary' : ''" /> Syncs
            <Badge v-if="bucketSyncCount" variant="secondary" class="ml-1">{{ bucketSyncCount }}</Badge>
          </Button>
          <Popover v-if="showReferenceStats">
            <Button
              variant="outline"
              size="sm"
              :title="`${referenceStats.count} referenced object${referenceStats.count === 1 ? '' : 's'} · ${formatBytes(referenceStats.bytes)}, open per-source breakdown`"
            >
              <Link2 class="h-4 w-4 text-primary" />
              <span class="font-mono text-xs">{{ formatBytes(referenceStats.bytes) }}</span>
              <Badge variant="secondary" class="ml-1">{{ referenceStats.count }}</Badge>
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
          <Button v-if="!remoteNodeId" size="sm" :disabled="!canWriteCurrentPrefix" :title="writeRestrictionMessage ?? 'Add data'" @click="emit('add-data')"><Plus class="h-4 w-4" /> Add data</Button>
        </div>
      </div>
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
                  :checked="allListedObjectsSelected"
                  :indeterminate="someListedObjectsSelected && !allListedObjectsSelected"
                  :disabled="selectableListedObjects.length === 0"
                  aria-label="Select all listed objects"
                  @change="setAllListedObjectsSelected(($event.target as HTMLInputElement).checked)"
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
              <td class="w-10 px-4 py-2.5"></td>
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-destructive hover:text-destructive"
                    aria-label="Permanently delete folder and all versions"
                    :disabled="!s3.canDeletePrefix(bucket, folder.prefix, remoteNodeId)"
                    :title="s3.canDeletePrefix(bucket, folder.prefix, remoteNodeId) ? 'Permanently delete folder and all versions' : 'This session cannot delete this entire folder'"
                    @click.stop="emit('purge-folder', folder)"
                  ><Bomb class="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" aria-label="Delete folder" :disabled="!s3.canDeletePrefix(bucket, folder.prefix, remoteNodeId)" :title="s3.canDeletePrefix(bucket, folder.prefix, remoteNodeId) ? 'Delete folder' : 'This session cannot delete this entire folder'" @click.stop="emit('delete-folder', folder)"><Trash2 class="size-3.5" /></Button>
                </div>
              </td>
            </tr>
            <!-- Row click previews; the action buttons stop propagation. -->
            <tr
              v-for="object in objects"
              :key="object.key"
              class="cursor-pointer border-t border-border hover:bg-muted/30"
              @click="openPreview(object)"
            >
              <td class="w-10 px-4 py-2.5" @click.stop>
                <input
                  type="checkbox"
                  class="h-3.5 w-3.5 rounded border-border accent-primary"
                  :checked="selectedObjectKeys.has(object.key)"
                  :disabled="!s3.canWrite(bucket, object.key, remoteNodeId)"
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
                  <Button variant="ghost" size="icon-sm" aria-label="Preview" @click.stop="openPreview(object)"><Eye class="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Download" @click.stop="download(object)"><Download class="size-3.5" /></Button>
                  <Button
                    v-if="!remoteNodeId"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Storage locations"
                    title="Storage locations: where this file is stored"
                    @click.stop="locationsKey = object.key"
                  ><HardDrive class="size-3.5" /></Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-destructive hover:text-destructive"
                    aria-label="Permanently delete all versions"
                    :disabled="!s3.canWrite(bucket, object.key, remoteNodeId)"
                    :title="s3.canWrite(bucket, object.key, remoteNodeId) ? 'Permanently delete all versions' : 'This session cannot delete this object'"
                    @click.stop="emit('purge-object', object)"
                  ><Bomb class="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" aria-label="Delete" :disabled="!s3.canWrite(bucket, object.key, remoteNodeId)" :title="s3.canWrite(bucket, object.key, remoteNodeId) ? 'Delete object' : 'This session cannot delete this object'" @click.stop="emit('delete-object', object)"><Trash2 class="size-3.5" /></Button>
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
          <Button variant="ghost" size="sm" :disabled="listLoading" @click="loadObjects(true)">Load more</Button>
        </div>
      </div>

      <slot />
      </template>
    </template>

    <BucketRoutingDialog v-model:open="routingDialogOpen" :bucket="bucket" :group-id="activeGroupId" />

    <BucketPolicyDialog v-if="residencyPoliciesEnabled && isRealmAdmin" v-model:open="residencyDialogOpen" :bucket="bucket" />

    <ObjectLocationsDialog
      :open="locationsKey !== null"
      :bucket="bucket"
      :object-key="locationsKey ?? ''"
      :group-id="activeGroupId"
      @update:open="(v: boolean) => { if (!v) locationsKey = null }"
    />
  </div>
</template>
