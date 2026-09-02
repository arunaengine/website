<script setup lang="ts">
// Every sync relationship that touches this bucket, in the list grammar. The
// backend lists, runs, pauses and deletes only what the caller created, so the
// tab says so instead of pretending to be a complete picture.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import ListShell from '@/components/ui/ListShell.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { useAruna } from '@/composables/useAruna'
import { useBucketSyncs, type SyncRow } from '@/composables/useBucketSyncs'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useRefresh } from '@/composables/useRefresh'
import { ApiError, type SyncReferenceHandling, type SyncRelationshipDetail } from '@/lib/api'
import { stateTone } from '@/lib/stateBadge'
import { arnLocationLabel, parseArunaArn, syncModeLabel } from '@/lib/sync'
import { errorMessage, formatBytes, formatDuration, relativeTime } from '@/lib/utils'
import { ArrowLeft, ArrowRight, Pause, Play, Plus, Trash2 } from '@lucide/vue'

const props = defineProps<{ bucket: string; nodeId: string | null }>()
const emit = defineEmits<{ (event: 'new-sync'): void; (event: 'changed'): void }>()

const { getSyncRelationship, runSyncRelationship, updateSyncRelationship, deleteSyncRelationship } =
  useAruna()
const realmNodes = useRealmNodes()
const bucket = computed(() => props.bucket)
const nodeId = computed(() => props.nodeId)
const {
  rows,
  hostedOn,
  loading,
  error: listError,
  remoteError,
  hostOpts,
  load: loadSyncs,
  cancel,
} = useBucketSyncs(bucket, nodeId)

const details = ref<Record<string, SyncRelationshipDetail>>({})
const rowError = ref<Record<string, string>>({})
const busyId = ref<string | null>(null)
const confirmingId = ref<string | null>(null)
// A node that predates pausing refuses the state patch; the control then goes
// away instead of failing again on the next click.
const pausingSupported = ref(true)
let pollTimer: number | undefined
let disposed = false

const REFERENCE_OPTIONS = [
  { value: 'materialize', label: 'Fetch the data and send it' },
  { value: 'preserve', label: 'Send the pointer unchanged' },
  { value: 'skip', label: 'Leave those objects out' },
]

const listState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
  if (loading.value && !rows.value.length) return 'loading'
  if (listError.value) return 'error'
  return rows.value.length ? 'ready' : 'empty'
})

function clearPoll() {
  if (pollTimer !== undefined) window.clearTimeout(pollTimer)
  pollTimer = undefined
}

function schedulePoll() {
  clearPoll()
  if (disposed || !Object.values(details.value).some((detail) => detail.pending_jobs > 0)) return
  pollTimer = window.setTimeout(() => void load(true), 3_000)
}

async function loadDetails() {
  const all = rows.value.map((row) => row.relationship)
  const settled = await Promise.allSettled(
    all.map((entry) => getSyncRelationship(entry.id, hostOpts(entry.id))),
  )
  const map: Record<string, SyncRelationshipDetail> = {}
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') map[all[index].id] = result.value
    else if (details.value[all[index].id]) map[all[index].id] = details.value[all[index].id]
  })
  details.value = map
  schedulePoll()
}

