<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ChevronRight, FileJson2, Files, Package, Plus, Users, Workflow } from '@lucide/vue'
import AccessBadge from '@/components/ui/AccessBadge.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconTile from '@/components/ui/IconTile.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import GroupStorage from '@/components/dashboard/GroupStorage.vue'
import { useMyGroupsUsage, entryState, QUOTA_SEVERITY, type GroupUsageEntry } from '@/composables/useMyGroupsUsage'
import { countText } from '@/composables/useBucketCount'
import { useAruna } from '@/composables/useAruna'
import { useReachableUsage } from '@/composables/useReachableUsage'
import type { ViewMode } from '@/composables/useViewMode'
import { distinctCount } from '@/lib/distribution'
import { formatCount } from '@/lib/formatCount'
import { QUOTA_STATE_BADGES } from '@/lib/quota'

const { entries, membershipKey, refresh, retry } = useMyGroupsUsage()
const reach = useReachableUsage()
// Members and your roles, as the group list reports them.
const { myGroups } = useAruna()
const memberships = computed(() => new Map(myGroups.value.map((group) => [group.id, group])))
/** `view`: cards or table, as the heading's toggle holds it; `members` adds members and your roles. */
const props = withDefaults(defineProps<{ refreshRevision: number; view?: ViewMode; members?: boolean }>(), { view: 'cards', members: false })
const router = useRouter()
const groupPage = (entry: GroupUsageEntry) => ({ name: 'group', params: { id: entry.groupId } })
const createGroup = { name: 'groups', query: { create: 'group' } }

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
    { key: 'objects', icon: Files, value: known(entry.objects), label: word(entry.objects, 'object', 'objects') },
    { key: 'buckets', icon: Package, value: buckets.text, label: word(buckets.count, 'bucket', 'buckets') },
    { key: 'datasets', icon: FileJson2, value: known(entry.datasetCount), label: word(entry.datasetCount, 'dataset', 'datasets') },
    { key: 'runs', icon: Workflow, value: known(entry.processRunCount), label: word(entry.processRunCount, 'run', 'runs') },
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
  <div class="space-y-3.5">
    <ErrorPanel
      v-if="entries.length && entries.filter((e) => e.status === 'error').length * 2 > entries.length"
      message="Could not load storage for most of your groups."
      @retry="refresh"
    />

    <!-- Cards of equal height; the last one creates a group. -->
    <div v-if="view === 'cards'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div v-for="entry in sortedEntries()" :key="entry.groupId" class="surface flex h-full flex-col p-4">
        <div class="flex items-center gap-3">
          <IconTile :icon="Users" size="sm" />
          <RouterLink :to="groupPage(entry)" class="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary hover:underline">
            {{ entry.name }}
          </RouterLink>
          <Badge v-if="entry.status === 'ready' && badgeFor(entry)" :variant="badgeFor(entry)!.variant" class="ml-auto shrink-0">
            {{ badgeFor(entry)!.label }}
          </Badge>
        </div>
        <p v-if="members && memberships.get(entry.groupId)" class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span v-if="memberships.get(entry.groupId)!.memberCount !== undefined" class="tabular-nums">
            {{ memberships.get(entry.groupId)!.memberCount }} {{ memberships.get(entry.groupId)!.memberCount === 1 ? 'member' : 'members' }}
          </span>
          <AccessBadge v-for="role in memberships.get(entry.groupId)!.tags ?? []" :key="role" :access="role" />
        </p>
        <Skeleton v-if="entry.status === 'loading'" class="mt-3 h-16" />
        <div v-else-if="entry.status === 'error'" class="mt-3">
          <p class="text-xs text-destructive">{{ entry.error }}</p>
          <Button variant="ghost" size="sm" class="mt-1 h-6 px-2 text-xs" @click="retry(entry)">Retry</Button>
        </div>
        <template v-else>
          <GroupStorage class="mb-4 mt-3" :entry="entry" />
          <p class="mt-auto flex flex-wrap gap-x-5 gap-y-1 border-t border-border/70 pt-3 tabular-nums type-secondary">
            <span v-for="count in counts(entry)" :key="count.key" class="inline-flex items-center gap-1.5">
              <component :is="count.icon" class="size-3.5 shrink-0" /><b class="font-medium text-foreground">{{ count.value }}</b> {{ count.label }}
            </span>
          </p>
        </template>
      </div>
      <RouterLink
        :to="createGroup"
        class="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus class="h-5 w-5" /> Create group
      </RouterLink>
    </div>

    <template v-else>
      <!-- Phones: one row per group with its facts in two short lines. -->
      <div class="surface overflow-hidden sm:hidden">
        <RouterLink
          v-for="entry in sortedEntries()"
          :key="entry.groupId"
          :to="groupPage(entry)"
          class="flex items-center gap-3 border-b border-border-subtle px-4 py-3 hover:bg-muted/40"
        >
          <IconTile :icon="Users" size="sm" />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-foreground">{{ entry.name }}</span>
            <Skeleton v-if="entry.status === 'loading'" class="mt-1 h-4 w-40" />
            <span v-else-if="entry.status === 'error'" class="block text-xs text-destructive">{{ entry.error }}</span>
            <template v-else>
              <GroupStorage compact class="mt-0.5" :entry="entry" />
              <span class="block text-xs tabular-nums text-muted-foreground">
                {{ counts(entry).slice(1).map((count) => `${count.value} ${count.label}`).join(', ') }}
              </span>
            </template>
          </span>
          <ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
        </RouterLink>
        <RouterLink :to="createGroup" class="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg border border-dashed border-border"><Plus class="size-4" /></span>
          Create group
        </RouterLink>
      </div>

      <div class="surface hidden overflow-x-auto sm:block">
        <table class="data-table data-table-tall">
          <thead>
            <tr>
              <th class="px-5">Group</th>
              <th class="px-4">Storage</th>
              <th class="num px-4">Objects</th>
              <th class="num px-4">Buckets</th>
              <th class="num px-4">Datasets</th>
              <th class="num px-4">Runs</th>
              <th class="w-10"><span class="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in sortedEntries()" :key="entry.groupId" class="cursor-pointer" @click="router.push(groupPage(entry))">
              <td class="px-5">
                <span class="flex items-center gap-3">
                  <IconTile :icon="Users" size="sm" />
                  <RouterLink :to="groupPage(entry)" class="font-medium text-foreground hover:text-primary hover:underline" @click.stop>
                    {{ entry.name }}
                  </RouterLink>
                  <Badge v-if="entry.status === 'ready' && badgeFor(entry)" :variant="badgeFor(entry)!.variant" class="shrink-0">
                    {{ badgeFor(entry)!.label }}
                  </Badge>
                </span>
              </td>
              <td v-if="entry.status === 'loading'" colspan="5" class="px-4"><Skeleton class="h-6" /></td>
              <td v-else-if="entry.status === 'error'" colspan="5" class="px-4">
                <span class="text-destructive">{{ entry.error }}</span>
                <Button variant="ghost" size="sm" class="ml-2 h-6 px-2 text-xs" @click.stop="retry(entry)">Retry</Button>
              </td>
              <template v-else>
                <td class="px-4"><GroupStorage compact :entry="entry" /></td>
                <td v-for="count in counts(entry)" :key="count.key" class="num px-4">{{ count.value }}</td>
              </template>
              <td class="pr-4 text-right text-muted-foreground"><ChevronRight class="ml-auto h-4 w-4" /></td>
            </tr>
            <tr class="cursor-pointer" @click="router.push(createGroup)">
              <td colspan="7" class="px-5">
                <RouterLink :to="createGroup" class="flex items-center gap-3 text-sm font-medium text-muted-foreground hover:text-foreground" @click.stop>
                  <span class="grid size-8 shrink-0 place-items-center rounded-lg border border-dashed border-border"><Plus class="size-4" /></span>
                  Create group
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
