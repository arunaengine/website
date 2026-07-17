<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Progress from '@/components/ui/Progress.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import JobDetailPanel from '@/components/jobs/JobDetailPanel.vue'
import { useJobsList } from '@/composables/useJobs'
import {
  JOB_STATE_META,
  JOB_STATE_ORDER,
  formatJobProgress,
  jobProgressPercent,
  type JobState,
  type JobStatusResponse,
} from '@/lib/jobs'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import { ChevronRight, ListTodo, RefreshCw } from '@lucide/vue'

// System-jobs section of the unified Compute view. Mounted only when the jobs
// feature is enabled and a user is signed in (ComputeView gates both).
const router = useRouter()
const route = useRoute()

// Deep-linkable job drawer driven by the :jobId route param (the back button
// closes it, the task drawer's taskId precedent).
const openJobId = computed(() =>
  route.name === 'job-detail' && route.params.jobId ? String(route.params.jobId) : '',
)
function openJob(job: JobStatusResponse) {
  void router.push({ name: 'job-detail', params: { jobId: job.job_id } })
}
function closeJob() {
  void router.push({ name: 'compute', query: { tab: 'jobs' } })
}

const list = useJobsList()
const {
  jobs,
  listState,
  listError,
  nextCursor,
  refreshing,
  loadingMore,
  moreError,
  lastPollError,
  stateFilter,
} = list

// Radix SelectItem forbids empty-string values, so 'all' is the sentinel.
const stateOptions = [
  { value: 'all', label: 'All' },
  ...JOB_STATE_ORDER.map((s) => ({ value: s, label: JOB_STATE_META[s].label })),
]
const stateModel = computed({
  get: () => stateFilter.value || 'all',
  set: (v: string) => (stateFilter.value = v === 'all' ? '' : (v as JobState)),
})

function reload() {
  void list.load()
}

// Infinite-scroll sentinel (SearchView's cursor pattern).
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
if (typeof IntersectionObserver !== 'undefined') {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void list.loadMore()
    },
    { rootMargin: '200px' },
  )
  watch(sentinel, (el, previous) => {
    if (previous) observer?.unobserve(previous)
    if (el) observer?.observe(el)
  })
}
onUnmounted(() => observer?.disconnect())

onMounted(() => void list.load())
</script>

<template>
  <div class="space-y-4">
    <p class="text-xs text-muted-foreground">
      System jobs are durable background jobs <span class="font-medium text-foreground">the node runs for your account</span> — staging, provenance and maintenance. They cannot be submitted here, only monitored and cancelled.
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <Select v-model="stateModel" :options="stateOptions" label="State" aria-label="Filter jobs by state" class="h-8 w-40 text-xs" />
      <Button variant="ghost" size="sm" :disabled="refreshing" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" :class="refreshing ? 'animate-spin' : ''" /> Refresh
      </Button>
      <span v-if="lastPollError" class="text-[11px] text-muted-foreground">Auto-refresh failed — {{ lastPollError }}</span>
    </div>

    <div v-if="listState === 'loading'" class="surface divide-y divide-border overflow-hidden">
      <div v-for="n in 5" :key="n" class="px-5 py-3"><Skeleton class="h-6 w-full" /></div>
    </div>

    <ErrorPanel v-else-if="listState === 'error'" :message="listError || 'Failed to load jobs.'" @retry="reload" />

    <p
      v-else-if="listState === 'unsupported'"
      class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
    >
      This backend does not serve the durable jobs API yet. Jobs cannot be listed.
    </p>

    <p
      v-else-if="listState === 'forbidden'"
      class="surface px-5 py-8 text-center text-sm text-muted-foreground"
    >
      This token cannot list jobs — path-restricted tokens have no access to the job surface.
    </p>

    <EmptyState
      v-else-if="listState === 'ready' && !jobs.length"
      :title="stateFilter ? 'No jobs in this state' : 'No jobs yet'"
      :description="stateFilter ? 'Try a different state filter.' : 'Background jobs the system runs for your account appear here.'"
    >
      <template #icon><ListTodo class="h-7 w-7" /></template>
    </EmptyState>

    <template v-else-if="jobs.length">
      <div class="surface overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th class="px-5 py-2 text-left font-semibold">Kind</th>
              <th class="px-5 py-2 text-left font-semibold">State</th>
              <th class="px-5 py-2 text-left font-semibold">Progress</th>
              <th class="px-5 py-2 text-left font-semibold">Attempts</th>
              <th class="px-5 py-2 text-left font-semibold">Created</th>
              <th class="px-5 py-2 text-left font-semibold">Updated</th>
              <th class="px-5 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="job in jobs"
              :key="job.job_id"
              class="cursor-pointer border-t border-border hover:bg-muted/40"
              @click="openJob(job)"
            >
              <td class="px-5 py-2.5">
                <button type="button" class="w-full text-left" @click.stop="openJob(job)">
                  <span class="font-medium capitalize text-foreground">{{ job.kind }}</span>
                  <span class="block font-mono text-[11px] text-muted-foreground">{{ truncateMiddle(job.job_id) }}</span>
                </button>
              </td>
              <td class="px-5 py-2.5">
                <div class="flex items-center gap-1.5">
                  <JobStateBadge :state="job.state" />
                  <Badge v-if="job.cancel_requested && !job.finished_at" variant="warn" class="text-[10px]">cancelling</Badge>
                </div>
              </td>
              <td class="px-5 py-2.5">
                <div class="min-w-[8rem] max-w-[14rem] space-y-1">
                  <Progress
                    v-if="jobProgressPercent(job.progress) !== null"
                    :value="jobProgressPercent(job.progress)!"
                    :label="`Job progress: ${formatJobProgress(job.progress)}`"
                    class="h-1.5"
                  />
                  <span class="block text-[11px] text-muted-foreground">{{ formatJobProgress(job.progress) }}</span>
                </div>
              </td>
              <td class="px-5 py-2.5 text-[11px] text-muted-foreground">{{ job.attempts }}</td>
              <td class="px-5 py-2.5 text-[11px] text-muted-foreground" :title="job.created_at">
                {{ relativeTime(job.created_at) }}
              </td>
              <td class="px-5 py-2.5 text-[11px] text-muted-foreground" :title="job.updated_at">
                {{ relativeTime(job.updated_at) }}
              </td>
              <td class="px-5 py-2.5 text-right"><ChevronRight class="ml-auto h-4 w-4 text-muted-foreground" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="loadingMore" class="surface divide-y divide-border overflow-hidden">
        <div v-for="n in 2" :key="n" class="px-5 py-3"><Skeleton class="h-6 w-full" /></div>
      </div>
      <div v-if="moreError" class="flex items-center gap-2 text-xs text-destructive">
        {{ moreError }}
        <Button variant="outline" size="sm" @click="list.loadMore()">Try again</Button>
      </div>
      <!-- IntersectionObserver sentinel (SearchView pattern). -->
      <div v-if="nextCursor && !moreError" ref="sentinel" class="h-1" aria-hidden="true" />
    </template>

    <JobDetailPanel
      v-if="openJobId"
      :job-id="openJobId"
      :open="!!openJobId"
      @update:open="(v) => !v && closeJob()"
      @changed="reload"
    />
  </div>
</template>
