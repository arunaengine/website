<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import TasksPanel from '@/components/compute/TasksPanel.vue'
import JobsPanel from '@/components/jobs/JobsPanel.vue'
import { useTes } from '@/composables/useTes'
import { useJobs } from '@/composables/useJobs'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { Cpu, ListPlus, LogIn, Zap } from '@lucide/vue'

// One surface for both compute planes: TES tasks (user-submitted) and durable
// system jobs (node-produced). Each half degrades on its own feature flag.
const router = useRouter()
const route = useRoute()
const { tesEnabled } = useTes()
const { jobsEnabled } = useJobs()
const { currentUser } = useAruna()
const { signIn, stage } = useAuth()

const anyEnabled = computed(() => tesEnabled.value || jobsEnabled.value)
const bothEnabled = computed(() => tesEnabled.value && jobsEnabled.value)

// Tab from the route: /app/compute/jobs/:jobId and ?tab=jobs select System jobs.
const tab = computed(() => {
  if (!tesEnabled.value) return 'jobs'
  if (!jobsEnabled.value) return 'tasks'
  return route.name === 'job-detail' || route.query.tab === 'jobs' ? 'jobs' : 'tasks'
})
function setTab(next: string) {
  void router.replace({ name: 'compute', query: next === 'jobs' ? { tab: 'jobs' } : {} })
}

function goNew() {
  void router.push({ name: 'compute-new' })
}
function goQuick() {
  void router.push({ name: 'compute-quick' })
}

const signingIn = computed(() => stage.value === 'redirecting')
function startSignIn() {
  void signIn({ redirectTo: route.fullPath })
}
</script>

<template>
  <div>
    <PageHeader title="Compute" description="Run tasks on this node and monitor the background jobs it produces.">
      <template v-if="tesEnabled && currentUser" #actions>
        <Button size="sm" @click="goQuick"><Zap class="h-4 w-4" /> Quick run</Button>
        <Button variant="outline" size="sm" @click="goNew"><ListPlus class="h-4 w-4" /> New task</Button>
      </template>
    </PageHeader>

    <!-- Gate 1: both features disabled — no API call is ever issued here. -->
    <div v-if="!anyEnabled" class="container py-8">
      <EmptyState
        title="Compute is not enabled"
        description="Enable features.tes (GA4GH TES tasks) or features.jobs (durable background jobs) in portal-config.json to activate this surface."
      >
        <template #icon><Cpu class="h-7 w-7" /></template>
      </EmptyState>
    </div>

    <!-- Gate 2: not signed in — tasks and jobs are scoped to the account. -->
    <div v-else-if="!currentUser" class="container py-8">
      <section class="surface mx-auto max-w-xl p-8 text-center">
        <Cpu class="mx-auto h-8 w-8 text-muted-foreground/70" />
        <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">Sign in to use compute</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">Task submission and job monitoring are scoped to your account.</p>
        <Button class="mt-4" size="sm" :disabled="signingIn" @click="startSignIn">
          <LogIn class="h-3.5 w-3.5" /> Sign in
        </Button>
      </section>
    </div>

    <div v-else class="container py-8">
      <Tabs v-if="bothEnabled" :model-value="tab" @update:model-value="setTab">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="jobs">System jobs</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" class="mt-4"><TasksPanel /></TabsContent>
        <TabsContent value="jobs" class="mt-4"><JobsPanel /></TabsContent>
      </Tabs>
      <TasksPanel v-else-if="tesEnabled" />
      <JobsPanel v-else />
    </div>
  </div>
</template>
