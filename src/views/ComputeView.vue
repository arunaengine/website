<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ComputeGates from '@/components/compute/ComputeGates.vue'
import ComputeNewMenu from '@/components/compute/ComputeNewMenu.vue'
import RunTemplatesPanel from '@/components/compute/RunTemplatesPanel.vue'
import NotebooksPanel from '@/components/notebook/NotebooksPanel.vue'
import { usePortalFeatures } from '@/composables/usePortalFeatures'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import TasksPanel from '@/components/compute/TasksPanel.vue'
import JobsPanel from '@/components/jobs/JobsPanel.vue'
import { useTes } from '@/composables/useTes'
import { useJobs } from '@/composables/useJobs'
import { useAruna } from '@/composables/useAruna'
import { useRefresh } from '@/composables/useRefresh'
import { providePageContext } from '@/composables/usePageContext'
import type { PageContext } from '@/lib/assistant/prompt'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { isDesktop } from '@/lib/desktop'
import { NotebookPen, Settings, Star, Workflow } from '@lucide/vue'

// The desktop shows whether this computer runs jobs; the web never loads it.
const LocalCompute = defineAsyncComponent({
  loader: () => import('@/components/desktop/LocalCompute.vue'),
  onError: asyncChunkError,
})
const desktop = isDesktop()

// One surface for both compute planes: the runs people start and the system
// jobs the node produces. Each half degrades on its own feature flag.
const router = useRouter()
const route = useRoute()
const { tesEnabled } = useTes()
const { jobsEnabled } = useJobs()
const { currentUser } = useAruna()

// One refresh in the header reads the shown list again.
const revision = ref(0)
const { busy: refreshBusy, refresh: onRefresh } = useRefresh(async () => {
  revision.value++
})

const anyEnabled = computed(() => tesEnabled.value || jobsEnabled.value)

// Runs, Notebooks, Run templates and System jobs are tabs in ?tab=; job routes select System jobs.
const TABS = ['runs', 'notebooks', 'templates', 'jobs'] as const
const { shown } = usePortalFeatures()
const notebooksShown = computed(() => tesEnabled.value && shown('notebooks'))
const tab = computed(() => {
  if (!tesEnabled.value) return 'jobs'
  if (route.name === 'job') return jobsEnabled.value ? 'jobs' : 'runs'
  if (route.name === 'task') return 'runs'
  const asked = TABS.find((entry) => entry === route.query.tab)
  if ((asked === 'jobs' && !jobsEnabled.value) || (asked === 'notebooks' && !notebooksShown.value)) return 'runs'
  return asked ?? 'runs'
})
const pageTitle = computed(() => {
  if (route.name === 'job') return `System job ${String(route.params.jobId ?? '')}`
  return 'Compute'
})
// The open run or system job, so "this run" needs no lookup.
providePageContext((): PageContext => {
  if (route.name === 'task') return { kind: 'run', title: '', details: { 'job id': String(route.params.taskId ?? '') } }
  if (route.name === 'job') return { kind: 'system job', title: '', details: { 'job id': String(route.params.jobId ?? '') } }
  return { kind: 'compute page', title: '', details: { tab: tab.value } }
})
// ?new=1 on the Notebooks tab starts a new notebook once.
const startNew = computed(() => tab.value === 'notebooks' && route.query.new === '1')
function newStarted() {
  void router.replace({ name: 'compute', query: { tab: 'notebooks' } })
}
function setTab(next: string) {
  void router.replace({ name: 'compute', query: next === 'runs' ? {} : { tab: next } })
}
</script>

<template>
  <div>
    <PageHeader :title="pageTitle" :docs="{ topic: 'compute-run', section: 'Follow the run' }">
      <!-- One New menu: a run, a run template or a notebook. -->
      <template v-if="currentUser && anyEnabled" #actions>
        <RefreshButton :busy="refreshBusy" @click="onRefresh" />
        <ComputeNewMenu v-if="tesEnabled" :notebooks="notebooksShown" />
      </template>
    </PageHeader>

    <ComputeGates
      :enabled="anyEnabled"
      disabled-description="Enable features.tes or features.jobs in portal-config.json to activate this surface."
      sign-in-title="Sign in to use compute"
      sign-in-description="Runs and system jobs are scoped to your account."
      :redirect-to="route.fullPath"
    >
      <div class="w-full px-4 py-6 sm:px-6">
        <LocalCompute v-if="desktop" class="mb-5" />
        <Tabs v-if="tesEnabled" :model-value="tab" @update:model-value="setTab">
          <TabsList>
            <TabsTrigger value="runs"><Workflow class="size-4" aria-hidden="true" />Runs</TabsTrigger>
            <TabsTrigger v-if="notebooksShown" value="notebooks"><NotebookPen class="size-4" aria-hidden="true" />Notebooks</TabsTrigger>
            <TabsTrigger value="templates"><Star class="size-4" aria-hidden="true" />Run templates</TabsTrigger>
            <TabsTrigger v-if="jobsEnabled" value="jobs"><Settings class="size-4" aria-hidden="true" />System jobs</TabsTrigger>
          </TabsList>
          <TabsContent value="runs" class="mt-6"><TasksPanel :refresh-revision="revision" /></TabsContent>
          <TabsContent v-if="notebooksShown" value="notebooks" class="mt-6">
            <NotebooksPanel :refresh-revision="revision" :start-new="startNew" @started="newStarted" />
          </TabsContent>
          <TabsContent value="templates" class="mt-6"><RunTemplatesPanel /></TabsContent>
          <TabsContent v-if="jobsEnabled" value="jobs" class="mt-6"><JobsPanel :refresh-revision="revision" /></TabsContent>
        </Tabs>
        <JobsPanel v-else :refresh-revision="revision" />
      </div>
    </ComputeGates>
  </div>
</template>
