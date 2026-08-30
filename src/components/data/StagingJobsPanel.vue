<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Progress from '@/components/ui/Progress.vue'
import Spinner from '@/components/ui/Spinner.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import { useAruna } from '@/composables/useAruna'
import { useStaging } from '@/composables/useStaging'
import { useRefresh } from '@/composables/useRefresh'
import { featureEnabled } from '@/lib/config'
import { ApiError, type StagingJob } from '@/lib/api'
import { errorMessage, formatBytes, relativeTime } from '@/lib/utils'
import { stateVariant, toneVariant } from '@/lib/stateBadge'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { HardDriveDownload } from '@lucide/vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const { listStagingJobs, getStagingJob } = useAruna()
const staging = useStaging()

const jobs = ref<StagingJob[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const expandedErrorJobs = ref<Set<string>>(new Set())
const nextCursor = ref<string | undefined>()
const loadingMore = ref(false)
const loadMoreError = ref<string | null>(null)
// The backend keeps no staging job registry yet: 404/405 is expected, not an error.
const noRegistry = ref(false)
let pollTimer: number | undefined
let requestId = 0
let disposed = false

function clearPoll() {
  if (pollTimer !== undefined) window.clearTimeout(pollTimer)
  pollTimer = undefined
}

function schedulePoll() {
  clearPoll()
  if (disposed || !props.open || !jobs.value.some((job) => job.state === 'queued' || job.state === 'running')) return
  pollTimer = window.setTimeout(() => void refreshActiveJobs(), 2_000)
}

async function loadJobs() {
  if (disposed) return
  const myRequest = ++requestId
  clearPoll()
  // Belt-and-suspenders: the parent only mounts this panel behind the flag, but
  // never reach the network if it is somehow off (mirrors #248's guard).
  if (!featureEnabled('stagingJobs')) return
  loading.value = true
  loadingMore.value = false
  nextCursor.value = undefined
  error.value = null
  loadMoreError.value = null
  noRegistry.value = false
  try {
    const response = await listStagingJobs()
    if (myRequest !== requestId) return
    jobs.value = response.jobs
    nextCursor.value = response.next_cursor
  } catch (err) {
    if (myRequest !== requestId) return
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      noRegistry.value = true
      jobs.value = []
      nextCursor.value = undefined
    } else {
      error.value = errorMessage(err)
    }
  } finally {
    if (myRequest === requestId && !disposed) {
      loading.value = false
      schedulePoll()
    }
  }
}

const { busy: reloadBusy, refresh: onReload } = useRefresh(() => loadJobs())
const spinning = computed(() => reloadBusy.value || loading.value)

async function refreshActiveJobs() {
  if (disposed) return
  const myRequest = requestId
  const active = jobs.value.filter((job) => job.state === 'queued' || job.state === 'running')
  const settled = await Promise.allSettled(active.map((job) => getStagingJob(job.job_id)))
  if (disposed || myRequest !== requestId) return
  const updates = new Map<string, StagingJob>()
  settled.forEach((result) => {
    if (result.status === 'fulfilled') updates.set(result.value.job_id, result.value)
  })
  jobs.value = jobs.value.map((job) => updates.get(job.job_id) ?? job)
  schedulePoll()
}

async function loadMore() {
  const cursor = nextCursor.value
  if (!cursor || loadingMore.value || disposed) return
  const myRequest = requestId
  loadingMore.value = true
  loadMoreError.value = null
  try {
    const response = await listStagingJobs(cursor)
    if (disposed || myRequest !== requestId) return
    const seen = new Set(jobs.value.map((job) => job.job_id))
    jobs.value = [...jobs.value, ...response.jobs.filter((job) => !seen.has(job.job_id))]
    nextCursor.value = response.next_cursor
    schedulePoll()
  } catch (err) {
    if (!disposed && myRequest === requestId) {
      loadMoreError.value = errorMessage(err)
    }
  } finally {
    if (!disposed && myRequest === requestId) loadingMore.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void loadJobs()
    else {
      ++requestId
      clearPoll()
    }
  },
)
onBeforeUnmount(() => {
  disposed = true
  ++requestId
  clearPoll()
})

function jobBadge(job: StagingJob) {
  if (job.state === 'done' && job.errors.length) return toneVariant('attention')
  return stateVariant(job.state)
}

function jobLabel(job: StagingJob): string {
  return job.state === 'done' && job.errors.length ? 'done with errors' : job.state
}

function visibleErrors(job: StagingJob) {
  return expandedErrorJobs.value.has(job.job_id) ? job.errors : job.errors.slice(0, 3)
}

function toggleErrors(jobId: string) {
  const next = new Set(expandedErrorJobs.value)
  if (next.has(jobId)) next.delete(jobId)
  else next.add(jobId)
  expandedErrorJobs.value = next
}

