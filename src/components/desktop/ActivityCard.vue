<script setup lang="ts">
// Activity: what is moving between this computer and Aruna, and what the owner
// decided. It reads the node's own transfer list and the log of every folder;
// nothing here is counted by the card itself.
import { computed, onMounted, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import DeviceSurfaceState from '@/components/desktop/DeviceSurfaceState.vue'
import { useDeviceSync } from '@/composables/useDeviceSync'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useFolderDecisions } from '@/composables/useFolderDecisions'
import { useRealm } from '@/composables/useRealm'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { activityCounts, groupActivity, totalProgress, type ActivityFilter } from '@/lib/activityGroups'
import { isMoving, type DeviceTransfer } from '@/lib/deviceApi'
import { stateVariant } from '@/lib/stateBadge'
import { transferLabel, transferPercent } from '@/lib/syncStates'
import { errorMessage, formatBytes, relativeTime } from '@/lib/utils'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, History, Pause, Play, RefreshCw, RotateCw } from '@lucide/vue'

const { realm } = useRealm()
const { folders, listState: foldersState, listError: foldersError, ensureLoaded, setPaused, sync } = useSyncedFolders()
const { all: transfers, state: transfersState, error: transfersError, load: loadTransfers } = useDeviceTransfers()
const { status: syncStatus, runSync, load: loadSync } = useDeviceSync()
const decisions = useFolderDecisions()

const filter = ref<ActivityFilter>('all')
const actionError = ref<string | null>(null)
const acting = ref(false)

onMounted(async () => {
  void loadSync()
  await Promise.all([ensureLoaded(), loadTransfers()])
  await decisions.load()
})

const counts = computed(() => activityCounts(transfers.value, decisions.items.value))
const moving = computed(() => transfers.value.filter(isMoving).length)
const progress = computed(() => totalProgress(transfers.value))
const groups = computed(() => groupActivity(folders.value, transfers.value, decisions.items.value, filter.value))
// One list across folders, each row naming its folder; long lists fold.
const FOLDED = 6
const expanded = ref(false)
const rows = computed(() => groups.value.flatMap((group) => group.rows.map((row) => ({ row, folder: group.name }))))
const decided = computed(() =>
  groups.value.flatMap((group) => group.decisions.map((entry) => ({ entry, folder: group.name }))),
)
const shownRows = computed(() => (expanded.value ? rows.value : rows.value.slice(0, FOLDED)))
const shownDecisions = computed(() =>
  expanded.value ? decided.value : decided.value.slice(0, Math.max(0, FOLDED - shownRows.value.length)),
)
const hidden = computed(() => rows.value.length + decided.value.length - shownRows.value.length - shownDecisions.value.length)

// A count that depends on decisions waits until they were read.
const decisionsKnown = computed(() => decisions.state.value === 'ready')

const chips = computed(() => [
  { value: 'all', label: 'All', ...(decisionsKnown.value ? { count: counts.value.all } : {}) },
  { value: 'progress', label: 'In progress', count: counts.value.progress },
  { value: 'failed', label: 'Failed', count: counts.value.failed },
  { value: 'done', label: 'Done', count: counts.value.done },
  { value: 'decisions', label: 'Decisions', ...(decisionsKnown.value ? { count: counts.value.decisions } : {}) },
])

// Loading, unavailable and failed are not the same as nothing decided yet.
const decisionsNote = computed(() => {
  switch (decisions.state.value) {
    case 'idle':
    case 'loading':
      return { tone: 'muted', text: 'Reading your decisions…' }
    case 'unsupported':
      return { tone: 'muted', text: 'This version of Aruna does not keep a history of decisions yet.' }
    case 'ready':
      return decisions.partial.value
        ? { tone: 'muted', text: 'Some folders did not report their decisions, so the list may be shorter than it should be.' }
        : null
    default:
      return {
        tone: 'error',
        text: `Your decisions could not be read${decisions.error.value ? `: ${decisions.error.value}` : '.'}`,
      }
  }
})

