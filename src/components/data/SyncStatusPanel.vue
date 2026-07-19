<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { type SyncReferenceHandling, type SyncRelationship, type SyncRelationshipDetail } from '@/lib/api'
import { arnLocationLabel, parseArunaArn, syncModeLabel, syncStateVariant } from '@/lib/sync'
import { formatBytes, formatDuration, relativeTime } from '@/lib/utils'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeftRight, ArrowLeft, ArrowRight, Loader2, Play, Plus, RefreshCw, Trash2 } from '@lucide/vue'

// Sync relationships touching one bucket on the connected node, outgoing and
// incoming, presented as a centered dialog opened from the sync chip. The
// backend only lists relationships created by the caller; run/delete are
// creator-only as well.
const props = defineProps<{ open: boolean; bucket: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  // Fired after a delete or re-run so the parent can refresh its badges.
  (e: 'changed'): void
  // Asks the parent to open the create-sync dialog (the parent owns it).
  (e: 'new-sync'): void
}>()

const { listSyncRelationships, getSyncRelationship, runSyncRelationship, updateSyncReferenceHandling, deleteSyncRelationship } =
  useAruna()
const realmNodes = useRealmNodes()

const outgoing = ref<SyncRelationship[]>([])
const incoming = ref<SyncRelationship[]>([])
const details = ref<Record<string, SyncRelationshipDetail>>({})
const detailRetryNeeded = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const rowError = ref<Record<string, string>>({})
const busyId = ref<string | null>(null)
const confirmingId = ref<string | null>(null)
let requestId = 0
let pollTimer: number | undefined
let disposed = false

function clearPoll() {
  if (pollTimer !== undefined) window.clearTimeout(pollTimer)
  pollTimer = undefined
}

function schedulePoll() {
  clearPoll()
  if (
    disposed ||
    !props.open ||
    (!detailRetryNeeded.value && !Object.values(details.value).some((detail) => detail.pending_jobs > 0))
  ) return
  pollTimer = window.setTimeout(() => void load(true), 3_000)
}

async function load(silent = false) {
  if (disposed) return
  const myRequest = ++requestId
  if (!silent) {
    loading.value = true
    error.value = null
    confirmingId.value = null
    rowError.value = {}
  }
  try {
    const response = await listSyncRelationships({ bucket: props.bucket, direction: 'both' })
    if (myRequest !== requestId) return
    outgoing.value = response.outgoing
    incoming.value = response.incoming
    // Lag and queue depth live on the detail endpoint; fetch per row and
    // tolerate individual failures (the snapshot row still renders).
    const all = [...response.outgoing, ...response.incoming]
    const settled = await Promise.allSettled(all.map((entry) => getSyncRelationship(entry.id)))
    if (myRequest !== requestId) return
    const map: Record<string, SyncRelationshipDetail> = {}
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') map[all[index].id] = result.value
      else if (details.value[all[index].id]) map[all[index].id] = details.value[all[index].id]
    })
    details.value = map
    detailRetryNeeded.value = settled.some((result) => result.status === 'rejected')
  } catch (err) {
    if (myRequest !== requestId) return
    if (!silent) error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (myRequest === requestId && !disposed) {
      loading.value = false
      schedulePoll()
    }
  }
}

watch(
  () => [props.open, props.bucket] as const,
  ([open]) => {
    if (open) void load()
    else {
      ++requestId
      clearPoll()
    }
  },
)
onBeforeUnmount(() => {
  disposed = true
  ++requestId
  clearPoll()
})

interface Row {
  relationship: SyncRelationship
  direction: 'outgoing' | 'incoming'
}

const rows = computed<Row[]>(() => [
  ...outgoing.value.map((relationship) => ({ relationship, direction: 'outgoing' as const })),
  ...incoming.value.map((relationship) => ({ relationship, direction: 'incoming' as const })),
])
const REFERENCE_HANDLING_OPTIONS = [
  { value: 'materialize', label: 'Materialize refs' },
  { value: 'preserve', label: 'Preserve refs' },
  { value: 'skip', label: 'Skip refs' },
]

