<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import FilterMenu from '@/components/compute/FilterMenu.vue'
import KindTile from '@/components/compute/KindTile.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import ListShell from '@/components/ui/ListShell.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Spinner from '@/components/ui/Spinner.vue'
import TaskDetailPanel from '@/components/compute/TaskDetailPanel.vue'
import NewRunMenu from '@/components/compute/NewRunMenu.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useNow } from '@/composables/useNow'
import { useRefresh } from '@/composables/useRefresh'
import { useFirstPaint } from '@/composables/useFirstPaint'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { errorMessage, formatDateTime, formatDuration, formatResourceGb, relativeTime, truncateMiddle } from '@/lib/utils'
import { follow, onWake } from '@/lib/poll'
import { sessionRuntime } from '@/lib/notebook/submit'
import { sessionRuntimeById } from '@/lib/notebook/runtimes'
import { isDesktop } from '@/lib/desktop'
import {
  TES_GROUP_TAG,
  isActiveTesState,
  isLocalRun,
  isTerminalTesState,
  runListed,
  TES_STATE_META,
  type TesServiceInfo,
  type TesState,
  type TesTask,
} from '@/lib/tes'
import { Activity, ChevronRight, CircleCheck, FileText, Gauge, Hourglass, Laptop, List, NotebookPen, RotateCcw, Server, Timer, Users, Workflow } from '@lucide/vue'

// Run list section of the unified Compute view. ComputeView gates the feature
// flag and sign-in, but the panel tracks the session itself so a late or lost
// login never strands the list in its pre-fetch state.
const router = useRouter()
const route = useRoute()
const { getTesServiceInfo, listTasks } = useTes()
const { currentUser, myGroups, metadataAtPath, getRun } = useAruna()
const { authPending } = useAuth()

// Deep-linkable run drawer driven by the :taskId route param (the back button
// closes it, DataManagerView's bucket-param precedent).
const openTaskId = computed(() =>
  route.name === 'task' && route.params.taskId ? String(route.params.taskId) : '',
)
function closeTask() {
  void router.push({ name: 'compute' })
}
function openTask(id: string) {
  void router.push({ name: 'task', params: { taskId: id } })
}
function rerun(id: string) {
  void router.push({ name: 'compute-new', query: { rerun: id } })
}
// The record is looked up only when asked for, as the run details find it.
const recordError = ref<string | null>(null)
async function openRecord(id: string) {
  recordError.value = null
  try {
    const record = (await metadataAtPath(`runs/${id}`))?.document_id ?? (await getRun(id)).run_crate
    if (record) void router.push({ name: 'dataset', params: { id: record } })
    else recordError.value = 'This run has no run record yet.'
  } catch {
    recordError.value = 'The run record could not be found.'
  }
}

// ── Service banner ───────────────────────────────────────────────────────────
const serviceInfo = ref<TesServiceInfo | null>(null)
const serviceState = ref<'idle' | 'loading' | 'ready' | 'unsupported' | 'error'>('idle')
const serviceError = ref<string | null>(null)

// Guards the service-info and init sequence the way `listRequestId` guards the
// list: a sign-out or an account swap mid-flight must not land on the session
// that replaced it.
let initRequestId = 0

/** Returns the request id it ran under, so a caller can drop a stale sequence. */
async function loadServiceInfo(): Promise<number> {
  const requestId = ++initRequestId
  serviceState.value = 'loading'
  serviceError.value = null
  try {
    const info = await getTesServiceInfo()
    if (requestId !== initRequestId) return requestId
    serviceInfo.value = info
    serviceState.value = 'ready'
  } catch (err) {
    if (requestId !== initRequestId) return requestId
    if (isTesUnsupported(err)) {
      serviceState.value = 'unsupported'
    } else {
      serviceState.value = 'error'
      serviceError.value = errorMessage(err)
    }
  }
  return requestId
}

// ── State filter ─────────────────────────────────────────────────────────────
// Chips cover only states the facade actually emits (aruna api tes.rs):
// PAUSED and PREEMPTED never occur; UNKNOWN (indeterminate) counts as failed.
type StateFilterGroup = 'active' | 'done' | 'failed' | 'canceled'
const GROUP_STATES: Record<StateFilterGroup, TesState[]> = {
  active: ['QUEUED', 'INITIALIZING', 'RUNNING', 'CANCELING'],
  done: ['COMPLETE'],
  failed: ['EXECUTOR_ERROR', 'SYSTEM_ERROR', 'UNKNOWN'],
  canceled: ['CANCELED'],
}
const GROUP_LABELS: Record<StateFilterGroup, string> = {
  active: 'Active',
  done: 'Completed',
  failed: 'Failed',
  canceled: 'Cancelled',
}
const stateGroups = ref<string[]>([])

