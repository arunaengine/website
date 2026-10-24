<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Badge from '@/components/ui/Badge.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import ListShell from '@/components/ui/ListShell.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Spinner from '@/components/ui/Spinner.vue'
import TaskStateBadge from '@/components/compute/TaskStateBadge.vue'
import TesPlacementTags from '@/components/compute/TesPlacementTags.vue'
import TaskDetailPanel from '@/components/compute/TaskDetailPanel.vue'
import NewRunMenu from '@/components/compute/NewRunMenu.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useJobs } from '@/composables/useJobs'
import { useNow } from '@/composables/useNow'
import { useRefresh } from '@/composables/useRefresh'
import { useFirstPaint } from '@/composables/useFirstPaint'
import { errorMessage, formatDuration, formatResourceGb, relativeTime, truncateMiddle } from '@/lib/utils'
import { follow, onWake } from '@/lib/poll'
import { deleteErrorMessage } from '@/lib/jobs'
import { sessionRuntime } from '@/lib/notebook/submit'
import { isDesktop } from '@/lib/desktop'
import {
  TES_GROUP_TAG,
  isActiveTesState,
  isLocalRun,
  isTerminalTesState,
  runListed,
  type TesServiceInfo,
  type TesState,
  type TesTask,
} from '@/lib/tes'
import { ChevronRight, Laptop, Server, Trash2 } from '@lucide/vue'

// Run list section of the unified Compute view. ComputeView gates the feature
// flag and sign-in, but the panel tracks the session itself so a late or lost
// login never strands the list in its pre-fetch state.
const router = useRouter()
const route = useRoute()
const { getTesServiceInfo, listTasks } = useTes()
const { currentUser, myGroups } = useAruna()
const { authPending } = useAuth()

