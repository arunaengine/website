<script setup lang="ts">
// Activity: what is moving between this computer and Aruna, and what the owner
// decided. It reads the node's own transfer list and the log of every folder;
// nothing here is counted by the page itself.
import { computed, onMounted, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import DeviceSurfaceState from '@/components/desktop/DeviceSurfaceState.vue'
import { useDeviceSync } from '@/composables/useDeviceSync'
import { useDeviceTransfers } from '@/composables/useDeviceTransfers'
import { useFolderDecisions } from '@/composables/useFolderDecisions'
import { useRealm } from '@/composables/useRealm'
import { useSyncedFolders } from '@/composables/useSyncedFolders'
import { activityCounts, groupActivity, OTHER_KEY, totalProgress, type ActivityFilter } from '@/lib/activityGroups'
import { isMoving, type DeviceTransfer } from '@/lib/deviceApi'
import { stateVariant } from '@/lib/stateBadge'
import { transferLabel, transferPercent } from '@/lib/syncStates'
import { errorMessage, formatBytes, relativeTime } from '@/lib/utils'
import { ArrowDownToLine, ArrowUpFromLine, FolderSync, History, Pause, Play, RefreshCw, RotateCw } from '@lucide/vue'

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

function summary(rows: DeviceTransfer[]): string {
  const parts = [
    [rows.filter((row) => isMoving(row)).length, 'moving'],
    [rows.filter((row) => row.state === 'failed').length, 'failed'],
    [rows.filter((row) => row.state === 'done').length, 'done'],
  ] as const
  return parts.filter(([count]) => count > 0).map(([count, word]) => `${count} ${word}`).join(' · ')
}

const when = (ms: number | null): string => (ms ? relativeTime(new Date(ms).toISOString()) : '')
</script>

<template>
  <div>
    <PageHeader
      eyebrow="This computer"
      title="Activity"
      description="What is moving between this computer and Aruna, and what you decided."
      :docs="{ topic: 'where-data-lives', section: 'Syncs' }"
    >
      <template #actions>
        <Button variant="outline" size="sm" :disabled="acting || !canAct" @click="pauseAll">
          <Play v-if="allPaused" class="h-3.5 w-3.5" />
          <Pause v-else class="h-3.5 w-3.5" />
          {{ allPaused ? 'Resume all' : 'Pause all' }}
        </Button>
        <Button size="sm" :disabled="acting || !canAct || allPaused" @click="syncNow">
          <RefreshCw class="h-3.5 w-3.5" /> Sync now
        </Button>
      </template>
    </PageHeader>

    <div class="container space-y-4 py-5">
      <Notice v-if="actionError" tone="error">{{ actionError }}</Notice>

      <Skeleton v-if="foldersState === 'idle' || foldersState === 'loading' || transfersState === 'idle' || transfersState === 'loading'" class="h-24" />
      <DeviceSurfaceState v-else-if="surface" :state="surface.state" :subject="surface.subject" :error="surface.error" />

      <template v-else>
        <section class="surface flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <div>
            <p class="font-display text-xl font-bold text-foreground">{{ moving }}</p>
            <p class="text-[11px] text-muted-foreground">moving now</p>
          </div>
          <div>
            <p class="font-display text-xl font-bold" :class="counts.failed ? 'text-destructive' : 'text-foreground'">{{ counts.failed }}</p>
            <p class="text-[11px] text-muted-foreground">failed</p>
          </div>
          <div>
            <p class="font-display text-xl font-bold text-foreground">{{ counts.done }}</p>
            <p class="text-[11px] text-muted-foreground">done</p>
          </div>
          <div v-if="progress" class="min-w-[14rem]">
            <div class="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>Total progress</span>
              <span>{{ formatBytes(progress.done) }} of {{ formatBytes(progress.total) }}</span>
            </div>
            <Progress
              :value="progress.total ? (progress.done / progress.total) * 100 : 0"
              label="Total progress"
              class="mt-1 h-1.5"
            />
          </div>
          <p class="ml-auto text-[11px] text-muted-foreground">{{ lastCheck }}</p>
        </section>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <FilterChips v-model="filter" :options="chips" aria-label="Filter activity" />
          <span class="text-[11px] text-muted-foreground">Grouped by folder</span>
        </div>

        <div v-if="decisionsNote" class="flex flex-wrap items-center gap-2 text-[11px]" :class="decisionsNote.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'">
          <span>{{ decisionsNote.text }}</span>
          <button v-if="decisionsNote.tone === 'error'" type="button" class="text-primary hover:underline" @click="decisions.load()">
            Try again
          </button>
        </div>

        <p v-if="!groups.length" class="surface px-5 py-8 text-center text-sm text-muted-foreground">
          {{
            filter === 'all'
              ? 'Nothing syncs with this computer yet.'
              : filter === 'decisions' && !decisionsKnown
                ? 'Your decisions are not available right now.'
                : filter === 'decisions'
                  ? 'You have not decided anything yet.'
                  : 'Nothing matches this filter.'
          }}
        </p>

        <section v-for="group in groups" :key="group.key" class="surface overflow-hidden">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <FolderSync v-if="group.key !== OTHER_KEY" class="h-4 w-4 shrink-0 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ group.name }}</h2>
              <span v-if="group.root" class="hash truncate text-[11px] text-muted-foreground" :title="group.root">{{ group.root }}</span>
            </div>
            <span class="text-[11px] text-muted-foreground">{{ summary(group.rows) }}</span>
          </header>

          <ul v-if="group.rows.length" class="divide-y divide-border/70">
            <li v-for="row in group.rows" :key="row.id" class="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <ArrowUpFromLine v-if="row.direction === 'upload'" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <ArrowDownToLine v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="hash min-w-0 truncate text-[12px] text-foreground" :title="row.path">{{ row.path }}</span>
                  <Badge :variant="stateVariant(row.state)" size="sm">{{ transferLabel(row) }}</Badge>
                </div>
                <p v-if="row.state === 'failed' && row.message" class="mt-0.5 text-[11px] text-destructive">{{ row.message }}</p>
              </div>
              <span class="text-[11px] text-muted-foreground">{{ moved(row) }}</span>
              <Progress
                v-if="isMoving(row) || row.state === 'queued'"
                :value="transferPercent(row) ?? 0"
                :indeterminate="transferPercent(row) === null"
                :label="row.path"
                class="h-1.5 w-32 shrink-0"
              />
              <Button v-if="row.state === 'failed' && row.folder_id" variant="ghost" size="sm" :disabled="acting" @click="retry(row)">
                <RotateCw class="h-3.5 w-3.5" /> Retry
              </Button>
            </li>
          </ul>
          <p v-else-if="filter === 'all' && !group.decisions.length" class="px-5 py-3 text-[11px] text-muted-foreground">
            Nothing is moving in this folder.
          </p>

          <div v-if="group.decisions.length" class="border-t border-border/70 bg-muted/20 px-5 py-3">
            <p class="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              <History class="h-3.5 w-3.5 text-muted-foreground" /> Decisions
            </p>
            <ul class="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
              <li
                v-for="(entry, index) in group.decisions"
                :key="index"
                :class="entry.outcome === 'failed' ? 'text-destructive' : entry.outcome === 'stale' ? 'text-amber-700 dark:text-amber-300' : ''"
              >
                {{ entry.text }}<template v-if="entry.atMs"> · {{ when(entry.atMs) }}</template>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
