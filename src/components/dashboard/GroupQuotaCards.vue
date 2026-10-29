<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import ViewToggle from '@/components/ui/ViewToggle.vue'
import GroupStorage from '@/components/dashboard/GroupStorage.vue'
import { useMyGroupsUsage, entryState, QUOTA_SEVERITY, type GroupUsageEntry } from '@/composables/useMyGroupsUsage'
import { countText } from '@/composables/useBucketCount'
import { useReachableUsage } from '@/composables/useReachableUsage'
import { useViewMode } from '@/composables/useViewMode'
import { distinctCount } from '@/lib/distribution'
import { formatCount } from '@/lib/formatCount'
import { QUOTA_STATE_BADGES } from '@/lib/quota'

const { entries, membershipKey, refresh, retry } = useMyGroupsUsage()
const reach = useReachableUsage()
const view = useViewMode('dashboard-groups')
/** `compact`: a column of the landing view's bottom row, one card wide and without nested surfaces. */
const props = defineProps<{ refreshRevision: number; compact?: boolean }>()

// Only states that need attention get a badge; an unlimited group shows "no quota" in its line.
function badgeFor(entry: GroupUsageEntry) {
  const state = entryState(entry)
  return state === 'unlimited' ? null : QUOTA_STATE_BADGES[state]
}

// A group's total counts a distributed bucket once per node unless the node says otherwise.
function bucketCount(entry: GroupUsageEntry): { text: string; count: number } {
  if (entry.buckets == null) return { text: 'Unknown', count: 2 }
  if (entry.bucketsDistinct || entry.buckets <= 1) return { text: formatCount(entry.buckets), count: entry.buckets }
  const listed = reach.groups.value.find((group) => group.groupId === entry.groupId)
  const whole = Boolean(listed && !listed.error && !listed.missing)
  const counted = distinctCount(entry.buckets, listed?.copies ?? 0, listed?.buckets ?? 0, whole)
  return { text: countText(counted, formatCount), count: counted.exact ? counted.count : 2 }
}

function counts(entry: GroupUsageEntry) {
  const known = (value: number | null | undefined) => (value == null ? 'Unknown' : formatCount(value))
  const word = (value: number | null | undefined, one: string, many: string) => (value === 1 ? one : many)
  const buckets = bucketCount(entry)
  return [
    { key: 'objects', value: known(entry.objects), label: word(entry.objects, 'object', 'objects') },
    { key: 'buckets', value: buckets.text, label: word(buckets.count, 'bucket', 'buckets') },
    { key: 'datasets', value: known(entry.datasetCount), label: word(entry.datasetCount, 'dataset', 'datasets') },
    { key: 'runs', value: known(entry.processRunCount), label: word(entry.processRunCount, 'run', 'runs') },
  ]
}

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

// This section owns the freshness of the shared usage: mounting the dashboard
// reloads it, and the personal tiles join the same round.
watch(membershipKey, () => void refresh(), { immediate: true })

watch(() => props.refreshRevision, (revision, previousRevision) => {
  if (revision > previousRevision) void refresh()
})
</script>

<template>
  <section class="space-y-3.5" aria-labelledby="dashboard-groups-heading">
    <div class="flex items-center justify-between gap-2 pt-2">
      <h3 id="dashboard-groups-heading" class="font-display text-sm font-semibold text-aruna-navy">Groups</h3>
      <ViewToggle v-model="view" />
    </div>

    <ErrorPanel
      v-if="entries.length && entries.filter((e) => e.status === 'error').length * 2 > entries.length"
      message="Could not load storage for most of your groups."
      @retry="refresh"
    />

    <div v-if="view === 'cards'" class="grid gap-3.5" :class="compact ? '' : 'sm:grid-cols-2 xl:grid-cols-3'">
      <div v-for="entry in sortedEntries()" :key="entry.groupId" :class="compact ? 'rounded-md border border-border p-3' : 'surface p-4'">
        <div class="flex items-center justify-between gap-2">
          <RouterLink
            :to="{ name: 'group', params: { id: entry.groupId } }"
            class="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
          >
            {{ entry.name }}
          </RouterLink>
          <Badge v-if="entry.status === 'ready' && badgeFor(entry)" :variant="badgeFor(entry)!.variant" class="shrink-0">
            {{ badgeFor(entry)!.label }}
          </Badge>
        </div>
        <Skeleton v-if="entry.status === 'loading'" class="mt-2 h-16" />
        <div v-else-if="entry.status === 'error'" class="mt-2">
          <p class="text-xs text-destructive">{{ entry.error }}</p>
          <Button variant="ghost" size="sm" class="mt-1 h-6 px-2 text-xs" @click="retry(entry)">Retry</Button>
        </div>
        <template v-else>
          <GroupStorage class="mt-2" :entry="entry" />
          <dl class="mt-3 grid grid-cols-4 gap-2 border-t border-border/70 pt-2.5 text-xs tabular-nums">
            <div v-for="count in counts(entry)" :key="count.key" class="flex flex-col-reverse">
              <dt class="text-[10px] text-muted-foreground">{{ count.label }}</dt>
              <dd class="font-medium text-foreground">{{ count.value }}</dd>
            </div>
          </dl>
        </template>
      </div>
    </div>

    <div v-else class="overflow-x-auto" :class="compact ? '' : 'surface'">
      <table class="data-table">
        <thead>
          <tr>
            <th class="px-4">Group</th>
            <th class="px-4">Storage</th>
            <th class="num px-4">Objects</th>
            <th class="num px-4">Buckets</th>
            <th class="num px-4">Datasets</th>
            <th class="num px-4">Runs</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in sortedEntries()" :key="entry.groupId">
            <td class="px-4 py-2.5">
              <div class="flex items-center gap-2">
                <RouterLink
                  :to="{ name: 'group', params: { id: entry.groupId } }"
                  class="font-medium text-foreground hover:text-primary hover:underline"
                >
                  {{ entry.name }}
                </RouterLink>
                <Badge v-if="entry.status === 'ready' && badgeFor(entry)" :variant="badgeFor(entry)!.variant" class="shrink-0">
                  {{ badgeFor(entry)!.label }}
                </Badge>
              </div>
            </td>
            <td v-if="entry.status === 'loading'" colspan="5" class="px-4 py-2.5"><Skeleton class="h-6" /></td>
            <td v-else-if="entry.status === 'error'" colspan="5" class="px-4 py-2.5">
              <span class="text-destructive">{{ entry.error }}</span>
              <Button variant="ghost" size="sm" class="ml-2 h-6 px-2 text-xs" @click="retry(entry)">Retry</Button>
            </td>
            <template v-else>
              <td class="w-[42%] px-4 py-2.5"><GroupStorage :entry="entry" /></td>
              <td v-for="count in counts(entry)" :key="count.key" class="num px-4 py-2.5">{{ count.value }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-muted-foreground">A bucket stored on several nodes counts once.</p>
  </section>
</template>