// A notebook session is a kernel behind a notebook; every other run is a tool run.
type RunKind = 'tool' | 'notebook'
const KIND_META: Record<RunKind, { label: string; icon: typeof Workflow; tone: 'royal' | 'aqua' }> = {
  tool: { label: 'Tool run', icon: Workflow, tone: 'royal' },
  notebook: { label: 'Notebook session', icon: NotebookPen, tone: 'aqua' },
}
const kindOf = (task: TesTask): RunKind => (sessionRuntime(task.tags) !== null ? 'notebook' : 'tool')
const kinds = ref<string[]>([])

const tasks = ref<TesTask[]>([])
const now = useNow(60_000)
// Finished runs older than the list window drop out; a link still opens them.
const shownTasks = computed(() => tasks.value.filter((task) => runListed(task, now.value)))
const olderCount = computed(() => tasks.value.length - shownTasks.value.length)

// The desktop lists the runs of this computer and of the realm in one table.
const desktop = isDesktop()
type Place = 'all' | 'local' | 'realm'
const place = ref<Place>('all')
const inPlace = (task: TesTask, where: Place) => where === 'all' || isLocalRun(task.tags) === (where === 'local')
const placedTasks = computed(() => shownTasks.value.filter((task) => inPlace(task, place.value)))
const placeOptions = computed(() =>
  (['all', 'local', 'realm'] as const).map((where) => ({
    value: where,
    label: where === 'all' ? 'Everywhere' : where === 'local' ? 'This computer' : 'Realm',
    count: shownTasks.value.filter((task) => inPlace(task, where)).length,
  })),
)

function inGroup(task: TesTask, group: StateFilterGroup): boolean {
  return !!task.state && GROUP_STATES[group].includes(task.state)
}
const query = ref('')
const visibleTasks = computed(() => {
  const groups = stateGroups.value as StateFilterGroup[]
  const text = query.value.trim().toLowerCase()
  return placedTasks.value.filter((task) =>
    (!groups.length || groups.some((group) => inGroup(task, group)))
    && (!kinds.value.length || kinds.value.includes(kindOf(task)))
    && (!text || [task.name, task.id, tool(task)].some((value) => value?.toLowerCase().includes(text))))
})
const stateOptions = computed(() => (Object.keys(GROUP_LABELS) as StateFilterGroup[]).map((group) => ({
  value: group,
  label: GROUP_LABELS[group],
  count: placedTasks.value.filter((task) => inGroup(task, group)).length,
})))
const kindOptions = computed(() => (Object.keys(KIND_META) as RunKind[]).map((kind) => ({
  value: kind,
  label: kind === 'tool' ? 'Tool runs' : 'Notebook sessions',
  count: placedTasks.value.filter((task) => kindOf(task) === kind).length,
})))
function clearFilters() {
  query.value = ''
  kinds.value = []
  stateGroups.value = []
}
// What a row says under its name: the kind and the tool or notebook runtime.
function kindLine(task: TesTask): string {
  const runtime = sessionRuntime(task.tags)
  const detail = runtime !== null ? (sessionRuntimeById(runtime)?.label ?? runtime) : tool(task)
  return detail ? `${KIND_META[kindOf(task)].label}, ${detail}` : KIND_META[kindOf(task)].label
}

// The API of the other node that owns the open run; the serving node's own runs need none.
const openTaskApi = computed(() => {
  const owner = remoteNode.value.get(openTaskId.value)
  return (owner && realmNodes.value.find((node) => node.nodeId === owner)?.apiBase) || undefined
})

function onDeleted() {
  const id = openTaskId.value
  tasks.value = tasks.value.filter((task) => task.id !== id)
  closeTask()
}

