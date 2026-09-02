<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import BucketRow from '@/components/data/BucketRow.vue'
import BucketSearchBox from '@/components/data/BucketSearchBox.vue'
import { useS3 } from '@/composables/useS3'
import type { DataManager } from '@/composables/useDataManager'
import type { BucketSearchHit } from '@/lib/api'
import { Boxes, ChevronRight, FolderPlus, History, KeyRound } from '@lucide/vue'

const props = defineProps<{ manager: DataManager }>()
const emit = defineEmits<{ (e: 'sync', hit: BucketSearchHit): void }>()

const s3 = useS3()
const {
  bucket,
  remoteNodeId,
  syncByBucket,
  syncKeyFor,
  openSearchHit,
  openBucket,
  openBucketOn,
  shortcuts,
  sidebarBuckets,
  recentBuckets,
  workspaceBuckets,
  workspacesOpen,
  bucketsLoaded,
  bucketsLoading,
  bucketsRefreshing,
  bucketsError,
  bucketsAuthError,
  newBucketName,
  newBucketProblem,
  newBucketRefusal,
  createBucketBlocker,
  creatingBucket,
  createBucket,
  createBucketError,
} = props.manager
</script>

<template>
  <aside class="space-y-3">
    <div class="surface p-3">
      <BucketSearchBox :sync-by-bucket="syncByBucket" @open="openSearchHit" @sync="(hit: BucketSearchHit) => emit('sync', hit)" />
    </div>

    <div class="surface overflow-hidden" :aria-busy="bucketsRefreshing">
      <header class="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 class="text-sm font-semibold text-foreground">Buckets</h2>
        <div class="flex items-center gap-2">
          <!-- Background revalidation only: the cached list stays readable behind it. -->
          <Spinner v-if="bucketsRefreshing" label="Refreshing buckets…" />
          <Badge variant="outline" size="count">{{ sidebarBuckets.length }}</Badge>
        </div>
      </header>
      <Spinner v-if="bucketsLoading" show-label label="Loading buckets…" class="px-4 py-4" />
      <Notice v-else-if="bucketsError && bucketsAuthError" tone="warning" class="m-3">
        <p>The temporary S3 session was rejected. Close it, then explicitly open this node and group again.</p>
        <p class="mt-1 break-all font-mono text-[10px]">{{ bucketsError }}</p>
        <Button variant="outline" size="sm" class="mt-2" @click="s3.clearSessions()"><KeyRound class="h-3.5 w-3.5" /> Close temporary sessions</Button>
      </Notice>
      <p v-else-if="bucketsError && !bucketsLoaded" class="px-4 py-3 text-xs text-destructive">{{ bucketsError }}</p>
      <template v-else>
        <!-- A failed revalidation keeps the last good list and reports itself above it. -->
        <p v-if="bucketsError" class="border-b border-border/70 px-4 py-2 text-xs text-destructive">{{ bucketsError }}</p>
        <ul v-if="sidebarBuckets.length" class="max-h-[420px] overflow-y-auto py-1">
          <li
            v-for="entry in sidebarBuckets"
            :key="`${entry.nodeId ?? 'local'}/${entry.bucket}`"
          >
            <BucketRow
              :bucket="entry.bucket"
              :node-id="entry.nodeId"
              :pinned="entry.pinned"
              :synced="syncByBucket.has(syncKeyFor(entry.nodeId, entry.bucket))"
              :active="entry.bucket === bucket && (entry.nodeId ?? null) === remoteNodeId"
              @open="openBucketOn(entry.bucket, entry.nodeId)"
              @toggle-pin="shortcuts.togglePin(entry.bucket, entry.nodeId)"
            />
          </li>
        </ul>
        <p v-else class="px-4 py-4 text-xs text-muted-foreground">No buckets in this group yet.</p>
        <div v-if="recentBuckets.length" class="border-t border-border/70 py-1">
          <p class="flex items-center gap-1.5 px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">
            <History class="h-3.5 w-3.5 shrink-0" />
            Recently browsed
          </p>
          <ul class="pb-1">
            <li v-for="entry in recentBuckets" :key="`${entry.nodeId ?? 'local'}/${entry.bucket}`">
              <BucketRow
                :bucket="entry.bucket"
                :node-id="entry.nodeId"
                :pinned="false"
                :synced="syncByBucket.has(syncKeyFor(entry.nodeId, entry.bucket))"
                :active="entry.bucket === bucket && (entry.nodeId ?? null) === remoteNodeId"
                @open="openBucketOn(entry.bucket, entry.nodeId)"
                @toggle-pin="shortcuts.togglePin(entry.bucket, entry.nodeId)"
              />
            </li>
          </ul>
        </div>
        <div v-if="workspaceBuckets.length" class="border-t border-border/70 py-1">
          <button
            type="button"
            class="flex w-full items-center gap-1 px-4 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
            title="Scratch buckets (ws-…) created by runs"
            @click="workspacesOpen = !workspacesOpen"
          >
            <ChevronRight :class="['h-3.5 w-3.5 shrink-0 transition-transform', workspacesOpen && 'rotate-90']" />
            System workspaces
            <Badge variant="outline" size="count" class="ml-auto">{{ workspaceBuckets.length }}</Badge>
          </button>
          <ul v-if="workspacesOpen" class="max-h-56 overflow-y-auto pb-1">
            <li v-for="entry in workspaceBuckets" :key="entry.name">
              <button
                class="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs hover:bg-muted"
                :class="entry.name === bucket && !remoteNodeId ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'"
                @click="openBucket(entry.name)"
              >
                <Boxes class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate font-mono">{{ entry.name }}</span>
              </button>
            </li>
          </ul>
        </div>
      </template>
      <footer class="space-y-2 border-t border-border p-3">
        <div class="flex gap-2">
          <Input
            v-model="newBucketName"
            data-tour="bucket-create"
            placeholder="new-bucket-name"
            class="h-8 font-mono text-xs"
            :invalid="newBucketProblem ? 'error' : undefined"
            aria-label="New bucket name"
            @keyup.enter="createBucket"
          />
          <Button variant="outline" size="sm" aria-label="Create bucket" :disabled="creatingBucket || !newBucketName.trim() || Boolean(createBucketBlocker)" @click="createBucket">
            <FolderPlus class="h-4 w-4" />
          </Button>
        </div>
        <p v-if="createBucketError" class="text-xs text-destructive">{{ createBucketError }}</p>
        <p v-else-if="newBucketProblem" class="text-xs text-destructive">{{ newBucketProblem }}</p>
        <p v-else-if="newBucketRefusal" class="text-xs text-muted-foreground">{{ newBucketRefusal }}</p>
      </footer>
    </div>
  </aside>
</template>
