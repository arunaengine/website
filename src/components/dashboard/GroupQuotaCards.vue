<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { HardDrive, RefreshCw } from '@lucide/vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import ReferencedUsageBar from '@/components/ui/ReferencedUsageBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import { useAruna } from '@/composables/useAruna'
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
}

// Cap the fetched cards so a user in dozens of groups does not fan out dozens
// of usage requests on the dashboard.
const CARD_LIMIT = 12
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
    .slice(0, CARD_LIMIT)
  entries.value = groups.map((group) => ({ groupId: group.id, name: group.name, status: 'loading' }))
  await mapLimit(entries.value, 3, (entry) => fetchEntry(entry, seq))
}

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
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Your groups' storage</h2>
        <Badge variant="outline" class="tabular-nums">{{ entries.length }}</Badge>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Refresh storage" @click="load">
        <RefreshCw class="h-3.5 w-3.5" />
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
          <QuotaBar
            v-if="entry.quota"
            class="mt-2"
            :used="entry.usedBytes ?? 0"
            :quota="entry.quota.quota_bytes"
            :ceiling="entry.quota.ceiling_bytes"
            :warn="entry.quota.warning"
            label="Storage"
            compact
          />
          <p v-else class="mt-2 text-[11px] text-muted-foreground">
            {{ formatBytes(entry.usedBytes ?? 0) }} · no quota policy reported
          </p>
          <ReferencedUsageBar
            v-if="entry.referencedBytes"
            class="mt-2"
            :referenced="entry.referencedBytes"
            :stored="entry.usedBytes ?? 0"
            compact
          />
        </template>
      </div>
    </div>

    <footer v-if="myGroups.length > CARD_LIMIT" class="border-t border-border px-5 py-2.5">
      <RouterLink :to="{ name: 'groups' }" class="text-xs font-medium text-primary hover:underline">
        +{{ myGroups.length - CARD_LIMIT }} more groups →
      </RouterLink>
    </footer>
  </div>
</template>
