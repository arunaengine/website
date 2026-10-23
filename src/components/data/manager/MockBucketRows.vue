<script setup lang="ts">
// Example buckets that are stored on several nodes, listed like any other bucket.
import { computed } from 'vue'
import BucketRow from '@/components/data/BucketRow.vue'
import { mockEnabled, storedLabel } from '@/lib/distributedMock'
import { degradedRanges, exampleBuckets, isMulti } from '@/lib/distributedMockData'

const props = defineProps<{ filter: string; active: string }>()
const emit = defineEmits<{ (e: 'open', bucket: string): void }>()

const rows = computed(() => (mockEnabled() ? exampleBuckets(props.filter) : []))
</script>

<template>
  <li v-for="bucket in rows" :key="bucket.name">
    <BucketRow
      :bucket="bucket.name"
      option
      :pinnable="false"
      :active="bucket.name === active"
      :degraded="degradedRanges(bucket).length > 0"
      :subtitle="isMulti(bucket) ? storedLabel(bucket.preset, bucket.members.length) : null"
      @open="emit('open', bucket.name)"
    >
      <template #tooltip>Stored on {{ bucket.members.map((member) => member.nodeId).join(', ') }}</template>
    </BucketRow>
  </li>
</template>
