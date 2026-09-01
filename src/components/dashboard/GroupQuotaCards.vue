<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink } from 'vue-router'
import { HardDrive } from '@lucide/vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import { useMyGroupsUsage, entryState, QUOTA_SEVERITY, type GroupUsageEntry } from '@/composables/useMyGroupsUsage'
import { useRefresh } from '@/composables/useRefresh'
import { QUOTA_STATE_BADGES } from '@/lib/quota'
import { formatBytes } from '@/lib/utils'

const { entries, membershipKey, refresh, retry } = useMyGroupsUsage()
const props = defineProps<{ refreshRevision: number }>()

function badgeFor(entry: GroupUsageEntry) {
  return QUOTA_STATE_BADGES[entryState(entry)]
}

// Percentage of the soft quota in use (matches the QuotaBar's own reading).
function quotaPct(entry: GroupUsageEntry): number {
  const quota = entry.quota?.quota_bytes
  if (quota == null || quota <= 0) return 0
  return Math.round(((entry.usedBytes ?? 0) / quota) * 100)
}

// Muted tail of the primary usage line. Separators live inside the string so
// spacing survives template whitespace condensing (" 9.9 MB" + this).
function quotaRemainder(entry: GroupUsageEntry): string {
  const quota = entry.quota?.quota_bytes
  return quota != null ? ` / ${formatBytes(quota)}` : ' · unlimited'
}

// Secondary detail moved off the primary usage line: the hard cap (when it
// differs from the quota) and any referenced-but-not-counted footprint.
function quotaDetail(entry: GroupUsageEntry): string {
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

const { busy: refreshBusy, refresh: onRefresh } = useRefresh(refresh)

// Ready entries first, sorted by severity then name; then loading; then errors.
const RANK: Record<GroupUsageEntry['status'], number> = { ready: 0, loading: 1, error: 2 }
function sortedEntries() {
  return [...entries.value].sort((a, b) => {
    if (a.status !== b.status) return RANK[a.status] - RANK[b.status]
    if (a.status === 'ready') {
      const severity = QUOTA_SEVERITY[entryState(a)] - QUOTA_SEVERITY[entryState(b)]
      if (severity !== 0) return severity
    }
    return a.name.localeCompare(b.name)
  })
}

// This card owns the freshness of the shared usage: mounting the dashboard
// reloads it, and the personal tiles join the same round.
watch(membershipKey, () => void refresh(), { immediate: true })

watch(() => props.refreshRevision, (revision, previousRevision) => {
  if (revision > previousRevision) void refresh()
})
</script>

<template>
  <div class="surface overflow-hidden">
    <header class="flex items-center justify-between border-b border-border px-5 py-4">
      <div class="flex items-center gap-2">
        <HardDrive class="h-4 w-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Per group</h2>
        <Badge variant="outline" size="count">{{ entries.length }}</Badge>
      </div>
      <RefreshButton :busy="refreshBusy" sr-label="Refresh the per-group figures" @click="onRefresh" />
    </header>

    <ErrorPanel
      v-if="entries.length && entries.filter((e) => e.status === 'error').length * 2 > entries.length"
      message="Could not load storage for most of your groups."
      class="m-5"
      @retry="refresh"
    />

    <div class="grid gap-3.5 p-5 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="entry in sortedEntries()"
        :key="entry.groupId"
        class="rounded-lg border border-border bg-background p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <RouterLink
            :to="{ name: 'group', params: { id: entry.groupId }, hash: '#storage-use' }"
            class="min-w-0 truncate text-xs font-medium text-foreground hover:text-primary hover:underline"
          >
            {{ entry.name }}
          </RouterLink>
          <Badge
            v-if="entry.status === 'ready' && badgeFor(entry)"
            :variant="badgeFor(entry)!.variant"
            size="sm"
            class="shrink-0 uppercase"
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