// The first read that is not ready is the one worth explaining.
const surface = computed(() =>
  [
    { state: foldersState.value, subject: 'its folders', error: foldersError.value },
    { state: transfersState.value, subject: 'its transfers', error: transfersError.value },
  ].find((entry) => entry.state !== 'ready'),
)

const allPaused = computed(() => folders.value.length > 0 && folders.value.every((folder) => folder.state === 'paused'))
const canAct = computed(() => folders.value.some((folder) => folder.state !== 'deleting'))

const lastCheck = computed(() => {
  const at = syncStatus.value.lastSyncMs
  const when = at ? relativeTime(new Date(at).toISOString()) : 'never'
  return `Last check: ${when} · ${realm.value.name} is ${syncStatus.value.realmReachable ? 'reachable' : 'not reachable'}`
})

async function run(work: () => Promise<unknown>): Promise<void> {
  acting.value = true
  actionError.value = null
  try {
    await work()
    await loadTransfers()
  } catch (err) {
    actionError.value = errorMessage(err)
  } finally {
    acting.value = false
  }
}

const pauseAll = () =>
  run(() =>
    Promise.all(
      folders.value
        .filter((folder) => folder.state !== 'deleting' && (folder.state === 'paused') === allPaused.value)
        .map((folder) => setPaused(folder.folder_id, !allPaused.value)),
    ),
  )

const syncNow = () =>
  run(() =>
    Promise.all([
      runSync(),
      ...folders.value.filter((folder) => folder.state === 'active').map((folder) => sync(folder.folder_id)),
    ]),
  )

/** A failed file is retried by sweeping its folder again. */
const retry = (transfer: DeviceTransfer) => run(async () => transfer.folder_id && sync(transfer.folder_id))

function moved(transfer: DeviceTransfer): string {
  const percent = transferPercent(transfer)
  if (transfer.bytes_total === null) return ''
  if (percent === null || transfer.bytes_done === null || transfer.state === 'done') return formatBytes(transfer.bytes_total)
  return `${formatBytes(transfer.bytes_done)} of ${formatBytes(transfer.bytes_total)}`
}

const when = (ms: number | null): string => (ms ? relativeTime(new Date(ms).toISOString()) : '')
</script>

