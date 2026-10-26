<script setup lang="ts">
// Example buckets that are stored on several nodes, listed like any other bucket.
import { computed } from 'vue'
import BucketRow from '@/components/data/BucketRow.vue'
import { mockEnabled, storedLabel } from '@/lib/distributedMock'
import { exampleBuckets } from '@/lib/distributedMockData'
import { degradedRanges, isMulti, type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ filter: string; active: string }>()

const emit = defineEmits<{ (e: 'open', bucket: string): void }>()

const rows = computed(() =>
  mockEnabled() ? exampleBuckets(props.filter) : [],
)
const second = (bucket: DistributedBucket) => (isMulti(bucket) ? storedLabel(bucket.preset, bucket.members.length) : null)
</script>

<template>
  <li v-for="bucket in rows" :key="bucket.name">
    <BucketRow
      :bucket="bucket.name"
      option
      :pinnable="false"
      :active="bucket.name === active"
      :degraded="degradedRanges(bucket).length > 0"
      :subtitle="second(bucket)"
      @open="emit('open', bucket.name)"
    >
      <template #tooltip>Stored on {{ bucket.members.map((member) => member.nodeId).join(', ') }}</template>
    </BucketRow>
  </li>
</template>
