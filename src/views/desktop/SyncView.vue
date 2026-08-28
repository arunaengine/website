<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import DeviceSurfaceState from '@/components/desktop/DeviceSurfaceState.vue'
import SyncItemRow from '@/components/desktop/SyncItemRow.vue'
import { useDeviceSync } from '@/composables/useDeviceSync'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useRefresh } from '@/composables/useRefresh'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { useUploadQueue } from '@/composables/useUploadQueue'
import type { SyncedFolder } from '@/lib/deviceApi'
import { stateVariant } from '@/lib/stateBadge'
import { itemChip, type SyncItem } from '@/lib/syncStates'
import { formatBytes, relativeTime } from '@/lib/utils'
import { FileText, FolderSync, Plus, Search, Upload } from '@lucide/vue'

const router = useRouter()
const { status, state, loading, error, runError, running, runSync, load } = useDeviceSync()
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
const { items: uploadItems } = useUploadQueue()

const filter = ref('all')
const showBind = ref(false)

onMounted(() => void Promise.all([load(), ensureLoaded(), loadTransfers()]))

async function reload(): Promise<void> {
  await Promise.all([load(), loadFolders(), loadTransfers()])
}

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(reload)
const spinning = computed(
  () => refreshBusy.value || loading.value || listState.value === 'loading' || transfersState.value === 'loading',
)

// Three device reads back this page; the first one that is not ready is the
// one worth explaining, so the others stay quiet behind it.
const surface = computed(() =>
  [
    { state: state.value, subject: 'its sync status', error: error.value, retry: load },
    { state: listState.value, subject: 'its folders', error: listError.value, retry: loadFolders },
    { state: transfersState.value, subject: 'its transfers', error: transfersError.value, retry: loadTransfers },
  ].find((entry) => entry.state !== 'ready'),
)

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

function category(item: SyncItem): string {
  const variant = itemChip(item).variant
  if (variant === 'destructive' || variant === 'warn') return 'attention'
  if (variant === 'sky') return 'syncing'
  if (variant === 'success') return 'in-sync'
  return 'other'
}

const chips = computed(() => [
  { value: 'all', label: 'All', count: items.value.length },
  {
    value: 'attention',
    label: 'Needs attention',
    count: items.value.filter((item) => category(item) === 'attention').length,
  },
  { value: 'syncing', label: 'Syncing', count: items.value.filter((item) => category(item) === 'syncing').length },
  { value: 'in-sync', label: 'In sync', count: items.value.filter((item) => category(item) === 'in-sync').length },
])

const shown = computed(() =>
  filter.value === 'all' ? items.value : items.value.filter((item) => category(item) === filter.value),
)

const lastSync = computed(() =>
  status.value.lastSyncMs ? relativeTime(new Date(status.value.lastSyncMs).toISOString()) : 'never',
)
const canRun = computed(() => state.value === 'ready' && status.value.realmReachable && !running.value)
const nothingSynced = computed(
  () => state.value === 'ready' && listState.value === 'ready' && !items.value.length && !uploadItems.value.length,
)

function itemKey(item: SyncItem): string {
  return item.kind === 'folder' ? `folder:${item.folder.folder_id}` : `document:${item.document.documentId}`
}

function runFolder(folder: SyncedFolder): void {
  void sync(folder.folder_id).catch(() => undefined)
}

function toggleFolder(folder: SyncedFolder): void {
  void setPaused(folder.folder_id, folder.state !== 'paused').catch(() => undefined)
}

