<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import Spinner from '@/components/ui/Spinner.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import BucketRow from '@/components/data/BucketRow.vue'
import BucketOrderHandle from '@/components/data/manager/BucketOrderHandle.vue'
import { useBucketJobs } from '@/composables/useBucketJobs'
import DatabaseRows from '@/components/data/manager/DatabaseRows.vue'
import MockBucketRows from '@/components/data/manager/MockBucketRows.vue'
import { useBucketOrder } from '@/composables/useBucketOrder'
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
import { moveBucket, orderCompare } from '@/lib/bucketOrder'
import type { BucketShortcut } from '@/composables/useBucketShortcuts'
import { Boxes, Check, ChevronLeft, ChevronRight, FolderPlus, FolderSync, History, KeyRound, ListFilter, RotateCcw, Trash2, X } from '@lucide/vue'
import { computed, nextTick, ref, useId, watch } from 'vue'

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
  { value: 'all', label: 'All' },
  { value: 'databases', label: 'Databases' },
  { value: 'hide', label: 'Buckets' },
]
const kindFilter = ref<KindFilter>('all')
// One node, and facts a row must have; each fact is read from what its node reports.
// The nodes to show; empty shows every node.
const nodeFilter = ref<string[]>([])
function toggleNode(node: string | null) {
  if (node === null) nodeFilter.value = []
  else if (nodeFilter.value.includes(node)) nodeFilter.value = nodeFilter.value.filter((entry) => entry !== node)
  else nodeFilter.value = [...nodeFilter.value, node]
}
type Fact = 'pinned' | 'public' | 'dataset' | 'inPlace'
const FACTS: { value: Fact; label: string }[] = [
  { value: 'pinned', label: 'Pinned' },
  { value: 'public', label: 'Public' },
  { value: 'dataset', label: 'Has a dataset' },
  { value: 'inPlace', label: 'Read in place' },
]
const onlyFacts = ref<Fact[]>([])
const toggleFact = (fact: Fact) =>
  (onlyFacts.value = onlyFacts.value.includes(fact) ? onlyFacts.value.filter((entry) => entry !== fact) : [...onlyFacts.value, fact])
const activeFilters = computed(() => [
  ...(kindFilter.value === 'all' ? [] : [{ key: 'kind', label: KINDS.find((kind) => kind.value === kindFilter.value)!.label, clear: () => (kindFilter.value = 'all') }]),
  ...nodeFilter.value.map((node) => ({ key: `node:${node}`, label: realmNodes.displayName(node), clear: () => toggleNode(node) })),
  ...FACTS.filter((fact) => onlyFacts.value.includes(fact.value)).map((fact) => ({ key: fact.value, label: fact.label, clear: () => toggleFact(fact.value) })),
])
function clearFilters() {
  kindFilter.value = 'all'
  nodeFilter.value = []
  onlyFacts.value = []
}
const filterLabel = computed(() => (activeFilters.value.length ? `Filter buckets, ${activeFilters.value.length} on` : 'Filter buckets'))
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
    (!term || entry.bucket.toLowerCase().includes(term)) && !(hideDatabases.value && databaseOf(entry.bucket, entry.nodeId ?? null))
    && passesFilters(entry.bucket, entry.nodeId ?? null, [realNode(entry.nodeId ?? null)], entry.pinned))
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
function databaseOf(name: string, nodeId: string | null): { title: string; dataset: string | null; public: boolean } | null {
  const node = nodeId ?? realmNodes.localNodeId.value
  const row = databases.rows.value.find((entry) => entry.bucket === name && entry.places.some((place) => place.nodeId === node))
  if (!row) return null
  // The description line names the version too, unless the title already does.
  const title = row.title ?? name
  const version = row.description?.version?.trim()
  return { title: version && !title.includes(version) ? `${title} ${version}` : title, dataset: row.datasetId, public: row.public }
}

