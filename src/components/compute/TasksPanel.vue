<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import TaskStateBadge from '@/components/compute/TaskStateBadge.vue'
import TaskDetailPanel from '@/components/compute/TaskDetailPanel.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import {
  TES_GROUP_TAG,
  TES_STATE_META,
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

// ── Filters ──────────────────────────────────────────────────────────────────
const TES_STATE_ORDER: TesState[] = [
  'UNKNOWN',
  'QUEUED',
  'INITIALIZING',
  'RUNNING',
  'PAUSED',
  'COMPLETE',
  'EXECUTOR_ERROR',
  'SYSTEM_ERROR',
  'CANCELING',
  'CANCELED',
  'PREEMPTED',
]
const stateFilter = ref('')
const groupFilter = ref('')
// Radix SelectItem forbids empty-string values, so 'all' is the sentinel.
const stateOptions = [
  { value: 'all', label: 'All' },
  ...TES_STATE_ORDER.map((s) => ({ value: s, label: TES_STATE_META[s].label })),
]
const stateModel = computed({
  get: () => stateFilter.value || 'all',
  set: (v: string) => (stateFilter.value = v === 'all' ? '' : v),
})
const groupOptions = computed(() => [
  { value: 'all', label: 'All' },
  ...myGroups.value.map((g) => ({ value: g.id, label: g.name })),
])
const groupModel = computed({
  get: () => groupFilter.value || 'all',
  set: (v: string) => (groupFilter.value = v === 'all' ? '' : v),
})

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

async function fetchList({ more = false, silent = false } = {}) {
  if (!currentUser.value) return
  const requestId = ++listRequestId
  if (!silent) refreshing.value = true
  if (!more && !silent && !tasks.value.length) listState.value = 'loading'
  try {
    const res = await listTasks({
      view: 'BASIC',
      page_size: 50,
      state: (stateFilter.value || undefined) as TesState | undefined,
      tag_key: groupFilter.value ? TES_GROUP_TAG : undefined,
      tag_value: groupFilter.value || undefined,
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

// Re-filtering starts a fresh page-one query.
watch([stateFilter, groupFilter], () => void fetchList())

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
      Tasks are runs <span class="font-medium text-foreground">you submit</span> to this node — start one with Quick run or describe a full GA4GH TES task.
    </p>

    <!-- Service banner -->
    <p v-if="serviceState === 'ready' && serviceInfo" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span class="font-medium text-foreground">{{ serviceInfo.name }}</span>
      <span>·</span>
      <span>TES {{ serviceInfo.type.version }}</span>
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

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-2">
      <Select v-model="stateModel" :options="stateOptions" label="State" aria-label="Filter tasks by state" class="h-8 w-40 text-xs" />
      <Select v-model="groupModel" :options="groupOptions" label="Group" aria-label="Filter tasks by group" class="h-8 w-48 text-xs" />
      <Button variant="ghost" size="sm" :disabled="refreshing" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" :class="refreshing ? 'animate-spin' : ''" /> Refresh
      </Button>
      <span v-if="lastPollError" class="text-[11px] text-muted-foreground">Auto-refresh failed — {{ lastPollError }}</span>
    </div>

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

    <EmptyState
      v-else-if="listState === 'ready' && !tasks.length"
      title="No compute tasks"
      description="Run a quick script or describe a full GA4GH TES task; submissions appear here."
    >
      <div class="flex items-center justify-center gap-2">
        <Button size="sm" @click="goQuick"><Zap class="h-4 w-4" /> Quick run</Button>
        <Button variant="outline" size="sm" @click="goNew"><ListPlus class="h-4 w-4" /> New task</Button>
      </div>
    </EmptyState>

    <div v-else-if="tasks.length" class="surface overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th class="px-5 py-2 text-left font-semibold">Name</th>
            <th class="px-5 py-2 text-left font-semibold">State</th>
            <th class="px-5 py-2 text-left font-semibold">Group</th>
            <th class="px-5 py-2 text-left font-semibold">Created</th>
            <th class="px-5 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in tasks"
            :key="task.id || task.name"
            class="border-t border-border"
            :class="task.id ? 'cursor-pointer hover:bg-muted/40' : ''"
            @click="openTask(task)"
          >
            <td class="px-5 py-2.5">
              <div class="font-medium text-foreground" :class="!task.name ? 'font-mono text-[11px]' : ''">
                {{ task.name || truncateMiddle(task.id || '') }}
              </div>
              <div v-if="task.description" class="text-[11px] text-muted-foreground">{{ task.description }}</div>
            </td>
            <td class="px-5 py-2.5"><TaskStateBadge :state="task.state" /></td>
            <td class="px-5 py-2.5 text-[11px] text-muted-foreground">
              <span v-if="taskGroup(task)" :class="taskGroup(task)!.mono ? 'font-mono' : ''">{{ taskGroup(task)!.text }}</span>
              <span v-else>—</span>
            </td>
            <td class="px-5 py-2.5 text-[11px] text-muted-foreground">
              {{ task.creation_time ? relativeTime(task.creation_time) : '—' }}
            </td>
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