<template>
  <section class="surface overflow-hidden">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
      <div class="flex items-center gap-2">
        <ArrowLeftRight class="h-4 w-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Activity</h2>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" :disabled="acting || !canAct" @click="pauseAll">
          <Play v-if="allPaused" class="h-3.5 w-3.5" />
          <Pause v-else class="h-3.5 w-3.5" />
          {{ allPaused ? 'Resume all' : 'Pause all' }}
        </Button>
        <Button variant="outline" size="sm" :disabled="acting || !canAct || allPaused" @click="syncNow">
          <RefreshCw class="h-3.5 w-3.5" /> Sync now
        </Button>
      </div>
    </header>

    <Notice v-if="actionError" tone="error" class="mx-5 mt-3">{{ actionError }}</Notice>

    <Skeleton
      v-if="foldersState === 'idle' || foldersState === 'loading' || transfersState === 'idle' || transfersState === 'loading'"
      class="mx-5 my-3 h-16"
    />
    <DeviceSurfaceState v-else-if="surface" class="m-5" :state="surface.state" :subject="surface.subject" :error="surface.error" />

    <template v-else>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/70 px-5 py-3">
        <p>
          <span class="font-display text-lg font-semibold text-foreground">{{ moving }}</span>
          <span class="ml-1 text-xs text-muted-foreground">moving now</span>
        </p>
        <p>
          <span class="font-display text-lg font-semibold" :class="counts.failed ? 'text-destructive' : 'text-foreground'">{{ counts.failed }}</span>
          <span class="ml-1 text-xs text-muted-foreground">failed</span>
        </p>
        <p>
          <span class="font-display text-lg font-semibold text-foreground">{{ counts.done }}</span>
          <span class="ml-1 text-xs text-muted-foreground">done</span>
        </p>
        <div v-if="progress" class="min-w-48 flex-1">
          <div class="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>Total progress</span>
            <span>{{ formatBytes(progress.done) }} of {{ formatBytes(progress.total) }}</span>
          </div>
          <Progress
            :value="progress.total ? (progress.done / progress.total) * 100 : 0"
            label="Total progress"
            :warn="101"
            :critical="101"
            class="mt-1 h-1.5"
          />
        </div>
        <p class="w-full text-[11px] text-muted-foreground">{{ lastCheck }}</p>
      </div>

      <div class="px-5 pt-3">
        <FilterChips v-model="filter" :options="chips" aria-label="Filter activity" />
        <p
          v-if="decisionsNote"
          class="mt-2 flex flex-wrap items-center gap-2 text-[11px]"
          :class="decisionsNote.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'"
        >
          <span>{{ decisionsNote.text }}</span>
          <button v-if="decisionsNote.tone === 'error'" type="button" class="text-primary hover:underline" @click="decisions.load()">
            Try again
          </button>
        </p>
      </div>

      <p v-if="!rows.length && !decided.length" class="px-5 py-6 text-center text-sm text-muted-foreground">
        {{
          filter === 'all'
            ? folders.length
              ? 'Nothing is moving right now.'
              : 'Nothing syncs with this computer yet.'
            : filter === 'decisions' && !decisionsKnown
              ? 'Your decisions are not available right now.'
              : filter === 'decisions'
                ? 'You have not decided anything yet.'
                : 'Nothing matches this filter.'
        }}
      </p>

      <ul v-else class="mt-2 divide-y divide-border/70 border-t border-border/70">
        <li v-for="{ row, folder } in shownRows" :key="row.id" class="flex flex-wrap items-center gap-3 px-5 py-2.5">
          <ArrowUpFromLine v-if="row.direction === 'upload'" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <ArrowDownToLine v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="hash min-w-0 truncate text-[12px] text-foreground" :title="row.path">{{ row.path }}</span>
              <Badge :variant="stateVariant(row.state)" size="sm">{{ transferLabel(row) }}</Badge>
            </div>
            <p v-if="row.state === 'failed' && row.message" class="mt-0.5 text-[11px] text-destructive">{{ row.message }}</p>
            <p v-else class="mt-0.5 text-[11px] text-muted-foreground">{{ folder }}</p>
          </div>
          <span class="text-[11px] text-muted-foreground">{{ moved(row) }}</span>
          <Progress
            v-if="isMoving(row) || row.state === 'queued'"
            :value="transferPercent(row) ?? 0"
            :indeterminate="transferPercent(row) === null"
            :label="row.path"
            :warn="101"
            :critical="101"
            class="h-1.5 w-28 shrink-0"
          />
          <Button v-if="row.state === 'failed' && row.folder_id" variant="ghost" size="sm" :disabled="acting" @click="retry(row)">
            <RotateCw class="h-3.5 w-3.5" /> Retry
          </Button>
        </li>
        <li
          v-for="({ entry, folder }, index) in shownDecisions"
          :key="`decision-${index}`"
          class="flex items-start gap-3 px-5 py-2.5 text-xs"
          :class="entry.outcome === 'failed' ? 'text-destructive' : entry.outcome === 'stale' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'"
        >
          <History class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            {{ entry.text }}
            <span class="text-muted-foreground"> · {{ folder }}<template v-if="entry.atMs"> · {{ when(entry.atMs) }}</template></span>
          </span>
        </li>
      </ul>
      <button
        v-if="hidden > 0 || expanded"
        type="button"
        class="block w-full border-t border-border/70 px-5 py-2.5 text-left text-xs font-medium text-primary hover:underline"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Show less' : `Show all ${rows.length + decided.length}` }}
      </button>
    </template>
  </section>
</template>
