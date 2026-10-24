<script setup lang="ts">
// Above the file list of an example bucket: where it is stored and what is wrong with it.
import { computed } from 'vue'
import DatabaseInfo from '@/components/data/DatabaseInfo.vue'
import DegradedNotice from '@/components/distributed/DegradedNotice.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Badge from '@/components/ui/Badge.vue'
import { storedLabel } from '@/lib/distributedMock'
import { degradedRanges, isMulti, type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ bucket: DistributedBucket }>()

const degraded = computed(() => degradedRanges(props.bucket))
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <MockNotice />
      <Badge variant="outline" size="sm">
        {{ isMulti(bucket) ? storedLabel(bucket.preset, bucket.members.length) : 'This node' }}
      </Badge>
      <Badge v-if="degraded.length" variant="warn" size="sm">Degraded</Badge>
    </div>
    <DatabaseInfo :bucket="bucket.name" />
    <DegradedNotice v-for="range in degraded" :key="range.id" :range="range" />
  </div>
</template>