// ── Task list ────────────────────────────────────────────────────────────────
const listState = ref<'idle' | 'loading' | 'ready' | 'error' | 'unsupported' | 'signed-out'>('idle')
const listError = ref<string | null>(null)
const nextPageToken = ref<string | undefined>(undefined)
// The last run of the local pages; runs merged in from other nodes do not page here.
const localLastCreated = ref<string | undefined>(undefined)
const pagesLoaded = ref(0)
const refreshing = ref(false)
const lastPollError = ref<string | null>(null)
// Each node lists only the runs it owns, so the first page also reads the other nodes.
// Only places of the realm are asked; a device is its owner's computer.
const { targets: realmNodes, localNodeId, displayName } = useRealmNodes()
const otherNodes = ref<{ failed: string[]; truncated: string[] }>({ failed: [], truncated: [] })
function otherNodeTasks() {
  const others = desktop ? [] : realmNodes.value.filter((node) => !node.isLocal && node.apiBase)
  return Promise.all(others.map((node) =>
    listTasks({ view: 'BASIC', page_size: 50 }, node.apiBase!).then((page) => ({ node, page }), () => ({ node, page: null }))))
}
// The node each run from another node came from; the serving node's own runs are not in it.
const remoteNode = ref(new Map<string, string>())
function nodeOf(task: TesTask): string | null {
  return (task.id && remoteNode.value.get(task.id)) || localNodeId.value
}
// Stale responses are dropped via a request id (ObjectBrowserPanel pattern).
let listRequestId = 0

const groupNameById = computed(() => new Map(myGroups.value.map((g) => [g.id, g.name] as const)))

function taskGroup(task: TesTask): { id: string; text: string; mono: boolean } | null {
  const id = task?.tags?.[TES_GROUP_TAG]
  if (!id) return null
  const name = groupNameById.value.get(id)
  return name ? { id, text: name, mono: false } : { id, text: truncateMiddle(id), mono: true }
}

// The tool is the image name without its registry, path and tag.
function tool(task: TesTask): string {
  return task.executors?.[0]?.image?.split('/').pop()?.split(/[:@]/)[0] ?? ''
}
const stateLabel = (task: TesTask) => TES_STATE_META[task.state ?? 'UNKNOWN'].label

// The facade always emits a `resources` object (`preemptible` is filled in even
// when the submitter asked for nothing), so an empty summary means no ceilings
// were requested, not that the field is missing.
function taskResources(task: TesTask): string {
  const r = task.resources
  if (!r) return ''
  const parts: string[] = []
  if (r.cpu_cores != null) parts.push(`${r.cpu_cores}\u00a0CPU`)
  if (r.ram_gb != null) parts.push(formatResourceGb(r.ram_gb))
  if (r.disk_gb != null) parts.push(`${formatResourceGb(r.disk_gb)} disk`)
  return parts.join(', ')
}

function resourcesHint(task: TesTask): string | undefined {
  if (taskResources(task)) return undefined
  return 'No resource limits requested, the node decides what to apply.'
}

// Latest attempt, matching TaskDetailPanel; the facade currently emits one log.
function taskLog(task: TesTask) {
  const logs = task.logs
  return logs?.length ? logs[logs.length - 1] : undefined
}

function runMs(task: TesTask): number | null {
  const log = taskLog(task)
  if (!log?.start_time) return null
  const start = Date.parse(log.start_time)
  const end = log.end_time ? Date.parse(log.end_time) : isActiveTesState(task.state) ? Date.now() : NaN
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null
}

function taskDuration(task: TesTask): string {
  const ms = runMs(task)
  const label = ms === null ? '' : formatDuration(ms)
  if (!label) return ''
  return taskLog(task)?.end_time ? label : `${label} so far`
}

// Figures over the loaded runs only; older pages and nodes that did not answer are not in them.
const stats = computed(() => {
  const list = shownTasks.value
  const times = list.map(runMs).filter((ms): ms is number => ms !== null)
  const started = list.filter((task) => taskLog(task)?.start_time || !NOT_STARTED.includes(task.state)).length
  // A started run without timing makes the sum a lower bound; none timed leaves it unknown.
  const sum = formatDuration(times.reduce((total, ms) => total + ms, 0)) || '0s'
  const nodes = [...new Set(list.map(nodeOf).filter((id): id is string => Boolean(id)))]
  return {
    total: list.length,
    completed: list.filter((task) => task.state === 'COMPLETE').length,
    active: list.filter((task) => isActiveTesState(task.state)).length,
    waiting: list.filter((task) => task.state === 'QUEUED' || task.state === 'INITIALIZING').length,
    time: !started ? '0s' : !times.length ? 'Unknown' : times.length < started ? `at least ${sum}` : sum,
    started,
    nodes,
    local: list.filter((task) => isLocalRun(task.tags)).length,
  }
})
const statsNote = computed(() =>
  otherNodes.value.failed.length || moreListed.value || olderHidden.value
    ? 'Counts the loaded runs only.'
    : undefined)

