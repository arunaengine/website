<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Spinner from '@/components/ui/Spinner.vue'
import BucketRow from '@/components/data/BucketRow.vue'
import { useBucketJobs } from '@/composables/useBucketJobs'
import BucketCreateResults from '@/components/data/BucketCreateResults.vue'
import BucketStorageDialog from '@/components/data/BucketStorageDialog.vue'
import DatabaseRows from '@/components/data/manager/DatabaseRows.vue'
import MockBucketRows from '@/components/data/manager/MockBucketRows.vue'
import { useBucketSearch } from '@/composables/useBucketSearch'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useS3 } from '@/composables/useS3'
import type { DataManager } from '@/composables/useDataManager'
import type { AdmissionResponse, BucketSearchHit } from '@/lib/api'
import type { ListedBucket } from '@/lib/distribution'
import { isDesktop } from '@/lib/desktop'
import type { BindSource } from '@/lib/bindSource'
import { defaultPlacement, mockEnabled, placementLabel } from '@/lib/distributedMock'
import { exampleBuckets } from '@/lib/distributedMockData'
import { folderName } from '@/lib/deviceApi'
import { placeName, placeTitle } from '@/lib/bucketPlace'
import { isFolderBucket, isHiddenBucket } from '@/lib/workspaces'
import type { BucketShortcut } from '@/composables/useBucketShortcuts'
import { Boxes, ChevronLeft, ChevronRight, FolderPlus, FolderSync, History, KeyRound, Plus, Trash2 } from '@lucide/vue'
import { computed, ref, useId, watch } from 'vue'

const props = defineProps<{ manager: DataManager }>()
// Aruna Desktop offers one action: link a bucket to a folder on this computer.
const desktop = isDesktop()
const emit = defineEmits<{
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
  bucketList,
  requestDelete,
  bindSourceFor,
  linkedFolderFor,
} = props.manager

// Steps running on the group's buckets, from the node of each shown row. They are read
// again whenever a list was read, in either mode (not on each typed letter).
const listings = ref(0)
watch(() => all.loading.value, (busy) => busy || listings.value++)

// Where the next bucket is stored: this node unless changed.
const storageOpen = ref(false)
const resultsOpen = ref(false)
// A database is a bucket with a linked dataset, so this is only a filter.
const bucketKind = ref('buckets')
const KINDS = [
  { value: 'buckets', label: 'Buckets' },
  { value: 'database', label: 'Databases' },
]
const databaseMode = computed(() => bucketKind.value === 'database')
// The example rows show even when the group has no bucket of its own.
const examples = computed(() => (mockEnabled() ? exampleBuckets(bucketNameFilter.value) : []))
const placement = ref(defaultPlacement())

// Several nodes show the result of each node; one node creates as before.
function create() {
  if (!placement.value.several) return void createBucket()
  if (newBucketName.value.trim() && !createBucketBlocker.value && selectedGroupId.value) resultsOpen.value = true
}

// The bucket opens here only when this node is one of its nodes.
async function created(outcome: AdmissionResponse) {
  const name = newBucketName.value.trim()
  newBucketName.value = ''
  placement.value = defaultPlacement()
  await bucketList.refresh()
  if (outcome.members.some((member) => realmNodes.isLocalNode(member.node_id)) && name) openBucket(name)
}

const allNodes = computed(() => bucketNodeChoice.value === null)
// An older node cannot list without a name; the open node's list stands in.
const searchList = computed(() => allNodes.value && !all.needsName.value)
// The other nodes of the shown rows, so their steps are read from them.
const otherNodes = computed(() => {
  const ids = searchList.value ? all.hits.value.map((hit) => hit.node_id) : [remoteNodeId.value]
  return [...new Set(ids.filter((id): id is string => Boolean(id) && !realmNodes.isLocalNode(id)))]
})
const jobs = useBucketJobs(selectedGroupId, computed(() => [buckets.value, listings.value]), otherNodes)
const jobOf = (name: string, nodeId: string | null) => jobs.value.get(nodeId && !realmNodes.isLocalNode(nodeId) ? `${nodeId}/${name}` : name)
const nodeBuckets = computed(() => {
  const term = bucketNameFilter.value.trim().toLowerCase()
  return term ? sidebarBuckets.value.filter((entry) => entry.bucket.toLowerCase().includes(term)) : sidebarBuckets.value
})
// Matches in other groups for the same query, below this group's list.
const search = useBucketSearch(bucketNameFilter)
const otherHits = computed(() =>
  search.hits.value.filter((hit) => hit.group_id !== selectedGroupId.value && !isHiddenBucket(hit.bucket) && realmNodes.isTarget(hit.node_id)),
)
// Hover text of a row; a row without a node is on this node.
function rowNode(nodeId: string | null): string {
  return `On ${realmNodes.displayName(nodeId ?? realmNodes.localNodeId.value)}`
}
// A distributed bucket names every node that holds part of it.
function hitNodes(hit: ListedBucket): string {
  return hit.set_id ? `On ${hit.nodes.map((id) => realmNodes.displayName(id)).join(', ')}` : rowNode(hit.node_id)
}
// The open bucket is this row when it was opened on the row's node, or on any node of its set.
function hitActive(hit: ListedBucket): boolean {
  const opened = (id: string) => (realmNodes.isLocalNode(id) ? null : id) === remoteNodeId.value
  return hit.bucket === bucket.value && (hit.set_id ? hit.nodes.some(opened) : opened(hit.node_id))
}
const spread = (hit: ListedBucket) => (hit.set_id ? hit.nodes.length : 0)

