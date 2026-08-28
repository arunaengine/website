<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Badge from '@/components/ui/Badge.vue'
import FilterChips from '@/components/ui/FilterChips.vue'
import ListShell from '@/components/ui/ListShell.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Progress from '@/components/ui/Progress.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import JobDetailPanel from '@/components/jobs/JobDetailPanel.vue'
import { useJobsList } from '@/composables/useJobs'
import { useRefresh } from '@/composables/useRefresh'
import {
  formatJobProgress,
  jobKindLabel,
  jobProgressPercent,
  type JobState,
  type JobStatusResponse,
} from '@/lib/jobs'
import { relativeTime, truncateMiddle } from '@/lib/utils'
import { ChevronRight, ListTodo } from '@lucide/vue'

// System-jobs section of the unified Compute view. ComputeView gates the
// feature flag and sign-in, but useJobsList tracks the session itself so a late
// or lost login never strands the list in its pre-fetch state.
const router = useRouter()
const route = useRoute()

// Deep-linkable detail drawer driven by the :jobId route param, so the back
// button closes it.
const openJobId = computed(() =>
  route.name === 'job' && route.params.jobId ? String(route.params.jobId) : '',
)
function openJob(job: JobStatusResponse) {
  void router.push({ name: 'job', params: { jobId: job.job_id } })
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
} = list

// Grouped state chips over the loaded list (the tasks-panel treatment).
type StateGroup = 'all' | 'active' | 'done' | 'failed' | 'cancelled'
const GROUP_STATES: Record<Exclude<StateGroup, 'all'>, JobState[]> = {
  active: ['queued', 'claimed', 'preparing', 'ready', 'running', 'cancelling'],
  done: ['succeeded'],
  failed: ['failed', 'indeterminate'],
  cancelled: ['cancelled'],
}
const GROUP_LABELS: Record<Exclude<StateGroup, 'all'>, string> = {
  active: 'Active',
  done: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
}
const stateGroup = ref<StateGroup>('all')

function inGroup(job: JobStatusResponse, group: Exclude<StateGroup, 'all'>): boolean {
  return GROUP_STATES[group].includes(job.state)
}
const visibleJobs = computed(() => {
  const group = stateGroup.value
  return group === 'all' ? jobs.value : jobs.value.filter((job) => inGroup(job, group))
})
const emptyGroupLabel = computed(() => {
  const group = stateGroup.value
  return group === 'all' ? '' : `${GROUP_LABELS[group].toLowerCase()} `
})
const chipOptions = computed(() => [
  { value: 'all', label: 'All', count: jobs.value.length },
  ...(Object.keys(GROUP_LABELS) as Array<Exclude<StateGroup, 'all'>>).map((group) => ({
    value: group,
    label: GROUP_LABELS[group],
    count: jobs.value.filter((job) => inGroup(job, group)).length,
  })),
])

function reload() {
  void list.load()
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(reload)
const spinning = computed(() => reloadBusy.value || refreshing.value)

// The states the shared list shell models; the rest are answered above it.
const shellState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
  if (listState.value === 'error') return 'error'
  if (listState.value === 'idle' || listState.value === 'loading') return 'loading'
  return jobs.value.length ? 'ready' : 'empty'
})

onMounted(() => void list.load())
</script>

