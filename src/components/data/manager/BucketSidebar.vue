<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import Spinner from '@/components/ui/Spinner.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import BucketRow from '@/components/data/BucketRow.vue'
import { useBucketJobs } from '@/composables/useBucketJobs'
import DatabaseRows from '@/components/data/manager/DatabaseRows.vue'
import MockBucketRows from '@/components/data/manager/MockBucketRows.vue'
import { useBucketSearch } from '@/composables/useBucketSearch'
import { useListedUsage } from '@/composables/useBucketUsage'
import { useDatabases } from '@/composables/useDatabases'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useS3 } from '@/composables/useS3'
import type { DataManager } from '@/composables/useDataManager'
import type { BucketSearchHit } from '@/lib/api'
import type { ListedBucket } from '@/lib/distribution'
import { isDesktop } from '@/lib/desktop'
import { formatCount } from '@/lib/formatCount'
import type { BindSource } from '@/lib/bindSource'
import { mockEnabled } from '@/lib/distributedMock'
import { exampleBuckets } from '@/lib/distributedMockData'
import { folderName } from '@/lib/deviceApi'
import { placeName, placeTitle } from '@/lib/bucketPlace'
import { isFolderBucket, isHiddenBucket } from '@/lib/workspaces'
import type { BucketShortcut } from '@/composables/useBucketShortcuts'
import { Boxes, Check, ChevronLeft, ChevronRight, FolderPlus, FolderSync, History, KeyRound, ListFilter, Trash2 } from '@lucide/vue'
import { computed, ref, useId, watch } from 'vue'

// `sheet`: the list inside the bucket picker of a narrow view, without its card and header.
const props = defineProps<{ manager: DataManager; sheet?: boolean }>()
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
  requestDelete,
  bindSourceFor,
  linkedFolderFor,
} = props.manager

// Steps running on the group's buckets, from the node of each shown row. They are read
// again whenever a list was read, in either mode (not on each typed letter).
const listings = ref(0)
watch(() => all.loading.value, (busy) => busy || listings.value++)

// A database is a bucket with a linked dataset, so this is only a filter. Only databases lists the
// realm's databases, so those of other readable groups show too.
type KindFilter = 'all' | 'databases' | 'hide'
const KINDS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All buckets' },
  { value: 'databases', label: 'Only databases' },
  { value: 'hide', label: 'Hide databases' },
]
const kindFilter = ref<KindFilter>('all')
const filterLabel = computed(() =>
  kindFilter.value === 'all' ? 'Filter buckets' : `Filter buckets: ${KINDS.find((kind) => kind.value === kindFilter.value)?.label}`)
const databaseMode = computed(() => kindFilter.value === 'databases')
const hideDatabases = computed(() => kindFilter.value === 'hide')
// The example rows show even when the group has no bucket of its own.
const examples = computed(() => (mockEnabled() ? exampleBuckets(bucketNameFilter.value) : []))

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
  return sidebarBuckets.value.filter((entry) =>
    (!term || entry.bucket.toLowerCase().includes(term)) && !(hideDatabases.value && databaseOf(entry.bucket, entry.nodeId ?? null)))
})
// Matches in other groups for the same query, below this group's list.
const search = useBucketSearch(bucketNameFilter)
const otherHits = computed(() =>
  search.hits.value.filter((hit) => hit.group_id !== selectedGroupId.value && !isHiddenBucket(hit.bucket) && realmNodes.isTarget(hit.node_id)
    && !(hideDatabases.value && databaseOf(hit.bucket, hit.node_id))),
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
  if (!row) return null
  // The description line names the version too, unless the title already does.
  const title = row.title ?? row.metadata.title ?? name
  const version = row.metadata.version?.trim()
  return { title: version && !title.includes(version) ? `${title} ${version}` : title }
}

