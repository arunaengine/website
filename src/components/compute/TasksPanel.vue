<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Badge from '@/components/ui/Badge.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import TaskStateBadge from '@/components/compute/TaskStateBadge.vue'
import TesPlacementTags from '@/components/compute/TesPlacementTags.vue'
import TaskDetailPanel from '@/components/compute/TaskDetailPanel.vue'
import NewRunMenu from '@/components/compute/NewRunMenu.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useHiddenTasks } from '@/composables/useHiddenTasks'
import { useRefresh } from '@/composables/useRefresh'
import { errorMessage, formatDuration, relativeTime, truncateMiddle } from '@/lib/utils'
import {
  TES_GROUP_TAG,
  isActiveTesState,
  isTerminalTesState,
  type TesServiceInfo,
  type TesState,
  type TesTask,
} from '@/lib/tes'
import { ArchiveRestore, ChevronRight, Trash2 } from '@lucide/vue'

// Task list section of the unified Compute view. ComputeView gates the feature
// flag and sign-in, but the panel tracks the session itself so a late or lost
// login never strands the list in its pre-fetch state.
const router = useRouter()
const route = useRoute()
const { getTesServiceInfo, listTasks } = useTes()
const { currentUser, myGroups } = useAruna()
const { authPending } = useAuth()

// Deep-linkable task drawer driven by the :taskId route param (the back button
// closes it, DataManagerView's bucket-param precedent).
const openTaskId = computed(() =>
  route.name === 'task' && route.params.taskId ? String(route.params.taskId) : '',
)
function openTask(task: TesTask) {
  if (task.id) void router.push({ name: 'task', params: { taskId: task.id } })
}
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
// 'deleted' is not a TES state: it lists client-side hidden tasks instead.
type StateFilterGroup = 'active' | 'done' | 'failed' | 'canceled'
type StateGroup = 'all' | StateFilterGroup | 'deleted'
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
const { hide, unhide, isHidden } = useHiddenTasks()
const hiddenTasks = computed(() => tasks.value.filter((task) => isHidden(task.id)))
const shownTasks = computed(() => tasks.value.filter((task) => !isHidden(task.id)))

function inGroup(task: TesTask, group: StateFilterGroup): boolean {
  return !!task.state && GROUP_STATES[group].includes(task.state)
}
const visibleTasks = computed(() => {
  const group = stateGroup.value
  if (group === 'deleted') return hiddenTasks.value
  if (group === 'all') return shownTasks.value
  return shownTasks.value.filter((task) => inGroup(task, group))
})
const emptyGroupLabel = computed(() => {
  const group = stateGroup.value
  if (group === 'all') return ''
  return group === 'deleted' ? 'deleted ' : `${GROUP_LABELS[group].toLowerCase()} `
})
// The Deleted chip only exists while some loaded task is hidden: a subtle
// escape hatch, not a permanent empty bucket.
const chipOptions = computed(() => [
  { value: 'all', label: 'All', count: shownTasks.value.length },
  ...(Object.keys(GROUP_LABELS) as StateFilterGroup[]).map((group) => ({
    value: group,
    label: GROUP_LABELS[group],
    count: shownTasks.value.filter((task) => inGroup(task, group)).length,
  })),
  ...(hiddenTasks.value.length ? [{ value: 'deleted', label: 'Deleted', count: hiddenTasks.value.length }] : []),
])
watch(hiddenTasks, (list) => {
  if (!list.length && stateGroup.value === 'deleted') stateGroup.value = 'all'
})