// A database row says whether it is public; the group's public role covers the others.
const rowPublic = (name: string, node: string | null) =>
  Boolean(databaseOf(name, node)?.public) || props.manager.publicAccess.isPublic(node, { kind: 'bucket', bucket: name, key: '' })

// A row passes the node and fact filters; a fact its node has not reported yet does not pass.
// `nodeId` is null for this node; `nodeIds` are every node of the row by id.
function passesFilters(name: string, node: string | null, nodeIds: string[], pinned: boolean): boolean {
  if (nodeFilter.value.length && !nodeIds.some((id) => nodeFilter.value.includes(id))) return false
  const database = databaseOf(name, node)
  const checks: Record<Fact, () => boolean> = {
    pinned: () => pinned,
    public: () => rowPublic(name, node),
    dataset: () => Boolean(database?.dataset),
    // Read in place is checked per page, as it reads each bucket's usage from its node.
    inPlace: () => true,
  }
  return onlyFacts.value.every((fact) => checks[fact]())
}
const inPlaceOn = computed(() => onlyFacts.value.includes('inPlace'))
const readsInPlace = (name: string, node: string | null) => !inPlaceOn.value || usage.referencedOf(name, usageNode(node)) === true
const realNode = (nodeId: string | null) => nodeId ?? realmNodes.localNodeId.value ?? ''
const rowNodes = (row: AllRow) => (row.hit ? row.hit.nodes : [realNode(row.nodeId)])

// All nodes rows: pins first, then the rest, each in the user's order and then the nodes' name
// order, so opening a bucket never moves a row. A row's node is named only when it is not this node, as the pins are keyed.
const order = useBucketOrder(selectedGroupId)
const { names: orderNames, canSave: canOrder, reset: resetOrder } = order
const ranked = <R extends { bucket: string }>(rows: R[]) => {
  const compare = orderCompare(orderNames.value)
  return [...rows].sort((a, b) => compare(a.bucket, b.bucket))
}
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
  const rows = [...ranked(pins), ...ranked(rest)].filter((row) => passesFilters(row.bucket, row.hit?.node_id ?? row.nodeId, rowNodes(row), row.pinned))
  return hideDatabases.value ? rows.filter((row) => !databaseOf(row.bucket, row.hit?.node_id ?? row.nodeId)) : rows
})
// The nodes the listed rows are on, for the node filter.
const filterNodes = computed(() => [...new Set(all.hits.value.flatMap((hit) => hit.nodes))]
  .sort((a, b) => realmNodes.displayName(a).localeCompare(realmNodes.displayName(b))))
// Pages of 25 rows, the pins on top of the first; the next page is read from the nodes when
// needed. The nodes name no total, so no page count is shown.
const BUCKETS_PER_PAGE = 25
const page = ref(1)
// Each list starts its own count, so a Next still reading for a replaced list does nothing.
let pageRun = 0
watch([selectedGroupId, bucketNameFilter, bucketNodeChoice, kindFilter, nodeFilter, onlyFacts], () => {
  pageRun++
  page.value = 1
})
const pageSlice = computed(() => allRows.value.slice((page.value - 1) * BUCKETS_PER_PAGE, page.value * BUCKETS_PER_PAGE))
const pageRows = computed(() => pageSlice.value.filter((row) => readsInPlace(row.bucket, row.hit?.node_id ?? row.nodeId)))
const pageFilled = () => allRows.value.length > page.value * BUCKETS_PER_PAGE
const hasNextPage = computed(() => pageFilled() || all.more.value)
// "1-25 of 80"; while the nodes have more to list, the total is at least the listed rows.
const pageRange = computed(() => {
  const start = (page.value - 1) * BUCKETS_PER_PAGE
  const end = Math.min(allRows.value.length, start + BUCKETS_PER_PAGE)
  return `${formatCount(start + 1)}-${formatCount(end)} of ${all.more.value ? 'at least ' : ''}${formatCount(allRows.value.length)}`
})
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

