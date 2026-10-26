<script setup lang="ts">
// Example buckets that are stored on several nodes, listed like any other bucket.
import { computed } from 'vue'
import { useMockDatabases } from '@/composables/useMockDatabases'
import BucketRow from '@/components/data/BucketRow.vue'
import { mockEnabled, storedLabel } from '@/lib/distributedMock'
import { exampleBuckets } from '@/lib/distributedMockData'
import { degradedRanges, isMulti, type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ filter: string; active: string; databaseOnly?: boolean }>()

const { entries } = useMockDatabases()
const described = (name: string) => entries.value.find((entry) => entry.bucket === name)
const emit = defineEmits<{ (e: 'open', bucket: string): void }>()

const rows = computed(() =>
  mockEnabled() ? exampleBuckets(props.filter).filter((bucket) => !props.databaseOnly || described(bucket.name)) : [],
)
const second = (bucket: DistributedBucket) =>
  props.databaseOnly
    ? (described(bucket.name)?.dataset.description ?? null)
    : isMulti(bucket)
      ? storedLabel(bucket.preset, bucket.members.length)
      : null
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
