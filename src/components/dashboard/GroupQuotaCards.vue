<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { HardDrive, RefreshCw } from '@lucide/vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import { useAruna } from '@/composables/useAruna'
import { useRefresh } from '@/composables/useRefresh'
import { assessQuota, quotaCountedBytes, referencedBytes, QUOTA_STATE_BADGES, type QuotaState } from '@/lib/quota'
import { formatBytes } from '@/lib/utils'
import type { GroupQuotaStatus } from '@/lib/api'

const { myGroups, getGroupUsage } = useAruna()
const props = defineProps<{ refreshRevision: number }>()

interface CardEntry {
  groupId: string
  name: string
  status: 'loading' | 'ready' | 'error'
  error?: string
  quota?: GroupQuotaStatus | null
  usedBytes?: number
  referencedBytes?: number
  datasetCount?: number | null
  profileCount?: number | null
  processRunCount?: number | null
}

const entries = ref<CardEntry[]>([])

// Guard stale loads (same pattern as AdminView's userSearchSeq).
let loadSeq = 0

// Severity ordering so the groups that need attention float to the top.
const SEVERITY: Record<QuotaState, number> = {
  'over-ceiling': 0,
  'over-quota': 1,
  warning: 2,
  ok: 3,
  unlimited: 4,
  'no-policy': 5,
}

function entryState(entry: CardEntry): QuotaState {
  return assessQuota(entry.quota, entry.usedBytes ?? 0).state
}

function badgeFor(entry: CardEntry) {
  return QUOTA_STATE_BADGES[entryState(entry)]
}

// Percentage of the soft quota in use (matches the QuotaBar's own reading).
function quotaPct(entry: CardEntry): number {
  const quota = entry.quota?.quota_bytes
  if (quota == null || quota <= 0) return 0
  return Math.round(((entry.usedBytes ?? 0) / quota) * 100)
}

// Muted tail of the primary usage line. Separators live inside the string so
// spacing survives template whitespace condensing (" 9.9 MB" + this).
function quotaRemainder(entry: CardEntry): string {
  const quota = entry.quota?.quota_bytes
  return quota != null ? ` / ${formatBytes(quota)}` : ' · unlimited'
}

// Secondary detail moved off the primary usage line: the hard cap (when it
// differs from the quota) and any referenced-but-not-counted footprint.
function quotaDetail(entry: CardEntry): string {
  const parts: string[] = []
  const quota = entry.quota?.quota_bytes
  const cap = entry.quota?.ceiling_bytes
  if (quota != null && cap != null && cap !== quota) parts.push(`cap ${formatBytes(cap)}`)
  const referenced = entry.referencedBytes ?? 0
  if (referenced > 0) parts.push(`${formatBytes(referenced)} referenced (not counted)`)
  return parts.join(' · ')
}

function purposeCountLabel(value: number | null | undefined): string {
  return value == null ? 'Unknown' : String(value.toLocaleString())
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await fn(next)
  })
  await Promise.all(workers)
}

async function fetchEntry(entry: CardEntry, seq: number) {
  try {
    const usage = await getGroupUsage(entry.groupId)
    if (seq !== loadSeq) return
    entry.usedBytes = quotaCountedBytes(usage)
    entry.referencedBytes = referencedBytes(usage)
    entry.datasetCount = usage.dataset_count ?? null
    entry.profileCount = usage.profile_count ?? null
    entry.processRunCount = usage.process_run_count ?? null
    entry.quota = usage.quota ?? null
    entry.status = 'ready'
  } catch (err) {
    if (seq !== loadSeq) return
    entry.status = 'error'
    entry.error = err instanceof Error ? err.message : String(err)
  }
  entries.value = [...entries.value]
}

async function load() {
  const seq = ++loadSeq
  const groups = [...myGroups.value]
    .sort((a, b) => a.name.localeCompare(b.name))
  // Preserve already-loaded cards across a reload so a dashboard refresh
  // updates their quota bars in place instead of flashing every card back to a
  // skeleton (the revision-driven reloads fire on mount, on interval and on
  // manual refresh).
  const previous = new Map(entries.value.map((entry) => [entry.groupId, entry]))
  entries.value = groups.map((group): CardEntry => {
    const prior = previous.get(group.id)
    if (prior && prior.status === 'ready') return { ...prior, name: group.name }
    return { groupId: group.id, name: group.name, status: 'loading' }
  })
  // Every membership is represented immediately; usage loads incrementally
  // with only three requests in flight at once.
  await mapLimit(entries.value, 3, (entry) => fetchEntry(entry, seq))
}

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(load)

function retry(entry: CardEntry) {
  entry.status = 'loading'
  entry.error = undefined
  entries.value = [...entries.value]
  void fetchEntry(entry, loadSeq)
}

