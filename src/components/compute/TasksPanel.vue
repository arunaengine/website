<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import TaskStateBadge from '@/components/compute/TaskStateBadge.vue'
import TaskDetailPanel from '@/components/compute/TaskDetailPanel.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { formatDuration, relativeTime, truncateMiddle } from '@/lib/utils'
import {
  TES_GROUP_TAG,
  isActiveTesState,
  type TesServiceInfo,
  type TesState,
  type TesTask,
} from '@/lib/tes'
import { ChevronRight, ListPlus, RefreshCw, Zap } from '@lucide/vue'

// Task list section of the unified Compute view. Mounted only when the tes
// feature is enabled and a user is signed in (ComputeView gates both).
const router = useRouter()
const route = useRoute()
const { getTesServiceInfo, listTasks } = useTes()
const { currentUser, myGroups } = useAruna()

function goNew() {
  void router.push({ name: 'compute-new' })
}
function goQuick() {
  void router.push({ name: 'compute-quick' })
}

// Deep-linkable task drawer driven by the :taskId route param (the back button
// closes it, DataManagerView's bucket-param precedent).
const openTaskId = computed(() =>
  route.name === 'compute-task' && route.params.taskId ? String(route.params.taskId) : '',
)
function openTask(task: TesTask) {
  if (task.id) void router.push({ name: 'compute-task', params: { taskId: task.id } })
}
function closeTask() {
  void router.push({ name: 'compute' })
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── Service banner ───────────────────────────────────────────────────────────
const serviceInfo = ref<TesServiceInfo | null>(null)
const serviceState = ref<'idle' | 'loading' | 'ready' | 'unsupported' | 'error'>('idle')
const serviceError = ref<string | null>(null)

async function loadServiceInfo() {
  serviceState.value = 'loading'
  serviceError.value = null
  try {
    serviceInfo.value = await getTesServiceInfo()
    serviceState.value = 'ready'
  } catch (err) {
    if (isTesUnsupported(err)) {
      serviceState.value = 'unsupported'
    } else {
      serviceState.value = 'error'
      serviceError.value = errorMessage(err)
    }
  }
}

// ── State filter ─────────────────────────────────────────────────────────────
// Chips cover only states the facade actually emits (aruna api tes.rs):
// PAUSED and PREEMPTED never occur; UNKNOWN (indeterminate) counts as failed.
type StateGroup = 'all' | 'active' | 'done' | 'failed' | 'canceled'
const GROUP_STATES: Record<Exclude<StateGroup, 'all'>, TesState[]> = {
  active: ['QUEUED', 'INITIALIZING', 'RUNNING', 'CANCELING'],
  done: ['COMPLETE'],
  failed: ['EXECUTOR_ERROR', 'SYSTEM_ERROR', 'UNKNOWN'],
  canceled: ['CANCELED'],
}
const GROUP_LABELS: Record<Exclude<StateGroup, 'all'>, string> = {
  active: 'Active',
  done: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
}
const stateGroup = ref<StateGroup>('all')

function inGroup(task: TesTask, group: Exclude<StateGroup, 'all'>): boolean {
  return !!task.state && GROUP_STATES[group].includes(task.state)
}
const visibleTasks = computed(() => {
  const group = stateGroup.value
  return group === 'all' ? tasks.value : tasks.value.filter((task) => inGroup(task, group))
})
const emptyGroupLabel = computed(() => {
  const group = stateGroup.value
  return group === 'all' ? '' : `${GROUP_LABELS[group].toLowerCase()} `
})
const chipOptions = computed(() => [
  { value: 'all', label: 'All', count: tasks.value.length },
  ...(Object.keys(GROUP_LABELS) as Array<Exclude<StateGroup, 'all'>>).map((group) => ({
    value: group,
    label: GROUP_LABELS[group],
    count: tasks.value.filter((task) => inGroup(task, group)).length,
  })),
])

// ── Task list ────────────────────────────────────────────────────────────────
const tasks = ref<TesTask[]>([])
const listState = ref<'idle' | 'loading' | 'ready' | 'error' | 'unsupported'>('idle')
const listError = ref<string | null>(null)
const nextPageToken = ref<string | undefined>(undefined)
const pagesLoaded = ref(0)
const refreshing = ref(false)
const lastPollError = ref<string | null>(null)
// Stale responses are dropped via a request id (ObjectBrowserPanel pattern).
let listRequestId = 0

const groupNameById = computed(() => new Map(myGroups.value.map((g) => [g.id, g.name] as const)))

function taskGroup(task: TesTask): { text: string; mono: boolean } | null {
  const id = task.tags?.[TES_GROUP_TAG]
  if (!id) return null
  const name = groupNameById.value.get(id)
  return name ? { text: name, mono: false } : { text: truncateMiddle(id), mono: true }
}

function taskResources(task: TesTask): string {
  const r = task.resources
  if (!r) return ''
  const parts: string[] = []
  if (r.cpu_cores) parts.push(`${r.cpu_cores} cpu`)
  if (r.ram_gb) parts.push(`${r.ram_gb} GB RAM`)
  if (r.disk_gb) parts.push(`${r.disk_gb} GB disk`)
  return parts.join(' · ')
}

function taskDuration(task: TesTask): string {
  const log = task.logs?.[0]
  if (!log?.start_time) return ''
  const start = Date.parse(log.start_time)
  const end = log.end_time ? Date.parse(log.end_time) : isActiveTesState(task.state) ? Date.now() : NaN
  if (!Number.isFinite(start) || !Number.isFinite(end)) return ''
  const label = formatDuration(end - start)
  if (!label) return ''
  return log.end_time ? label : `${label} so far`
}

async function fetchList({ more = false, silent = false } = {}) {
  if (!currentUser.value) return
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
    // for them — a silent poll that superseded this request id must not leave
    // the spinner stuck on (a later poll never touches `refreshing`).
    if (!silent) refreshing.value = false
  }
}

