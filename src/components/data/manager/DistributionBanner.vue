<script setup lang="ts">
// Below the bucket header of a bucket stored on more nodes: what is wrong with it. The title names
// where it is stored.
import { computed } from 'vue'
import DegradedNotice from '@/components/distributed/DegradedNotice.vue'
import DeletionNotice from '@/components/distributed/DeletionNotice.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Badge from '@/components/ui/Badge.vue'
import { degradedRanges, isDeleting, openTransfers, type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ bucket: DistributedBucket }>()

const degraded = computed(() => degradedRanges(props.bucket))
const moving = computed(() => openTransfers(props.bucket).length)
const left = computed(() => Boolean(props.bucket.live?.publicationsClosed) && !isDeleting(props.bucket))
const marked = computed(() => !props.bucket.live || isDeleting(props.bucket) || Boolean(props.bucket.live?.pending) || moving.value > 0 || left.value)
</script>

<template>
  <div v-if="marked || bucket.live?.deletion || degraded.length" class="space-y-3">
    <div v-if="marked" class="flex flex-wrap items-center gap-2">
      <MockNotice v-if="!bucket.live" />
      <Badge v-if="isDeleting(bucket)" variant="destructive" size="sm">Deleting</Badge>
      <Badge v-if="bucket.live?.pending" variant="warn" size="sm">Pending</Badge>
      <Badge v-if="moving" variant="outline" size="sm">{{ moving }} {{ moving === 1 ? 'range moves' : 'ranges move' }}</Badge>
      <Badge v-if="left" variant="outline" size="sm" title="This node applies no more changes of the bucket">Left</Badge>
    </div>
    <DeletionNotice v-if="bucket.live?.deletion" :deletion="bucket.live.deletion" />
    <DegradedNotice :ranges="degraded" />
  </div>
</template>
