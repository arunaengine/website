<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import BucketRow from '@/components/data/BucketRow.vue'
import { useBucketSearch } from '@/composables/useBucketSearch'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useS3 } from '@/composables/useS3'
import type { DataManager } from '@/composables/useDataManager'
import type { BucketSearchHit } from '@/lib/api'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { ArrowLeftRight, Boxes, ChevronRight, FolderPlus, History, KeyRound, Trash2 } from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps<{ manager: DataManager }>()
const emit = defineEmits<{ (e: 'sync', hit: BucketSearchHit): void }>()

const s3 = useS3()
const realmNodes = useRealmNodes()
const {
  bucket,
  remoteNodeId,
  requiredNodeId,
  bucketNodeChoice,
  selectedGroupId,
  bucketNameFilter,
  allBuckets: all,
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
  requestDelete,
} = props.manager

const allNodes = computed(() => bucketNodeChoice.value === null)
// An older node cannot list without a name; the open node's list stands in.
const searchList = computed(() => allNodes.value && !all.needsName.value)
const nodeBuckets = computed(() => {
  const term = bucketNameFilter.value.trim().toLowerCase()
  return term ? sidebarBuckets.value.filter((entry) => entry.bucket.toLowerCase().includes(term)) : sidebarBuckets.value
})
// Matches in other groups for the same query, below this group's list.
const search = useBucketSearch(bucketNameFilter)
const otherHits = computed(() =>
  search.hits.value.filter((hit) => hit.group_id !== selectedGroupId.value && !isWorkspaceBucket(hit.bucket)),
)
const createNode = computed(() => realmNodes.displayName(requiredNodeId.value))

function openHit(hit: BucketSearchHit) {
  openBucketOn(hit.bucket, realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id)
}

// Bucket deletion lives on the row it destroys; the shared dialog does the rest.
function deleteRefusal(name: string, nodeId: string | null): string | null {
  if (nodeId) return 'Only the node that serves this bucket can delete it.'
  if (!s3.canDeletePrefix(name, '', null)) {
    return 'This session cannot delete this bucket: it needs write on the whole bucket.'
  }
  return null
}
</script>

