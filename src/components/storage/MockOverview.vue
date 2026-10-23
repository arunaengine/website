<script setup lang="ts">
// The overview of an example bucket: state, nodes, files and size, from static data.
import { computed } from 'vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import DetailList from '@/components/ui/DetailList.vue'
import StatCard from '@/components/ui/StatCard.vue'
import { presetById, stamp, storedLabel } from '@/lib/distributedMock'
import { degradedRanges, isMulti, type MockBucket } from '@/lib/distributedMockData'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'

const props = defineProps<{ bucket: MockBucket }>()

const files = computed(() => props.bucket.ranges.reduce((sum, range) => sum + range.objects, 0))
const bytes = computed(() => props.bucket.ranges.reduce((sum, range) => sum + range.bytes, 0))
const degraded = computed(() => degradedRanges(props.bucket).length)
const details = computed(() => [
  {
    label: 'Stored on',
    value: isMulti(props.bucket)
      ? `${storedLabel(props.bucket.preset, props.bucket.members.length)}: ${props.bucket.members.map((member) => member.nodeId).join(', ')}`
      : 'This node',
  },
  ...(isMulti(props.bucket) ? [{ label: 'Kept as', value: presetById(props.bucket.preset).label }] : []),
  { label: 'Created', value: stamp(props.bucket.created) },
])
</script>

<template>
  <section class="space-y-4">
    <MockNotice />
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="State" :value="degraded ? 'Degraded' : 'Active'" :hint="degraded ? 'Writes to one range are refused' : undefined" />
      <StatCard label="Nodes" :value="bucket.members.length" />
      <StatCard label="Files" :value="formatCount(files)" />
      <StatCard label="Size" :value="formatBytes(bytes)" />
    </div>
    <DetailList :items="details" />
  </section>
</template>
