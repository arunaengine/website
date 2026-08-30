<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useRefresh } from '@/composables/useRefresh'
import { type SyncReferenceHandling, type SyncRelationship, type SyncRelationshipDetail } from '@/lib/api'
import { arnLocationLabel, parseArunaArn, syncModeLabel, syncStateVariant } from '@/lib/sync'
import { errorMessage, formatBytes, formatDuration, relativeTime } from '@/lib/utils'
import type { StateTone } from '@/lib/stateBadge'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeftRight, ArrowLeft, ArrowRight, Play, Plus, Trash2 } from '@lucide/vue'

// Sync relationships touching one bucket, outgoing and incoming, presented as
// a centered dialog opened from the sync chip. The backend only lists
// relationships created by the caller; run/delete are creator-only as well.
// For a bucket hosted on another node (nodeId set) that node's own API is
// queried too, because relationships live on their source node.
const props = defineProps<{
  open: boolean
  bucket: string
  /** Node hosting the browsed bucket; null/absent = the connected node. */
  nodeId?: string | null
}>()
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

// Resolved like the create flow resolves remote-source POSTs: the node's
// published REST base from the realm document.
const remoteApiBase = computed(() =>
  props.nodeId ? (realmNodes.nodeById(props.nodeId)?.apiBase ?? null) : null,
)

const outgoing = ref<SyncRelationship[]>([])
const incoming = ref<SyncRelationship[]>([])
// Relationship id → hosting node id, for rows only the remote node's listing
// returned. Their detail/run/delete calls address that node too.
const hostedOn = ref<Record<string, string>>({})
const details = ref<Record<string, SyncRelationshipDetail>>({})
const detailRetryNeeded = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const remoteQueryError = ref<string | null>(null)
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
    let mergedOutgoing = response.outgoing
    let mergedIncoming = response.incoming
    const hosts: Record<string, string> = {}
    // Remote-hosted bucket: relationships whose source is that node exist only
    // in its own listing, so query it as well and merge (dedupe by id). A
    // failure degrades to an inline notice, never blocking the local results.
    if (props.nodeId) {
      try {
        if (!remoteApiBase.value) throw new Error('no published API base')
        const remote = await listSyncRelationships(
          { bucket: props.bucket, direction: 'both' },
          { baseUrl: remoteApiBase.value },
        )
        if (myRequest !== requestId) return
        const known = new Set([...mergedOutgoing, ...mergedIncoming].map((entry) => entry.id))
        for (const entry of remote.outgoing) {
          if (known.has(entry.id)) continue
          hosts[entry.id] = props.nodeId
          mergedOutgoing = [...mergedOutgoing, entry]
        }
        for (const entry of remote.incoming) {
          if (known.has(entry.id)) continue
          hosts[entry.id] = props.nodeId
          mergedIncoming = [...mergedIncoming, entry]
        }
        remoteQueryError.value = null
      } catch (remoteErr) {
        if (myRequest !== requestId) return
        // "The API session changed" aborts the whole load, not just this leg.
        if (remoteErr instanceof DOMException && remoteErr.name === 'AbortError') throw remoteErr
        remoteQueryError.value = `Could not query node ${realmNodes.displayName(props.nodeId)} for its sync relationships`
      }
    } else {
      remoteQueryError.value = null
    }
    outgoing.value = mergedOutgoing
    incoming.value = mergedIncoming
    hostedOn.value = hosts
    // Lag and queue depth live on the detail endpoint; fetch per row (from the
    // hosting node) and tolerate individual failures (the snapshot row still
    // renders).
    const all = [...mergedOutgoing, ...mergedIncoming]
    const settled = await Promise.allSettled(
      all.map((entry) => getSyncRelationship(entry.id, hostOpts(entry.id))),
    )
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
    if (!silent) error.value = errorMessage(err)
  } finally {
    if (myRequest === requestId && !disposed) {
      loading.value = false
      schedulePoll()
    }
  }
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(() => load())
const spinning = computed(() => reloadBusy.value || loading.value)