// A database bucket shows the database icon and its title; the realm's database list names it
// by bucket and the node that holds it.
const databases = useDatabases()
databases.ensure()
function databaseOf(name: string, nodeId: string | null): { title: string } | null {
  const node = nodeId ?? realmNodes.localNodeId.value
  const row = databases.rows.value.find((entry) => entry.bucket === name && entry.places.some((place) => place.nodeId === node))
  return row ? { title: row.title ?? row.metadata.title ?? name } : null
}

// All nodes rows: pins first, then this group's recently browsed buckets, then the rest. A row's
// node is named only when it is not this node, as the pins are keyed.
const shortcutNode = (hit: ListedBucket) => (realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id)
type AllRow = { key: string; bucket: string; nodeId: string | null; hit: ListedBucket | null; pinned: boolean }
// Recent buckets move up only within the first batch the nodes answered, so a later page never
// reorders rows already shown; the batch starts over when the list does.
const hitKey = (hit: ListedBucket) => `${hit.node_id}/${hit.bucket}`
const firstBatch = ref(new Set<string>())
watch(
  () => all.hits.value,
  (hits, previous) => {
    if (!previous?.length || hits.length < previous.length) firstBatch.value = new Set(hits.map(hitKey))
  },
  { immediate: true },
)
const allRows = computed<AllRow[]>(() => {
  const hits = all.hits.value
  const used = new Set<ListedBucket>()
  // A pin stays a row even before its page was listed; a recent one shows only when listed.
  const take = (entry: BucketShortcut, pinned: boolean): AllRow[] => {
    const nodeId = entry.nodeId ?? null
    // A distributed bucket is one merged row; a pin on any of its nodes is that row.
    const onNode = (candidate: ListedBucket) =>
      (candidate.set_id ? candidate.nodes : [candidate.node_id]).some((id) => (realmNodes.isLocalNode(id) ? null : id) === nodeId)
    const hit = hits.find((candidate) => !used.has(candidate) && candidate.bucket === entry.bucket && onNode(candidate)
      && (pinned || firstBatch.value.has(hitKey(candidate)))) ?? null
    if (!hit && !pinned) return []
    if (hit) used.add(hit)
    return [{ key: `${nodeId ?? ''}/${entry.bucket}`, bucket: entry.bucket, nodeId, hit, pinned }]
  }
  // A pin passes the same checks as a listed row: no device, and the name being searched.
  const term = bucketNameFilter.value.trim().toLowerCase()
  const shownPin = (entry: BucketShortcut) =>
    !isFolderBucket(entry.bucket) && realmNodes.isTarget(entry.nodeId) && entry.bucket.toLowerCase().includes(term)
  const pins = shortcuts.pinned.value.filter(shownPin).flatMap((entry) => take(entry, true))
  const recents = shortcuts.recent.value.filter((entry) => (entry.groupId ?? '') === selectedGroupId.value).flatMap((entry) => take(entry, false))
  const rest = hits.filter((hit) => !used.has(hit)).map((hit) => ({ key: `${hit.node_id}/${hit.bucket}`, bucket: hit.bucket, nodeId: shortcutNode(hit), hit, pinned: false }))
  return [...pins, ...recents, ...rest]
})
// Pages of 25 rows, the pins on top of the first; the next page is read from the nodes when
// needed. The nodes name no total, so no page count is shown.
const BUCKETS_PER_PAGE = 25
const page = ref(1)
watch([selectedGroupId, bucketNameFilter, bucketNodeChoice], () => (page.value = 1))
const pageRows = computed(() => allRows.value.slice((page.value - 1) * BUCKETS_PER_PAGE, page.value * BUCKETS_PER_PAGE))
const pageFilled = () => allRows.value.length > page.value * BUCKETS_PER_PAGE
const hasNextPage = computed(() => pageFilled() || all.more.value)
async function nextPage() {
  if (!pageFilled() && all.more.value) await all.loadMore()
  if (pageFilled()) page.value++
}

