<script setup lang="ts">
// The Storage and Objects cards of the Overview over every group the caller belongs to. They come
// from the buckets themselves, so a distributed bucket counts once; a part that was not read makes
// the figure a lower bound instead of a smaller number.
import { computed, watch } from 'vue'
import { Database, Files, HardDrive, Link, Package, Server } from '@lucide/vue'
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

const props = withDefaults(defineProps<{ refreshRevision?: number }>(), { refreshRevision: 0 })

const { aggregate, membershipKey, load } = useMyGroupsUsage()
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
  if (total == null) return null
  const counted = aggregate.value.bucketsDistinct
    ? { count: total, exact: true }
    : distinctCount(total, reach.copies.value, reach.total.value.buckets, reach.listedAll.value)
  return { value: countText(counted, formatCount), word: plural(counted.exact ? counted.count : 2, 'bucket', 'buckets') }
})
// The databases of my groups, once the realm's database list was read.
const databaseText = computed(() => {
  if (databases.state.value !== 'ready') return null
  const mine = new Set(myGroups.value.map((group) => group.id))
  const count = databases.rows.value.filter((row) => mine.has(row.ownerGroup)).length
  return { value: lowerBound(!databases.complete.value, formatCount(count)), word: plural(count, 'database', 'databases') }
})
</script>

<template>
  <!-- Cards of the Overview grid; the notes run below its row. -->
  <div class="contents">
    <template v-if="!loaded">
      <Skeleton class="h-[132px] rounded-xl" />
      <Skeleton class="h-[132px] rounded-xl" />
    </template>
    <template v-else>
      <OverviewCell label="Storage" :icon="HardDrive" info="Stored data counts against quotas. Referenced data stays at its source.">
        <template #value>{{ lowerBound(referencedLower, formatBytes(sum.stored + sum.referenced)) }}</template>
        <template #unit>total</template>
        <span><Server /><b>{{ lowerBound(atLeast, formatBytes(sum.stored)) }}</b> stored</span>
        <span><Link /><b>{{ lowerBound(referencedLower, formatBytes(sum.referenced)) }}</b> referenced</span>
      </OverviewCell>
      <OverviewCell label="Objects" :icon="Files" :to="{ name: 'buckets' }">
        <template #value>{{ lowerBound(atLeast, formatCount(sum.objects)) }}</template>
        <span v-if="buckets"><Package /><b>{{ buckets.value }}</b> {{ buckets.word }}</span>
        <span v-if="databaseText"><Database /><b>{{ databaseText.value }}</b> {{ databaseText.word }}</span>
      </OverviewCell>
    </template>

    <div v-if="loaded && (notes.length || aggregate.failed.length)" class="order-last col-span-full space-y-2">
      <ul v-if="notes.length" class="space-y-1 text-xs text-muted-foreground">
        <li v-for="note in notes" :key="note">{{ note }}</li>
      </ul>
      <Notice v-if="aggregate.failed.length" tone="warning">
        Totals stay unknown while the storage of {{ aggregate.failed.join(', ') }} cannot be read.
      </Notice>
    </div>
  </div>
</template>
