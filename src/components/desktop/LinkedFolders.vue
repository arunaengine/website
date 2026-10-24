<script setup lang="ts">
// Folders and offline datasets this computer keeps in step with the realm. A
// folder row opens its folder page.
import { computed, onMounted, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import DeviceSurfaceState from '@/components/desktop/DeviceSurfaceState.vue'
import SyncItemRow from '@/components/desktop/SyncItemRow.vue'
import { useDeviceSync } from '@/composables/useDeviceSync'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import type { SyncedFolder } from '@/lib/deviceApi'
import type { SyncItem } from '@/lib/syncStates'
import { FolderPlus, FolderSync } from '@lucide/vue'

const { status, state, error, load } = useDeviceSync()
const {
  folders,
  listState,
  listError,
  busy,
  actionErrors,
  load: loadFolders,
  ensureLoaded,
  setPaused,
  sync,
} = useSyncedFolders()
const { all: transfers, state: transfersState, error: transfersError, load: loadTransfers } = useDeviceTransfers()

const showBind = ref(false)

onMounted(() => void Promise.all([load(), ensureLoaded(), loadTransfers()]))

// Three device reads back this list; the first one that is not ready is the
// one worth explaining, so the others stay quiet behind it.
const surface = computed(() =>
  [
    { state: state.value, subject: 'its sync status', error: error.value, retry: load },
    { state: listState.value, subject: 'its folders', error: listError.value, retry: loadFolders },
    { state: transfersState.value, subject: 'its transfers', error: transfersError.value, retry: loadTransfers },
  ].find((entry) => entry.state !== 'ready'),
)
const waiting = computed(() => surface.value?.state === 'idle' || surface.value?.state === 'loading')

const items = computed<SyncItem[]>(() => [
  ...folders.value.map(
    (folder): SyncItem => ({
      kind: 'folder',
      folder,
      actionError: actionErrors.get(folder.folder_id) ?? null,
      transfers: transfers.value.filter((transfer) => transfer.folder_id === folder.folder_id),
    }),
  ),
  ...status.value.documents.map((document): SyncItem => ({ kind: 'document', document })),
])

function itemKey(item: SyncItem): string {
  return item.kind === 'folder' ? `folder:${item.folder.folder_id}` : `document:${item.document.documentId}`
}

function runFolder(folder: SyncedFolder): void {
  void sync(folder.folder_id).catch(() => undefined)
}

function toggleFolder(folder: SyncedFolder): void {
  void setPaused(folder.folder_id, folder.state !== 'paused').catch(() => undefined)
}
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
      <div class="flex items-center gap-2">
        <FolderSync class="h-4 w-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Linked folders</h2>
        <Badge v-if="!surface" variant="outline" size="count">{{ items.length }}</Badge>
      </div>
      <Button variant="outline" size="sm" @click="showBind = true">
        <FolderPlus class="h-3.5 w-3.5" /> Link a local folder
      </Button>
    </header>

    <Notice v-if="state === 'ready' && !status.realmReachable" tone="warning" class="mx-5 mt-3" title="Realm unreachable">
      Your edits are kept here and go out on their own once it answers.
    </Notice>

    <Skeleton v-if="waiting" class="mx-5 my-3 h-12" />
    <DeviceSurfaceState
      v-else-if="surface"
      class="m-5"
      :state="surface.state"
      :subject="surface.subject"
      :error="surface.error"
      @retry="surface.retry()"
    />
    <ul v-else-if="items.length" class="divide-y divide-border/70">
      <SyncItemRow
        v-for="item in items"
        :key="itemKey(item)"
        :item="item"
        :busy="busy"
        @sync="item.kind === 'folder' && runFolder(item.folder)"
        @pause="item.kind === 'folder' && toggleFolder(item.folder)"
      />
    </ul>
    <EmptyState
      v-else
      compact
      class="m-5"
      title="No folder is linked yet."
      description="Link a folder to keep it in step with a bucket."
    >
      <Button size="sm" @click="showBind = true"><FolderPlus class="h-3.5 w-3.5" /> Link a local folder</Button>
    </EmptyState>

    <BindFolderDialog v-model:open="showBind" @bound="loadFolders" />
  </section>
</template>