// All nodes rows: pins first, then the rest in the nodes' name order, so opening a bucket never
// moves a row. A row's node is named only when it is not this node, as the pins are keyed.
const shortcutNode = (hit: ListedBucket) => (realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id)
type AllRow = { key: string; bucket: string; nodeId: string | null; hit: ListedBucket | null; pinned: boolean }
const allRows = computed<AllRow[]>(() => {
  const hits = all.hits.value
  const used = new Set<ListedBucket>()
  // A pin stays a row even before its page was listed.
  const take = (entry: BucketShortcut): AllRow[] => {
    const nodeId = entry.nodeId ?? null
    // A distributed bucket is one merged row; a pin on any of its nodes is that row.
    const onNode = (candidate: ListedBucket) =>
      (candidate.set_id ? candidate.nodes : [candidate.node_id]).some((id) => (realmNodes.isLocalNode(id) ? null : id) === nodeId)
    const hit = hits.find((candidate) => !used.has(candidate) && candidate.bucket === entry.bucket && onNode(candidate)) ?? null
    if (hit) used.add(hit)
    return [{ key: `${nodeId ?? ''}/${entry.bucket}`, bucket: entry.bucket, nodeId, hit, pinned: true }]
  }
  // A pin passes the same checks as a listed row: no device, and the name being searched.
  const term = bucketNameFilter.value.trim().toLowerCase()
  const shownPin = (entry: BucketShortcut) =>
    !isFolderBucket(entry.bucket) && realmNodes.isTarget(entry.nodeId) && entry.bucket.toLowerCase().includes(term)
  const pins = shortcuts.pinned.value.filter(shownPin).flatMap(take)
  const rest = hits.filter((hit) => !used.has(hit)).map((hit) => ({ key: `${hit.node_id}/${hit.bucket}`, bucket: hit.bucket, nodeId: shortcutNode(hit), hit, pinned: false }))
  const rows = [...pins, ...rest]
  return hideDatabases.value ? rows.filter((row) => !databaseOf(row.bucket, row.hit?.node_id ?? row.nodeId)) : rows
})
// Pages of 25 rows, the pins on top of the first; the next page is read from the nodes when
// needed. The nodes name no total, so no page count is shown.
const BUCKETS_PER_PAGE = 25
const page = ref(1)
// Each list starts its own count, so a Next still reading for a replaced list does nothing.
let pageRun = 0
watch([selectedGroupId, bucketNameFilter, bucketNodeChoice, kindFilter], () => {
  pageRun++
  page.value = 1
})
const pageRows = computed(() => allRows.value.slice((page.value - 1) * BUCKETS_PER_PAGE, page.value * BUCKETS_PER_PAGE))
const pageFilled = () => allRows.value.length > page.value * BUCKETS_PER_PAGE
const hasNextPage = computed(() => pageFilled() || all.more.value)
// A short page (rows filtered or merged away) fills up first and stays, so no row is skipped;
// a full page moves on once the next one has rows. A few reads at most per click.
async function nextPage() {
  const run = ++pageRun
  const short = allRows.value.length < page.value * BUCKETS_PER_PAGE
  const enough = () => (short ? allRows.value.length >= page.value * BUCKETS_PER_PAGE : pageFilled())
  for (let reads = 0; !enough() && all.more.value && reads < 10; reads++) {
    await all.loadMore()
    if (run !== pageRun) return
  }
  if (!short && pageFilled()) page.value++
}

function openRow(row: AllRow) {
  if (row.hit) openHit(row.hit)
  else openBucketOn(row.bucket, row.nodeId)
}
// Every row names its node, linked to the node's details; the desktop names this computer so and
// adds location, kind and id to the title.
type RowPlace = { place: string | null; placeTitle: string | null; placeNode: string | null }
function rowPlace(nodeId: string | null): RowPlace {
  const id = nodeId ?? realmNodes.localNodeId.value
  if (!desktop) return { place: realmNodes.displayName(id), placeTitle: null, placeNode: id }
  const node = realmNodes.nodeById(id)
  if (node) {
    const short = node.kind === 'user' && node.isLocal ? 'This computer' : node.label
    return { place: short, placeTitle: `${placeName(node)} (${placeTitle(node)})`, placeNode: id }
  }
  return { place: realmNodes.isLocalNode(nodeId) ? 'This computer' : realmNodes.displayName(nodeId), placeTitle: null, placeNode: id }
}
// One node's list names a row's place only where it is not that node.
function listPlace(nodeId: string | null): RowPlace {
  const other = (id: string | null) => (id && !realmNodes.isLocalNode(id) ? id : null)
  return other(nodeId) === other(remoteNodeId.value) ? { place: null, placeTitle: null, placeNode: null } : rowPlace(nodeId)
}