async function load(silent = false) {
  if (!silent) {
    confirmingId.value = null
    rowError.value = {}
  }
  await loadSyncs(silent)
  if (!disposed) await loadDetails()
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(() => load())
const spinning = computed(() => reloadBusy.value || loading.value)

watch(
  () => [props.bucket, props.nodeId] as const,
  () => {
    if (props.bucket) void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  disposed = true
  cancel()
  clearPoll()
})

function counterpart(row: SyncRow): { nodeId: string | null; label: string } {
  const arn = row.direction === 'outgoing' ? row.relationship.target : row.relationship.source
  return { nodeId: parseArunaArn(arn)?.nodeId ?? null, label: arnLocationLabel(arn) }
}

function lastError(row: SyncRow): string | null {
  return (
    details.value[row.relationship.id]?.last_error ??
    row.relationship.status.last_error ??
    row.relationship.failure_reason ??
    null
  )
}

async function act(row: SyncRow, work: () => Promise<unknown>) {
  if (busyId.value) return
  busyId.value = row.relationship.id
  rowError.value = { ...rowError.value, [row.relationship.id]: '' }
  try {
    await work()
    emit('changed')
    await load()
  } catch (err) {
    rowError.value = { ...rowError.value, [row.relationship.id]: errorMessage(err) }
    throw err
  } finally {
    busyId.value = null
  }
}

function rerun(row: SyncRow) {
  void act(row, () => runSyncRelationship(row.relationship.id, hostOpts(row.relationship.id))).catch(
    () => undefined,
  )
}

function setReferenceHandling(row: SyncRow, value: string) {
  if (row.direction !== 'outgoing') return
  void act(row, () =>
    updateSyncRelationship(
      row.relationship.id,
      { reference_handling: value as SyncReferenceHandling },
      hostOpts(row.relationship.id),
    ),
  ).catch(() => undefined)
}

function setPaused(row: SyncRow, paused: boolean) {
  void act(row, () =>
    updateSyncRelationship(
      row.relationship.id,
      { state: paused ? 'paused' : 'enabled' },
      hostOpts(row.relationship.id),
    ),
  ).catch((err) => {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      pausingSupported.value = false
      rowError.value = { ...rowError.value, [row.relationship.id]: '' }
    }
  })
}

