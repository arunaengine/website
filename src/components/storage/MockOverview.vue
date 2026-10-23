<script setup lang="ts">
// The storage overview of an example bucket, from static data.
import { computed } from 'vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import RowList from '@/components/distributed/RowList.vue'
import { presetById, stamp, storedLabel } from '@/lib/distributedMock'
import { degradedRanges, isMulti, type MockBucket } from '@/lib/distributedMockData'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'
import { HardDrive } from '@lucide/vue'

const props = defineProps<{ bucket: MockBucket }>()

const rows = computed(() => {
  const ranges = props.bucket.ranges
  const nodes = props.bucket.members.map((member) => member.nodeId).join(', ')
  return [
    { label: 'State', value: degradedRanges(props.bucket).length ? 'Degraded' : 'Active' },
    { label: 'Files', value: formatCount(ranges.reduce((sum, range) => sum + range.objects, 0)) },
    { label: 'Size', value: formatBytes(ranges.reduce((sum, range) => sum + range.bytes, 0)) },
    { label: 'Stored on', value: isMulti(props.bucket) ? `${storedLabel(props.bucket.preset, props.bucket.members.length)}: ${nodes}` : 'This node' },
    ...(isMulti(props.bucket) ? [{ label: 'Kept as', value: presetById(props.bucket.preset).label }] : []),
    { label: 'Created', value: stamp(props.bucket.created) },
  ]
})
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <HardDrive class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Storage</h2>
      <MockNotice class="ml-auto" />
    </header>
    <div class="px-5 py-4"><RowList :rows="rows" /></div>
  </section>
</template>