// Pinned rows first, then databases, then the other buckets, each under its label and by name.
type Named = { bucket: string; nodeId?: string | null }
const byName = (a: Named, b: Named) => a.bucket.localeCompare(b.bucket) || (a.nodeId ?? '').localeCompare(b.nodeId ?? '')
function sectioned<R extends Named>(rows: R[], pinned: (row: R) => boolean, database: (row: R) => boolean): { label: string; rows: R[] }[] {
  const pins = rows.filter(pinned).sort(byName)
  const bases = rows.filter((row) => !pinned(row) && database(row)).sort(byName)
  const rest = rows.filter((row) => !pinned(row) && !database(row)).sort(byName)
  return [{ label: 'Pinned', rows: pins }, { label: 'Databases', rows: bases }, { label: 'Buckets', rows: rest }].filter((section) => section.rows.length)
}
const rowNodeId = (row: AllRow) => row.hit?.node_id ?? row.nodeId
const allSections = computed(() => sectioned(pageRows.value, (row) => row.pinned, (row) => Boolean(databaseOf(row.bucket, rowNodeId(row)))))
const shownRows = computed(() => allSections.value.flatMap((section) => section.rows))
type NodeEntry = (typeof nodeBuckets.value)[number]
const nodeSections = computed(() => sectioned(nodeBuckets.value, (entry) => entry.pinned, (entry) => Boolean(databaseOf(entry.bucket, entry.nodeId ?? null))))
const shownEntries = computed(() => nodeSections.value.flatMap((section) => section.rows))
// The position of a row in the shown order, for the arrow key highlight.
const rowIndex = (row: AllRow) => shownRows.value.indexOf(row)
const entryIndex = (entry: NodeEntry) => shownEntries.value.indexOf(entry)