// Pinned rows first under their label, then every other bucket, each part in the user's order,
// then by name. The database icon tells databases apart; an empty label marks the rest.
type Named = { bucket: string; nodeId?: string | null }
const byName = (a: Named, b: Named) => a.bucket.localeCompare(b.bucket) || (a.nodeId ?? '').localeCompare(b.nodeId ?? '')
function sectioned<R extends Named>(rows: R[], pinned: (row: R) => boolean): { label: string; rows: R[] }[] {
  const compare = orderCompare(orderNames.value)
  const sorted = (part: R[]) => part.sort((a, b) => compare(a.bucket, b.bucket) || byName(a, b))
  const pins = sorted(rows.filter(pinned))
  const rest = sorted(rows.filter((row) => !pinned(row)))
  return [{ label: 'Pinned', rows: pins }, { label: '', rows: rest }].filter((section) => section.rows.length)
}
const rowNodeId = (row: AllRow) => row.hit?.node_id ?? row.nodeId
const allSections = computed(() => sectioned(pageRows.value, (row) => row.pinned))
const shownRows = computed(() => allSections.value.flatMap((section) => section.rows))
type NodeEntry = (typeof nodeBuckets.value)[number]
const nodeSections = computed(() =>
  sectioned(nodeBuckets.value.filter((entry) => readsInPlace(entry.bucket, entry.nodeId ?? null)), (entry) => entry.pinned))
const shownEntries = computed(() => nodeSections.value.flatMap((section) => section.rows))
// The position of a row in the shown order, for the arrow key highlight.
const rowIndex = (row: AllRow) => shownRows.value.indexOf(row)
const entryIndex = (entry: NodeEntry) => shownEntries.value.indexOf(entry)
const entryKey = (entry: NodeEntry) => `${entry.nodeId ?? 'local'}/${entry.bucket}`

// A row moves within its section, by dragging its handle onto another row or with the arrow keys.
const dragging = ref<{ section: string; bucket: string } | null>(null)
const dropKey = ref<string | null>(null)
const orderNote = ref('')
function moveRow(rows: Named[], from: number, to: number): boolean {
  if (from < 0 || to < 0 || to >= rows.length || from === to) return false
  const name = rows[from].bucket
  void order.save(moveBucket(orderNames.value, rows.map((row) => row.bucket), name, rows[to].bucket))
  orderNote.value = `${name} moved to position ${to + 1} of ${rows.length}`
  return true
}
function moveByKey(rows: Named[], index: number, step: number, key: string) {
  if (!moveRow(rows, index, index + step) || typeof document === 'undefined') return
  void nextTick(() => document.querySelector<HTMLElement>(`[data-order-handle="${CSS.escape(key)}"]`)?.focus())
}
function startDrag(event: DragEvent, section: string, bucket: string) {
  dragging.value = { section, bucket }
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', bucket)
  const row = (event.target as HTMLElement | null)?.closest?.('li')
  if (row) event.dataTransfer.setDragImage(row, 16, 16)
}
function dragOver(event: DragEvent, section: string, key: string) {
  if (dragging.value?.section !== section) return
  event.preventDefault()
  dropKey.value = key
}
function dropOn(event: DragEvent, section: string, rows: Named[], index: number) {
  const drag = dragging.value
  endDrag()
  if (drag?.section !== section) return
  event.preventDefault()
  moveRow(rows, rows.findIndex((row) => row.bucket === drag.bucket), index)
}
function endDrag() {
  dragging.value = null
  dropKey.value = null
}
const dropClass = (key: string, bucket: string) =>
  dropKey.value === key && dragging.value?.bucket !== bucket ? 'bg-primary/10' : dragging.value?.bucket === bucket ? 'opacity-50' : ''

