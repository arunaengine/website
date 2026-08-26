<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TasksPanel from '@/components/compute/TasksPanel.vue'
import JobsPanel from '@/components/jobs/JobsPanel.vue'
import { useTes } from '@/composables/useTes'
import { useJobs } from '@/composables/useJobs'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { ChevronDown, Cpu, ListPlus, LogIn, Play, Zap } from '@lucide/vue'

// One surface for both compute planes: TES tasks (user-submitted) and durable
// system jobs (node-produced). Each half degrades on its own feature flag.
const router = useRouter()
const route = useRoute()
const { tesEnabled } = useTes()
const { jobsEnabled } = useJobs()
const { currentUser } = useAruna()
const { signIn, stage, authPending } = useAuth()

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
      <!-- One Run entry point; the menu explains the two submission modes. -->
      <template v-if="tesEnabled && currentUser" #actions>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="sm"><Play class="h-4 w-4" /> Run <ChevronDown class="h-3.5 w-3.5 opacity-70" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-80 p-1.5">
            <DropdownMenuItem class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5" @click="goQuick">
              <Zap class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-foreground">Quick run</span>
                <span class="block text-xs leading-relaxed text-muted-foreground">Write a short script, the portal stages it and builds the TES task for you.</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5" @click="goNew">
              <ListPlus class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-foreground">New task</span>
                <span class="block text-xs leading-relaxed text-muted-foreground">Describe a full GA4GH TES task by hand, image, command, resources.</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </PageHeader>

    <!-- Gate 1: both features disabled; no API call is ever issued here. -->
    <div v-if="!anyEnabled" class="container py-8">
      <EmptyState
        title="Compute is not enabled"
        description="Enable features.tes (GA4GH TES tasks) or features.jobs (durable background jobs) in portal-config.json to activate this surface."
      >
        <template #icon><Cpu class="h-7 w-7" /></template>
      </EmptyState>
    </div>

    <!-- Session restore in flight: a stored token exists but the user profile
         has not resolved yet, never flash the signed-out gate. -->
    <div v-else-if="authPending" class="container py-8">
      <section class="surface mx-auto max-w-xl space-y-3 p-8">
        <Skeleton class="mx-auto h-8 w-8 rounded-full" />
        <Skeleton class="mx-auto h-4 w-44" />
        <Skeleton class="mx-auto h-3 w-64" />
      </section>
    </div>

    <!-- Gate 2: not signed in; tasks and jobs are scoped to the account. -->
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
