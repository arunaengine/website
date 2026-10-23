<script setup lang="ts">
// The nodes a bucket is stored on, who writes which part, and how reads and updates work.
import { computed, ref } from 'vue'
import BucketActions from '@/components/distributed/BucketActions.vue'
import DegradedNotice from '@/components/distributed/DegradedNotice.vue'
import MemberTable from '@/components/distributed/MemberTable.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import RangeTable from '@/components/distributed/RangeTable.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import DetailList from '@/components/ui/DetailList.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import { presetById, stamp } from '@/lib/distributedMock'
import { degradedRanges, type MockBucket } from '@/lib/distributedMockData'

const props = defineProps<{ bucket: MockBucket }>()

// The example data can be viewed as a group admin or as a member.
const viewer = ref('admin')
const VIEWERS = [
  { value: 'admin', label: 'Group admin' },
  { value: 'member', label: 'Group member' },
]

const degraded = computed(() => degradedRanges(props.bucket))
const settings = computed(() => [
  { label: 'Kept as', value: presetById(props.bucket.preset).label },
  { label: 'Check external sources', value: props.bucket.refresh },
  { label: 'Range requests', value: props.bucket.mode },
  { label: 'Search index', value: props.bucket.searchIndex ? 'On' : 'Off' },
  { label: 'Created', value: stamp(props.bucket.created) },
  { label: 'Name on every node', value: props.bucket.name, mono: true },
])
</script>

<template>
  <div class="space-y-5">
    <MockNotice />
    <OptionToggle v-model="viewer" :options="VIEWERS" aria-label="View as" />
    <DegradedNotice v-for="range in degraded" :key="range.id" :range="range" />
    <section class="space-y-2">
      <div class="flex items-center gap-2">
        <h2 class="font-display text-base font-semibold text-aruna-navy">Nodes</h2>
        <StorageFeatureLink icon question="nodes" />
      </div>
      <MemberTable :bucket="bucket" />
      <BucketActions :bucket="bucket" :admin="viewer === 'admin'" />
    </section>
    <section class="space-y-2">
      <h2 class="font-display text-base font-semibold text-aruna-navy">Ranges</h2>
      <p class="text-xs text-muted-foreground">A range is a part of the bucket. One node writes each range, and other nodes keep copies.</p>
      <RangeTable :ranges="bucket.ranges" />
    </section>
    <section class="space-y-2">
      <h2 class="font-display text-base font-semibold text-aruna-navy">Reads and updates</h2>
      <DetailList :items="settings" />
    </section>
  </div>
</template>
