<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useRefresh } from '@/composables/useRefresh'
import {
  ackQuarantine,
  isHexKey,
  listQuarantine,
  pruneQuarantine,
  readQuarantine,
  type QuarantineInspect,
  type QuarantinePruneResult,
  type QuarantineRecord,
  type QuarantineUsage,
} from '@/lib/quarantine'
import { errorMessage, formatBytes, formatNumber, relativeTime } from '@/lib/utils'
import { useDebounceFn } from '@vueuse/core'
import { ChevronLeft, ChevronRight, ShieldAlert, ShieldCheck, Trash2 } from '@lucide/vue'
import Notice from '@/components/ui/Notice.vue'

const { bootstrapped, currentUser, canManageQuarantine, apiBaseUrl, authToken } = useAruna()
const { isAuthenticated } = useAuth()

const ready = computed(() => bootstrapped.value && !!currentUser.value && canManageQuarantine.value)

function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

function quarantinedAt(record: QuarantineRecord): string {
  return relativeTime(new Date(record.quarantined_at_ms).toISOString())
}

function quarantinedIso(record: QuarantineRecord): string {
  return new Date(record.quarantined_at_ms).toISOString()
}

// ── Listing (cursor-paged; cursors[i] is the exclusive start of page i) ──────
const PAGE_SIZE = 25

const cursors = ref<Array<string | undefined>>([undefined])
const pageIndex = ref(0)
const records = ref<QuarantineRecord[]>([])
const usage = ref<QuarantineUsage | null>(null)
const nextCursor = ref<string | null>(null)
const listLoading = ref(false)
const listError = ref<string | null>(null)

// Hex sync topic filter; anything the backend's hex decode would 400 on is
// held back as an inline hint instead of a request.
const topicDraft = ref('')
const topic = ref('')
const topicInvalid = computed(() => topicDraft.value.trim() !== '' && !isHexKey(topicDraft.value.trim()))
const applyTopic = useDebounceFn((value: string) => {
  const trimmed = value.trim()
  if (trimmed !== '' && !isHexKey(trimmed)) return
  if (trimmed === topic.value) return
  topic.value = trimmed
  resetPaging()
}, 300)
watch(topicDraft, (value) => void applyTopic(value))

let listSeq = 0
async function loadPage(index: number) {
  const seq = ++listSeq
  listLoading.value = true
  listError.value = null
  try {
    const page = await listQuarantine(
      { cursor: cursors.value[index], topic: topic.value || undefined, limit: PAGE_SIZE },
      client(),
    )
    if (seq !== listSeq) return
    records.value = page.records
    usage.value = page.usage
    nextCursor.value = page.next_cursor ?? null
    pageIndex.value = index
  } catch (err) {
    if (seq === listSeq) listError.value = errorMessage(err)
  } finally {
    if (seq === listSeq) listLoading.value = false
  }
}

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(() => loadPage(pageIndex.value))
const spinning = computed(() => refreshBusy.value || listLoading.value)

function resetPaging() {
  cursors.value = [undefined]
  void loadPage(0)
}

function nextPage() {
  if (!nextCursor.value || listLoading.value) return
  cursors.value = [...cursors.value.slice(0, pageIndex.value + 1), nextCursor.value]
  void loadPage(pageIndex.value + 1)
}
function prevPage() {
  if (pageIndex.value > 0 && !listLoading.value) void loadPage(pageIndex.value - 1)
}

let loaded = false
watch(
  ready,
  (ok) => {
    if (ok && !loaded) {
      loaded = true
      void loadPage(0)
    }
  },
  { immediate: true },
)

// ── Acknowledge (idempotent; the response is the updated row) ────────────────
const ackBusy = ref<string | null>(null)
const ackError = ref<string | null>(null)

async function acknowledge(recordId: string) {
  if (ackBusy.value) return
  ackBusy.value = recordId
  ackError.value = null
  try {
    const updated = await ackQuarantine(recordId, client())
    records.value = records.value.map((row) => (row.id === updated.id ? updated : row))
    if (inspected.value?.record.id === updated.id) {
      inspected.value = { ...inspected.value, record: updated }
    }
  } catch (err) {
    ackError.value = errorMessage(err)
  } finally {
    ackBusy.value = null
  }
}