// Each shown row names its files and size once its node answered.
const usage = useListedUsage()
const usageNode = (nodeId: string | null) => (nodeId && !realmNodes.isLocalNode(nodeId) ? nodeId : null)
const factsOf = (name: string, nodeId: string | null) => usage.textOf(name, usageNode(nodeId))
watch(
  () => (searchList.value ? shownRows.value.map((row) => ({ bucket: row.bucket, nodeId: usageNode(rowNodeId(row)) })) : shownEntries.value.map((entry) => ({ bucket: entry.bucket, nodeId: usageNode(entry.nodeId ?? null) }))),
  (entries) => usage.ensure(entries),
  { immediate: true },
)
// Arrow keys move through the shown rows of this group, then of other groups.
const listId = `bucket-results-${useId()}`
const listClass = 'pb-1'
const bucketCount = computed(() => formatCount(searchList.value ? all.hits.value.length : nodeBuckets.value.length))
const databaseRows = ref<{ openers: (() => void)[] } | null>(null)
const groupOpeners = computed<(() => void)[]>(() => {
  if (databaseMode.value) return databaseRows.value?.openers ?? []
  if (searchList.value) return all.error.value ? [] : shownRows.value.map((row) => () => openRow(row))
  if (bucketsLoading.value || (bucketsError.value && (bucketsAuthError.value || !bucketsLoaded.value))) return []
  return shownEntries.value.map((entry) => () => openBucketOn(entry.bucket, entry.nodeId))
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
  <aside :class="sheet ? '' : 'flex h-full min-w-0 flex-col'">
    <SectionHeading v-if="!sheet" title="Buckets" :icon="Boxes" :count="bucketCount">
      <template #actions>
        <!-- Background revalidation only: the cached list stays readable behind it. -->
        <Spinner v-if="bucketsRefreshing" label="Refreshing buckets…" />
        <Button size="sm" data-tour="bucket-create" @click="emit('new-bucket')"><FolderPlus class="h-4 w-4" /> New bucket</Button>
      </template>
    </SectionHeading>
    <div v-else class="flex min-h-9 items-center justify-between gap-2 pb-1 pl-4 pr-16 pt-4">
      <DialogTitle class="type-section-title">Buckets <span class="text-sm font-normal tabular-nums text-muted-foreground">{{ bucketCount }}</span></DialogTitle>
      <Button size="sm" data-tour="bucket-create" @click="emit('new-bucket')"><FolderPlus class="h-4 w-4" /> New bucket</Button>
    </div>
    <!-- At least as tall as the files beside it and as tall as its rows, so none is cut off. -->
    <div :class="sheet ? '' : 'flex flex-1 flex-col lg:min-h-[24rem]'">
    <div :class="sheet ? '' : 'surface flex-1'" :aria-busy="bucketsRefreshing">
      <div class="sticky top-0 z-10 flex items-center gap-2 bg-card px-3.5 pb-1 pt-3" :class="sheet ? 'bg-background' : ''">
        <Input
          v-model="bucketNameFilter"
          placeholder="Find a bucket"
          aria-label="Find a bucket"
          role="combobox"
          aria-autocomplete="list"
          :aria-controls="`${listId}-group ${listId}-other`"
          :aria-expanded="openers.length > 0"
          class="h-8 min-w-0 flex-1 text-xs"
          @keydown="onKeydown"
        />
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button :variant="kindFilter === 'all' ? 'outline' : 'default'" size="icon" class="h-8 w-8 shrink-0" :title="filterLabel" :aria-label="filterLabel">
              <ListFilter class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              v-for="kind in KINDS"
              :key="kind.value"
              role="menuitemradio"
              :aria-checked="kindFilter === kind.value"
              class="pl-8"
              @click="kindFilter = kind.value"
            >
              <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                <Check v-if="kindFilter === kind.value" class="h-3.5 w-3.5" />
              </span>
              {{ kind.label }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ul v-if="databaseMode" :id="`${listId}-group`" role="listbox" :class="listClass">
        <DatabaseRows ref="databaseRows" :filter="bucketNameFilter" :active="bucket" :highlighted="activeIndex" @open="openBucketOn" />
      </ul>
      <template v-else-if="searchList">
        <Spinner v-if="all.loading.value && !all.hits.value.length" show-label label="Loading buckets…" class="px-3 py-4" />
        <p v-else-if="all.error.value" class="px-3 py-3 text-xs text-destructive">{{ all.error.value }}</p>
        <ul v-else-if="allRows.length || examples.length" :id="`${listId}-group`" role="listbox" :class="listClass">
          <template v-for="section in allSections" :key="section.label">
            <li v-if="section.label" role="presentation" class="px-3.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">{{ section.label }}</li>
            <li v-for="row in section.rows" :key="row.key" role="presentation">
              <BucketRow
                v-if="row.hit"
                :bucket="row.bucket"
                :database="Boolean(databaseOf(row.bucket, row.hit.node_id))"
                :subtitle="databaseOf(row.bucket, row.hit.node_id)?.title ?? null"
                :facts="factsOf(row.bucket, row.hit.node_id)"
                :pinned="row.pinned"
                option
                :highlighted="rowIndex(row) === activeIndex"
                :job="jobOf(row.bucket, row.hit.node_id)"
                :active="hitActive(row.hit)"
                :nodes="row.hit.set_id ? row.hit.nodes : []"
                :synced="syncByBucket.has(syncKeyFor(row.hit.node_id, row.bucket))"
                :synced-with="syncByBucket.get(syncKeyFor(row.hit.node_id, row.bucket))?.partners ?? []"
                v-bind="rowPlace(row.hit.node_id)"
                :linked-to="linkedTo(row.hit.node_id, row.bucket)"
                @open="openRow(row)"
                @toggle-pin="shortcuts.togglePin(row.bucket, row.nodeId)"
              >
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
                :facts="factsOf(row.bucket, row.nodeId)"
                pinned
                option
                :highlighted="rowIndex(row) === activeIndex"
                :active="row.bucket === bucket && row.nodeId === remoteNodeId"
                v-bind="rowPlace(row.nodeId)"
                @open="openRow(row)"
                @toggle-pin="shortcuts.togglePin(row.bucket, row.nodeId)"
              />
            </li>
          </template>
          <MockBucketRows :filter="bucketNameFilter" :active="bucket" @open="openBucket" />
        </ul>
        <p v-else-if="!all.loading.value" class="px-3 py-4 text-xs text-muted-foreground">No buckets found.</p>
        <p v-if="all.failedNodes.value" class="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
          {{ all.failedNodes.value }} {{ all.failedNodes.value === 1 ? 'node' : 'nodes' }} did not answer.
          <button type="button" class="text-primary hover:underline" @click="all.reload()">Retry</button>
        </p>
        <div v-if="page > 1 || hasNextPage" class="flex items-center justify-end gap-2 border-t border-border/70 px-3.5 py-2">
          <IconButton label="Previous buckets" variant="outline" size="icon" class="h-8 w-8" :disabled="page <= 1 || all.loading.value" @click="page--">
            <ChevronLeft class="size-3.5" />
          </IconButton>
          <IconButton label="Next buckets" variant="outline" size="icon" class="h-8 w-8" :disabled="!hasNextPage || all.loading.value" @click="nextPage">
            <ChevronRight class="size-3.5" />
          </IconButton>
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
          <ul v-if="nodeBuckets.length || examples.length" :id="`${listId}-group`" role="listbox" :class="listClass">
            <template v-for="section in nodeSections" :key="section.label">
              <li v-if="section.label" role="presentation" class="px-3.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">{{ section.label }}</li>
              <li
                v-for="entry in section.rows"
                :key="`${entry.nodeId ?? 'local'}/${entry.bucket}`"
                role="presentation"
              >
                <BucketRow
                  :bucket="entry.bucket"
                  option
                  :database="Boolean(databaseOf(entry.bucket, entry.nodeId ?? null))"
                  :subtitle="databaseOf(entry.bucket, entry.nodeId ?? null)?.title ?? null"
                  :facts="factsOf(entry.bucket, entry.nodeId ?? null)"
                  :highlighted="entryIndex(entry) === activeIndex"
                  :node-id="entry.nodeId"
                  :pinned="entry.pinned"
                  :synced="syncByBucket.has(syncKeyFor(entry.nodeId, entry.bucket))"
                  :synced-with="syncByBucket.get(syncKeyFor(entry.nodeId, entry.bucket))?.partners ?? []"
                  :job="jobOf(entry.bucket, entry.nodeId)"
                  :active="entry.bucket === bucket && (entry.nodeId ?? null) === remoteNodeId"
                  v-bind="listPlace(entry.nodeId ?? null)"
                  :linked-to="linkedTo(entry.nodeId ?? null, entry.bucket)"
                  @open="openBucketOn(entry.bucket, entry.nodeId)"
                  @toggle-pin="shortcuts.togglePin(entry.bucket, entry.nodeId)"
                >
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
            </template>
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
                  :synced-with="syncByBucket.get(syncKeyFor(entry.nodeId, entry.bucket))?.partners ?? []"
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
      <footer v-if="sheet" class="px-3.5 pb-4 pt-2">
        <p class="text-xs text-muted-foreground">Press and hold a bucket to pin it.</p>
      </footer>
    </div>
    </div>
  </aside>
</template>
