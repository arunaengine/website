<script setup lang="ts">
// The Overview cells over every group the caller belongs to. Storage and objects come from the
// buckets themselves, so a distributed bucket counts once; a part that was not read makes the
// figure a lower bound instead of a smaller number.
import { computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Notice from '@/components/ui/Notice.vue'
import OverviewCell from '@/components/dashboard/OverviewCell.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabases } from '@/composables/useDatabases'
import { useMyGroupsUsage } from '@/composables/useMyGroupsUsage'
import { countText } from '@/composables/useBucketCount'
import { useReachableUsage } from '@/composables/useReachableUsage'
import { distinctCount } from '@/lib/distribution'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'

/** `running`: the visible runs that run right now; null while they are not known. */
const props = withDefaults(defineProps<{ refreshRevision?: number; running?: { count: number; atLeast: boolean } | null }>(), {
  refreshRevision: 0,
  running: null,
})

const { aggregate, entries, membershipKey, load } = useMyGroupsUsage()
const reach = useReachableUsage()
const { myGroups } = useAruna()
const databases = useDatabases()
databases.ensure()

// A dashboard refresh reads every bucket again; a membership change reads what is new.
watch(membershipKey, () => {
  void load()
  void reach.load()
}, { immediate: true })
watch(() => props.refreshRevision, (next, previous) => {
  if (next > previous) void reach.load(true)
})

const sum = computed(() => reach.total.value)
const loaded = computed(() => reach.groups.value.length > 0)
const failed = computed(() => reach.groups.value.filter((group) => group.error).map((group) => group.name))
const missing = computed(() => reach.groups.value.filter((group) => group.missing && !group.error).map((group) => group.name))
const atLeast = computed(() => reach.groups.value.some((group) => group.error || group.missing) || sum.value.partial || sum.value.unread > 0)
const referencedLower = computed(() => atLeast.value || sum.value.referencedUnknown > 0)
const lowerBound = (lower: boolean, text: string) => `${lower ? 'at least ' : ''}${text}`

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

// Why a figure is a lower bound or unknown, in short sentences under the cells.
const notes = computed(() => {
  const total = sum.value
  return [
    total.unread ? `The usage of ${total.unread} ${plural(total.unread, 'bucket', 'buckets')} could not be read, so it is not counted.` : '',
    total.referencedUnknown
      ? `${total.referencedUnknown} ${plural(total.referencedUnknown, 'bucket does', 'buckets do')} not report referenced data, so the referenced size is unknown there.`
      : '',
    total.partial ? 'Some buckets are still being counted, so their numbers are lower bounds.' : '',
    missing.value.length ? `Buckets of ${missing.value.join(', ')} may be missing: a node did not answer or the list was too long.` : '',
    failed.value.length ? `The buckets of ${failed.value.join(', ')} could not be listed.` : '',
  ].filter(Boolean)
})

// Group totals count a bucket stored on several nodes once per node; the listed buckets correct that.
const buckets = computed(() => {
  const total = aggregate.value.buckets
  if (total == null) return 'Buckets unknown'
  const counted = aggregate.value.bucketsDistinct
    ? { count: total, exact: true }
    : distinctCount(total, reach.copies.value, reach.total.value.buckets, reach.listedAll.value)
  return `${countText(counted, formatCount)} ${plural(counted.exact ? counted.count : 2, 'bucket', 'buckets')}`
})
// The databases of my groups, once the realm's database list was read.
const databaseText = computed(() => {
  if (databases.state.value !== 'ready') return null
  const mine = new Set(myGroups.value.map((group) => group.id))
  const count = databases.rows.value.filter((row) => mine.has(row.ownerGroup)).length
  return `${lowerBound(!databases.complete.value, formatCount(count))} ${plural(count, 'database', 'databases')}`
})

// The groups' quotas: a sum when every group has one, "no quota" when none has; mixed says nothing.
const quotaText = computed(() => {
  const quotas = entries.value.map((entry) => entry.quota?.quota_bytes ?? null)
  if (!quotas.length || entries.value.some((entry) => entry.status !== 'ready')) return ''
  if (quotas.every((quota) => quota === null)) return ', no quota'
  if (quotas.every((quota) => quota !== null)) return ` of ${formatBytes(quotas.reduce<number>((total, quota) => total + (quota ?? 0), 0))}`
  return ''
})

const datasets = computed(() => (aggregate.value.datasets == null ? 'Unknown' : formatCount(aggregate.value.datasets)))
const runCount = computed(() => (aggregate.value.processRuns == null ? 'Unknown' : formatCount(aggregate.value.processRuns)))
// Below the runs: how many run right now, and the datasets.
const workLine = computed(() => {
  const running = props.running ? `${props.running.atLeast ? 'at least ' : ''}${formatCount(props.running.count)} running` : null
  const datasetCount = aggregate.value.datasets
  return [running, `${datasets.value} ${datasetCount === 1 ? 'dataset' : 'datasets'}`].filter(Boolean).join(', ')
})
</script>

<template>
  <!-- Cells of the Overview grid; the notes run below its row. -->
  <div class="contents">
    <template v-if="!loaded">
      <div class="bg-card px-5 py-4"><Skeleton class="h-16" /></div>
      <div class="bg-card px-5 py-4"><Skeleton class="h-16" /></div>
    </template>
    <template v-else>
      <OverviewCell label="Storage">
        <template #value>
          <b>{{ lowerBound(atLeast, formatBytes(sum.stored)) }}</b> stored{{ quotaText }}
          <b class="ml-2">{{ lowerBound(referencedLower, formatBytes(sum.referenced)) }}</b> referenced
        </template>
        Stored counts against quotas. Referenced data stays at its source.
      </OverviewCell>
      <OverviewCell label="Data">
        <template #value>
          <RouterLink :to="{ name: 'buckets' }" class="hover:underline"><b>{{ lowerBound(atLeast, formatCount(sum.objects)) }}</b></RouterLink>
          {{ plural(sum.objects, 'object', 'objects') }}
        </template>
        {{ [buckets, databaseText].filter(Boolean).join(', ') }}
      </OverviewCell>
    </template>
    <div v-if="aggregate.pending" class="bg-card px-5 py-4"><Skeleton class="h-16" /></div>
    <OverviewCell v-else label="Work">
      <template #value>
        <RouterLink :to="{ name: 'compute' }" class="hover:underline"><b>{{ runCount }}</b></RouterLink>
        {{ aggregate.processRuns === 1 ? 'run' : 'runs' }}
      </template>
      {{ workLine }}
    </OverviewCell>

    <div v-if="loaded && (notes.length || aggregate.failed.length)" class="order-last space-y-2 bg-card px-5 py-3 sm:col-span-2 lg:col-span-4">
      <ul v-if="notes.length" class="space-y-1 text-xs text-muted-foreground">
        <li v-for="note in notes" :key="note">{{ note }}</li>
      </ul>
      <Notice v-if="aggregate.failed.length" tone="warning">
        Totals stay unknown while the storage of {{ aggregate.failed.join(', ') }} cannot be read.
      </Notice>
    </div>
  </div>
</template>