// ── Inspect (centered modal; side sheets are banned in this app) ─────────────
const inspectOpen = ref(false)
const inspected = ref<QuarantineInspect | null>(null)
const inspectLoading = ref(false)
const inspectError = ref<string | null>(null)

let inspectSeq = 0
async function inspect(record: QuarantineRecord) {
  const seq = ++inspectSeq
  inspected.value = { record }
  inspectOpen.value = true
  inspectLoading.value = true
  inspectError.value = null
  try {
    const fresh = await readQuarantine(record.id, client())
    if (seq === inspectSeq) inspected.value = fresh
  } catch (err) {
    if (seq === inspectSeq) inspectError.value = errorMessage(err)
  } finally {
    if (seq === inspectSeq) inspectLoading.value = false
  }
}

const inspectFields = computed<Array<[string, string]>>(() => {
  const record = inspected.value?.record
  if (!record) return []
  return [
    ['Topic', record.topic],
    ['Actor', record.actor],
    ['Actor sequence', String(record.actor_seq)],
    ['Event id', record.event_id ?? '-'],
    ['Family', record.family ?? '-'],
    ['Target', record.target ?? '-'],
    ['Origin node', record.origin_node_id ?? '-'],
    ['Quarantined', quarantinedIso(record)],
    ['Retained bytes', formatBytes(record.event_bytes)],
  ]
})

// ── Prune (bounded: one pass scans up to 200 rows, continue while a cursor
//    remains; only acknowledged rows are removed) ─────────────────────────────
const PRUNE_PASS_LIMIT = 200

const pruneOpen = ref(false)
const pruning = ref(false)
const pruneError = ref<string | null>(null)
const pruneResult = ref<QuarantinePruneResult | null>(null)
const prunedTotal = ref(0)
const scannedTotal = ref(0)

function openPrune() {
  pruneError.value = null
  pruneResult.value = null
  prunedTotal.value = 0
  scannedTotal.value = 0
  pruneOpen.value = true
}

