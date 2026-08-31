<script setup lang="ts">
// Runs this computer executed itself. Both the list and the detail drawer talk
// to the node's own API, so the job client is provided down this subtree.
import { computed, onMounted, provide, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import ListShell from '@/components/ui/ListShell.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import Spinner from '@/components/ui/Spinner.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import JobDetailPanel from '@/components/jobs/JobDetailPanel.vue'
import NewRunMenu from '@/components/compute/NewRunMenu.vue'
import DeviceSurfaceState from '@/components/desktop/DeviceSurfaceState.vue'
import { JOB_CLIENT, useJobsList } from '@/composables/useJobs'
import { useDeviceCompute } from '@/composables/useDeviceCompute'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useRefresh } from '@/composables/useRefresh'
import { requireDevice } from '@/lib/deviceApi'
import { formatJobProgress, jobKindLabel, jobProgressPercent, type JobStatusResponse } from '@/lib/jobs'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import { Cpu } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { deviceClient } = useDeviceStatus()
const { compute, ensureLoaded } = useDeviceCompute()

// Refuses rather than falling back: an empty base would list the realm's jobs
// as if they had run here.
const jobClient = () => requireDevice(deviceClient.value, 'its runs')
provide(JOB_CLIENT, jobClient)

const reachable = computed(() => deviceClient.value !== null)
const list = useJobsList({ client: jobClient, pageSize: 25, pollWhile: () => reachable.value })
const { jobs, listState, listError, refreshing, loadingMore, nextCursor } = list

const openJobId = computed(() =>
  route.name === 'run' && route.params.jobId ? String(route.params.jobId) : '',
)
function openJob(job: JobStatusResponse): void {
  void router.push({ name: 'run', params: { jobId: job.job_id } })
}
function closeJob(): void {
  void router.push({ name: 'runs' })
}

function reload(): void {
  if (reachable.value) void list.load()
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(reload)
const spinning = computed(() => reloadBusy.value || refreshing.value)

// The states the shared list shell models; the rest are answered above it.
const shellState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
  if (listState.value === 'error') return 'error'
  if (listState.value === 'idle' || listState.value === 'loading') return 'loading'
  return jobs.value.length ? 'ready' : 'empty'
})

onMounted(() => {
  void ensureLoaded()
  reload()
})
watch(reachable, (now) => now && reload())
</script>

<template>
  <div class="space-y-4">
    <p class="text-xs text-muted-foreground">
      Runs this computer executed itself, against data it already holds. They never leave this computer, and the realm
      is not told about them.
    </p>

    <DeviceSurfaceState v-if="!reachable" state="offline" subject="its runs" />

    <template v-else>
      <Notice v-if="compute && !compute.enabled" tone="warning">
        Running work on this computer is switched off. Turn it on under This device to use it.
      </Notice>

      <Notice v-if="listState === 'unsupported'" tone="warning">
        This node version does not list runs yet, so the runs on this computer cannot be shown.
      </Notice>

      <ListShell
        v-else
        :state="shellState"
        :error="listError || 'The runs on this computer could not be listed.'"
        :rows="3"
        empty-title="Nothing has run here yet"
        empty-description="Start a run and pick This computer as the place to run it."
        @retry="reload"
      >
        <template #icon><Cpu class="h-6 w-6" /></template>
        <template #empty-actions><NewRunMenu size="sm" /></template>
        <template #filters>
          <span class="text-[11px] text-muted-foreground">{{ jobs.length }} on this computer</span>
        </template>
        <template #tools>
          <RefreshButton :busy="spinning" sr-label="Refresh the runs on this computer" @click="onReload" />
        </template>

        <ul class="divide-y divide-border">
          <li v-for="job in jobs" :key="job.job_id">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              @click="openJob(job)"
            >
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[13px] font-medium text-foreground">{{ jobKindLabel(job.kind) }}</span>
                  <JobStateBadge :state="job.state" />
                  <Badge v-if="job.cancel_requested && !job.finished_at" variant="warn" size="sm">cancelling</Badge>
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

        <template v-if="nextCursor" #footer>
          <Button variant="ghost" size="sm" :disabled="loadingMore" :aria-busy="loadingMore" @click="list.loadMore()">
            <Spinner v-if="loadingMore" label="Loading more local runs" class="text-current" /> Load more
          </Button>
        </template>
      </ListShell>
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
