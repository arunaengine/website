<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import TaskStateBadge from '@/components/compute/TaskStateBadge.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import {
  TES_GROUP_TAG,
  TES_STATE_META,
  isActiveTesState,
  type TesServiceInfo,
  type TesState,
  type TesTask,
} from '@/lib/tes'
import { Cpu, LogIn, RefreshCw } from '@lucide/vue'

const { tesEnabled, getTesServiceInfo, listTasks } = useTes()
const { currentUser, myGroups } = useAruna()
const { signIn, stage } = useAuth()

const signingIn = computed(() => stage.value === 'redirecting')
function startSignIn() {
  void signIn({ redirectTo: '/app/compute' })
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
const stateOptions = [
  { value: '', label: 'All states' },
  ...TES_STATE_ORDER.map((s) => ({ value: s, label: TES_STATE_META[s].label })),
]
const groupOptions = computed(() => [
  { value: '', label: 'All groups' },
  ...myGroups.value.map((g) => ({ value: g.id, label: g.name })),
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

async function fetchList({ more = false, silent = false } = {}) {
  if (!tesEnabled.value || !currentUser.value) return
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
    if (requestId === listRequestId && !silent) refreshing.value = false
  }
}

function reload() {
  void fetchList()
}

// Re-filtering starts a fresh page-one query.
watch([stateFilter, groupFilter], () => {
  if (!tesEnabled.value || !currentUser.value) return
  void fetchList()
})

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
  if (!tesEnabled.value || !currentUser.value) return
  void init()
  // View-owned auto-refresh: only re-fetch page one (a multi-page view must not
  // silently truncate) and only while some listed task is still active.
  pollTimer = window.setInterval(() => {
    if (document.hidden) return
    if (pagesLoaded.value !== 1) return
    if (!tasks.value.some((t) => isActiveTesState(t.state))) return
    void fetchList({ silent: true })
  }, 10_000)
})
onUnmounted(() => window.clearInterval(pollTimer))
</script>

<template>
  <div>
    <PageHeader title="Compute" description="Submit and monitor GA4GH TES tasks executed on this node." />

    <!-- Gate 1: feature disabled — no API call is ever issued in this state. -->
    <div v-if="!tesEnabled" class="container max-w-[1100px] py-8">
      <EmptyState
        title="Compute is not enabled"
        description="Enable the tes feature flag in portal-config.json once this realm's nodes serve the GA4GH TES endpoint (aruna#290)."
      >
        <template #icon><Cpu class="h-7 w-7" /></template>
      </EmptyState>
    </div>

    <!-- Gate 2: not signed in — task submission and listing are authenticated. -->
    <div v-else-if="!currentUser" class="container max-w-[1100px] py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <Cpu class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Sign in to run compute tasks</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">
          Listing and submitting GA4GH TES tasks are authenticated operations.
        </p>
        <Button class="mt-4" size="sm" :disabled="signingIn" @click="startSignIn">
          <LogIn class="h-3.5 w-3.5" /> Sign in
        </Button>
      </section>
    </div>

    <!-- Content -->
    <div v-else class="container max-w-[1100px] space-y-5 py-8">
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
        This backend does not serve a TES endpoint yet (aruna#290). Tasks cannot be listed or submitted.
      </p>
      <ErrorPanel v-else-if="serviceState === 'error'" :message="serviceError || 'Failed to load the TES service info.'" @retry="loadServiceInfo" />

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="stateFilter" :options="stateOptions" class="h-8 w-44 text-xs" />
        <Select v-model="groupFilter" :options="groupOptions" class="h-8 w-52 text-xs" />
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
        Tasks cannot be listed until this node serves the GA4GH TES endpoint (aruna#290).
      </p>

      <EmptyState
        v-else-if="listState === 'ready' && !tasks.length"
        title="No compute tasks"
        description="Tasks submitted to this node appear here."
      />

      <div v-else-if="tasks.length" class="surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th class="px-5 py-2 text-left font-semibold">Name</th>
              <th class="px-5 py-2 text-left font-semibold">State</th>
              <th class="px-5 py-2 text-left font-semibold">Group</th>
              <th class="px-5 py-2 text-left font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in tasks" :key="task.id || task.name" class="border-t border-border">
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
            </tr>
          </tbody>
        </table>
        <div v-if="nextPageToken" class="border-t border-border px-5 py-2">
          <Button variant="ghost" size="sm" :disabled="refreshing" @click="fetchList({ more: true })">Load more</Button>
        </div>
      </div>
    </div>
  </div>
</template>
