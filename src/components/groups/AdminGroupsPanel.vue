<script setup lang="ts">
// Every group of the realm with counts and sizes only, for realm administrators.
import Button from '@/components/ui/Button.vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import SectionHeading from '@/components/ui/SectionHeading.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import DeleteGroupDialog from '@/components/groups/DeleteGroupDialog.vue'
import GroupStatsGrid from '@/components/groups/GroupStatsGrid.vue'
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Trash2, Users } from '@lucide/vue'
import { refreshContext, sessionEpoch } from '@/composables/aruna/state'
import { getGroupStatistics, listGroupStatistics, type GroupStatistics } from '@/lib/api'
import { errorMessage, formatBytes, formatNumber } from '@/lib/utils'

type SortKey = 'display_name' | 'members' | 'admins' | 'buckets' | 'logical_bytes' | 'referenced_bytes' | 'objects' | 'quota' | 'jobs'

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'display_name', label: 'Group', numeric: false },
  { key: 'members', label: 'Members', numeric: true },
  { key: 'admins', label: 'Admins', numeric: true },
  { key: 'buckets', label: 'Buckets', numeric: true },
  { key: 'logical_bytes', label: 'Stored', numeric: true },
  { key: 'referenced_bytes', label: 'Referenced', numeric: true },
  { key: 'objects', label: 'Objects', numeric: true },
  { key: 'quota', label: 'Quota use', numeric: true },
  { key: 'jobs', label: 'Jobs', numeric: true },
]

const groups = ref<GroupStatistics[] | null>(null)
const loadError = ref<string | null>(null)
const sortKey = ref<SortKey>('display_name')
const ascending = ref(true)
const selected = ref<GroupStatistics | null>(null)
const details = ref<GroupStatistics | null>(null)
const deleteOpen = ref(false)
let generation = 0

async function load() {
  const current = ++generation
  const { epoch, client } = refreshContext()
  loadError.value = null
  try {
    const response = await listGroupStatistics(client)
    if (current === generation && epoch === sessionEpoch.value) groups.value = response.groups
  } catch (err) {
    if (current === generation && epoch === sessionEpoch.value) loadError.value = errorMessage(err)
  }
}

watch(sessionEpoch, () => {
  groups.value = null
  void load()
}, { immediate: true })

function quotaUse(group: GroupStatistics): number {
  const limit = group.quota?.quota_bytes
  return limit ? group.logical_bytes / limit : -1
}

function sortValue(group: GroupStatistics, key: SortKey): number | string {
  if (key === 'display_name') return group.display_name.toLowerCase()
  if (key === 'buckets') return group.distinct_buckets ?? group.buckets
  if (key === 'quota') return quotaUse(group)
  if (key === 'jobs') return group.running_jobs + (group.recent_jobs ?? 0)
  return group[key]
}

const rows = computed(() => {
  const list = [...(groups.value ?? [])]
  const key = sortKey.value
  list.sort((a, b) => {
    const [left, right] = [sortValue(a, key), sortValue(b, key)]
    const order = left < right ? -1 : left > right ? 1 : 0
    return ascending.value ? order : -order
  })
  return list
})

function sortBy(key: SortKey) {
  if (sortKey.value === key) ascending.value = !ascending.value
  else {
    sortKey.value = key
    ascending.value = key === 'display_name'
  }
}

function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) return 'none'
  return ascending.value ? 'ascending' : 'descending'
}

// The details dialog adds the token count, which only the single group route has.
async function open(group: GroupStatistics) {
  selected.value = group
  details.value = group
  const { epoch, client } = refreshContext()
  try {
    const full = await getGroupStatistics(group.group_id, client)
    if (epoch === sessionEpoch.value && selected.value?.group_id === group.group_id) details.value = full
  } catch {
    // The overview figures stay shown.
  }
}

function onDeleted() {
  selected.value = null
  void load()
}
</script>

<template>
  <section aria-labelledby="admin-groups-heading">
    <SectionHeading
      id="admin-groups-heading"
      title="Groups"
      :icon="Users"
      :count="groups ? formatNumber(groups.length) : undefined"
      info="Counts and sizes only. This view gives no access to any group's data or metadata."
    />
    <ErrorPanel v-if="loadError" :message="loadError" @retry="load" />
    <Skeleton v-else-if="groups === null" class="h-40" />
    <div v-else class="surface overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th
              v-for="column in COLUMNS"
              :key="column.key"
              scope="col"
              class="px-4 py-2 font-semibold"
              :class="column.numeric ? 'text-right' : 'text-left'"
              :aria-sort="ariaSort(column.key)"
            >
              <button type="button" class="inline-flex items-center gap-1 hover:text-foreground" @click="sortBy(column.key)">
                {{ column.label }}
                <ArrowUp v-if="sortKey === column.key && ascending" class="h-3 w-3" aria-hidden="true" />
                <ArrowDown v-else-if="sortKey === column.key" class="h-3 w-3" aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in rows" :key="group.group_id" class="border-t border-border hover:bg-muted/40">
            <td class="px-4 py-2.5 text-sm font-medium text-foreground">
              <button type="button" class="text-left hover:underline" @click="open(group)">{{ group.display_name }}</button>
            </td>
            <td class="px-4 py-2.5 text-right text-xs">{{ formatNumber(group.members) }}</td>
            <td class="px-4 py-2.5 text-right text-xs">{{ formatNumber(group.admins) }}</td>
            <td class="px-4 py-2.5 text-right text-xs">{{ formatNumber(group.distinct_buckets ?? group.buckets) }}</td>
            <td class="px-4 py-2.5 text-right text-xs">{{ formatBytes(group.logical_bytes) }}</td>
            <td class="px-4 py-2.5 text-right text-xs">{{ formatBytes(group.referenced_bytes) }}</td>
            <td class="px-4 py-2.5 text-right text-xs">{{ formatNumber(group.objects) }}</td>
            <td class="min-w-32 px-4 py-2.5 text-xs">
              <QuotaBar v-if="group.quota?.quota_bytes" compact :show-labels="false" :used="group.logical_bytes" :quota="group.quota.quota_bytes" :warn="group.quota.warning" />
              <span v-else class="block text-right text-muted-foreground">No quota</span>
            </td>
            <td class="px-4 py-2.5 text-right text-xs">{{ formatNumber(group.running_jobs) }} running</td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="COLUMNS.length" class="px-4 py-6 text-center text-xs text-muted-foreground">No groups.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <DetailDialog :open="selected !== null" fit @update:open="(open) => { if (!open) selected = null }">
      <template #header>
        <h2 class="truncate text-base font-semibold text-foreground">{{ details?.display_name }}</h2>
        <p class="font-mono text-[11px] text-muted-foreground">{{ details?.group_id }}</p>
      </template>
      <template #actions>
        <Button variant="outline" size="sm" @click="deleteOpen = true"><Trash2 class="h-3.5 w-3.5" /> Delete group</Button>
      </template>
      <GroupStatsGrid v-if="details" :stats="details" />
    </DetailDialog>

    <DeleteGroupDialog
      v-if="selected"
      v-model:open="deleteOpen"
      :group-id="selected.group_id"
      :confirm-name="selected.display_name"
      @deleted="onDeleted"
    />
  </section>
</template>
