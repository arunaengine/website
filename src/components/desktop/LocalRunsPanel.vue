<script setup lang="ts">
// Runs this machine executed itself. Both the list and the detail drawer talk
// to the node's own API, so the job client is provided down this subtree.
import { computed, onMounted, provide, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Progress from '@/components/ui/Progress.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import JobDetailPanel from '@/components/jobs/JobDetailPanel.vue'
import { JOB_CLIENT, useJobsList } from '@/composables/useJobs'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { formatJobProgress, jobProgressPercent, type JobStatusResponse } from '@/lib/jobs'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import { Cpu, RefreshCw } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { deviceClient } = useDeviceStatus()
const { compute, ensureLoaded } = useDeviceCompute()

// Never falls back to the realm base: without a device client nothing loads.
const jobClient = () => ({
  baseUrl: deviceClient.value?.baseUrl ?? '',
  token: deviceClient.value?.token ?? '',
})
provide(JOB_CLIENT, jobClient)

const list = useJobsList({ client: jobClient, pageSize: 25 })
const { jobs, listState, listError, refreshing, nextCursor } = list

const reachable = computed(() => deviceClient.value !== null)

const openJobId = computed(() =>
  route.name === 'run-detail' && route.params.jobId ? String(route.params.jobId) : '',
)
function openJob(job: JobStatusResponse): void {
  void router.push({ name: 'run-detail', params: { jobId: job.job_id } })
}
function closeJob(): void {
  void router.push({ name: 'runs' })
}

function reload(): void {
  if (reachable.value) void list.load()
}

onMounted(() => {
  void ensureLoaded()
  reload()
})
watch(reachable, (now) => now && reload())
</script>

<template>
  <div class="space-y-4">
    <p class="text-xs text-muted-foreground">
      Jobs this computer ran itself, against data it already holds. They never leave the machine, and the realm is not
      told about them.
    </p>

    <div v-if="!reachable" class="surface px-5 py-10 text-center">
      <p class="text-sm font-medium text-foreground">This device's node is not running.</p>
      <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Local runs are listed by the node on this machine. Start it under This device.
      </p>
      <RouterLink :to="{ name: 'device' }" class="mt-4 inline-flex">
        <Button variant="outline" size="sm">Open This device</Button>
      </RouterLink>
    </div>

    <template v-else>
      <p
        v-if="compute && !compute.enabled"
        class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
      >
        Running jobs on this computer is switched off. Turn it on under This device to use it.
      </p>

      <div v-if="listState === 'idle' || listState === 'loading'" class="space-y-2">
        <Skeleton v-for="n in 3" :key="n" class="h-12" />
      </div>

      <ErrorPanel
        v-else-if="listState === 'error'"
        :message="listError || 'The local runs could not be listed.'"
        @retry="reload"
      />

      <p
        v-else-if="listState === 'unsupported'"
        class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
      >
        This node version does not serve a job list yet, so local runs cannot be shown.
      </p>

      <EmptyState
        v-else-if="!jobs.length"
        title="Nothing has run here yet"
        description="Submit a task and pick This computer as the place to run it."
      >
        <template #icon><Cpu class="h-6 w-6" /></template>
        <RouterLink :to="{ name: 'compute-new' }"><Button size="sm">New task</Button></RouterLink>
      </EmptyState>

      <div v-else class="surface overflow-hidden">
        <div class="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
          <span class="text-[11px] text-muted-foreground">{{ jobs.length }} on this computer</span>
          <Button variant="ghost" size="icon-sm" :disabled="refreshing" aria-label="Refresh local runs" @click="reload">
            <RefreshCw class="h-3.5 w-3.5" :class="refreshing ? 'animate-spin' : ''" />
          </Button>
        </div>
        <ul class="divide-y divide-border">
          <li v-for="job in jobs" :key="job.job_id">
            <button type="button" class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40" @click="openJob(job)">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[13px] font-medium capitalize text-foreground">{{ job.kind }}</span>
                  <JobStateBadge :state="job.state" />
                  <Badge v-if="job.cancel_requested && !job.finished_at" variant="warn" class="text-[10px]">cancelling</Badge>
                </div>
                <span class="mt-0.5 block font-mono text-[10px] text-muted-foreground">{{ truncateMiddle(job.job_id) }}</span>
              </div>
              <div class="hidden w-40 shrink-0 sm:block">
                <Progress
                  v-if="jobProgressPercent(job.progress) !== null"
                  :value="jobProgressPercent(job.progress)!"
                  :label="`Run progress: ${formatJobProgress(job.progress)}`"
                  class="h-1.5"
                />
                <span class="mt-1 block text-[10px] text-muted-foreground">{{ formatJobProgress(job.progress) }}</span>
              </div>
              <span class="shrink-0 text-[11px] text-muted-foreground" :title="job.created_at">{{
                relativeTime(job.created_at)
              }}</span>
            </button>
          </li>
        </ul>
        <div v-if="nextCursor" class="border-t border-border px-4 py-2 text-center">
          <Button variant="ghost" size="sm" @click="list.loadMore()">Load more</Button>
        </div>
      </div>
    </template>

    <JobDetailPanel
      v-if="openJobId"
      :job-id="openJobId"
      :open="!!openJobId"
      @update:open="(v: boolean) => !v && closeJob()"
      @changed="reload"
    />
  </div>
</template>
