<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import BucketRow from '@/components/data/BucketRow.vue'
import { useBucketJobs } from '@/composables/useBucketJobs'
import BucketStorageDialog from '@/components/data/BucketStorageDialog.vue'
import MockBucketRows from '@/components/data/manager/MockBucketRows.vue'
import { useBucketSearch } from '@/composables/useBucketSearch'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useS3 } from '@/composables/useS3'
import type { DataManager } from '@/composables/useDataManager'
import type { BucketSearchHit } from '@/lib/api'
import { isDesktop } from '@/lib/desktop'
import type { BindSource } from '@/lib/bindSource'
import { defaultPlacement, mockEnabled, placementLabel } from '@/lib/distributedMock'
import { folderName } from '@/lib/deviceApi'
import { placeName, placeTitle } from '@/lib/bucketPlace'
import { isHiddenBucket } from '@/lib/workspaces'
import { ArrowLeftRight, Boxes, ChevronRight, FolderPlus, FolderSync, History, KeyRound, Plus, Trash2 } from '@lucide/vue'
import { computed, ref, useId, watch } from 'vue'

const props = defineProps<{ manager: DataManager }>()
// Aruna Desktop offers one action: link a bucket to a folder on this computer.
const desktop = isDesktop()
const emit = defineEmits<{
  (e: 'sync', hit: BucketSearchHit): void
  (e: 'sync-computer', source: BindSource): void
  (e: 'new-bucket'): void
}>()

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
  buckets,
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
  bindSourceFor,
  linkedFolderFor,
} = props.manager

// Steps running on this node's buckets of the group; rows of other nodes show none.
// They are read again whenever a list was read, in either mode (not on each typed letter).
const listings = ref(0)
watch(() => all.loading.value, (busy) => busy || listings.value++)
const jobs = useBucketJobs(selectedGroupId, computed(() => [buckets.value, listings.value]))

// Where the next bucket is stored (node mock); this node unless changed.
const storageOpen = ref(false)
const placement = ref(defaultPlacement())

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
  search.hits.value.filter((hit) => hit.group_id !== selectedGroupId.value && !isHiddenBucket(hit.bucket)),
)
// Hover text of a row; a row without a node is on this node.
function rowNode(nodeId: string | null): string {
  return `On ${realmNodes.displayName(nodeId ?? realmNodes.localNodeId.value)}`
}
// The desktop names every row's place, short; the tooltip adds location, kind and id.
function rowPlace(nodeId: string | null): { place: string | null; placeTitle: string | null } {
  if (!desktop) return { place: null, placeTitle: null }
  const node = realmNodes.nodeById(nodeId ?? realmNodes.localNodeId.value)
  if (node) {
    const short = node.kind === 'user' && node.isLocal ? 'This computer' : node.label
    return { place: short, placeTitle: `${placeName(node)} (${placeTitle(node)})` }
  }
  return { place: realmNodes.isLocalNode(nodeId) ? 'This computer' : realmNodes.displayName(nodeId), placeTitle: null }
}
// One node's list names a row's place only where it is not that node.
function listPlace(nodeId: string | null): { place: string | null; placeTitle: string | null } {
  const other = (id: string | null) => (id && !realmNodes.isLocalNode(id) ? id : null)
  return other(nodeId) === other(remoteNodeId.value) ? { place: null, placeTitle: null } : rowPlace(nodeId)
}
// Arrow keys move through the shown rows of this group, then of other groups.
const listId = `bucket-results-${useId()}`
const groupOpeners = computed<(() => void)[]>(() => {
  if (searchList.value) return all.error.value ? [] : all.hits.value.map((hit) => () => openHit(hit))
  if (bucketsLoading.value || (bucketsError.value && (bucketsAuthError.value || !bucketsLoaded.value))) return []
  return nodeBuckets.value.map((entry) => () => openBucketOn(entry.bucket, entry.nodeId))
})
const openers = computed(() => [...groupOpeners.value, ...otherHits.value.map((hit) => () => openSearchHit(hit))])
const activeIndex = ref(-1)
watch(openers, () => (activeIndex.value = -1))