watch(
  () => [props.open, props.bucket, props.nodeId] as const,
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

// Base-URL override for rows hosted on the remote node; their detail, run,
// reference-handling and delete endpoints live there, not on the connected node.
function hostOpts(relationshipId: string): { baseUrl?: string } {
  return hostedOn.value[relationshipId] && remoteApiBase.value
    ? { baseUrl: remoteApiBase.value }
    : {}
}

// The "other side" of the relationship, seen from this bucket.
function counterpart(row: Row): { nodeId: string | null; label: string } {
  const arn = row.direction === 'outgoing' ? row.relationship.target : row.relationship.source
  return { nodeId: parseArunaArn(arn)?.nodeId ?? null, label: arnLocationLabel(arn) }
}

function stateDotTone(state: SyncRelationship['state']): StateTone {
  const variant = syncStateVariant(state)
  if (variant === 'success') return 'done'
  if (variant === 'warn') return 'attention'
  if (variant === 'destructive') return 'failed'
  return 'idle'
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
    await runSyncRelationship(row.relationship.id, hostOpts(row.relationship.id))
    emit('changed')
    await load()
  } catch (err) {
    rowError.value = {
      ...rowError.value,
      [row.relationship.id]: errorMessage(err),
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
    await updateSyncReferenceHandling(
      row.relationship.id,
      value as SyncReferenceHandling,
      hostOpts(row.relationship.id),
    )
    emit('changed')
    await load(true)
  } catch (err) {
    rowError.value = {
      ...rowError.value,
      [row.relationship.id]: errorMessage(err),
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
    await deleteSyncRelationship(row.relationship.id, hostOpts(row.relationship.id))
    confirmingId.value = null
    emit('changed')
    await load()
  } catch (err) {
    rowError.value = {
      ...rowError.value,
      [row.relationship.id]: errorMessage(err),
    }
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="flex max-w-xl flex-col">
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
            <RefreshButton :busy="spinning" sr-label="Reload" @click="onReload" />
          </div>
        </div>
        <DialogDescription>
          Your sync relationships where this bucket is the source (outgoing) or the target (incoming).
        </DialogDescription>
      </DialogHeader>

      <section class="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto">
        <Notice v-if="remoteQueryError" tone="warning">
          {{ remoteQueryError }}
        </Notice>
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
            class="rounded-md border border-border px-4 py-3"
          >
            <!-- Line 1: identity (flexible, truncating) + metrics right-aligned. -->
            <div class="flex items-center gap-2 text-xs">
              <StatusDot :tone="stateDotTone(row.relationship.state)" :label="row.relationship.state" />
              <Badge variant="outline" size="sm" class="shrink-0">{{ syncModeLabel(row.relationship.mode) }}</Badge>
              <component
                :is="row.direction === 'outgoing' ? ArrowRight : ArrowLeft"
                class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                :aria-label="row.direction"
              />
              <Badge variant="outline" size="sm" class="shrink-0" :title="counterpart(row).nodeId ?? undefined">
                {{ realmNodes.displayName(counterpart(row).nodeId) }}
              </Badge>
              <span class="min-w-0 flex-1 truncate font-mono" :title="counterpart(row).label">{{ counterpart(row).label }}</span>
              <span class="flex shrink-0 items-center gap-3 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                <span v-if="details[row.relationship.id]">
                  {{ details[row.relationship.id].pending_jobs }} pending
                </span>
                <span v-if="details[row.relationship.id]?.oldest_lag_ms != null">
                  lag {{ formatDuration(details[row.relationship.id].oldest_lag_ms ?? 0) }}
                </span>
                <span v-if="row.relationship.status.last_synced_at">
                  synced {{ relativeTime(row.relationship.status.last_synced_at) }}
                </span>
                <span v-if="row.relationship.status.counters.versions_synced">
                  {{ row.relationship.status.counters.versions_synced }} versions ({{ formatBytes(row.relationship.status.counters.bytes_synced) }})
                </span>
              </span>
            </div>

            <!-- Line 2: traits left, reference handling + actions right. -->
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
                <span v-if="row.relationship.replicate_deletes">replicates deletes</span>
              </span>
              <template v-if="confirmingId === row.relationship.id">
                <span class="text-[11px] text-muted-foreground">Remove this sync? Already synced data is kept.</span>
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
                <Badge v-else variant="outline" size="sm">{{ row.relationship.reference_handling }}</Badge>
                <Spinner v-if="busyId === row.relationship.id" label="Working" class="text-primary" />
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

            <p
              v-if="details[row.relationship.id]?.pending_jobs && row.relationship.reference_handling === 'materialize'"
              class="mt-1 text-[11px] text-muted-foreground"
            >
              Referenced objects are fetched from their original connector before transfer. Large sources can remain queued or transferring for a while; this status refreshes automatically.
            </p>
            <p v-if="lastError(row)" class="mt-1 break-all text-[11px] text-destructive">{{ lastError(row) }}</p>
            <p v-if="rowError[row.relationship.id]" class="mt-1 break-all text-[11px] text-destructive">{{ rowError[row.relationship.id] }}</p>
          </div>
        </div>
      </section>
    </DialogContent>
  </Dialog>
</template>
