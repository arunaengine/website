<script setup lang="ts">
// The nodes a bucket is stored on, who writes which part, and how reads and updates work.
import { computed, ref } from 'vue'
import AdmissionRetry from '@/components/distributed/AdmissionRetry.vue'
import BucketActions from '@/components/distributed/BucketActions.vue'
import DegradedNotice from '@/components/distributed/DegradedNotice.vue'
import DeletionNotice from '@/components/distributed/DeletionNotice.vue'
import TransferStatus from '@/components/distributed/TransferStatus.vue'
import MemberTable from '@/components/distributed/MemberTable.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import RangeTable from '@/components/distributed/RangeTable.vue'
import RowList from '@/components/distributed/RowList.vue'
import StorageFeatureLink from '@/components/distributed/StorageFeatureLink.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import StatCard from '@/components/ui/StatCard.vue'
import { presetById, stamp } from '@/lib/distributedMock'
import { degradedRanges, isDeleting, openTransfers, type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ bucket: DistributedBucket; admin?: boolean; busy?: boolean }>()
const emit = defineEmits<{ (e: 'reload'): void }>()

// The example data can be viewed as a group admin or as a member.
const viewer = ref('admin')
const VIEWERS = [
  { value: 'admin', label: 'Group admin' },
  { value: 'member', label: 'Group member' },
]

const NOTICED = 3
const degraded = computed(() => degradedRanges(props.bucket))
// A node that does not report a setting leaves its row out.
const settings = computed(() => {
  const { refresh, mode, searchIndex, created, preset } = props.bucket
  return [
    { label: 'Kept as', value: presetById(preset).label },
    ...(refresh ? [{ label: 'Check external sources', value: refresh }] : []),
    ...(mode ? [{ label: 'Range requests', value: mode }] : []),
    ...(searchIndex === undefined ? [] : [{ label: 'Search index', value: searchIndex ? 'On' : 'Off' }]),
    ...(created ? [{ label: 'Created', value: stamp(created) }] : []),
  ]
})
const transfers = computed(() => openTransfers(props.bucket))
// A pending bucket, or an active one with a member that is not admitted, can retry the admission.
const unadmitted = computed(() => Boolean(props.bucket.live?.pending || props.bucket.members.some((member) => member.admitted === false)))
const state = computed(() => (isDeleting(props.bucket) ? 'Deleting' : props.bucket.live?.pending ? 'Pending' : degraded.value.length ? 'Degraded' : 'Active'))
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center gap-3">
      <template v-if="bucket.live">
        <RefreshButton :busy="Boolean(busy)" class="ml-auto" @click="emit('reload')" />
      </template>
      <template v-else>
        <MockNotice />
        <OptionToggle v-model="viewer" :options="VIEWERS" aria-label="View as" class="ml-auto" />
      </template>
    </div>
    <div class="grid gap-3 sm:grid-cols-3">
      <StatCard label="State" :value="state" />
      <StatCard label="Nodes" :value="bucket.members.length" />
      <StatCard label="Ranges" :value="bucket.ranges.length" />
    </div>
    <DeletionNotice v-if="bucket.live?.deletion" :deletion="bucket.live.deletion" />
    <Notice v-if="bucket.live?.conflicted" tone="error" title="Configuration changes are stopped">
      The node that publishes the configuration signed two different versions. Data service continues.
    </Notice>
    <Notice v-else-if="bucket.live?.changesUnavailable" tone="warning" title="Configuration changes wait">
      The node that publishes the configuration cannot be reached. Reads and writes continue.
    </Notice>
    <AdmissionRetry v-if="bucket.live && unadmitted && admin" :live="bucket.live" @done="emit('reload')" />
    <TransferStatus v-if="transfers.length" :bucket="bucket" :transfers="transfers" />
    <DegradedNotice v-for="range in degraded.slice(0, NOTICED)" :key="range.id" :range="range" />
    <p v-if="degraded.length > NOTICED" class="text-xs text-muted-foreground">
      {{ degraded.length - NOTICED }} more ranges are degraded.
    </p>
    <section class="surface">
      <header class="flex items-center gap-2 border-b border-border px-5 py-4">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Nodes</h2>
        <StorageFeatureLink icon question="nodes" />
      </header>
      <div class="space-y-3 p-5">
        <MemberTable :bucket="bucket" />
        <BucketActions :bucket="bucket" :admin="bucket.live ? Boolean(admin) : viewer === 'admin'" @changed="emit('reload')" />
      </div>
    </section>
    <section class="surface">
      <header class="border-b border-border px-5 py-4">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Ranges</h2>
      </header>
      <div class="p-5"><RangeTable :ranges="bucket.ranges" /></div>
    </section>
    <section v-if="settings.length > 1" class="surface">
      <header class="border-b border-border px-5 py-4">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Reads and updates</h2>
      </header>
      <div class="px-5 py-4"><RowList :rows="settings" /></div>
    </section>
  </div>
</template>