// The datasets view opens its own search on this query, so no DOM is touched.
async function findOfflineDataset(): Promise<void> {
  await router.push({ name: 'datasets', query: { focus: 'search' } })
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="This computer"
      title="Sync"
      description="Folders and datasets this computer keeps in step with the realm."
    >
      <template #breadcrumbs>
        <Badge :variant="stateVariant(status.realmReachable ? 'reachable' : 'unreachable')">
          {{ status.realmReachable ? 'Realm reachable' : 'Realm unreachable' }}
        </Badge>
        <span>·</span>
        <span>last sync {{ lastSync }}</span>
        <span>·</span>
        <span>{{ status.pendingTotal }} {{ status.pendingTotal === 1 ? 'change' : 'changes' }} pending</span>
      </template>
      <template #actions>
        <RefreshButton :busy="spinning" @click="onRefresh" />
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="sm"><Plus class="h-4 w-4" /> Add</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="showBind = true">
              <FolderSync class="h-4 w-4" /> Sync a folder…
            </DropdownMenuItem>
            <DropdownMenuItem @click="findOfflineDataset">
              <Search class="h-4 w-4" /> Keep a dataset offline…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" :disabled="!canRun" @click="runSync">
          <FolderSync class="h-4 w-4" /> {{ running ? 'Syncing' : 'Sync now' }}
        </Button>
      </template>
    </PageHeader>

    <div class="container space-y-5 py-5">
      <RefusalNote v-if="runError" :message="runError" />

      <Notice
        v-else-if="state === 'ready' && !status.realmReachable"
        tone="warning"
        title="Realm unreachable"
      >
        Your edits are kept here and go out on their own once it answers.
      </Notice>

      <DeviceSurfaceState
        v-if="surface"
        :state="surface.state"
        :subject="surface.subject"
        :error="surface.error"
        @retry="surface.retry()"
      />

      <div v-if="spinning && !items.length && !uploadItems.length" class="space-y-3">
        <Skeleton v-for="n in 2" :key="n" class="h-28" />
      </div>

      <EmptyState
        v-else-if="nothingSynced"
        title="Nothing syncs with this computer yet"
        description="Sync a folder or keep a realm dataset offline."
      >
        <template #icon><FileText class="h-6 w-6" /></template>
        <div class="flex flex-wrap justify-center gap-2">
          <Button size="sm" @click="showBind = true"><FolderSync class="h-4 w-4" /> Sync a folder…</Button>
          <Button variant="outline" size="sm" @click="findOfflineDataset">
            <Search class="h-4 w-4" /> Keep a dataset offline…
          </Button>
        </div>
      </EmptyState>

      <template v-else>
        <section v-if="items.length" class="space-y-3">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Synced items</h2>
            <FilterChips v-model="filter" :options="chips" aria-label="Filter synced items by state" />
          </header>

          <EmptyState v-if="!shown.length" compact title="No synced item is in this state." />
          <ul v-else class="surface divide-y divide-border/70 overflow-hidden">
            <SyncItemRow
              v-for="item in shown"
              :key="itemKey(item)"
              :item="item"
              :busy="busy"
              @sync="item.kind === 'folder' && runFolder(item.folder)"
              @pause="item.kind === 'folder' && toggleFolder(item.folder)"
            />
          </ul>
        </section>

        <section v-if="uploadItems.length" class="space-y-3">
          <header class="flex flex-wrap items-center gap-2">
            <Upload class="h-4 w-4 text-primary" />
            <h2 class="font-display text-sm font-semibold text-aruna-navy">Uploads from this window</h2>
            <Badge variant="outline" size="sm">{{ uploadItems.length }}</Badge>
          </header>
          <div class="surface space-y-2 px-5 py-3.5">
            <div v-for="item in uploadItems.slice(0, 3)" :key="item.id" class="flex items-center gap-3 text-[11px]">
              <div class="min-w-0 flex-1">
                <p class="truncate text-foreground">{{ item.name }}</p>
                <p class="hash truncate">{{ item.bucket }}/{{ item.key }}</p>
                <p v-if="item.error" class="text-destructive">{{ item.error }}</p>
              </div>
              <Progress :value="item.progress" :label="`${item.name}: ${item.progress}%`" class="h-1.5 w-28" />
              <span class="text-muted-foreground">{{ formatBytes(item.size) }}</span>
            </div>
            <p v-if="uploadItems.length > 3" class="text-[11px] text-muted-foreground">
              and {{ uploadItems.length - 3 }} more
            </p>
          </div>
        </section>
      </template>
    </div>

    <BindFolderDialog v-model:open="showBind" @bound="loadFolders" />
  </div>
</template>
