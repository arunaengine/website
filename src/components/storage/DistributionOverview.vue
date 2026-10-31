<script setup lang="ts">
// Where a bucket is stored. An example bucket also shows its counts, from static data.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import MockNotice from '@/components/distributed/MockNotice.vue'
import RowList from '@/components/distributed/RowList.vue'
import { presetById, stamp, storedLabel } from '@/lib/distributedMock'
import { degradedRanges, isDeleting, isMulti, type DistributedBucket } from '@/lib/distribution'
import { formatCount } from '@/lib/formatCount'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { formatBytes } from '@/lib/utils'
import { HardDrive } from '@lucide/vue'

const props = defineProps<{ bucket: DistributedBucket }>()
const { displayName } = useRealmNodes()
const memberNodes = computed(() => [...new Set(props.bucket.members.map((member) => member.nodeId))])

const rows = computed(() => {
  const bucket = props.bucket
  const counted = bucket.ranges.every((range) => range.objects !== undefined && range.bytes !== undefined)
  const nodes = memberNodes.value.map((id) => displayName(id)).join(', ')
  const state = isDeleting(bucket) ? 'Deleting' : bucket.live?.pending ? 'Pending' : degradedRanges(bucket).length ? 'Degraded' : 'Active'
  return [
    { label: 'State', value: state },
    ...(counted
      ? [
          { label: 'Files', value: formatCount(bucket.ranges.reduce((sum, range) => sum + (range.objects ?? 0), 0)) },
          { label: 'Size', value: formatBytes(bucket.ranges.reduce((sum, range) => sum + (range.bytes ?? 0), 0)) },
        ]
      : []),
    { key: 'stored', label: 'Stored on', value: isMulti(bucket) ? `${storedLabel(bucket.preset, bucket.members.length)}: ${nodes}` : 'This node' },
    ...(isMulti(bucket) ? [{ label: 'Kept as', value: presetById(bucket.preset).label }] : []),
    ...(bucket.created ? [{ label: 'Created', value: stamp(bucket.created) }] : []),
  ]
})
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <HardDrive class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ bucket.live ? 'Stored on' : 'Storage' }}</h2>
      <MockNotice v-if="!bucket.live" class="ml-auto" />
    </header>
    <div class="px-5 py-4">
      <RowList :rows="rows">
        <template #stored="{ row }">
          <template v-if="isMulti(bucket)">
            {{ storedLabel(bucket.preset, bucket.members.length) }}:
            <template v-for="(id, index) in memberNodes" :key="id">
              <RouterLink :to="{ name: 'node', params: { nodeId: id } }" class="text-primary hover:underline">{{ displayName(id) }}</RouterLink><template v-if="index < memberNodes.length - 1">, </template>
            </template>
          </template>
          <template v-else>{{ row.value }}</template>
        </template>
      </RowList>
    </div>
  </section>
</template>