<template>
  <div class="space-y-4">
    <p class="text-xs text-muted-foreground">
      System jobs are the background work <span class="font-medium text-foreground">a node runs for your account</span>, staging, provenance and maintenance. You cannot start one here, only follow it or cancel it.
    </p>

    <Notice v-if="listState === 'unsupported'" tone="warning">
      This node does not serve system jobs yet, so none can be listed.
    </Notice>

    <EmptyState
      v-else-if="listState === 'forbidden'"
      compact
      title="This token cannot list system jobs, path-restricted tokens have no access to them."
    />

    <EmptyState
      v-else-if="listState === 'signed-out'"
      compact
      title="Sign in to see the system jobs a node runs for your account."
    />

    <ListShell
      v-else
      :state="shellState"
      :error="listError || 'The system jobs could not be listed.'"
      empty-title="No system jobs yet"
      empty-description="Background work a node runs for your account appears here."
      @retry="reload"
    >
      <template #icon><ListTodo class="h-7 w-7" /></template>
      <template #filters>
        <FilterChips v-model="stateGroup" :options="chipOptions" aria-label="Filter system jobs by state" />
      </template>
      <template #tools>
        <span v-if="lastPollError" class="text-[11px] text-muted-foreground">Auto-refresh failed: {{ lastPollError }}</span>
        <RefreshButton :busy="spinning" sr-label="Refresh system jobs" @click="onReload" />
      </template>

      <EmptyState
        v-if="!visibleJobs.length"
        compact
        class="rounded-none border-0 shadow-none"
        :title="`No ${emptyGroupLabel}system jobs in the loaded list.`"
      />

      <table v-else class="w-full text-sm">
        <thead class="bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th class="px-5 py-2 text-left font-semibold">Kind</th>
            <th class="px-5 py-2 text-left font-semibold">State</th>
            <th class="px-5 py-2 text-left font-semibold">Progress</th>
            <th class="hidden px-5 py-2 text-left font-semibold sm:table-cell">Attempts</th>
            <th class="px-5 py-2 text-left font-semibold">Created</th>
            <th class="hidden px-5 py-2 text-left font-semibold md:table-cell">Updated</th>
            <th class="px-5 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in visibleJobs" :key="job.job_id" class="border-t border-border hover:bg-muted/40">
            <td class="px-5 py-2.5">
              <button
                type="button"
                class="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                :aria-label="`Open ${jobKindLabel(job.kind)} ${job.job_id}`"
                @click="openJob(job)"
              >
                <span class="font-medium text-foreground">{{ jobKindLabel(job.kind) }}</span>
                <span class="block font-mono text-[11px] text-muted-foreground" :title="job.job_id">{{ truncateMiddle(job.job_id) }}</span>
              </button>
            </td>
            <td class="px-5 py-2.5">
              <div class="flex items-center gap-1.5">
                <JobStateBadge :state="job.state" />
                <Badge v-if="job.cancel_requested && !job.finished_at" variant="warn" size="sm">cancelling</Badge>
              </div>
            </td>
            <td class="px-5 py-2.5">
              <div class="min-w-[8rem] max-w-[14rem] space-y-1">
                <Progress
                  v-if="jobProgressPercent(job.progress) !== null"
                  :value="jobProgressPercent(job.progress)!"
                  :label="`Progress: ${formatJobProgress(job.progress)}`"
                  class="h-1.5"
                />
                <span class="block text-[11px] text-muted-foreground">{{ formatJobProgress(job.progress) }}</span>
              </div>
            </td>
            <td class="hidden px-5 py-2.5 text-[11px] text-muted-foreground sm:table-cell">{{ job.attempts }}</td>
            <td class="px-5 py-2.5 text-[11px] text-muted-foreground" :title="job.created_at">
              {{ relativeTime(job.created_at) }}
            </td>
            <td class="hidden px-5 py-2.5 text-[11px] text-muted-foreground md:table-cell" :title="job.updated_at">
              {{ relativeTime(job.updated_at) }}
            </td>
            <td class="px-5 py-2.5 text-right">
              <ChevronRight class="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </td>
          </tr>
        </tbody>
      </table>

      <template v-if="nextCursor || moreError" #footer>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" :disabled="loadingMore" @click="list.loadMore()">Load more</Button>
          <span v-if="moreError" class="text-xs text-destructive">{{ moreError }}</span>
        </div>
      </template>
    </ListShell>

    <JobDetailPanel
      v-if="openJobId"
      :job-id="openJobId"
      :open="!!openJobId"
      @update:open="(v) => !v && closeJob()"
      @changed="reload"
    />
  </div>
</template>