// A task the node has not started yet has no start time by design; one that is
// already past that point and still reports none cannot be timed here.
const NOT_STARTED: readonly (TesState | undefined)[] = [undefined, 'UNKNOWN', 'QUEUED', 'INITIALIZING']
function durationHint(task: TesTask): string | undefined {
  if (taskLog(task)?.start_time) return undefined
  return NOT_STARTED.includes(task.state) ? 'Not started yet.' : 'This node reported no start time for the run.'
}

// No session: drop any in-flight response and land on a terminal state, never
// on the pre-fetch skeleton. A session that is still resolving keeps loading.
function clearNoUser() {
  listRequestId++
  initRequestId++
  tasks.value = []
  nextPageToken.value = undefined
  localLastCreated.value = undefined
  pagesLoaded.value = 0
  otherNodes.value = { failed: [], truncated: [] }
  remoteNode.value = new Map()
  listError.value = null
  lastPollError.value = null
  listState.value = authPending.value ? 'loading' : 'signed-out'
}

async function fetchList({ more = false, silent = false } = {}) {
  if (!currentUser.value) {
    clearNoUser()
    return
  }
  const requestId = ++listRequestId
  if (!silent) refreshing.value = true
  if (!more && !silent && !tasks.value.length) listState.value = 'loading'
  try {
    const [res, others] = await Promise.all([
      listTasks({
        view: 'BASIC',
        page_size: 50,
        page_token: more ? nextPageToken.value : undefined,
      }),
      more ? null : otherNodeTasks(),
    ])
    if (requestId !== listRequestId) return
    if (others) {
      otherNodes.value = {
        failed: others.filter((entry) => !entry.page).map((entry) => entry.node.name ?? entry.node.nodeId),
        truncated: others.filter((entry) => entry.page?.next_page_token).map((entry) => entry.node.name ?? entry.node.nodeId),
      }
      const local = new Set(res.tasks.map((task) => task.id))
      const owners = new Map<string, string>()
      for (const entry of others) {
        for (const task of entry.page?.tasks ?? []) {
          if (task.id && !local.has(task.id) && !owners.has(task.id)) owners.set(task.id, entry.node.nodeId)
        }
      }
      remoteNode.value = owners
      const seen = new Set<string>()
      tasks.value = [...res.tasks, ...others.flatMap((entry) => entry.page?.tasks ?? [])]
        .filter((task) => !seen.has(task.id ?? '') && Boolean(seen.add(task.id ?? '')))
        .sort((a, b) => (b.creation_time ?? '').localeCompare(a.creation_time ?? ''))
    } else {
      tasks.value = [...tasks.value, ...res.tasks]
    }
    nextPageToken.value = res.next_page_token
    localLastCreated.value = res.tasks.at(-1)?.creation_time ?? (more ? localLastCreated.value : undefined)
    pagesLoaded.value = more ? pagesLoaded.value + 1 : 1
    listState.value = 'ready'
    lastPollError.value = null
  } catch (err) {
    if (requestId !== listRequestId) return
    if (silent) {
      lastPollError.value = errorMessage(err)
    } else if (isTesUnsupported(err)) {
      listState.value = 'unsupported'
    } else {
      listState.value = 'error'
      listError.value = errorMessage(err)
    }
  } finally {
    // Only non-silent calls ever set `refreshing`, so clear it unconditionally
    // for them; a silent poll that superseded this request id must not leave
    // the spinner stuck on (a later poll never touches `refreshing`).
    if (!silent) refreshing.value = false
  }
}

function reload() {
  void fetchList()
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(reload)
// The page header's refresh reads the runs again.
const props = defineProps<{ refreshRevision?: number }>()
watch(() => props.refreshRevision, () => void onReload())
const spinning = computed(() => reloadBusy.value || refreshing.value)

// No listed run brings the run-mode chooser back.
const listEmpty = computed(() => !shownTasks.value.length)
// Pages run newest first, so a page reaching past the window ends the list.
const moreListed = computed(() => {
  const last = localLastCreated.value
  return Boolean(nextPageToken.value) && (!last || runListed({ creation_time: last }, now.value))
})
const olderHidden = computed(() => olderCount.value > 0 || (Boolean(nextPageToken.value) && !moreListed.value))
const shellState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
  switch (listState.value) {
    case 'idle':
    case 'loading':
      return 'loading'
    case 'error':
      return 'error'
    case 'unsupported':
    case 'signed-out':
      return 'empty'
    default:
      return listEmpty.value ? 'empty' : 'ready'
  }
})
// The service banner and the list paint together, once both have answered.
const painted = useFirstPaint(() =>
  serviceState.value !== 'idle' && serviceState.value !== 'loading'
  && listState.value !== 'idle' && listState.value !== 'loading')