function jobProgress(job: StagingJob): { current: number; total: number | null; bytes: boolean } {
  const bytes = job.strategy === 'snapshot' && job.progress.bytes_total != null && job.progress.bytes_total > 0
  return {
    current: bytes ? job.progress.bytes_current : job.progress.items_current,
    total: bytes ? (job.progress.bytes_total ?? null) : (job.progress.items_total ?? null),
    bytes,
  }
}

function jobPercent(job: StagingJob): number {
  const progress = jobProgress(job)
  return progress.total ? Math.min(100, (progress.current / progress.total) * 100) : 0
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="flex max-w-xl flex-col">
      <DialogHeader>
        <div class="flex items-center justify-between gap-2 pr-8">
          <DialogTitle class="flex items-center gap-2">
            <HardDriveDownload class="h-4 w-4 text-primary" /> Staging
          </DialogTitle>
          <RefreshButton :busy="spinning" sr-label="Reload" @click="onReload" />
        </div>
      </DialogHeader>

      <div class="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto">
      <section class="space-y-2">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Node registry</h2>
        <div v-if="loading" class="space-y-2">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>
        <EmptyState
          v-else-if="noRegistry"
          compact
          title="This node does not keep a staging registry yet (aruna#276)."
          description="Staging started from this browser appears below."
        />
        <ErrorPanel v-else-if="error" :message="error" @retry="loadJobs" />
        <EmptyState v-else-if="!jobs.length" title="No staging system jobs" />
        <div v-else class="space-y-2">
            <div v-for="job in jobs" :key="job.job_id" class="space-y-1 rounded-md border border-border px-3 py-2">
              <div class="flex items-center gap-2 text-xs">
              <Spinner v-if="job.state === 'running' || job.state === 'queued'" label="Staging" class="text-primary" />
              <Badge :variant="jobBadge(job)" size="sm" class="uppercase">{{ jobLabel(job) }}</Badge>
              <span class="min-w-0 flex-1 truncate font-mono">{{ job.bucket }}</span>
              <Badge variant="outline" size="sm" class="shrink-0">{{ job.strategy }}</Badge>
            </div>
            <div class="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>{{ relativeTime(job.submitted_at) }}</span>
              <span>· {{ job.phase }}</span>
              <span v-if="jobProgress(job).total != null">
                · {{ jobProgress(job).bytes ? formatBytes(jobProgress(job).current) : jobProgress(job).current }}
                / {{ jobProgress(job).bytes ? formatBytes(jobProgress(job).total ?? 0) : jobProgress(job).total }}
              </span>
            </div>
            <Progress
              v-if="job.state === 'queued' || job.state === 'running'"
              :value="jobPercent(job)"
              :indeterminate="jobProgress(job).total == null"
              :warn="101"
              :critical="101"
              class="h-1.5"
            />
            <p v-if="job.progress.current_path" class="truncate font-mono text-[10px] text-muted-foreground" :title="job.progress.current_path">{{ job.progress.current_path }}</p>
            <p v-if="job.error" class="text-[11px] text-destructive">{{ job.error }}</p>
            <p v-for="itemError in visibleErrors(job)" :key="`${itemError.source_path}:${itemError.target_key}`" class="text-[10px] text-destructive">
              <span class="font-mono">{{ itemError.source_path }}</span>: {{ itemError.error }}
            </p>
            <button
              v-if="job.errors.length > 3"
              type="button"
              class="text-[10px] text-primary hover:underline"
              @click="toggleErrors(job.job_id)"
            >
              {{ expandedErrorJobs.has(job.job_id) ? 'Show fewer errors' : `Show ${job.errors.length - 3} more errors` }}
            </button>
          </div>
        </div>
        <div v-if="nextCursor || loadMoreError" class="space-y-1 text-center">
          <Button v-if="nextCursor" variant="outline" size="sm" :disabled="loadingMore" @click="loadMore">
            <Spinner v-if="loadingMore" label="Loading more staging system jobs" class="text-current" /> Load more
          </Button>
          <p v-if="loadMoreError" class="text-[10px] text-destructive">{{ loadMoreError }}</p>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">This session</h2>
        <EmptyState v-if="!staging.submissions.value.length" title="Nothing staged this session" />
        <div v-else class="space-y-2">
          <div
            v-for="submission in staging.submissions.value"
            :key="submission.id"
            class="space-y-0.5 rounded-md border border-border px-3 py-2"
          >
            <div class="flex items-center gap-2 text-xs">
              <Spinner v-if="submission.state === 'running'" label="Staging" class="text-primary" />
              <Badge :variant="stateVariant(submission.state)" size="sm" class="uppercase">{{ submission.state }}</Badge>
              <span class="min-w-0 flex-1 truncate font-mono">{{ submission.bucket }}/{{ submission.key }}</span>
              <Badge variant="outline" size="sm" class="shrink-0">{{ submission.strategy }}</Badge>
            </div>
            <p class="text-[11px] text-muted-foreground">{{ relativeTime(submission.submittedAt) }}</p>
            <p v-if="submission.error" class="text-[11px] text-destructive">{{ submission.error }}</p>
          </div>
        </div>
      </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