// ── Row-level delete (two-step inline confirm) ───────────────────────────────
const confirmingDeleteId = ref<string | null>(null)
let rowDeleteTimer: number | undefined
function requestRowDelete(id: string) {
  confirmingDeleteId.value = id
  window.clearTimeout(rowDeleteTimer)
  rowDeleteTimer = window.setTimeout(() => (confirmingDeleteId.value = null), 4000)
}
function confirmRowDelete(id: string) {
  window.clearTimeout(rowDeleteTimer)
  confirmingDeleteId.value = null
  hide(id)
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
  if (r.ram_gb != null) parts.push(`${r.ram_gb} GB RAM`)
  if (r.disk_gb != null) parts.push(`${r.disk_gb} GB disk`)
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

let pollTimer: number | undefined
onMounted(() => {
  void init()
  // Section-owned auto-refresh: only re-fetch page one (a multi-page view must
  // not silently truncate) and only while some listed task is still active.
  pollTimer = window.setInterval(() => {
    if (document.hidden) return
    if (!currentUser.value) return
    if (refreshing.value) return
    if (pagesLoaded.value !== 1) return
    if (!tasks.value.some((t) => isActiveTesState(t.state))) return
    void fetchList({ silent: true })
  }, 10_000)
})
onUnmounted(() => {
  window.clearInterval(pollTimer)
  window.clearTimeout(rowDeleteTimer)
})
</script>

<template>
  <div class="space-y-4">
    <p class="text-xs text-muted-foreground">
      Tasks are runs <span class="font-medium text-foreground">you submit</span> to this node, start one with Quick run or describe a full GA4GH TES task.
    </p>

    <!-- Service banner: capability and version only; the realm identity
         already sits in the page header badge. -->
    <p v-if="serviceState === 'ready' && serviceInfo" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span class="font-medium text-foreground">Task execution service</span>
      <span>·</span>
      <span>GA4GH TES {{ serviceInfo.type.version }}</span>
      <template v-if="serviceInfo.storage?.length">
        <span>·</span>
        <Badge v-for="s in serviceInfo.storage" :key="s" variant="outline" class="font-mono">{{ s }}</Badge>
      </template>
    </p>
    <Notice v-else-if="serviceState === 'unsupported'" tone="warning">
      This node does not expose the TES endpoint. Configure a compute backend before enabling TES.
    </Notice>
    <ErrorPanel v-else-if="serviceState === 'error'" :message="serviceError || 'Failed to load the TES service info.'" @retry="loadServiceInfo" />

    <!-- List. 'idle' is the pre-fetch gap while init() awaits service info and
         'loading' also covers a session that has not resolved yet, show the
         same skeleton instead of a blank area. -->
    <div v-if="listState === 'idle' || listState === 'loading'" class="surface divide-y divide-border overflow-hidden">
      <div v-for="n in 5" :key="n" class="px-5 py-3"><Skeleton class="h-6 w-full" /></div>
    </div>

    <ErrorPanel v-else-if="listState === 'error'" :message="listError || 'Failed to load tasks.'" @retry="reload" />

    <EmptyState
      v-else-if="listState === 'unsupported'"
      compact
      title="Tasks cannot be listed until this node exposes the GA4GH TES endpoint."
    />

    <EmptyState v-else-if="listState === 'signed-out'" compact title="Sign in to see the tasks you submitted to this node." />

    <!-- First-run empty state doubles as the run-mode chooser. Branch on the
         SHOWN list so hiding every task brings the chooser back, and only stand
         aside for the Deleted chip view while it still has something to show. -->
    <EmptyState
      v-else-if="listState === 'ready' && !shownTasks.length && (stateGroup !== 'deleted' || !hiddenTasks.length)"
      title="No compute tasks yet"
      description="Start your first run with a quick script or a full task."
    >
      <div class="space-y-4">
        <NewRunMenu size="sm" />
        <p v-if="hiddenTasks.length" class="text-xs text-muted-foreground">
          {{ hiddenTasks.length }} deleted {{ hiddenTasks.length === 1 ? 'run' : 'runs' }} hidden from this list.
          <button type="button" class="text-primary hover:underline" @click="stateGroup = 'deleted'">Show</button>
        </p>
      </div>
    </EmptyState>

    <div v-else-if="tasks.length" class="surface overflow-hidden">
      <!-- List toolbar -->
      <div class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2">
        <FilterChips v-model="stateGroup" :options="chipOptions" aria-label="Filter tasks by state" />
        <div class="ml-auto flex items-center gap-2">
          <span v-if="lastPollError" class="text-[11px] text-muted-foreground">Auto-refresh failed: {{ lastPollError }}</span>
          <RefreshButton :busy="spinning" sr-label="Refresh tasks" @click="onReload" />
        </div>
      </div>

      <EmptyState
        v-if="!visibleTasks.length"
        compact
        class="rounded-none border-0 shadow-none"
        :title="`No ${emptyGroupLabel}tasks in the loaded list.`"
      />

      <table v-else class="w-full text-sm">
        <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th class="px-5 py-2 text-left font-semibold">Task</th>
            <th class="px-5 py-2 text-left font-semibold">State</th>
            <th class="hidden px-5 py-2 text-left font-semibold md:table-cell">Group</th>
            <th class="hidden px-5 py-2 text-left font-semibold lg:table-cell">Resources</th>
            <th class="px-5 py-2 text-left font-semibold">Submitted</th>
            <th class="hidden px-5 py-2 text-left font-semibold sm:table-cell">Duration</th>
            <th class="px-5 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in visibleTasks"
            :key="task.id || task.name"
            class="border-t border-border"
            :class="task.id ? 'cursor-pointer hover:bg-muted/40' : ''"
            @click="openTask(task)"
          >
            <td class="px-5 py-2.5">
              <div class="font-medium text-foreground">{{ task.name || 'Untitled task' }}</div>
              <div v-if="task.id" class="font-mono text-[11px] text-muted-foreground" :title="task.id">{{ truncateMiddle(task.id) }}</div>
            </td>
            <td class="px-5 py-2.5">
              <TaskStateBadge :state="task.state" />
              <TesPlacementTags :tags="task.tags" compact class="mt-1" />
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
                <Button
                  v-if="stateGroup === 'deleted' && task.id"
                  variant="outline"
                  size="sm"
                  :aria-label="`Restore ${task.name || 'task'} to the list`"
                  @click.stop="unhide(task.id)"
                >
                  <ArchiveRestore class="h-3.5 w-3.5" /> Restore
                </Button>
                <template v-else-if="task.id && isTerminalTesState(task.state)">
                  <Button
                    v-if="confirmingDeleteId !== task.id"
                    variant="ghost"
                    size="icon-sm"
                    class="text-muted-foreground hover:text-destructive"
                    :aria-label="`Delete ${task.name || 'task'} from the list`"
                    title="Delete from list (this browser only)"
                    @click.stop="requestRowDelete(task.id)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                  <Button v-else variant="destructive" size="sm" title="Removes it from this browser's list only" @click.stop="confirmRowDelete(task.id)">
                    <Trash2 class="h-3.5 w-3.5" /> Delete?
                  </Button>
                </template>
                <ChevronRight v-if="task.id" class="h-4 w-4 text-muted-foreground" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="nextPageToken" class="border-t border-border px-5 py-2">
        <Button variant="ghost" size="sm" :disabled="refreshing" @click="fetchList({ more: true })">Load more</Button>
      </div>
    </div>

    <TaskDetailPanel
      v-if="openTaskId"
      :task-id="openTaskId"
      :open="!!openTaskId"
      @update:open="(v) => !v && closeTask()"
      @canceled="reload"
      @hidden="closeTask"
    />
  </div>
</template>