function onKeydown(event: KeyboardEvent) {
  const count = openers.value.length
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!count) return
    const down = event.key === 'ArrowDown'
    if (activeIndex.value < 0) activeIndex.value = down ? 0 : count - 1
    else activeIndex.value = (activeIndex.value + (down ? 1 : count - 1)) % count
  } else if (event.key === 'Enter') {
    openers.value[activeIndex.value]?.()
  } else if (event.key === 'Escape') {
    activeIndex.value = -1
  }
}

const otherPartial = computed(() => search.searched.value && search.nodesFailed.value > 0)
const createNode = computed(() => realmNodes.displayName(requiredNodeId.value))

function openHit(hit: BucketSearchHit) {
  openBucketOn(hit.bucket, realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id)
}

function emitSync(source: BindSource | null) {
  if (source) emit('sync-computer', source)
}

// Every desktop row keeps a link column, empty or not, so the rows line up.
function linkedTo(nodeId: string | null, name: string): string | null | undefined {
  if (!desktop) return undefined
  const folder = linkedFolderFor(nodeId, name)
  return folder ? folderName(folder.root) : null
}

// A hit names its own node and group; nothing falls back to the connected node.
const hitSource = (hit: BucketSearchHit) => (desktop ? bindSourceFor(hit.bucket, hit.node_id, hit.group_id) : null)