// The "other side" of the relationship, seen from this bucket.
function counterpart(row: Row): { nodeId: string | null; label: string } {
  const arn = row.direction === 'outgoing' ? row.relationship.target : row.relationship.source
  return { nodeId: parseArunaArn(arn)?.nodeId ?? null, label: arnLocationLabel(arn) }
}

function stateDotClass(state: string): string {
  const variant = syncStateVariant(state)
  if (variant === 'success') return 'bg-emerald-500'
  if (variant === 'warn') return 'bg-amber-500'
  if (variant === 'destructive') return 'bg-destructive'
  return 'bg-muted-foreground/50'
}

function lastError(row: Row): string | null {
  return (
    details.value[row.relationship.id]?.last_error ??
    row.relationship.status.last_error ??
    row.relationship.failure_reason ??
    null
  )
}

async function rerun(row: Row) {
  if (busyId.value) return
  busyId.value = row.relationship.id
  rowError.value = { ...rowError.value, [row.relationship.id]: '' }
  try {
    await runSyncRelationship(row.relationship.id)
    emit('changed')
    await load()
  } catch (err) {
    rowError.value = {
      ...rowError.value,
      [row.relationship.id]: err instanceof Error ? err.message : String(err),
    }
  } finally {
    busyId.value = null
  }
}

async function setReferenceHandling(row: Row, value: string) {
  if (busyId.value || row.direction !== 'outgoing') return
  busyId.value = row.relationship.id
  rowError.value = { ...rowError.value, [row.relationship.id]: '' }
  try {
    await updateSyncReferenceHandling(row.relationship.id, value as SyncReferenceHandling)
    emit('changed')
    await load(true)
  } catch (err) {
    rowError.value = {
      ...rowError.value,
      [row.relationship.id]: err instanceof Error ? err.message : String(err),
    }
  } finally {
    busyId.value = null
  }
}