<template>
  <aside class="space-y-3">
    <div class="surface overflow-hidden" :aria-busy="bucketsRefreshing">
      <header class="flex items-center justify-between border-b border-border px-3 py-3">
        <h2 class="text-sm font-semibold text-foreground">Buckets</h2>
        <div class="flex items-center gap-2">
          <!-- Background revalidation only: the cached list stays readable behind it. -->
          <Spinner v-if="bucketsRefreshing" label="Refreshing buckets…" />
          <Badge variant="outline" size="count">{{ searchList ? all.hits.value.length : nodeBuckets.length }}</Badge>
        </div>
      </header>
      <div class="border-b border-border px-3 py-2">
        <Input v-model="bucketNameFilter" placeholder="Find a bucket" aria-label="Find a bucket" class="h-8 text-xs" />
      </div>
      <template v-if="searchList">
        <Spinner v-if="all.loading.value && !all.hits.value.length" show-label label="Loading buckets…" class="px-3 py-4" />
        <p v-else-if="all.error.value" class="px-3 py-3 text-xs text-destructive">{{ all.error.value }}</p>
        <ul v-else-if="all.hits.value.length" class="max-h-[420px] overflow-y-auto py-1">
          <li v-for="hit in all.hits.value" :key="`${hit.node_id}/${hit.bucket}`">
            <BucketRow
              :bucket="hit.bucket"
              :pinnable="false"
              :active="hit.bucket === bucket && (realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id) === remoteNodeId"
              @open="openHit(hit)"
            >
              <template #actions>
                <Badge variant="secondary" size="sm" class="min-w-0 max-w-24 shrink-0" :title="`${realmNodes.displayName(hit.node_id)} (${hit.node_id})`">
                  <span class="truncate">{{ realmNodes.displayName(hit.node_id) }}</span>
                </Badge>
              </template>
            </BucketRow>
          </li>
        </ul>
        <p v-else-if="!all.loading.value" class="px-3 py-4 text-xs text-muted-foreground">No buckets found.</p>
        <p v-if="all.failedNodes.value" class="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
          {{ all.failedNodes.value }} {{ all.failedNodes.value === 1 ? 'node' : 'nodes' }} did not answer.
          <button type="button" class="text-primary hover:underline" @click="all.reload()">Retry</button>
        </p>
        <div v-if="all.more.value" class="border-t border-border/70 p-2 text-center">
          <Button variant="outline" size="sm" :disabled="all.loading.value" @click="all.loadMore()">Load more</Button>
        </div>
      </template>
      <template v-else>
        <p v-if="allNodes" class="border-b border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground">
          Type 2 letters to search all nodes.
        </p>
        <Spinner v-if="bucketsLoading" show-label label="Loading buckets…" class="px-3 py-4" />
        <Notice v-else-if="bucketsError && bucketsAuthError" tone="warning" class="m-3">
          <p>The temporary S3 session was rejected. Close it, then explicitly open this node and group again.</p>
          <p class="mt-1 break-all font-mono text-[10px]">{{ bucketsError }}</p>
          <Button variant="outline" size="sm" class="mt-2" @click="s3.clearSessions()"><KeyRound class="h-3.5 w-3.5" /> Close temporary sessions</Button>
        </Notice>
        <p v-else-if="bucketsError && !bucketsLoaded" class="px-3 py-3 text-xs text-destructive">{{ bucketsError }}</p>
        <template v-else>
          <!-- A failed revalidation keeps the last good list and reports itself above it. -->
          <p v-if="bucketsError" class="border-b border-border/70 px-3 py-2 text-xs text-destructive">{{ bucketsError }}</p>
          <ul v-if="nodeBuckets.length" class="max-h-[420px] overflow-y-auto py-1">
            <li
              v-for="entry in nodeBuckets"
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
              >
                <template #actions>
                  <IconButton
                    label="Delete bucket…"
                    class="text-muted-foreground hover:text-destructive"
                    :disabled-reason="deleteRefusal(entry.bucket, entry.nodeId)"
                    side="right"
                    @click="requestDelete({ kind: 'bucket', bucket: entry.bucket, nodeId: entry.nodeId })"
                  >
                    <Trash2 class="h-3 w-3" />
                  </IconButton>
                </template>
              </BucketRow>
            </li>
          </ul>
          <p v-else class="px-3 py-4 text-xs text-muted-foreground">No buckets in this group yet.</p>
          <div v-if="recentBuckets.length" class="border-t border-border/70 py-1">
            <p class="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
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
              class="flex w-full items-center gap-1 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
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
                  class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
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
      </template>
      <div v-if="otherHits.length" class="border-t border-border/70 py-1">
        <p class="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Other groups</p>
        <ul class="max-h-56 overflow-y-auto pb-1">
          <li v-for="hit in otherHits" :key="hit.arn">
            <BucketRow
              :bucket="hit.bucket"
              :node-id="realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id"
              :subtitle="hit.group_name || null"
              :pinnable="false"
              @open="openSearchHit(hit)"
            >
              <template v-if="!realmNodes.isLocalNode(hit.node_id)" #actions>
                <IconButton :label="`Sync ${hit.bucket} to this node…`" side="right" @click="emit('sync', hit)">
                  <ArrowLeftRight class="h-3 w-3" />
                </IconButton>
              </template>
            </BucketRow>
          </li>
        </ul>
      </div>
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
          <Button variant="outline" size="sm" aria-label="Create bucket" :title="`Creates the bucket on ${createNode}`" :disabled="creatingBucket || !newBucketName.trim() || Boolean(createBucketBlocker)" @click="createBucket">
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
