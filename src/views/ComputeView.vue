<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ComputeGates from '@/components/compute/ComputeGates.vue'
import NewRunMenu from '@/components/compute/NewRunMenu.vue'
import TasksPanel from '@/components/compute/TasksPanel.vue'
import JobsPanel from '@/components/jobs/JobsPanel.vue'
import { useTes } from '@/composables/useTes'
import { useJobs } from '@/composables/useJobs'
import { useAruna } from '@/composables/useAruna'

// One surface for both compute planes: the runs people start and the system
// jobs the node produces. Each half degrades on its own feature flag.
const router = useRouter()
const route = useRoute()
const { tesEnabled } = useTes()
const { jobsEnabled } = useJobs()
const { currentUser } = useAruna()

const anyEnabled = computed(() => tesEnabled.value || jobsEnabled.value)
const bothEnabled = computed(() => tesEnabled.value && jobsEnabled.value)

// System job routes and ?tab=jobs select System jobs.
const tab = computed(() => {
  if (!tesEnabled.value) return 'jobs'
  if (!jobsEnabled.value) return 'tasks'
  return route.name === 'job' || route.query.tab === 'jobs' ? 'jobs' : 'tasks'
})
const pageTitle = computed(() => {
  if (route.name === 'job') return `System job ${String(route.params.jobId ?? '')}`
  if (route.name === 'task') return `Run ${String(route.params.taskId ?? '')}`
  return 'Compute'
})
function setTab(next: string) {
  void router.replace({ name: 'compute', query: next === 'jobs' ? { tab: 'jobs' } : {} })
}
</script>

<template>
  <div>
    <PageHeader :title="pageTitle" description="The runs you start on this node, and the system jobs it produces.">
      <!-- One Run entry point; the menu explains the two ways to start one. -->
      <template v-if="tesEnabled && currentUser" #actions>
        <NewRunMenu size="sm" />
      </template>
    </PageHeader>

    <ComputeGates
      :enabled="anyEnabled"
      disabled-description="Enable features.tes or features.jobs in portal-config.json to activate this surface."
      sign-in-title="Sign in to use compute"
      sign-in-description="Runs and system jobs are scoped to your account."
      :redirect-to="route.fullPath"
    >
      <div class="container py-8">
        <Tabs v-if="bothEnabled" :model-value="tab" @update:model-value="setTab">
          <TabsList>
            <TabsTrigger value="tasks">Runs</TabsTrigger>
            <TabsTrigger value="jobs">System jobs</TabsTrigger>
          </TabsList>
          <TabsContent value="tasks" class="mt-4"><TasksPanel /></TabsContent>
          <TabsContent value="jobs" class="mt-4"><JobsPanel /></TabsContent>
        </Tabs>
        <TasksPanel v-else-if="tesEnabled" />
        <JobsPanel v-else />
      </div>
    </ComputeGates>
  </div>
</template>