async function remove(row: Row) {
  if (busyId.value) return
  busyId.value = row.relationship.id
  rowError.value = { ...rowError.value, [row.relationship.id]: '' }
  try {
    await deleteSyncRelationship(row.relationship.id)
    confirmingId.value = null
    emit('changed')
    await load()
  } catch (err) {
    rowError.value = {
      ...rowError.value,
      [row.relationship.id]: err instanceof Error ? err.message : String(err),
    }
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="flex max-h-[85vh] max-w-xl flex-col">
      <DialogHeader>
        <div class="flex items-center justify-between gap-2 pr-8">
          <DialogTitle class="flex min-w-0 items-center gap-2">
            <ArrowLeftRight class="h-4 w-4 shrink-0 text-primary" />
            <span class="truncate">Sync status: <span class="font-mono text-sm">{{ props.bucket }}</span></span>
          </DialogTitle>
          <div class="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" @click="emit('new-sync')">
              <Plus class="h-3.5 w-3.5" /> New sync
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Reload" :disabled="loading" @click="() => load()">
              <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
            </Button>
          </div>
        </div>
        <DialogDescription>
          Your sync relationships where this bucket is the source (outgoing) or the target (incoming).
        </DialogDescription>
      </DialogHeader>

      <section class="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto">
        <div v-if="loading && !rows.length" class="space-y-2">
          <Skeleton class="h-16 w-full" />
          <Skeleton class="h-16 w-full" />
        </div>
        <ErrorPanel v-else-if="error" :message="error" @retry="load" />
        <EmptyState v-else-if="!rows.length" title="No sync relationships" description="This bucket is not part of any sync you created. Replicate it to another node with a new sync.">
          <Button size="sm" @click="emit('new-sync')"><Plus class="h-3.5 w-3.5" /> New sync</Button>
        </EmptyState>
        <div v-else class="space-y-2">
          <div
            v-for="row in rows"
            :key="row.relationship.id"
            class="space-y-1 rounded-md border border-border px-3 py-2"
          >
            <div class="flex items-center gap-2 text-xs">
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                :class="stateDotClass(row.relationship.state)"
                :title="row.relationship.state"
              />
              <Badge variant="outline" class="shrink-0 text-[10px]">{{ syncModeLabel(row.relationship.mode) }}</Badge>
              <component
                :is="row.direction === 'outgoing' ? ArrowRight : ArrowLeft"
                class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                :aria-label="row.direction"
              />
              <Badge variant="outline" class="shrink-0 text-[10px]" :title="counterpart(row).nodeId ?? undefined">
                {{ realmNodes.displayName(counterpart(row).nodeId) }}
              </Badge>
              <span class="min-w-0 flex-1 truncate font-mono" :title="counterpart(row).label">{{ counterpart(row).label }}</span>
            </div>

            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span v-if="details[row.relationship.id]">
                {{ details[row.relationship.id].pending_jobs }} pending
              </span>
              <span v-if="details[row.relationship.id]?.oldest_lag_ms != null">
                · lag {{ formatDuration(details[row.relationship.id].oldest_lag_ms ?? 0) }}
              </span>
              <span v-if="row.relationship.status.last_synced_at">
                · synced {{ relativeTime(row.relationship.status.last_synced_at) }}
              </span>
              <span v-if="row.relationship.status.counters.versions_synced">
                · {{ row.relationship.status.counters.versions_synced }} versions ({{ formatBytes(row.relationship.status.counters.bytes_synced) }})
              </span>
              <span v-if="row.relationship.replicate_deletes">· replicates deletes</span>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-[11px] text-muted-foreground">Source references</span>
              <Select
                v-if="row.direction === 'outgoing' && row.relationship.mode !== 'reference'"
                :model-value="row.relationship.reference_handling"
                :options="REFERENCE_HANDLING_OPTIONS"
                class="h-7 w-40 text-[11px]"
                aria-label="Source reference handling"
                :disabled="busyId !== null"
                @update:model-value="(value: string) => setReferenceHandling(row, value)"
              />
              <Badge v-else variant="outline" class="text-[10px]">{{ row.relationship.reference_handling }}</Badge>
            </div>
            <p
              v-if="details[row.relationship.id]?.pending_jobs && row.relationship.reference_handling === 'materialize'"
              class="text-[11px] text-muted-foreground"
            >
              Referenced objects are fetched from their original connector before transfer. Large sources can remain queued or transferring for a while; this status refreshes automatically.
            </p>

            <p v-if="lastError(row)" class="break-all text-[11px] text-destructive">{{ lastError(row) }}</p>
            <p v-if="rowError[row.relationship.id]" class="break-all text-[11px] text-destructive">{{ rowError[row.relationship.id] }}</p>

            <div class="flex items-center justify-end gap-1 pt-0.5">
              <template v-if="confirmingId === row.relationship.id">
                <span class="mr-auto text-[11px] text-muted-foreground">Remove this sync? Already synced data is kept.</span>
                <Button variant="outline" size="sm" class="h-6 px-2 text-[11px]" @click="confirmingId = null">Cancel</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  class="h-6 px-2 text-[11px]"
                  :disabled="busyId === row.relationship.id"
                  @click="remove(row)"
                >
                  {{ busyId === row.relationship.id ? 'Removing…' : 'Delete' }}
                </Button>
              </template>
              <template v-else>
                <Loader2 v-if="busyId === row.relationship.id" class="h-3.5 w-3.5 animate-spin text-primary" />
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
                  title="Delete sync relationship"
                  aria-label="Delete sync relationship"
                  :disabled="busyId !== null"
                  @click="confirmingId = row.relationship.id"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </template>
            </div>
          </div>
        </div>
      </section>
    </DialogContent>
  </Dialog>
</template>
