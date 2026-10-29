<script setup lang="ts">
// Personal tiles over every group the caller belongs to. Storage and objects come from the
// buckets themselves, so a distributed bucket counts once; a part that was not read makes the
// figure a lower bound instead of a smaller number.
import { computed, watch } from 'vue'
import Notice from '@/components/ui/Notice.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import QuotaLegend from '@/components/ui/QuotaLegend.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useMyGroupsUsage } from '@/composables/useMyGroupsUsage'
import { countText } from '@/composables/useBucketCount'
import { useReachableUsage } from '@/composables/useReachableUsage'
import { distinctCount } from '@/lib/distribution'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'

const props = withDefaults(defineProps<{ refreshRevision?: number }>(), { refreshRevision: 0 })

const { aggregate, membershipKey, load } = useMyGroupsUsage()
const reach = useReachableUsage()

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

// Group totals count a bucket stored on several nodes once per node; the listed buckets correct that.
const buckets = computed(() => {
  const total = aggregate.value.buckets
  if (total == null) return 'in an unknown number of buckets'
  const counted = aggregate.value.bucketsDistinct
    ? { count: total, exact: true }
    : distinctCount(total, reach.copies.value, reach.total.value.buckets, reach.listedAll.value)
  return `in ${countText(counted, formatCount)} ${plural(counted.exact ? counted.count : 2, 'bucket', 'buckets')}`
})

const datasets = computed(() => (aggregate.value.datasets == null ? 'Unknown' : formatCount(aggregate.value.datasets)))
const runs = computed(() => {
  const value = aggregate.value.processRuns
  return value == null ? 'Process runs unknown' : `and ${formatCount(value)} ${plural(value, 'process run', 'process runs')}`
})
</script>

<template>
  <div class="space-y-3.5">
    <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      <template v-if="!loaded">
        <Skeleton class="h-[108px] sm:col-span-2" />
        <Skeleton class="h-[108px]" />
      </template>
      <template v-else>
        <div class="surface flex flex-col gap-1.5 p-4 sm:col-span-2">
          <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Storage</span>
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="font-display text-2xl font-semibold text-aruna-navy">{{ lowerBound(atLeast, formatBytes(sum.stored)) }}</span>
            <span class="text-xs text-muted-foreground">stored</span>
            <span class="ml-3 font-display text-2xl font-semibold text-aruna-navy">{{ lowerBound(referencedLower, formatBytes(sum.referenced)) }}</span>
            <span class="text-xs text-muted-foreground">referenced</span>
          </div>
          <QuotaBar class="mt-2" :used="sum.stored" :quota="null" :referenced="sum.referenced" :show-labels="false" :legend="false" />
          <QuotaLegend class="mt-1" quota />
        </div>
        <div class="surface flex flex-col gap-1.5 p-4">
          <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Objects</span>
          <span class="font-display text-2xl font-semibold text-aruna-navy">{{ lowerBound(atLeast, formatCount(sum.objects)) }}</span>
          <span class="text-xs text-muted-foreground">{{ buckets }}</span>
        </div>
      </template>
      <Skeleton v-if="aggregate.pending" class="h-[108px]" />
      <div v-else class="surface flex flex-col gap-1.5 p-4">
        <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Datasets</span>
        <span class="font-display text-2xl font-semibold text-aruna-navy">{{ datasets }}</span>
        <span class="text-xs text-muted-foreground">{{ runs }}</span>
      </div>
    </div>

    <ul v-if="loaded" class="space-y-1 text-xs text-muted-foreground">
      <li v-if="sum.unread">
        The usage of {{ sum.unread }} {{ plural(sum.unread, 'bucket', 'buckets') }} could not be read, so it is not counted.
      </li>
      <li v-if="sum.referencedUnknown">
        {{ sum.referencedUnknown }} {{ plural(sum.referencedUnknown, 'bucket does', 'buckets do') }} not report
        referenced data, so the referenced size is unknown there.
      </li>
      <li v-if="sum.partial">Some buckets are still being counted, so their numbers are lower bounds.</li>
      <li v-if="missing.length">Buckets of {{ missing.join(', ') }} may be missing: a node did not answer or the list was too long.</li>
      <li v-if="failed.length">The buckets of {{ failed.join(', ') }} could not be listed.</li>
    </ul>
    <Notice v-if="aggregate.failed.length" tone="warning">
      Totals stay unknown while the storage of {{ aggregate.failed.join(', ') }} cannot be read.
    </Notice>
  </div>
</template>