// Bucket deletion lives on the row it destroys; the shared dialog does the rest.
function deleteRefusal(name: string, nodeId: string | null): string | null {
  // The serving node decides in the dialog's preflight.
  if (nodeId) return null
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
        <Input
          v-model="bucketNameFilter"
          placeholder="Find a bucket"
          aria-label="Find a bucket"
          role="combobox"
          aria-autocomplete="list"
          :aria-controls="`${listId}-group ${listId}-other`"
          :aria-expanded="openers.length > 0"
          class="h-8 text-xs"
          @keydown="onKeydown"
        />
      </div>
      <template v-if="searchList">
        <Spinner v-if="all.loading.value && !all.hits.value.length" show-label label="Loading buckets…" class="px-3 py-4" />
        <p v-else-if="all.error.value" class="px-3 py-3 text-xs text-destructive">{{ all.error.value }}</p>
        <ul v-else-if="all.hits.value.length" :id="`${listId}-group`" role="listbox" class="max-h-[420px] overflow-y-auto py-1">
          <li v-for="(hit, index) in all.hits.value" :key="`${hit.node_id}/${hit.bucket}`">
            <BucketRow
              :bucket="hit.bucket"
              :pinnable="false"
              option
              :highlighted="index === activeIndex"
              :job="realmNodes.isLocalNode(hit.node_id) ? jobs.get(hit.bucket) : null"
              :active="hit.bucket === bucket && (realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id) === remoteNodeId"
              v-bind="rowPlace(hit.node_id)"
              :linked-to="linkedTo(hit.node_id, hit.bucket)"
              @open="openHit(hit)"
            >
              <template #tooltip>{{ rowNode(hit.node_id) }}</template>
              <template #link>
                <IconButton v-if="hitSource(hit)" :label="`Link a local folder to ${hit.bucket}…`" side="right" @click="emitSync(hitSource(hit))">
                  <FolderSync class="h-3 w-3" />
                </IconButton>
              </template>
            </BucketRow>
          </li>
          <MockBucketRows :filter="bucketNameFilter" :active="bucket" @open="openBucket" />
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
          <ul v-if="nodeBuckets.length" :id="`${listId}-group`" role="listbox" class="max-h-[420px] overflow-y-auto py-1">
            <li
              v-for="(entry, index) in nodeBuckets"
              :key="`${entry.nodeId ?? 'local'}/${entry.bucket}`"
            >
              <BucketRow
                :bucket="entry.bucket"
                option
                :highlighted="index === activeIndex"
                :node-id="entry.nodeId"
                :pinned="entry.pinned"
                :synced="syncByBucket.has(syncKeyFor(entry.nodeId, entry.bucket))"
                :job="entry.nodeId ? null : jobs.get(entry.bucket)"
                :active="entry.bucket === bucket && (entry.nodeId ?? null) === remoteNodeId"
                v-bind="listPlace(entry.nodeId ?? null)"
                :linked-to="linkedTo(entry.nodeId ?? null, entry.bucket)"
                @open="openBucketOn(entry.bucket, entry.nodeId)"
                @toggle-pin="shortcuts.togglePin(entry.bucket, entry.nodeId)"
              >
                <template #tooltip>{{ rowNode(entry.nodeId) }}</template>
                <template #link>
                  <IconButton
                    v-if="bindSourceFor(entry.bucket, entry.nodeId ?? null, selectedGroupId)"
                    :label="`Link a local folder to ${entry.bucket}…`"
                    side="right"
                    @click="emitSync(bindSourceFor(entry.bucket, entry.nodeId ?? null, selectedGroupId))"
                  >
                    <FolderSync class="h-3 w-3" />
                  </IconButton>
                </template>
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
            <MockBucketRows :filter="bucketNameFilter" :active="bucket" @open="openBucket" />
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
                  v-bind="listPlace(entry.nodeId ?? null)"
                  :linked-to="linkedTo(entry.nodeId ?? null, entry.bucket)"
                  @open="openBucketOn(entry.bucket, entry.nodeId)"
                  @toggle-pin="shortcuts.togglePin(entry.bucket, entry.nodeId)"
                >
                  <template #tooltip>{{ rowNode(entry.nodeId) }}</template>
                </BucketRow>
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
                  :title="rowNode(remoteNodeId)"
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
      <div v-if="otherHits.length || search.error.value || otherPartial" class="border-t border-border/70 py-1">
        <p class="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Other groups</p>
        <p v-if="search.error.value" class="px-3 pb-1 text-xs text-destructive">Other groups could not be searched.</p>
        <p v-else-if="otherPartial" class="px-3 pb-1 text-xs text-muted-foreground">Some nodes did not answer.</p>
        <ul v-if="otherHits.length" :id="`${listId}-other`" role="listbox" class="max-h-56 overflow-y-auto pb-1">
          <li v-for="(hit, index) in otherHits" :key="hit.arn">
            <BucketRow
              :bucket="hit.bucket"
              option
              :highlighted="groupOpeners.length + index === activeIndex"
              :node-id="realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id"
              :subtitle="hit.group_name || null"
              :pinnable="false"
              v-bind="rowPlace(hit.node_id)"
              :linked-to="linkedTo(hit.node_id, hit.bucket)"
              @open="openSearchHit(hit)"
            >
              <template #tooltip>{{ rowNode(hit.node_id) }}</template>
              <template #link>
                <IconButton v-if="hitSource(hit)" :label="`Link a local folder to ${hit.bucket}…`" side="right" @click="emitSync(hitSource(hit))">
                  <FolderSync class="h-3 w-3" />
                </IconButton>
              </template>
              <template v-if="!desktop && !realmNodes.isLocalNode(hit.node_id)" #actions>
                <IconButton :label="`Sync ${hit.bucket} to this node…`" side="right" @click="emit('sync', hit)">
                  <ArrowLeftRight class="h-3 w-3" />
                </IconButton>
              </template>
            </BucketRow>
          </li>
        </ul>
      </div>
      <footer v-if="desktop" class="border-t border-border p-3">
        <Button variant="outline" size="sm" class="w-full" data-tour="bucket-create" @click="emit('new-bucket')">
          <Plus class="h-4 w-4" /> New bucket
        </Button>
      </footer>
      <footer v-else class="space-y-2 border-t border-border p-3">
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
        <button v-if="mockEnabled()" type="button" class="block text-left text-xs text-muted-foreground hover:text-foreground" @click="storageOpen = true">
          Stored on: {{ placementLabel(placement) }} <span class="underline">Change</span>
        </button>
        <p v-if="createBucketError" class="text-xs text-destructive">{{ createBucketError }}</p>
        <p v-else-if="newBucketProblem" class="text-xs text-destructive">{{ newBucketProblem }}</p>
        <p v-else-if="newBucketRefusal" class="text-xs text-muted-foreground">{{ newBucketRefusal }}</p>
      </footer>
    </div>
    <BucketStorageDialog v-if="mockEnabled()" v-model:open="storageOpen" v-model="placement" />
  </aside>
</template>