function remove(row: SyncRow) {
  void act(row, () => deleteSyncRelationship(row.relationship.id, hostOpts(row.relationship.id)))
    .then(() => {
      confirmingId.value = null
    })
    .catch(() => undefined)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-muted-foreground">
        Only syncs you created are listed.
        <DocsLink icon topic="where-data-lives" section="Syncs" class="ml-0.5" />
      </p>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="emit('new-sync')">
          <Plus class="size-3.5" /> New sync
        </Button>
        <RefreshButton :busy="spinning" sr-label="Reload the sync list" @click="onReload" />
      </div>
    </div>

    <Notice v-if="remoteError" tone="warning">{{ remoteError }}</Notice>
    <Notice v-if="!pausingSupported" tone="info">
      This node does not serve pausing a sync, so the pause control is hidden.
    </Notice>

    <ListShell
      :state="listState"
      :error="listError ?? undefined"
      empty-title="No sync you created touches this bucket."
      empty-description="A sync writes a second, independently owned bucket on another node."
      @retry="load()"
    >
      <ul class="divide-y divide-border">
        <li v-for="row in rows" :key="row.relationship.id" class="px-5 py-3.5">
          <div class="flex items-center gap-2 text-xs">
            <StatusDot :tone="stateTone(row.relationship.state)" :label="row.relationship.state" />
            <Badge variant="outline" size="sm" class="shrink-0">{{ syncModeLabel(row.relationship.mode) }}</Badge>
            <component
              :is="row.direction === 'outgoing' ? ArrowRight : ArrowLeft"
              class="size-3.5 shrink-0 text-muted-foreground"
              :aria-label="row.direction === 'outgoing' ? 'to' : 'from'"
            />
            <Badge variant="outline" size="sm" class="shrink-0" :title="counterpart(row).nodeId ?? undefined">
              {{ realmNodes.displayName(counterpart(row).nodeId) }}
            </Badge>
            <span class="min-w-0 flex-1 truncate font-mono" :title="counterpart(row).label">
              {{ counterpart(row).label }}
            </span>
            <span class="flex shrink-0 items-center gap-3 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
              <span v-if="details[row.relationship.id]">{{ details[row.relationship.id].pending_jobs }} pending</span>
              <span v-if="details[row.relationship.id]?.oldest_lag_ms != null">
                lag {{ formatDuration(details[row.relationship.id].oldest_lag_ms ?? 0) }}
              </span>
              <span v-if="row.relationship.status.last_synced_at">
                synced {{ relativeTime(row.relationship.status.last_synced_at) }}
              </span>
              <span v-if="row.relationship.status.counters.versions_synced">
                {{ row.relationship.status.counters.versions_synced }} versions
                ({{ formatBytes(row.relationship.status.counters.bytes_synced) }})
              </span>
            </span>
          </div>

          <div class="mt-2 flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
            <span class="mr-auto flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge
                v-if="hostedOn[row.relationship.id]"
                variant="secondary"
                size="sm"
                :title="`Listed by node ${hostedOn[row.relationship.id]}`"
              >
                on {{ realmNodes.displayName(hostedOn[row.relationship.id]) }}
              </Badge>
              <span v-if="row.relationship.replicate_deletes">replicates deletions</span>
            </span>

            <template v-if="confirmingId === row.relationship.id">
              <span class="text-[11px] text-muted-foreground">Delete this sync? Data already synced is kept.</span>
              <Button variant="outline" size="sm" class="h-6 px-2 text-[11px]" @click="confirmingId = null">Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                class="h-6 px-2 text-[11px]"
                :disabled="busyId === row.relationship.id"
                @click="remove(row)"
              >
                {{ busyId === row.relationship.id ? 'Deleting…' : 'Delete' }}
              </Button>
            </template>
            <template v-else>
              <template v-if="row.direction === 'outgoing' && row.relationship.mode !== 'reference'">
                <span class="text-[11px] text-muted-foreground">When the source points elsewhere</span>
                <Select
                  :model-value="row.relationship.reference_handling"
                  :options="REFERENCE_OPTIONS"
                  class="h-7 w-56 text-[11px]"
                  aria-label="What to do when a source object points at data elsewhere"
                  :disabled="busyId !== null"
                  @update:model-value="(value: string) => setReferenceHandling(row, value)"
                />
              </template>
              <Spinner v-if="busyId === row.relationship.id" label="Working" class="text-primary" />
              <Button
                v-if="pausingSupported"
                variant="ghost"
                size="icon-sm"
                :title="row.relationship.state === 'paused' ? 'Resume this sync' : 'Pause this sync'"
                :aria-label="row.relationship.state === 'paused' ? 'Resume this sync' : 'Pause this sync'"
                :disabled="busyId !== null"
                @click="setPaused(row, row.relationship.state !== 'paused')"
              >
                <component :is="row.relationship.state === 'paused' ? Play : Pause" class="size-3.5" />
              </Button>
              <Button
                v-if="row.direction === 'outgoing'"
                variant="ghost"
                size="icon-sm"
                :title="row.relationship.mode === 'once' ? 'Run again' : 'Backfill now'"
                :aria-label="row.relationship.mode === 'once' ? 'Run again' : 'Backfill now'"
                :disabled="busyId !== null"
                @click="rerun(row)"
              >
                <Play class="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-destructive hover:text-destructive"
                title="Delete this sync relationship"
                aria-label="Delete this sync relationship"
                :disabled="busyId !== null"
                @click="confirmingId = row.relationship.id"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </template>
          </div>

          <p
            v-if="details[row.relationship.id]?.pending_jobs && row.relationship.reference_handling === 'materialize'"
            class="mt-1 text-[11px] text-muted-foreground"
          >
            Data the source only points at is fetched before it is sent, so a large source can stay
            queued for a while.
          </p>
          <p v-if="lastError(row)" class="mt-1 break-all text-[11px] text-destructive">{{ lastError(row) }}</p>
          <p v-if="rowError[row.relationship.id]" class="mt-1 break-all text-[11px] text-destructive">
            {{ rowError[row.relationship.id] }}
          </p>
        </li>
      </ul>
      <template #empty-actions>
        <Button size="sm" @click="emit('new-sync')"><Plus class="size-3.5" /> New sync</Button>
      </template>
    </ListShell>
  </div>
</template>