function openRow(row: AllRow) {
  if (row.hit) openHit(row.hit)
  else openBucketOn(row.bucket, row.nodeId)
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
const databaseRows = ref<{ openers: (() => void)[] } | null>(null)
const groupOpeners = computed<(() => void)[]>(() => {
  if (databaseMode.value) return databaseRows.value?.openers ?? []
  if (searchList.value) return all.error.value ? [] : pageRows.value.map((row) => () => openRow(row))
  if (bucketsLoading.value || (bucketsError.value && (bucketsAuthError.value || !bucketsLoaded.value))) return []
  return nodeBuckets.value.map((entry) => () => openBucketOn(entry.bucket, entry.nodeId))
})
// The database view lists no other groups, so its keys reach only its own rows.
const openers = computed(() => [
  ...groupOpeners.value,
  ...(databaseMode.value ? [] : otherHits.value.map((hit) => () => openSearchHit(hit))),
])
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
        <OptionToggle v-model="bucketKind" :options="KINDS" aria-label="Kind of bucket" />
      </div>
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
      <ul v-if="databaseMode" :id="`${listId}-group`" role="listbox" class="max-h-[420px] overflow-y-auto py-1">
        <DatabaseRows ref="databaseRows" :filter="bucketNameFilter" :active="bucket" :highlighted="activeIndex" @open="openBucketOn" />
      </ul>
      <template v-else-if="searchList">
        <Spinner v-if="all.loading.value && !all.hits.value.length" show-label label="Loading buckets…" class="px-3 py-4" />
        <p v-else-if="all.error.value" class="px-3 py-3 text-xs text-destructive">{{ all.error.value }}</p>
        <ul v-else-if="allRows.length || examples.length" :id="`${listId}-group`" role="listbox" class="max-h-[420px] overflow-y-auto py-1">
          <li v-for="(row, index) in pageRows" :key="row.key">
            <BucketRow
              v-if="row.hit"
              :bucket="row.bucket"
              :database="Boolean(databaseOf(row.bucket, row.hit.node_id))"
              :subtitle="databaseOf(row.bucket, row.hit.node_id)?.title ?? null"
              :pinned="row.pinned"
              option
              :highlighted="index === activeIndex"
              :job="jobOf(row.bucket, row.hit.node_id)"
              :active="hitActive(row.hit)"
              :node-count="spread(row.hit)"
              v-bind="rowPlace(row.hit.node_id)"
              :linked-to="linkedTo(row.hit.node_id, row.bucket)"
              @open="openRow(row)"
              @toggle-pin="shortcuts.togglePin(row.bucket, row.nodeId)"
            >
              <template #tooltip>{{ hitNodes(row.hit) }}</template>
              <template #link>
                <IconButton v-if="hitSource(row.hit)" :label="`Link a local folder to ${row.bucket}…`" side="right" @click="emitSync(hitSource(row.hit))">
                  <FolderSync class="h-3 w-3" />
                </IconButton>
              </template>
            </BucketRow>
            <BucketRow
              v-else
              :bucket="row.bucket"
              :node-id="row.nodeId"
              :database="Boolean(databaseOf(row.bucket, row.nodeId))"
              :subtitle="databaseOf(row.bucket, row.nodeId)?.title ?? null"
              pinned
              option
              :highlighted="index === activeIndex"
              :active="row.bucket === bucket && row.nodeId === remoteNodeId"
              v-bind="rowPlace(row.nodeId)"
              @open="openRow(row)"
              @toggle-pin="shortcuts.togglePin(row.bucket, row.nodeId)"
            >
              <template #tooltip>{{ rowNode(row.nodeId) }}</template>
            </BucketRow>
          </li>
          <MockBucketRows :filter="bucketNameFilter" :active="bucket" @open="openBucket" />
        </ul>
        <p v-else-if="!all.loading.value" class="px-3 py-4 text-xs text-muted-foreground">No buckets found.</p>
        <p v-if="all.failedNodes.value" class="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
          {{ all.failedNodes.value }} {{ all.failedNodes.value === 1 ? 'node' : 'nodes' }} did not answer.
          <button type="button" class="text-primary hover:underline" @click="all.reload()">Retry</button>
        </p>
        <div v-if="page > 1 || hasNextPage" class="flex items-center justify-center gap-2 border-t border-border/70 p-2">
          <Button variant="outline" size="sm" :disabled="page <= 1 || all.loading.value" @click="page--">
            <ChevronLeft class="size-3.5" /> Prev
          </Button>
          <span class="px-1 text-center text-xs tabular-nums text-muted-foreground">Page {{ page }}</span>
          <Button variant="outline" size="sm" :disabled="!hasNextPage || all.loading.value" @click="nextPage">
            Next <ChevronRight class="size-3.5" />
          </Button>
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
          <ul v-if="nodeBuckets.length || examples.length" :id="`${listId}-group`" role="listbox" class="max-h-[420px] overflow-y-auto py-1">
            <li
              v-for="(entry, index) in nodeBuckets"
              :key="`${entry.nodeId ?? 'local'}/${entry.bucket}`"
            >
              <BucketRow
                :bucket="entry.bucket"
                option
                :database="Boolean(databaseOf(entry.bucket, entry.nodeId ?? null))"
                :subtitle="databaseOf(entry.bucket, entry.nodeId ?? null)?.title ?? null"
                :highlighted="index === activeIndex"
                :node-id="entry.nodeId"
                :pinned="entry.pinned"
                :synced="syncByBucket.has(syncKeyFor(entry.nodeId, entry.bucket))"
                :job="jobOf(entry.bucket, entry.nodeId)"
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
      <div v-if="!databaseMode && (otherHits.length || search.error.value || otherPartial)" class="border-t border-border/70 py-1">
        <p class="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Other groups</p>
        <p v-if="search.error.value" class="px-3 pb-1 text-xs text-destructive">Other groups could not be searched.</p>
        <p v-else-if="otherPartial" class="px-3 pb-1 text-xs text-muted-foreground">Some nodes did not answer.</p>
        <ul v-if="otherHits.length" :id="`${listId}-other`" role="listbox" class="max-h-56 overflow-y-auto pb-1">
          <li v-for="(hit, index) in otherHits" :key="hit.arn">
            <BucketRow
              :bucket="hit.bucket"
              option
              :highlighted="groupOpeners.length + index === activeIndex"
              :node-id="realmNodes.isLocalNode(hit.node_id) || hit.set_id ? null : hit.node_id"
              :node-count="spread(hit)"
              :subtitle="hit.group_name || null"
              :pinnable="false"
              v-bind="rowPlace(hit.node_id)"
              :linked-to="linkedTo(hit.node_id, hit.bucket)"
              @open="openSearchHit(hit)"
            >
              <template #tooltip>{{ hitNodes(hit) }}</template>
              <template #link>
                <IconButton v-if="hitSource(hit)" :label="`Link a local folder to ${hit.bucket}…`" side="right" @click="emitSync(hitSource(hit))">
                  <FolderSync class="h-3 w-3" />
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
            @keyup.enter="create"
          />
          <Button variant="outline" size="sm" aria-label="Create bucket" :title="`Creates the bucket on ${placement.several ? `${placement.members.length} nodes` : createNode}`" :disabled="creatingBucket || !newBucketName.trim() || Boolean(createBucketBlocker)" @click="create">
            <FolderPlus class="h-4 w-4" />
          </Button>
        </div>
        <button type="button" class="block text-left text-xs text-muted-foreground hover:text-foreground" @click="storageOpen = true">
          Stored on: {{ placementLabel(placement) }} <span class="underline">Change</span>
        </button>
        <p v-if="createBucketError" class="text-xs text-destructive">{{ createBucketError }}</p>
        <p v-else-if="newBucketProblem" class="text-xs text-destructive">{{ newBucketProblem }}</p>
        <p v-else-if="newBucketRefusal" class="text-xs text-muted-foreground">{{ newBucketRefusal }}</p>
      </footer>
    </div>
    <BucketStorageDialog v-model:open="storageOpen" v-model="placement" />
    <BucketCreateResults
      v-if="selectedGroupId"
      v-model:open="resultsOpen"
      :name="newBucketName.trim()"
      :group-id="selectedGroupId"
      :placement="placement"
      @created="created"
    />
  </aside>
</template>
