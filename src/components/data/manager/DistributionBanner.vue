<script setup lang="ts">
// Above the file list of a bucket stored on more nodes: where it is stored and what is wrong with it.
import { computed } from 'vue'
import DatabaseInfo from '@/components/data/DatabaseInfo.vue'
import DegradedNotice from '@/components/distributed/DegradedNotice.vue'
import DeletionNotice from '@/components/distributed/DeletionNotice.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Badge from '@/components/ui/Badge.vue'
import { storedLabel } from '@/lib/distributedMock'
import { degradedRanges, isDeleting, isMulti, openTransfers, type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ bucket: DistributedBucket }>()

const degraded = computed(() => degradedRanges(props.bucket))
const moving = computed(() => openTransfers(props.bucket).length)
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <MockNotice v-if="!bucket.live" />
      <Badge variant="outline" size="sm">
        {{ isMulti(bucket) ? storedLabel(bucket.preset, bucket.members.length) : 'This node' }}
      </Badge>
      <Badge v-if="isDeleting(bucket)" variant="destructive" size="sm">Deleting</Badge>
      <Badge v-if="bucket.live?.pending" variant="warn" size="sm">Pending</Badge>
      <Badge v-if="moving" variant="outline" size="sm">{{ moving }} {{ moving === 1 ? 'range moves' : 'ranges move' }}</Badge>
      <Badge v-if="bucket.live?.publicationsClosed && !isDeleting(bucket)" variant="outline" size="sm" title="This node applies no more changes of the bucket">Left</Badge>
      <Badge v-if="degraded.length" variant="warn" size="sm">Degraded</Badge>
    </div>
    <DeletionNotice v-if="bucket.live?.deletion" :deletion="bucket.live.deletion" />
    <DatabaseInfo v-if="!bucket.live" :bucket="bucket.name" />
    <DegradedNotice v-for="range in degraded" :key="range.id" :range="range" />
  </div>
</template>
