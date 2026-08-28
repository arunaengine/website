<script setup lang="ts">
// Everything running for this account, split by where it runs: on this
// computer, or in the realm. The realm half is the portal's own compute
// surface, reused as it is.
import { computed, onMounted } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import NewRunMenu from '@/components/compute/NewRunMenu.vue'
import LocalRunsPanel from '@/components/desktop/LocalRunsPanel.vue'
import JobsPanel from '@/components/jobs/JobsPanel.vue'
import TasksPanel from '@/components/compute/TasksPanel.vue'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useRouteTab } from '@/composables/useRouteTab'
import { featureEnabled } from '@/lib/config'

const route = useRoute()
const router = useRouter()
const { compute, ensureLoaded } = useDeviceCompute()

const tesEnabled = featureEnabled('tes')
const jobsEnabled = featureEnabled('jobs')

// The detail drawer lives on the local tab, so a run deep link opens it there.
const tab = useRouteTab(['local', 'realm'], 'local')

const localHint = computed(() =>
  compute.value?.backend ? `${compute.value.backend} · ${compute.value.running} running` : '',
)
const pageTitle = computed(() =>
  route.name === 'run' ? `Run ${String(route.params.jobId ?? '')}` : 'Runs',
)

onMounted(() => {
  void ensureLoaded()
  // An older ?where=realm link still lands on the realm tab.
  if (route.query.where === 'realm') {
    const query: LocationQuery = { ...route.query, tab: 'realm' }
    delete query.where
    void router.replace({ query })
  }
})
</script>

<template>
  <div>
    <PageHeader eyebrow="This computer" :title="pageTitle" description="Work you started, wherever it is executing.">
      <template #breadcrumbs>
        <Badge v-if="localHint" variant="outline" size="sm">{{ localHint }}</Badge>
      </template>
      <template #actions>
        <NewRunMenu size="sm" />
      </template>
    </PageHeader>

    <div class="container py-5">
      <Tabs v-model="tab">
        <TabsList>
          <TabsTrigger value="local">This computer</TabsTrigger>
          <TabsTrigger value="realm">In the realm</TabsTrigger>
        </TabsList>

        <TabsContent value="local">
          <LocalRunsPanel />
        </TabsContent>

        <TabsContent value="realm">
          <div class="space-y-6">
            <TasksPanel v-if="tesEnabled" />
            <JobsPanel v-if="jobsEnabled" />
            <EmptyState v-if="!tesEnabled && !jobsEnabled" compact title="This realm serves no compute surface." />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>
