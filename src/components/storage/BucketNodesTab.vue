<script setup lang="ts">
// The nodes a bucket is stored on, who writes which part, and how reads and updates work.
import { computed, ref } from 'vue'
import BucketActions from '@/components/distributed/BucketActions.vue'
import DegradedNotice from '@/components/distributed/DegradedNotice.vue'
import MemberTable from '@/components/distributed/MemberTable.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import RangeTable from '@/components/distributed/RangeTable.vue'
import RowList from '@/components/distributed/RowList.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import StatCard from '@/components/ui/StatCard.vue'
import { presetById, stamp } from '@/lib/distributedMock'
import { degradedRanges, type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ bucket: DistributedBucket }>()

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
])
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center gap-3">
      <MockNotice />
      <OptionToggle v-model="viewer" :options="VIEWERS" aria-label="View as" class="ml-auto" />
    </div>
    <div class="grid gap-3 sm:grid-cols-3">
      <StatCard label="State" :value="degraded.length ? 'Degraded' : 'Active'" />
      <StatCard label="Nodes" :value="bucket.members.length" />
      <StatCard label="Ranges" :value="bucket.ranges.length" />
    </div>
    <DegradedNotice v-for="range in degraded" :key="range.id" :range="range" />
    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Nodes</h2>
        <StorageFeatureLink icon question="nodes" />
      </header>
      <div class="space-y-3 p-5">
        <MemberTable :bucket="bucket" />
        <BucketActions :bucket="bucket" :admin="viewer === 'admin'" />
      </div>
    </section>
    <section class="surface">
      <header class="border-b border-border px-5 py-4">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Ranges</h2>
      </header>
      <div class="p-5"><RangeTable :ranges="bucket.ranges" /></div>
    </section>
    <section class="surface">
      <header class="border-b border-border px-5 py-4">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Reads and updates</h2>
      </header>
      <div class="px-5 py-4"><RowList :rows="settings" /></div>
    </section>
  </div>
</template>
