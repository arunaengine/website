<script setup lang="ts">
import Sheet from '@/components/ui/Sheet.vue'
import SheetContent from '@/components/ui/SheetContent.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import { useAruna, isUnsupportedEndpoint } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { type SyncRelationship, type SyncRelationshipDetail } from '@/lib/api'
import { arnLocationLabel, parseArunaArn, syncModeLabel, syncStateVariant } from '@/lib/sync'
import { formatBytes, formatDuration, relativeTime } from '@/lib/utils'
import { computed, ref, watch } from 'vue'
import { ArrowLeftRight, ArrowLeft, ArrowRight, Loader2, Play, RefreshCw, Trash2 } from '@lucide/vue'

// Sync relationships touching one bucket on the connected node, outgoing and
// incoming (StagingJobsPanel's side-panel pattern). The backend only lists
// relationships created by the caller; run/delete are creator-only as well.
const props = defineProps<{ open: boolean; bucket: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  // Fired after a delete or re-run so the parent can refresh its badges.
  (e: 'changed'): void
}>()

const { listSyncRelationships, getSyncRelationship, runSyncRelationship, deleteSyncRelationship } =
  useAruna()
const realmNodes = useRealmNodes()

const outgoing = ref<SyncRelationship[]>([])
const incoming = ref<SyncRelationship[]>([])
const details = ref<Record<string, SyncRelationshipDetail>>({})
const loading = ref(false)
const error = ref<string | null>(null)
const unsupported = ref(false)
const rowError = ref<Record<string, string>>({})
const busyId = ref<string | null>(null)
const confirmingId = ref<string | null>(null)
let requestId = 0

async function load() {
  const myRequest = ++requestId
  loading.value = true
  error.value = null
  unsupported.value = false
  confirmingId.value = null
  rowError.value = {}
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
    })
    details.value = map
  } catch (err) {
    if (myRequest !== requestId) return
    if (isUnsupportedEndpoint(err)) unsupported.value = true
    else error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (myRequest === requestId) loading.value = false
  }
}

watch(
  () => [props.open, props.bucket] as const,
  ([open]) => {
    if (open) void load()
  },
)

interface Row {
  relationship: SyncRelationship
  direction: 'outgoing' | 'incoming'
}

const rows = computed<Row[]>(() => [
  ...outgoing.value.map((relationship) => ({ relationship, direction: 'outgoing' as const })),
  ...incoming.value.map((relationship) => ({ relationship, direction: 'incoming' as const })),
])

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
  <Sheet :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <SheetContent side="right" class="w-full p-6 sm:max-w-md">
      <DialogTitle class="sr-only">Sync status</DialogTitle>
      <div class="flex items-center justify-between pr-8">
        <h2 class="flex min-w-0 items-center gap-2 text-base font-semibold text-foreground">
          <ArrowLeftRight class="h-4 w-4 shrink-0 text-primary" />
          <span class="truncate">Sync — <span class="font-mono text-sm">{{ props.bucket }}</span></span>
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label="Reload" :disabled="loading" @click="load">
          <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
        </Button>
      </div>
      <p class="mt-1 text-xs text-muted-foreground">
        Your sync relationships where this bucket is the source (outgoing) or the target (incoming).
      </p>

      <section class="mt-4 space-y-2">
        <div v-if="loading && !rows.length" class="space-y-2">
          <Skeleton class="h-16 w-full" />
          <Skeleton class="h-16 w-full" />
        </div>
        <p
          v-else-if="unsupported"
          class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          Bucket sync is not supported by this node yet.
        </p>
        <ErrorPanel v-else-if="error" :message="error" @retry="load" />
        <EmptyState v-else-if="!rows.length" title="No sync relationships" description="This bucket is not part of any sync you created." />
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
    </SheetContent>
  </Sheet>
</template>