const emptyTitle = computed(() => {
  if (listState.value === 'unsupported') return 'Runs cannot be listed until this node accepts them.'
  if (listState.value === 'signed-out') return 'Sign in to see the runs you started.'
  if (otherNodes.value.failed.length) return 'No runs on the nodes that answered'
  return olderHidden.value ? 'No runs in the last 48 hours' : 'No runs yet'
})
const emptyDescription = computed(() => {
  if (listState.value !== 'ready') return undefined
  return olderHidden.value
    ? 'Older finished runs are not listed. Start a new run with a quick script or a custom run.'
    : 'Start your first run with a quick script or a custom run.'
})

async function init() {
  const requestId = await loadServiceInfo()
  // A sign-out or another account took over while the service info was in
  // flight: its state is the current one.
  if (requestId !== initRequestId) return
  // Skip the initial list fetch when service-info reports no TES backend, to
  // avoid a second failing request; the list area shows its own honest panel
  // and the Refresh button still allows a manual retry.
  if (serviceState.value === 'unsupported') {
    listState.value = 'unsupported'
    return
  }
  await fetchList()
}

// onMounted loads once, so authentication resolving (or dropping) afterwards
// has to drive the list: a new account reloads, a lost one clears immediately
// so the previous user's tasks cannot stay on screen.
watch([currentUser, authPending], ([user], [previous]) => {
  if (!user) clearNoUser()
  else if (user.id !== previous?.id) void init()
})

// Section-owned auto-refresh of page one (a multi-page view must not silently
// truncate): fast while a run works, slower otherwise, so deletions and runs
// from other browsers still arrive.
function pollIdle(): boolean {
  return !currentUser.value || refreshing.value || pagesLoaded.value !== 1
}
function pollDelay(): number {
  return tasks.value.some((t) => isActiveTesState(t.state)) ? 10_000 : 30_000
}
async function pollList() {
  if (pollIdle()) return
  await fetchList({ silent: true })
}
let stopFollow: (() => void) | undefined
let stopWake: (() => void) | undefined
onMounted(() => {
  void init()
  stopFollow = follow(pollList, pollDelay)
  stopWake = onWake(() => void pollList())
})
onUnmounted(() => {
  stopFollow?.()
  stopWake?.()
})
</script>