// Ready entries first, sorted by severity then name; then loading; then errors.
const RANK: Record<CardEntry['status'], number> = { ready: 0, loading: 1, error: 2 }
function sortedEntries() {
  return [...entries.value].sort((a, b) => {
    if (a.status !== b.status) return RANK[a.status] - RANK[b.status]
    if (a.status === 'ready') {
      const severity = SEVERITY[entryState(a)] - SEVERITY[entryState(b)]
      if (severity !== 0) return severity
    }
    return a.name.localeCompare(b.name)
  })
}

watch(
  () => myGroups.value.map((group) => group.id).join(','),
  () => void load(),
  { immediate: true },
)

watch(() => props.refreshRevision, (revision, previousRevision) => {
  if (revision > previousRevision) void load()
})
</script>

<template>
  <div class="surface overflow-hidden">
    <header class="flex items-center justify-between border-b border-border px-5 py-4">
      <div class="flex items-center gap-2">
        <HardDrive class="h-4 w-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Group statistics</h2>
        <Badge variant="outline" class="tabular-nums">{{ entries.length }}</Badge>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        :disabled="refreshBusy"
        :aria-busy="refreshBusy"
        aria-label="Refresh group statistics"
        @click="onRefresh"
      >
        <RefreshCw class="h-3.5 w-3.5" :class="refreshBusy ? 'animate-spin' : ''" />
      </Button>
    </header>

    <ErrorPanel
      v-if="entries.length && entries.filter((e) => e.status === 'error').length * 2 > entries.length"
      message="Could not load storage for most of your groups."
      class="m-5"
      @retry="load"
    />

    <div class="grid gap-3.5 p-5 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="entry in sortedEntries()"
        :key="entry.groupId"
        class="rounded-lg border border-border bg-background p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <RouterLink
            :to="{ name: 'groups', params: { id: entry.groupId }, hash: '#storage' }"
            class="min-w-0 truncate text-xs font-medium text-foreground hover:text-primary hover:underline"
          >
            {{ entry.name }}
          </RouterLink>
          <Badge
            v-if="entry.status === 'ready' && badgeFor(entry)"
            :variant="badgeFor(entry)!.variant"
            class="shrink-0 text-[10px] uppercase"
          >
            {{ badgeFor(entry)!.label }}
          </Badge>
        </div>

        <Skeleton v-if="entry.status === 'loading'" class="mt-2 h-8" />
        <div v-else-if="entry.status === 'error'" class="mt-2">
          <p class="text-xs text-destructive">{{ entry.error }}</p>
          <Button variant="ghost" size="sm" class="mt-1 h-6 px-2 text-xs" @click="retry(entry)">Retry</Button>
        </div>
        <template v-else>
          <dl class="mt-2 grid grid-cols-3 gap-2 border-t border-border/70 pt-2">
            <div>
              <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Datasets</dt>
              <dd class="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">{{ purposeCountLabel(entry.datasetCount) }}</dd>
            </div>
            <div>
              <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Profiles</dt>
              <dd class="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">{{ purposeCountLabel(entry.profileCount) }}</dd>
            </div>
            <div>
              <dt class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Process runs</dt>
              <dd class="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">{{ purposeCountLabel(entry.processRunCount) }}</dd>
            </div>
          </dl>
          <div v-if="entry.quota" class="mt-2">
            <div class="flex items-baseline justify-between gap-2 text-[11px]">
              <span class="min-w-0 truncate tabular-nums"><span class="font-medium text-foreground">{{ formatBytes(entry.usedBytes ?? 0) }}</span><span class="text-muted-foreground">{{ quotaRemainder(entry) }}</span></span>
              <span
                v-if="entry.quota.quota_bytes != null"
                class="shrink-0 tabular-nums text-muted-foreground"
              >{{ quotaPct(entry) }}%</span>
            </div>
            <QuotaBar
              class="mt-1.5"
              :used="entry.usedBytes ?? 0"
              :quota="entry.quota.quota_bytes"
              :ceiling="entry.quota.ceiling_bytes"
              :referenced="entry.referencedBytes ?? 0"
              :warn="entry.quota.warning"
              :show-labels="false"
              compact
            />
            <p
              v-if="quotaDetail(entry)"
              class="mt-1 text-[10px] leading-tight text-muted-foreground tabular-nums"
            >{{ quotaDetail(entry) }}</p>
          </div>
          <p v-else class="mt-2 text-[11px] text-muted-foreground">
            {{ formatBytes(entry.usedBytes ?? 0) }} · no quota policy reported<template v-if="entry.referencedBytes"> · {{ formatBytes(entry.referencedBytes) }} referenced (not counted)</template>
          </p>
        </template>
      </div>
    </div>

  </div>
</template>
