<script setup lang="ts">
// Mock page of one distributed bucket: members, key ranges and distribution settings.
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import BucketActions from '@/components/distributed/BucketActions.vue'
import DegradedNotice from '@/components/distributed/DegradedNotice.vue'
import MemberTable from '@/components/distributed/MemberTable.vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import RangeTable from '@/components/distributed/RangeTable.vue'
import Badge from '@/components/ui/Badge.vue'
import DetailList from '@/components/ui/DetailList.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import { useRouteTab } from '@/composables/useRouteTab'
import { presetById, stamp } from '@/lib/distributedMock'
import { degradedRanges, mockBucket } from '@/lib/distributedMockData'
import { formatCount } from '@/lib/formatCount'
import { formatBytes } from '@/lib/utils'
import { MOCK_BASE } from '@/router/distributedMock'

const route = useRoute()
const bucket = computed(() => mockBucket(String(route.params.bucketId ?? '')))
const degraded = computed(() => (bucket.value ? degradedRanges(bucket.value) : []))
const objects = computed(() => bucket.value?.ranges.reduce((sum, range) => sum + range.objects, 0) ?? 0)
const bytes = computed(() => bucket.value?.ranges.reduce((sum, range) => sum + range.bytes, 0) ?? 0)

const viewer = ref('admin')
const VIEWERS = [
  { value: 'admin', label: 'Group admin' },
  { value: 'member', label: 'Group member' },
]

const tab = useRouteTab(['overview', 'settings'], 'overview')

const settings = computed(() => {
  const found = bucket.value
  if (!found) return []
  return [
    { label: 'Preset', value: presetById(found.preset).label },
    { label: 'Check external sources', value: found.refresh },
    { label: 'Range requests', value: found.mode },
    { label: 'Search index', value: found.searchIndex ? 'On' : 'Off' },
    { label: 'Created', value: stamp(found.created) },
    { label: 'Name on every node', value: found.name, mono: true },
  ]
})
</script>

<template>
  <div>
    <PageHeader :title="bucket?.name ?? 'Unknown bucket'" :description="bucket?.description">
      <template #breadcrumbs>
        <span>·</span>
        <RouterLink :to="MOCK_BASE" class="hover:underline">Distributed buckets</RouterLink>
        <template v-if="bucket">
          <Badge v-if="degraded.length" variant="warn" size="sm">Degraded</Badge>
          <Badge v-else variant="success" size="sm">Active</Badge>
        </template>
      </template>
      <template #actions>
        <OptionToggle v-model="viewer" :options="VIEWERS" aria-label="View as" />
      </template>
    </PageHeader>

    <div class="container space-y-5 py-6">
      <MockNotice />
      <EmptyState v-if="!bucket" title="No example bucket with this name" description="The mock knows bakrep, spire-db and reads-edge." />
      <Tabs v-else v-model="tab" class="space-y-5">
        <TabsList aria-label="Distributed bucket sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" class="mt-0 space-y-5">
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Nodes" :value="bucket.members.length" />
            <StatCard label="Ranges" :value="bucket.ranges.length" />
            <StatCard label="Files" :value="formatCount(objects)" hint="Counted on the coordinators" />
            <StatCard label="Size" :value="formatBytes(bytes)" />
          </div>
          <DegradedNotice v-for="range in degraded" :key="range.id" :range="range" />
          <BucketActions :bucket="bucket" :admin="viewer === 'admin'" />
          <section class="space-y-2">
            <h2 class="font-display text-base font-semibold text-aruna-navy">Members</h2>
            <MemberTable :bucket="bucket" />
          </section>
          <section class="space-y-2">
            <h2 class="font-display text-base font-semibold text-aruna-navy">Key ranges</h2>
            <RangeTable :ranges="bucket.ranges" />
          </section>
        </TabsContent>

        <TabsContent value="settings" class="mt-0">
          <DetailList :items="settings" />
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>