function reload() {
  void fetchList()
}

async function init() {
  await loadServiceInfo()
  // Skip the initial list fetch when service-info reports no TES backend, to
  // avoid a second failing request; the list area shows its own honest panel
  // and the Refresh button still allows a manual retry.
  if (serviceState.value === 'unsupported') {
    listState.value = 'unsupported'
    return
  }
  await fetchList()
}

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
onUnmounted(() => window.clearInterval(pollTimer))
</script>

<template>
  <div class="space-y-4">
    <p class="text-xs text-muted-foreground">
      Tasks are runs <span class="font-medium text-foreground">you submit</span> to this node, start one with Quick run or describe a full GA4GH TES task.
    </p>

    <!-- Service banner: capability and version only — the realm identity
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
    <p
      v-else-if="serviceState === 'unsupported'"
      class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
    >
      This node does not expose the TES endpoint. Configure a compute backend before enabling TES.
    </p>
    <ErrorPanel v-else-if="serviceState === 'error'" :message="serviceError || 'Failed to load the TES service info.'" @retry="loadServiceInfo" />

    <!-- List -->
    <div v-if="listState === 'loading'" class="surface divide-y divide-border overflow-hidden">
      <div v-for="n in 5" :key="n" class="px-5 py-3"><Skeleton class="h-6 w-full" /></div>
    </div>

    <ErrorPanel v-else-if="listState === 'error'" :message="listError || 'Failed to load tasks.'" @retry="reload" />

    <p
      v-else-if="listState === 'unsupported'"
      class="surface px-5 py-8 text-center text-sm text-muted-foreground"
    >
      Tasks cannot be listed until this node exposes the GA4GH TES endpoint.
    </p>

    <!-- First-run empty state doubles as the run-mode chooser. -->
    <section v-else-if="listState === 'ready' && !tasks.length" class="surface px-5 py-10 text-center">
      <p class="text-sm font-medium text-foreground">No compute tasks yet</p>
      <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Start your first run, submissions appear here.</p>
      <div class="mx-auto mt-5 grid max-w-xl gap-3 text-left sm:grid-cols-2">
        <button type="button" class="surface-inline p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40" @click="goQuick">
          <span class="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Zap class="h-4 w-4 text-primary" /> Quick run</span>
          <span class="mt-1 block text-xs text-muted-foreground">Write a short script, the portal stages it and builds the task for you.</span>
        </button>
        <button type="button" class="surface-inline p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40" @click="goNew">
          <span class="flex items-center gap-1.5 text-sm font-semibold text-foreground"><ListPlus class="h-4 w-4 text-primary" /> New task</span>
          <span class="mt-1 block text-xs text-muted-foreground">Describe a full GA4GH TES task by hand, image, command, resources.</span>
        </button>
      </div>
    </section>

    <div v-else-if="tasks.length" class="surface overflow-hidden">
      <!-- List toolbar -->
      <div class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2">
        <FilterChips v-model="stateGroup" :options="chipOptions" aria-label="Filter tasks by state" />
        <div class="ml-auto flex items-center gap-2">
          <span v-if="lastPollError" class="text-[11px] text-muted-foreground">Auto-refresh failed: {{ lastPollError }}</span>
          <Button variant="ghost" size="icon-sm" :disabled="refreshing" aria-label="Refresh tasks" @click="reload">
            <RefreshCw class="h-3.5 w-3.5" :class="refreshing ? 'animate-spin' : ''" />
          </Button>
        </div>
      </div>

      <p v-if="!visibleTasks.length" class="px-5 py-8 text-center text-sm text-muted-foreground">
        No {{ emptyGroupLabel }}tasks in the loaded list.
      </p>

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
            <td class="px-5 py-2.5"><TaskStateBadge :state="task.state" /></td>
            <td class="hidden px-5 py-2.5 text-[11px] text-muted-foreground md:table-cell">
              <span v-if="taskGroup(task)" :class="taskGroup(task)!.mono ? 'font-mono' : ''">{{ taskGroup(task)!.text }}</span>
              <span v-else>-</span>
            </td>
            <td class="hidden px-5 py-2.5 text-[11px] text-muted-foreground lg:table-cell">{{ taskResources(task) || '-' }}</td>
            <td class="px-5 py-2.5 text-[11px] text-muted-foreground" :title="task.creation_time">
              {{ task.creation_time ? relativeTime(task.creation_time) : '-' }}
            </td>
            <td class="hidden px-5 py-2.5 text-[11px] tabular-nums text-muted-foreground sm:table-cell">{{ taskDuration(task) || '-' }}</td>
            <td class="px-5 py-2.5 text-right"><ChevronRight v-if="task.id" class="ml-auto h-4 w-4 text-muted-foreground" /></td>
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
    />
  </div>
</template>
