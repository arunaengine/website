<script setup lang="ts">
// Folders on this machine that are bound to a bucket in the realm. The list is
// about the machine: what is on disk, where it goes, and what is waiting for a
// decision.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import DesktopHeader from '@/components/desktop/DesktopHeader.vue'
import BindFolderDialog from '@/components/desktop/BindFolderDialog.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { folderName, type SyncedFolder } from '@/lib/deviceApi'
import { needsYouCount } from '@/lib/syncStates'
import { relativeTime } from '@/lib/utils'
import { ArrowRight, FolderSync, Pause, Play, Plus, RefreshCw } from '@lucide/vue'

const { folders, listState, listError, busy, load, ensureLoaded, setPaused, sync } = useSyncedFolders()
const { displayName } = useRealmNodes()

const showBind = ref(false)
const actionError = ref<string | null>(null)

onMounted(() => void ensureLoaded())

const loading = computed(() => listState.value === 'loading' || listState.value === 'idle')

function remoteLabel(folder: SyncedFolder): string {
  const target = `${folder.remote.bucket}/${folder.remote.prefix}`.replace(/\/+$/, '/')
  return `${displayName(folder.remote.node_id)} · ${target}`
}

function needsYou(folder: SyncedFolder): number {
  return needsYouCount(folder.counters)
}

async function run(work: Promise<unknown>): Promise<void> {
  actionError.value = null
  try {
    await work
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div>
    <DesktopHeader
      title="Synced folders"
      description="Folders on this computer that keep in step with a bucket in the realm."
    >
      <template #actions>
        <Button variant="outline" size="sm" :disabled="loading" @click="load">
          <RefreshCw class="h-3.5 w-3.5" /> Refresh
        </Button>
        <Button size="sm" @click="showBind = true"><Plus class="h-4 w-4" /> Bind a folder</Button>
      </template>
    </DesktopHeader>

    <div class="container space-y-4 py-5">
      <p
        v-if="actionError"
        class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      >
        {{ actionError }}
      </p>

      <div v-if="listState === 'offline'" class="surface px-5 py-10 text-center">
        <p class="text-sm font-medium text-foreground">This device's node is not running.</p>
        <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Folders are kept by the node on this machine. Start it under This device and they come back.
        </p>
        <RouterLink :to="{ name: 'device' }" class="mt-4 inline-flex">
          <Button variant="outline" size="sm">Open This device</Button>
        </RouterLink>
      </div>

      <div v-else-if="listState === 'unsupported'" class="surface px-5 py-10 text-center">
        <p class="text-sm font-medium text-foreground">This node does not sync folders yet.</p>
        <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Its version serves no folder routes. Update the node and the surface fills itself in.
        </p>
      </div>

      <div v-else-if="listState === 'forbidden'" class="surface px-5 py-10 text-center">
        <p class="text-sm font-medium text-foreground">This session cannot manage the device.</p>
        <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Folders answer to the owner's own token. Sign in as the account this device belongs to.
        </p>
      </div>

      <ErrorPanel
        v-else-if="listState === 'error'"
        :message="listError || 'The folder list could not be loaded.'"
        @retry="load"
      />

      <div v-else-if="loading" class="space-y-3">
        <Skeleton v-for="n in 2" :key="n" class="h-28" />
      </div>

      <EmptyState
        v-else-if="!folders.length"
        title="No folders bound yet"
        description="Bind a folder and its files travel to the realm; a two-way folder also picks up what the realm gains."
      >
        <template #icon><FolderSync class="h-6 w-6" /></template>
        <Button size="sm" @click="showBind = true"><Plus class="h-4 w-4" /> Bind a folder</Button>
      </EmptyState>

      <ul v-else class="space-y-3">
        <li v-for="folder in folders" :key="folder.folder_id" class="surface overflow-hidden">
          <div class="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <RouterLink
                  :to="{ name: 'folder', params: { folderId: folder.folder_id } }"
                  class="font-display text-sm font-semibold text-foreground hover:text-primary hover:underline"
                >{{ folderName(folder.root) }}</RouterLink>
                <Badge variant="outline" class="text-[10px] uppercase">{{
                  folder.mode === 'two_way' ? 'two-way' : 'upload only'
                }}</Badge>
                <Badge v-if="folder.state === 'paused'" variant="secondary" class="text-[10px] uppercase">paused</Badge>
                <Badge v-else-if="folder.state === 'error'" variant="destructive" class="text-[10px] uppercase">error</Badge>
              </div>
              <div class="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <span class="truncate" :title="folder.root">{{ folder.root }}</span>
                <ArrowRight class="h-3 w-3 shrink-0" />
                <span class="truncate">{{ remoteLabel(folder) }}</span>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                :disabled="busy || folder.state === 'paused'"
                @click="run(sync(folder.folder_id))"
              >
                <RefreshCw class="h-3.5 w-3.5" /> Sync now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :disabled="busy"
                @click="run(setPaused(folder.folder_id, folder.state !== 'paused'))"
              >
                <Play v-if="folder.state === 'paused'" class="h-3.5 w-3.5" />
                <Pause v-else class="h-3.5 w-3.5" />
                {{ folder.state === 'paused' ? 'Resume' : 'Pause' }}
              </Button>
              <RouterLink :to="{ name: 'folder', params: { folderId: folder.folder_id } }">
                <Button variant="outline" size="sm">Open</Button>
              </RouterLink>
            </div>
          </div>

          <div
            class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground"
          >
            <span><span class="font-medium text-foreground">{{ folder.counters.in_sync }}</span> in sync</span>
            <span><span class="font-medium text-foreground">{{ folder.counters.uploading }}</span> uploading</span>
            <RouterLink
              v-if="needsYou(folder)"
              :to="{ name: 'folder', params: { folderId: folder.folder_id } }"
              class="font-medium text-amber-700 hover:underline dark:text-amber-300"
            >{{ needsYou(folder) }} need your decision</RouterLink>
            <RouterLink
              v-if="folder.counters.errors"
              :to="{ name: 'folder', params: { folderId: folder.folder_id } }"
              class="font-medium text-destructive hover:underline"
            >{{ folder.counters.errors }} failed</RouterLink>
            <span v-if="folder.last_reconcile_ms" class="ml-auto"
              >checked {{ relativeTime(new Date(folder.last_reconcile_ms).toISOString()) }}</span
            >
          </div>
        </li>
      </ul>
    </div>

    <BindFolderDialog v-model:open="showBind" @bound="load" />
  </div>
</template>