// Each shown row names its files and size once its node answered.
const usage = useListedUsage()
const usageNode = (nodeId: string | null) => (nodeId && !realmNodes.isLocalNode(nodeId) ? nodeId : null)
watch(
  () => (searchList.value ? shownRows.value.map((row) => ({ bucket: row.bucket, nodeId: usageNode(rowNodeId(row)) })) : shownEntries.value.map((entry) => ({ bucket: entry.bucket, nodeId: usageNode(entry.nodeId ?? null) }))),
  (entries) => usage.ensure(entries),
  { immediate: true },
)
// Read in place reads the usage of the rows of this page only, and only while it is on.
const usageCandidates = computed(() =>
  !inPlaceOn.value ? []
    : searchList.value ? pageSlice.value.map((row) => ({ bucket: row.bucket, nodeId: usageNode(rowNodeId(row)) }))
      : nodeBuckets.value.map((entry) => ({ bucket: entry.bucket, nodeId: usageNode(entry.nodeId ?? null) })))
watch(usageCandidates, (entries) => usage.ensure(entries), { immediate: true })
const checkingUsage = computed(() => usageCandidates.value.some((entry) => !usage.answered(entry.bucket, entry.nodeId)))
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
  <aside :class="sheet ? '' : 'min-w-0 self-start'">
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
    <div data-tour="bucket-list" :class="sheet ? '' : 'surface'" :aria-busy="bucketsRefreshing">
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
            <Button variant="outline" size="icon" class="h-8 w-8 shrink-0" :class="activeFilters.length ? 'border-primary/40 text-primary' : ''" :title="filterLabel" :aria-label="filterLabel">
              <ListFilter class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-60">
            <DropdownMenuLabel>Kind</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="kind in KINDS"
              :key="kind.value"
              role="menuitemradio"
              :aria-checked="kindFilter === kind.value"
              class="pl-8"
              @click="kindFilter = kind.value"
            >
              <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                <Check v-if="kindFilter === kind.value" class="h-3.5 w-3.5 text-primary" />
              </span>
              {{ kind.label }}
            </DropdownMenuItem>
            <template v-if="searchList && filterNodes.length">
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Node</DropdownMenuLabel>
              <DropdownMenuItem
                v-for="node in [null, ...filterNodes]"
                :key="node ?? 'all'"
                role="menuitemcheckbox"
                :aria-checked="node ? nodeFilter.includes(node) : !nodeFilter.length"
                class="pl-8"
                @select.prevent
                @click="toggleNode(node)"
              >
                <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <Check v-if="node ? nodeFilter.includes(node) : !nodeFilter.length" class="h-3.5 w-3.5 text-primary" />
                </span>
                {{ node ? realmNodes.displayName(node) : 'All nodes' }}
              </DropdownMenuItem>
            </template>
            <!-- A list of one node, opened from a failed session, goes back to every node here. -->
            <template v-else-if="!allNodes">
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Node</DropdownMenuLabel>
              <DropdownMenuItem role="menuitemradio" :aria-checked="false" class="pl-8" @click="props.manager.pickNode(null)">All nodes</DropdownMenuItem>
              <DropdownMenuItem role="menuitemradio" :aria-checked="true" class="pl-8">
                <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center"><Check class="h-3.5 w-3.5 text-primary" /></span>
                {{ realmNodes.displayName(bucketNodeChoice) }}
              </DropdownMenuItem>
            </template>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Only</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="fact in FACTS"
              :key="fact.value"
              role="menuitemcheckbox"
              :aria-checked="onlyFacts.includes(fact.value)"
              class="pl-8"
              @select.prevent
              @click="toggleFact(fact.value)"
            >
              <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                <Check v-if="onlyFacts.includes(fact.value)" class="h-3.5 w-3.5 text-primary" />
              </span>
              {{ fact.label }}
            </DropdownMenuItem>
            <template v-if="activeFilters.length">
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="clearFilters"><X class="h-3.5 w-3.5" /> Clear filters</DropdownMenuItem>
            </template>
            <template v-if="canOrder && orderNames.length">
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="resetOrder"><RotateCcw class="h-3.5 w-3.5" /> Reset order</DropdownMenuItem>
            </template>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div v-if="activeFilters.length" class="flex flex-wrap items-center gap-1.5 px-3.5 pt-2">
        <Button
          v-for="filter in activeFilters"
          :key="filter.key"
          variant="secondary"
          size="sm"
          class="h-7 gap-1 px-2"
          :aria-label="`Remove filter ${filter.label}`"
          @click="filter.clear()"
        >
          {{ filter.label }} <X class="h-3 w-3" />
        </Button>
        <button type="button" class="ml-auto text-xs text-primary hover:underline" @click="clearFilters">Clear</button>
      </div>
      <p class="sr-only" aria-live="polite">{{ orderNote }}</p>
      <Spinner v-if="checkingUsage" show-label label="Checking which buckets read in place…" class="px-3.5 pt-2" />
      <ul v-if="databaseMode" :id="`${listId}-group`" role="listbox" :class="listClass">
        <DatabaseRows ref="databaseRows" :filter="bucketNameFilter" :active="bucket" :highlighted="activeIndex" @open="openBucketOn" />
      </ul>
      <template v-else-if="searchList">
        <Spinner v-if="all.loading.value && !all.hits.value.length" show-label label="Loading buckets…" class="px-3 py-4" />
        <p v-else-if="all.error.value" class="px-3 py-3 text-xs text-destructive">{{ all.error.value }}</p>
        <ul v-else-if="pageRows.length || examples.length" :id="`${listId}-group`" role="listbox" :class="listClass">
          <template v-for="section in allSections" :key="section.label">
            <li v-if="section.label" role="presentation" class="px-3.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">{{ section.label }}</li>
            <li v-else-if="allSections.length > 1" role="presentation" class="mx-3.5 my-2 border-t border-border-subtle" />
            <li
              v-for="(row, index) in section.rows"
              :key="row.key"
              role="presentation"
              :class="dropClass(row.key, row.bucket)"
              @dragover="dragOver($event, section.label, row.key)"
              @drop="dropOn($event, section.label, section.rows, index)"
            >
              <BucketRow
                v-if="row.hit"
                :bucket="row.bucket"
                :database="Boolean(databaseOf(row.bucket, row.hit.node_id))"
                :is-public="rowPublic(row.bucket, row.hit.node_id)"
                :parts="usage.partsOf(row.bucket, usageNode(row.hit.node_id))"
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
                <template v-if="canOrder" #handle>
                  <BucketOrderHandle
                    :bucket="row.bucket"
                    :row-key="row.key"
                    @move="(step: number) => moveByKey(section.rows, index, step, row.key)"
                    @dragstart="startDrag($event, section.label, row.bucket)"
                    @dragend="endDrag"
                  />
                </template>
              </BucketRow>
              <BucketRow
                v-else
                :bucket="row.bucket"
                :node-id="row.nodeId"
                :database="Boolean(databaseOf(row.bucket, row.nodeId))"
                :is-public="rowPublic(row.bucket, row.nodeId)"
                :parts="usage.partsOf(row.bucket, usageNode(row.nodeId))"
                pinned
                option
                :highlighted="rowIndex(row) === activeIndex"
                :active="row.bucket === bucket && row.nodeId === remoteNodeId"
                v-bind="rowPlace(row.nodeId)"
                @open="openRow(row)"
                @toggle-pin="shortcuts.togglePin(row.bucket, row.nodeId)"
              >
                <template v-if="canOrder" #handle>
                  <BucketOrderHandle
                    :bucket="row.bucket"
                    :row-key="row.key"
                    @move="(step: number) => moveByKey(section.rows, index, step, row.key)"
                    @dragstart="startDrag($event, section.label, row.bucket)"
                    @dragend="endDrag"
                  />
                </template>
              </BucketRow>
            </li>
          </template>
          <MockBucketRows :filter="bucketNameFilter" :active="bucket" @open="openBucket" />
        </ul>
        <p v-else-if="!all.loading.value && !checkingUsage" class="px-3 py-4 text-xs text-muted-foreground">
          {{ !activeFilters.length ? 'No buckets found.' : inPlaceOn && hasNextPage ? 'No bucket on this page matches.' : 'No bucket matches.' }}
          <button v-if="activeFilters.length" type="button" class="text-primary hover:underline" @click="clearFilters">Clear filters</button>
        </p>
        <p v-if="all.failedNodes.value" class="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
          {{ all.failedNodes.value }} {{ all.failedNodes.value === 1 ? 'node' : 'nodes' }} did not answer.
          <button type="button" class="text-primary hover:underline" @click="all.reload()">Retry</button>
        </p>
        <div v-if="page > 1 || hasNextPage" class="flex items-center justify-between gap-2 border-t border-border-subtle px-3.5 py-2 text-xs tabular-nums text-muted-foreground">
          <span>{{ pageRange }}</span>
          <span class="flex gap-1">
            <IconButton label="Previous page" variant="outline" size="icon" class="h-7 w-7" :disabled="page <= 1 || all.loading.value" @click="page--">
              <ChevronLeft class="size-3.5" />
            </IconButton>
            <IconButton label="Next page" variant="outline" size="icon" class="h-7 w-7" :disabled="!hasNextPage || all.loading.value" @click="nextPage">
              <ChevronRight class="size-3.5" />
            </IconButton>
          </span>
        </div>
      </template>
      <template v-else>
        <Spinner v-if="bucketsLoading" show-label label="Loading buckets…" class="px-3 py-4" />
        <Notice v-else-if="bucketsError && bucketsAuthError" tone="warning" class="m-3">
          <p>The temporary S3 session was rejected. Close it, then explicitly open this node and group again.</p>
          <p class="mt-1 break-all font-mono text-xs">{{ bucketsError }}</p>
          <Button variant="outline" size="sm" class="mt-2" @click="s3.clearSessions()"><KeyRound class="h-3.5 w-3.5" /> Close temporary sessions</Button>
        </Notice>
        <p v-else-if="bucketsError && !bucketsLoaded" class="px-3 py-3 text-xs text-destructive">{{ bucketsError }}</p>
        <template v-else>
          <!-- A failed revalidation keeps the last good list and reports itself above it. -->
          <p v-if="bucketsError" class="border-b border-border/70 px-3 py-2 text-xs text-destructive">{{ bucketsError }}</p>
          <ul v-if="shownEntries.length || examples.length" :id="`${listId}-group`" role="listbox" :class="listClass">
            <template v-for="section in nodeSections" :key="section.label">
              <li v-if="section.label" role="presentation" class="px-3.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">{{ section.label }}</li>
              <li v-else-if="nodeSections.length > 1" role="presentation" class="mx-3.5 my-2 border-t border-border-subtle" />
              <li
                v-for="(entry, index) in section.rows"
                :key="entryKey(entry)"
                role="presentation"
                :class="dropClass(entryKey(entry), entry.bucket)"
                @dragover="dragOver($event, section.label, entryKey(entry))"
                @drop="dropOn($event, section.label, section.rows, index)"
              >
                <BucketRow
                  :bucket="entry.bucket"
                  option
                  :database="Boolean(databaseOf(entry.bucket, entry.nodeId ?? null))"
                  :is-public="rowPublic(entry.bucket, entry.nodeId ?? null)"
                  :parts="usage.partsOf(entry.bucket, usageNode(entry.nodeId ?? null))"
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
                  <template v-if="canOrder" #handle>
                    <BucketOrderHandle
                      :bucket="entry.bucket"
                      :row-key="entryKey(entry)"
                      @move="(step: number) => moveByKey(section.rows, index, step, entryKey(entry))"
                      @dragstart="startDrag($event, section.label, entry.bucket)"
                      @dragend="endDrag"
                    />
                  </template>
                </BucketRow>
              </li>
            </template>
            <MockBucketRows :filter="bucketNameFilter" :active="bucket" @open="openBucket" />
          </ul>
          <p v-else-if="!checkingUsage" class="px-3 py-4 text-xs text-muted-foreground">{{ activeFilters.length ? 'No bucket matches.' : 'No buckets in this group yet.' }}</p>
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
  </aside>
</template>