async function runPrunePass() {
  if (pruning.value) return
  pruning.value = true
  pruneError.value = null
  try {
    const result = await pruneQuarantine(
      {
        cursor: pruneResult.value?.next_cursor,
        topic: topic.value || undefined,
        limit: PRUNE_PASS_LIMIT,
      },
      client(),
    )
    pruneResult.value = result
    prunedTotal.value += result.pruned
    scannedTotal.value += result.scanned
    usage.value = result.usage
    // Rows may have vanished under the current page; restart from page one.
    resetPaging()
  } catch (err) {
    pruneError.value = errorMessage(err)
  } finally {
    pruning.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Sync quarantine"
      description="Replicated sync events this node rejected, retained as evidence for review."
    >
      <template #actions>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'admin' }">Admin</RouterLink>
        </Button>
        <RefreshButton :busy="spinning" :disabled="!ready" @click="onRefresh" />
        <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" :disabled="!ready" @click="openPrune">
          <Trash2 class="h-4 w-4" /> Prune acknowledged
        </Button>
      </template>
    </PageHeader>

    <div v-if="!bootstrapped" class="container space-y-3 py-8">
      <Skeleton class="h-24" />
      <Skeleton class="h-64" />
    </div>

    <div v-else-if="!ready" class="container py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <ShieldCheck class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Realm admin access required</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {{
            isAuthenticated
              ? 'Your account does not hold the quarantine permission (WRITE on /{realm}/admin/sync-quarantine) needed to review rejected sync events.'
              : 'Sign in with a realm admin account to review rejected sync events.'
          }}
        </p>
      </section>
    </div>

    <div v-else class="container py-8">
      <section class="surface">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div class="flex items-center gap-2">
            <ShieldAlert class="h-4 w-4 text-primary" />
            <h3 class="font-display text-sm font-semibold text-aruna-navy">Quarantined events</h3>
            <Badge v-if="usage" variant="outline" class="tabular-nums">
              {{ formatNumber(usage.records) }} / {{ formatNumber(usage.max_records) }} records ·
              {{ formatBytes(usage.bytes) }} / {{ formatBytes(usage.max_bytes) }}
            </Badge>
          </div>
          <div class="w-full sm:max-w-xs">
            <label for="quarantine-topic-filter" class="sr-only">Filter by hex sync topic</label>
            <Input
              id="quarantine-topic-filter"
              v-model="topicDraft"
              type="datasets"
              placeholder="Filter by hex sync topic"
              class="font-mono"
            />
            <p v-if="topicInvalid" class="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
              Topics are even-length hex strings; the filter is not applied.
            </p>
          </div>
        </header>

        <p v-if="ackError" class="border-b border-border bg-destructive/5 px-5 py-2 text-xs text-destructive">
          Acknowledge failed: {{ ackError }}
        </p>

        <div v-if="listLoading && !records.length" class="space-y-2 p-5" aria-hidden="true">
          <Skeleton v-for="i in 5" :key="i" class="h-10" />
        </div>

        <div v-else-if="listError" class="p-5">
          <ErrorPanel :message="listError" @retry="loadPage(pageIndex)" />
        </div>

        <EmptyState
          v-else-if="!records.length"
          title="No quarantined events"
          :description="
            topic
              ? 'This node holds no rejected sync events for the filtered topic.'
              : 'This node has not rejected any replicated sync events.'
          "
        >
          <template #icon><ShieldCheck class="h-8 w-8" /></template>
        </EmptyState>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <caption class="sr-only">Quarantined sync events</caption>
            <thead>
              <tr class="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" class="px-5 py-2.5 font-medium">Family</th>
                <th scope="col" class="px-5 py-2.5 font-medium">Target</th>
                <th scope="col" class="px-5 py-2.5 font-medium">Origin</th>
                <th scope="col" class="px-5 py-2.5 font-medium">Reason</th>
                <th scope="col" class="px-5 py-2.5 font-medium">Quarantined</th>
                <th scope="col" class="px-5 py-2.5 font-medium">Status</th>
                <th scope="col" class="px-5 py-2.5 text-right font-medium"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="record in records"
                :key="record.id"
                class="border-b border-border/60 last:border-b-0 hover:bg-muted/40"
              >
                <td class="px-5 py-3">
                  <Badge v-if="record.family" variant="secondary" class="font-mono">{{ record.family }}</Badge>
                  <span v-else class="text-muted-foreground" title="The payload never decoded into an event.">undecoded</span>
                </td>
                <td class="max-w-56 px-5 py-3">
                  <span class="block truncate font-mono text-[11px] text-foreground/80" :title="record.target">
                    {{ record.target ?? '-' }}
                  </span>
                </td>
                <td class="px-5 py-3 text-[11px] text-muted-foreground">
                  <NodeLabel v-if="record.origin_node_id" :node-id="record.origin_node_id" size="sm" />
                  <template v-else>-</template>
                </td>
                <td class="max-w-56 px-5 py-3">
                  <span class="block truncate text-xs text-foreground/85" :title="record.reason">{{ record.reason }}</span>
                </td>
                <td class="px-5 py-3 text-xs text-muted-foreground" :title="quarantinedIso(record)">
                  {{ quarantinedAt(record) }}
                </td>
                <td class="px-5 py-3">
                  <Badge v-if="record.acknowledged" variant="success">Acknowledged</Badge>
                  <Badge v-else variant="warn">Unreviewed</Badge>
                </td>
                <td class="px-5 py-3 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" :aria-label="`Inspect record ${record.id}`" @click="inspect(record)">
                      Inspect
                    </Button>
                    <Button
                      v-if="!record.acknowledged"
                      variant="outline"
                      size="sm"
                      :disabled="ackBusy === record.id"
                      @click="acknowledge(record.id)"
                    >
                      {{ ackBusy === record.id ? 'Acknowledging…' : 'Acknowledge' }}
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer
          v-if="!listError && (pageIndex > 0 || nextCursor)"
          class="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-2 text-[11px] text-muted-foreground"
          :aria-busy="listLoading"
        >
          <span class="flex items-center gap-2" aria-live="polite">
            <Spinner v-if="listLoading" label="Loading the quarantine page" /> Page {{ pageIndex + 1 }} · {{ records.length }} records shown
          </span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-foreground/70 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="pageIndex <= 0 || listLoading"
              aria-label="Previous page"
              @click="prevPage"
            >
              <ChevronLeft class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-foreground/70 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!nextCursor || listLoading"
              aria-label="Next page"
              @click="nextPage"
            >
              <ChevronRight class="h-3.5 w-3.5" />
            </button>
          </div>
        </footer>
      </section>
    </div>

    <Dialog :open="inspectOpen" @update:open="(v: boolean) => (inspectOpen = v)">
      <DialogContent class="flex w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden bg-background p-0 sm:w-[92vw]">
        <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-6">
          <DialogTitle class="sr-only">Quarantine record details</DialogTitle>

          <div v-if="inspected" class="space-y-6">
            <div class="space-y-1.5 pr-8">
              <h2 class="font-display text-lg font-semibold text-aruna-navy">
                {{ inspected.record.family ? `Rejected ${inspected.record.family} event` : 'Rejected sync event' }}
              </h2>
              <div class="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <span class="truncate">{{ inspected.record.id }}</span>
                <CopyButton :value="inspected.record.id" label="Copy record id" />
              </div>
              <p v-if="inspectError" class="text-[11px] text-amber-700 dark:text-amber-300">
                Refresh failed ({{ inspectError }}), showing the listed state.
              </p>
            </div>

            <section class="space-y-2">
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Rejection</h2>
              <p class="rounded-md bg-muted/40 px-3 py-2 text-xs text-foreground">{{ inspected.record.reason }}</p>
            </section>

            <section class="space-y-2">
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Record</h2>
              <dl class="grid grid-cols-[minmax(8rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                <template v-for="[key, value] in inspectFields" :key="key">
                  <dt class="text-muted-foreground">{{ key }}</dt>
                  <dd class="break-all font-mono text-foreground">{{ value }}</dd>
                </template>
              </dl>
            </section>

            <section class="space-y-2">
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Decoded event</h2>
              <Skeleton v-if="inspectLoading && !inspected.event" class="h-10" />
              <pre
                v-else-if="inspected.event"
                class="whitespace-pre-wrap break-words rounded-md bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground"
                >{{ inspected.event }}</pre>
              <p v-else class="text-xs text-muted-foreground">The retained bytes do not decode into a sync event.</p>
            </section>

            <div class="flex items-center justify-between gap-3">
              <Badge v-if="inspected.record.acknowledged" variant="success">Acknowledged</Badge>
              <Badge v-else variant="warn">Unreviewed</Badge>
              <Button
                v-if="!inspected.record.acknowledged"
                size="sm"
                variant="outline"
                :disabled="ackBusy === inspected.record.id"
                @click="acknowledge(inspected.record.id)"
              >
                {{ ackBusy === inspected.record.id ? 'Acknowledging…' : 'Acknowledge' }}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog :open="pruneOpen" @update:open="(v: boolean) => (pruneOpen = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Prune acknowledged records</DialogTitle>
          <DialogDescription>
            Each pass scans up to {{ PRUNE_PASS_LIMIT }} records<span v-if="topic"> of the filtered topic</span> and
            deletes the acknowledged ones together with their retained event bytes. Unreviewed records are never
            touched; run further passes until no records remain unscanned.
          </DialogDescription>
        </DialogHeader>
        <p v-if="pruneResult" class="text-sm text-foreground" aria-live="polite">
          Removed {{ formatNumber(prunedTotal) }} of {{ formatNumber(scannedTotal) }} scanned records.
          <span v-if="pruneResult.next_cursor">More records remain unscanned.</span>
          <span v-else>All records have been scanned.</span>
        </p>
        <Notice v-if="pruneError" tone="error">{{ pruneError }}</Notice>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline">{{ pruneResult ? 'Close' : 'Cancel' }}</Button></DialogClose>
          <Button
            v-if="!pruneResult || pruneResult.next_cursor"
            variant="destructive"
            :disabled="pruning"
            @click="runPrunePass"
          >
            {{ pruning ? 'Pruning…' : pruneResult ? 'Continue prune' : 'Prune one pass' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