// Deep-linkable run drawer driven by the :taskId route param (the back button
// closes it, DataManagerView's bucket-param precedent).
const openTaskId = computed(() =>
  route.name === 'task' && route.params.taskId ? String(route.params.taskId) : '',
)
function closeTask() {
  void router.push({ name: 'compute' })
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
type StateGroup = 'all' | StateFilterGroup
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
const stateGroup = ref<StateGroup>('all')

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
const visibleTasks = computed(() => {
  const group = stateGroup.value
  if (group === 'all') return placedTasks.value
  return placedTasks.value.filter((task) => inGroup(task, group))
})
const emptyGroupLabel = computed(() => {
  const group = stateGroup.value
  if (group === 'all') return ''
  return `${GROUP_LABELS[group].toLowerCase()} `
})
const chipOptions = computed(() => [
  { value: 'all', label: 'All', count: placedTasks.value.length },
  ...(Object.keys(GROUP_LABELS) as StateFilterGroup[]).map((group) => ({
    value: group,
    label: GROUP_LABELS[group],
    count: placedTasks.value.filter((task) => inGroup(task, group)).length,
  })),
])

// ── Row-level delete (two-step inline confirm) ───────────────────────────────
const confirmingDeleteId = ref<string | null>(null)
let rowDeleteTimer: number | undefined
function requestRowDelete(id: string) {
  confirmingDeleteId.value = id
  window.clearTimeout(rowDeleteTimer)
  rowDeleteTimer = window.setTimeout(() => (confirmingDeleteId.value = null), 4000)
}
// The node removes the run for every client; one already gone counts as deleted.
const { deleteJob } = useJobs()
const deleteError = ref<string | null>(null)
async function confirmRowDelete(id: string) {
  window.clearTimeout(rowDeleteTimer)
  confirmingDeleteId.value = null
  deleteError.value = null
  try {
    await deleteJob(id)
  } catch (err) {
    deleteError.value = deleteErrorMessage(err)
    if (deleteError.value) return
  }
  tasks.value = tasks.value.filter((task) => task.id !== id)
}
function onDeleted() {
  const id = openTaskId.value
  tasks.value = tasks.value.filter((task) => task.id !== id)
  closeTask()
}

// ── Task list ────────────────────────────────────────────────────────────────
const listState = ref<'idle' | 'loading' | 'ready' | 'error' | 'unsupported' | 'signed-out'>('idle')
const listError = ref<string | null>(null)
const nextPageToken = ref<string | undefined>(undefined)
const pagesLoaded = ref(0)
const refreshing = ref(false)
const lastPollError = ref<string | null>(null)
// Stale responses are dropped via a request id (ObjectBrowserPanel pattern).
let listRequestId = 0

const groupNameById = computed(() => new Map(myGroups.value.map((g) => [g.id, g.name] as const)))

function taskGroup(task: TesTask): { text: string; mono: boolean } | null {
  const id = task?.tags?.[TES_GROUP_TAG]
  if (!id) return null
  const name = groupNameById.value.get(id)
  return name ? { text: name, mono: false } : { text: truncateMiddle(id), mono: true }
}

// The facade always emits a `resources` object (`preemptible` is filled in even
// when the submitter asked for nothing), so an empty summary means no ceilings
// were requested, not that the field is missing.
function taskResources(task: TesTask): string {
  const r = task.resources
  if (!r) return ''
  const parts: string[] = []
  if (r.cpu_cores != null) parts.push(`${r.cpu_cores} cpu`)
  if (r.ram_gb != null) parts.push(`${formatResourceGb(r.ram_gb)} RAM`)
  if (r.disk_gb != null) parts.push(`${formatResourceGb(r.disk_gb)} disk`)
  return parts.join(' · ')
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

function taskDuration(task: TesTask): string {
  const log = taskLog(task)
  if (!log?.start_time) return ''
  const start = Date.parse(log.start_time)
  const end = log.end_time ? Date.parse(log.end_time) : isActiveTesState(task.state) ? Date.now() : NaN
  if (!Number.isFinite(start) || !Number.isFinite(end)) return ''
  const label = formatDuration(end - start)
  if (!label) return ''
  return log.end_time ? label : `${label} so far`
}

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
  pagesLoaded.value = 0
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
    const res = await listTasks({
      view: 'BASIC',
      page_size: 50,
      page_token: more ? nextPageToken.value : undefined,
    })
    if (requestId !== listRequestId) return
    tasks.value = more ? [...tasks.value, ...res.tasks] : res.tasks
    nextPageToken.value = res.next_page_token
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
const spinning = computed(() => reloadBusy.value || refreshing.value)

// No listed run brings the run-mode chooser back.
const listEmpty = computed(() => !shownTasks.value.length)
// Pages run newest first, so a page reaching past the window ends the list.
const moreListed = computed(() => {
  const last = tasks.value[tasks.value.length - 1]
  return Boolean(nextPageToken.value) && (!last || runListed({ creation_time: last.creation_time }, now.value))
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
  if (listState.value === 'signed-out') return 'Sign in to see the runs you started on this node.'
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
  window.clearTimeout(rowDeleteTimer)
})
</script>

<template>
  <div class="space-y-4">
    <p class="text-xs text-muted-foreground">
      Runs are the work <span class="font-medium text-foreground">you start</span> on this node; begin with a script template, or describe your own container.
    </p>

    <ListSkeleton v-if="!painted" header :rows="5" label="Loading runs" />

    <!-- Service banner: capability and storage only; the protocol version lives
         in the tooltip and the realm identity in the page header badge. -->
    <p v-else-if="serviceState === 'ready' && serviceInfo" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span class="font-medium text-foreground" :title="`GA4GH TES ${serviceInfo.type.version}`">Run service</span>
      <template v-if="serviceInfo.storage?.length">
        <span>·</span>
        <Badge v-for="s in serviceInfo.storage" :key="s" variant="outline" class="font-mono">{{ s }}</Badge>
      </template>
    </p>
    <Notice v-else-if="serviceState === 'unsupported'" tone="warning">
      This node does not accept runs. Configure a compute backend first.
    </Notice>
    <ErrorPanel v-else-if="serviceState === 'error'" :message="serviceError || 'Failed to load the run service info.'" @retry="loadServiceInfo" />

    <!-- 'loading' also covers the pre-fetch gap while init() awaits service
         info and a session that has not resolved yet. -->
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
          <template v-if="desktop">
            <FilterChips v-model="place" :options="placeOptions" aria-label="Filter runs by place" />
            <span class="h-4 w-px bg-border" aria-hidden="true" />
          </template>
          <FilterChips v-model="stateGroup" :options="chipOptions" aria-label="Filter runs by state" />
        </div>
      </template>
      <template #tools>
        <span v-if="deleteError" class="text-[11px] text-destructive">{{ deleteError }}</span>
        <span v-if="lastPollError" class="text-[11px] text-muted-foreground" :title="lastPollError">Refresh failed, retrying.</span>
        <RefreshButton :busy="spinning" sr-label="Refresh runs" @click="onReload" />
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
        :title="`No ${emptyGroupLabel}runs in the loaded list.`"
      />

      <table v-else class="w-full text-sm">
        <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th class="px-5 py-2 text-left font-semibold">Run</th>
            <th class="px-5 py-2 text-left font-semibold">State</th>
            <th v-if="desktop" class="px-5 py-2 text-left font-semibold">Runs on</th>
            <th class="hidden px-5 py-2 text-left font-semibold md:table-cell">Group</th>
            <th class="hidden px-5 py-2 text-left font-semibold lg:table-cell">Resources</th>
            <th class="px-5 py-2 text-left font-semibold">Started</th>
            <th class="hidden px-5 py-2 text-left font-semibold sm:table-cell">Duration</th>
            <th class="px-5 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in visibleTasks"
            :key="task.id || task.name"
            class="border-t border-border hover:bg-muted/40"
          >
            <td class="px-5 py-2.5">
              <RouterLink
                v-if="task.id"
                class="font-medium text-foreground hover:text-primary hover:underline"
                :to="{ name: 'task', params: { taskId: task.id } }"
              >
                {{ task.name || 'Untitled run' }}
              </RouterLink>
              <div v-else class="font-medium text-foreground">{{ task.name || 'Untitled run' }}</div>
              <div v-if="task.id" class="font-mono text-[11px] text-muted-foreground" :title="task.id">{{ truncateMiddle(task.id) }}</div>
            </td>
            <td class="px-5 py-2.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <TaskStateBadge :state="task.state" />
                <Badge v-if="sessionRuntime(task.tags) !== null" variant="sky" size="sm" title="An interactive notebook kernel, not a batch run">Notebook</Badge>
              </div>
              <TesPlacementTags :tags="task.tags" compact class="mt-1" />
            </td>
            <td v-if="desktop" class="px-5 py-2.5 text-[13px]">
              <span v-if="isLocalRun(task.tags)" class="inline-flex items-center gap-1.5 font-medium text-aruna-royal">
                <Laptop class="h-3.5 w-3.5" /> This computer
              </span>
              <span v-else class="inline-flex items-center gap-1.5 text-muted-foreground">
                <Server class="h-3.5 w-3.5" /> Realm
              </span>
            </td>
            <td class="hidden px-5 py-2.5 text-[11px] text-muted-foreground md:table-cell">
              <span v-if="taskGroup(task)" :class="taskGroup(task)!.mono ? 'font-mono' : ''">{{ taskGroup(task)!.text }}</span>
              <span v-else>-</span>
            </td>
            <td class="hidden px-5 py-2.5 text-[11px] text-muted-foreground lg:table-cell" :title="resourcesHint(task)">
              {{ taskResources(task) || '-' }}
            </td>
            <td class="px-5 py-2.5 text-[11px] text-muted-foreground" :title="task.creation_time">
              {{ task.creation_time ? relativeTime(task.creation_time) : '-' }}
            </td>
            <td class="hidden px-5 py-2.5 text-[11px] tabular-nums text-muted-foreground sm:table-cell" :title="durationHint(task)">
              {{ taskDuration(task) || '-' }}
            </td>
            <td class="px-5 py-2.5 text-right">
              <div class="flex items-center justify-end gap-1">
                <template v-if="task.id && isTerminalTesState(task.state)">
                  <Button
                    v-if="confirmingDeleteId !== task.id"
                    variant="ghost"
                    size="icon-sm"
                    class="text-muted-foreground hover:text-destructive"
                    :aria-label="`Delete ${task.name || 'run'}`"
                    title="Delete this run"
                    @click.stop="requestRowDelete(task.id)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                  <Button v-else variant="destructive" size="sm" title="Removes the run from the list in every browser" @click.stop="confirmRowDelete(task.id)">
                    <Trash2 class="h-3.5 w-3.5" /> Delete?
                  </Button>
                </template>
                <ChevronRight v-if="task.id" class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <template v-if="moreListed || olderHidden" #footer>
        <Button v-if="moreListed" variant="ghost" size="sm" :disabled="refreshing" :aria-busy="refreshing" @click="fetchList({ more: true })">
          <Spinner v-if="refreshing" label="Loading more runs" class="text-current" /> Load more
        </Button>
        <span v-else class="text-[11px] text-muted-foreground">Finished runs started more than 48 hours ago are not listed.</span>
      </template>
    </ListShell>

    <TaskDetailPanel
      v-if="openTaskId"
      :task-id="openTaskId"
      :open="!!openTaskId"
      @update:open="(v) => !v && closeTask()"
      @canceled="reload"
      @deleted="onDeleted"
    />
  </div>
</template>
