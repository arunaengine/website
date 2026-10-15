<script setup lang="ts">
// The staging jobs of the node that write into this bucket, in the row style of
// the sync list. A node without a staging registry lists none.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import Progress from '@/components/ui/Progress.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { useAruna } from '@/composables/useAruna'
import { bucketStagingJobs } from '@/composables/useStaging'
import { ApiError, type StagingJob } from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { stateTone } from '@/lib/stateBadge'
import { errorMessage, formatBytes, relativeTime } from '@/lib/utils'
import { ArrowLeft } from '@lucide/vue'

const props = defineProps<{ bucket: string; quiet?: boolean }>()
const emit = defineEmits<{ (e: 'count', count: number): void }>()

const { sessionEpoch, listStagingJobs, getStagingJob, listGroupConnectors } = useAruna()

const jobs = ref<StagingJob[]>([])
const truncated = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const noRegistry = ref(false)
const connectorNames = ref<Record<string, string>>({})
let pollTimer: number | undefined
let requestId = 0
let disposed = false

function clearPoll() {
  if (pollTimer !== undefined) window.clearTimeout(pollTimer)
  pollTimer = undefined
}

const active = (job: StagingJob) => job.state === 'queued' || job.state === 'running'

function schedulePoll() {
  clearPoll()
  if (disposed || !jobs.value.some(active)) return
  pollTimer = window.setTimeout(() => void refreshActive(), 2_000)
}

async function loadNames(groupIds: string[]) {
  const id = requestId
  for (const groupId of new Set(groupIds)) {
    const response = await listGroupConnectors(groupId).catch(() => null)
    if (disposed || id !== requestId || !response) continue
    const names = { ...connectorNames.value }
    for (const connector of response.connectors) names[connector.connector_id] = connector.name
    connectorNames.value = names
  }
}

async function load() {
  const id = ++requestId
  clearPoll()
  if (!featureEnabled('stagingJobs')) {
    emit('count', 0)
    return
  }
  loading.value = true
  error.value = null
  noRegistry.value = false
  try {
    const found = await bucketStagingJobs(listStagingJobs, props.bucket)
    if (id !== requestId) return
    jobs.value = found.jobs
    truncated.value = found.truncated
    void loadNames(found.jobs.map((job) => job.group_id))
  } catch (err) {
    if (id !== requestId) return
    jobs.value = []
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) noRegistry.value = true
    else error.value = errorMessage(err)
  } finally {
    if (id === requestId && !disposed) {
      loading.value = false
      emit('count', jobs.value.length)
      schedulePoll()
    }
  }
}

async function refreshActive() {
  const id = requestId
  const settled = await Promise.allSettled(jobs.value.filter(active).map((job) => getStagingJob(job.job_id)))
  if (disposed || id !== requestId) return
  const updates = new Map<string, StagingJob>()
  for (const result of settled) if (result.status === 'fulfilled') updates.set(result.value.job_id, result.value)
  jobs.value = jobs.value.map((job) => updates.get(job.job_id) ?? job)
  schedulePoll()
}

// Another account or API base lists other jobs, so the rows start over.
watch(
  () => [props.bucket, sessionEpoch.value],
  () => {
    jobs.value = []
    connectorNames.value = {}
    truncated.value = false
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  disposed = true
  ++requestId
  clearPoll()
})

const state = computed(() => {
  if (loading.value && !jobs.value.length) return 'loading'
  if (error.value) return 'error'
  return jobs.value.length ? 'ready' : 'empty'
})

function progressText(job: StagingJob): string | null {
  const bytes = job.strategy === 'snapshot' && Boolean(job.progress.bytes_total)
  const total = bytes ? job.progress.bytes_total : job.progress.items_total
  if (total == null) return null
  return bytes
    ? `${formatBytes(job.progress.bytes_current)} / ${formatBytes(total)}`
    : `${job.progress.items_current} / ${total} files`
}

function percent(job: StagingJob): number {
  const total = job.progress.items_total
  return total ? Math.min(100, (job.progress.items_current / total) * 100) : 0
}
</script>

<template>
  <ErrorPanel v-if="state === 'error'" :message="error ?? ''" @retry="load" />
  <template v-else-if="state === 'empty'">
    <EmptyState
      v-if="!quiet"
      :title="noRegistry ? 'This node does not list staging jobs.' : 'No staging job writes into this bucket.'"
      description="Staging copies data from outside storage into a bucket."
    />
  </template>
  <div v-else class="surface overflow-hidden">
    <ListSkeleton v-if="state === 'loading'" bare :rows="2" />
    <ul v-else class="divide-y divide-border">
      <li v-for="job in jobs" :key="job.job_id" class="px-5 py-3.5">
        <div class="flex items-center gap-2 text-xs">
          <StatusDot :tone="stateTone(job.state)" :label="job.state" />
          <Badge variant="secondary" size="sm" class="shrink-0">Staging</Badge>
          <Badge variant="outline" size="sm" class="shrink-0">{{ job.strategy === 'snapshot' ? 'Copy' : 'Reference' }}</Badge>
          <ArrowLeft class="size-3.5 shrink-0 text-muted-foreground" aria-label="from" />
          <Badge variant="outline" size="sm" class="shrink-0" :title="job.connector_id">
            {{ connectorNames[job.connector_id] ?? 'Connector' }}
          </Badge>
          <span class="min-w-0 flex-1 truncate font-mono" :title="job.progress.current_path ?? undefined">
            {{ job.progress.current_path ?? job.phase }}
          </span>
          <span class="flex shrink-0 items-center gap-3 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
            <span>started {{ relativeTime(job.submitted_at) }}</span>
            <span v-if="progressText(job)">{{ progressText(job) }}</span>
          </span>
        </div>
        <Progress
          v-if="active(job)"
          :value="percent(job)"
          :indeterminate="job.progress.items_total == null"
          :warn="101"
          :critical="101"
          class="mt-2 h-1.5"
        />
        <p v-if="job.error" class="mt-1 break-all text-[11px] text-destructive">{{ job.error }}</p>
        <p v-else-if="job.errors.length" class="mt-1 break-all text-[11px] text-destructive">
          {{ job.errors.length }} {{ job.errors.length === 1 ? 'file' : 'files' }} failed, first:
          <span class="font-mono">{{ job.errors[0].source_path }}</span>: {{ job.errors[0].error }}
        </p>
      </li>
    </ul>
    <p v-if="truncated" class="border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
      Only the newest staging jobs of this node were checked.
    </p>
  </div>
</template>
