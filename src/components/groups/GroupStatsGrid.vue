<script setup lang="ts">
// Counts and sizes of one group; never names buckets, objects or datasets.
import DetailList, { type Detail } from '@/components/ui/DetailList.vue'
import QuotaBar from '@/components/ui/QuotaBar.vue'
import { computed } from 'vue'
import type { GroupStatistics } from '@/lib/api'
import { formatBytes, formatNumber } from '@/lib/utils'

const props = defineProps<{ stats: GroupStatistics }>()

const items = computed<Detail[]>(() => {
  const stats = props.stats
  const list: Detail[] = [
    { label: 'Members', value: formatNumber(stats.members) },
    { label: 'Admins', value: formatNumber(stats.admins) },
    { label: 'Buckets', value: formatNumber(stats.distinct_buckets ?? stats.buckets) },
    { label: 'Objects', value: formatNumber(stats.objects) },
    { label: 'Stored', value: formatBytes(stats.logical_bytes) },
    { label: 'Referenced', value: formatBytes(stats.referenced_bytes) },
    { label: 'Running jobs on this node', value: formatNumber(stats.running_jobs) },
    { label: 'Jobs finished in 24 hours', value: stats.recent_jobs === undefined ? 'Unknown' : formatNumber(stats.recent_jobs) },
  ]
  if (stats.active_tokens !== undefined) {
    list.push({ label: 'Active tokens on this node', value: formatNumber(stats.active_tokens) })
  }
  return list
})
</script>

<template>
  <div class="space-y-5">
    <DetailList :items="items" class="lg:grid-cols-4" />
    <div v-if="stats.quota">
      <p class="type-label mb-1">Quota</p>
      <QuotaBar
        :used="stats.logical_bytes"
        :quota="stats.quota.quota_bytes"
        :ceiling="stats.quota.ceiling_bytes"
        :warn="stats.quota.warning"
      />
    </div>
  </div>
</template>