<template>
  <div class="space-y-4">
    <ListSkeleton v-if="!painted" header :rows="5" label="Loading runs" />

    <Notice v-else-if="serviceState === 'unsupported'" tone="warning">
      This node does not accept runs. Configure a compute backend first.
    </Notice>
    <ErrorPanel v-else-if="serviceState === 'error'" :message="serviceError || 'Failed to load the run service info.'" @retry="loadServiceInfo" />

    <!-- Outside the list, so an empty list still shows what other nodes did not answer. -->
    <Notice v-if="otherNodes.failed.length" tone="error" class="flex items-center gap-2">
      <span class="flex-1">Runs on {{ otherNodes.failed.join(', ') }} could not be read.</span>
      <Button variant="outline" size="sm" :disabled="spinning" @click="onReload">Retry</Button>
    </Notice>
    <p v-if="otherNodes.truncated.length" class="text-xs text-muted-foreground">Only the newest 50 runs of {{ otherNodes.truncated.join(', ') }} are shown.</p>

    <section v-if="painted && shellState === 'ready'">
    <SectionHeading title="Overview" :icon="Gauge" />
    <div class="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <OverviewCell label="Runs" :icon="Workflow" :info="statsNote">
        <template #value>{{ stats.total }}</template>
        <span><CircleCheck class="text-status-ok" /><b>{{ stats.completed }}/{{ stats.total }}</b> completed</span>
      </OverviewCell>
      <OverviewCell label="Active" :icon="Activity">
        <template #value>{{ stats.active }}</template>
        <span><Hourglass /><b>{{ stats.waiting }}</b> waiting to start</span>
      </OverviewCell>
      <OverviewCell label="Compute time" :icon="Timer">
        <template #value>{{ stats.time }}</template>
        <span><Workflow /><b>{{ stats.started }}</b> {{ stats.started === 1 ? 'run' : 'runs' }} started</span>
      </OverviewCell>
      <OverviewCell v-if="desktop" label="On this computer" :icon="Laptop">
        <template #value>{{ stats.local }}</template>
        <span><Server /><b>{{ stats.total - stats.local }}</b> in the realm</span>
      </OverviewCell>
      <OverviewCell v-else label="Nodes used" :icon="Server">
        <template #value>{{ stats.nodes.length }}</template>
        <span v-for="id in stats.nodes.slice(0, 2)" :key="id" class="min-w-0">
          <Server /><RouterLink :to="{ name: 'node', params: { nodeId: id } }" class="truncate hover:text-foreground hover:underline">{{ displayName(id) }}</RouterLink>
        </span>
        <span v-if="stats.nodes.length > 2"><b>{{ stats.nodes.length - 2 }}</b> more</span>
      </OverviewCell>
    </div>
    </section>

    <!-- 'loading' also covers the pre-fetch gap while init() awaits service
         info and a session that has not resolved yet. -->
    <SectionHeading v-if="painted && shellState === 'ready'" title="Runs" :icon="List" class="!mb-0 pt-2" />
    <ListShell
      v-if="painted"
      :state="shellState"
      :error="listError || 'Failed to load the runs.'"
      :empty-title="emptyTitle"
      :empty-description="emptyDescription"
      :compact="listState !== 'ready'"
      @retry="reload"
    >
      <template #filters>
        <div class="flex flex-wrap items-center gap-3">
          <Input v-model="query" class="h-8 w-full text-xs sm:w-64" placeholder="Find a run" aria-label="Find a run" />
          <template v-if="desktop">
            <FilterChips v-model="place" :options="placeOptions" aria-label="Filter runs by place" />
            <span class="h-4 w-px bg-border" aria-hidden="true" />
          </template>
          <FilterMenu v-model="kinds" label="Kind" :options="kindOptions" />
          <FilterMenu v-model="stateGroups" label="State" :options="stateOptions" />
        </div>
      </template>
      <template #tools>
        <span v-if="recordError" role="status" class="text-xs text-muted-foreground">{{ recordError }}</span>
        <span v-if="lastPollError" class="text-xs text-muted-foreground" :title="lastPollError">Refresh failed, retrying.</span>
      </template>

      <!-- The first-run empty state doubles as the run-mode chooser. -->
      <template #empty-actions>
        <div v-if="listState === 'ready'" class="space-y-4">
          <NewRunMenu size="sm" />
        </div>
      </template>

      <EmptyState
        v-if="!visibleTasks.length"
        compact
        class="rounded-none border-0 shadow-none"
        :title="query.trim() ? 'No run matches this name.' : 'No runs match these filters.'"
      >
        <Button variant="outline" size="sm" @click="clearFilters">Clear filters</Button>
      </EmptyState>

      <div v-else class="overflow-x-auto">
        <table class="data-table data-table-tall">
          <thead>
            <tr>
              <th class="hidden w-12 pl-5 pr-0 sm:table-cell">Kind</th>
              <th class="pl-5">Run</th>
              <th>State</th>
              <th v-if="desktop" class="hidden md:table-cell">Runs on</th>
              <th v-else class="hidden md:table-cell">Node</th>
              <th class="hidden xl:table-cell">Group</th>
              <th class="hidden lg:table-cell">Resources</th>
              <th class="hidden text-right sm:table-cell">Started</th>
              <th class="num hidden sm:table-cell">Duration</th>
              <th class="w-10 pr-4 sm:w-28"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="task in visibleTasks"
              :key="task.id || task.name"
              :class="task.id ? 'cursor-pointer' : ''"
              @click="task.id && openTask(task.id)"
            >
              <td class="hidden w-12 pl-5 pr-0 sm:table-cell">
                <KindTile :icon="KIND_META[kindOf(task)].icon" :tone="KIND_META[kindOf(task)].tone" :label="KIND_META[kindOf(task)].label" />
              </td>
              <td class="w-full max-w-0 pl-5">
                <span class="flex items-start gap-3">
                  <span class="min-w-0">
                    <RouterLink
                      v-if="task.id"
                      class="line-clamp-2 break-words font-medium text-foreground hover:underline"
                      :to="{ name: 'task', params: { taskId: task.id } }"
                      @click.stop
                    >{{ task.name || 'Untitled run' }}</RouterLink>
                    <span v-else class="line-clamp-2 break-words font-medium text-foreground">{{ task.name || 'Untitled run' }}</span>
                    <span class="mt-1 block text-xs text-muted-foreground">{{ kindLine(task) }}</span>
                  </span>
                </span>
              </td>
              <td class="whitespace-nowrap">
                <StatusPill
                  v-if="task.state === 'COMPLETE'"
                  :state="stateLabel(task)"
                  :icon="CircleCheck"
                  class="border-transparent bg-status-ok/10 text-status-ok"
                />
                <StatusPill v-else :state="stateLabel(task)" />
              </td>
              <td v-if="desktop" class="hidden whitespace-nowrap text-[13px] md:table-cell">
                <span v-if="isLocalRun(task.tags)" class="inline-flex items-center gap-1.5">
                  <Laptop class="h-3.5 w-3.5 text-muted-foreground" /> This computer
                </span>
                <span v-else class="inline-flex items-center gap-1.5">
                  <Server class="h-3.5 w-3.5 text-muted-foreground" /> Realm
                </span>
              </td>
              <td v-else class="hidden whitespace-nowrap text-[13px] md:table-cell">
                <RouterLink v-if="nodeOf(task)" :to="{ name: 'node', params: { nodeId: nodeOf(task)! } }" class="inline-flex items-center gap-1.5 hover:underline" @click.stop>
                  <Server class="h-3.5 w-3.5 text-muted-foreground" />{{ displayName(nodeOf(task)) }}
                </RouterLink>
              </td>
              <td class="hidden whitespace-nowrap text-[13px] xl:table-cell">
                <RouterLink v-if="taskGroup(task)" :to="{ name: 'group', params: { id: taskGroup(task)!.id } }" class="inline-flex items-center gap-1.5 hover:underline" @click.stop>
                  <Users class="h-3.5 w-3.5 text-muted-foreground" /><span :class="taskGroup(task)!.mono ? 'font-mono text-xs' : ''">{{ taskGroup(task)!.text }}</span>
                </RouterLink>
              </td>
              <td class="hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:table-cell" :title="resourcesHint(task)">
                {{ taskResources(task) || '-' }}
              </td>
              <td class="hidden whitespace-nowrap text-right text-xs text-muted-foreground sm:table-cell" :title="task.creation_time ? formatDateTime(task.creation_time) : undefined">
                {{ task.creation_time ? relativeTime(task.creation_time) : '-' }}
              </td>
              <td class="num hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell" :title="durationHint(task)">
                {{ taskDuration(task) || '-' }}
              </td>
              <td class="w-10 pr-4 sm:w-28">
                <span class="flex items-center justify-end gap-1">
                  <span v-if="task.id" class="hidden items-center gap-1 sm:inline-flex">
                    <IconButton v-if="isTerminalTesState(task.state)" label="Run again" @click.stop="rerun(task.id)"><RotateCcw class="h-4 w-4" /></IconButton>
                    <IconButton v-if="task.state === 'COMPLETE'" label="Open the run record" @click.stop="openRecord(task.id)"><FileText class="h-4 w-4" /></IconButton>
                  </span>
                  <ChevronRight v-if="task.id" class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
          <span>{{ visibleTasks.length }} of {{ placedTasks.length }} {{ placedTasks.length === 1 ? 'run' : 'runs' }}</span>
          <Button v-if="moreListed" variant="outline" size="sm" :disabled="refreshing" :aria-busy="refreshing" @click="fetchList({ more: true })">
            <Spinner v-if="refreshing" label="Loading more runs" class="text-current" /> Load more
          </Button>
          <span v-else-if="olderHidden">Finished runs started more than 48 hours ago are not listed.</span>
        </div>
      </template>
    </ListShell>

    <TaskDetailPanel
      v-if="openTaskId"
      :task-id="openTaskId"
      :api-base="openTaskApi"
      :open="!!openTaskId"
      @update:open="(v) => !v && closeTask()"
      @resolved="(id) => router.replace({ name: 'task', params: { taskId: id } })"
      @canceled="reload"
      @deleted="onDeleted"
    />
  </div>
</template>
