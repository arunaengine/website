<script setup lang="ts">
// The staging jobs that write into this bucket, from every node that runs them for it, in the row
// style of the sync list. A node without a staging registry lists none.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import ListSkeleton from '@/components/ui/ListSkeleton.vue'
import Progress from '@/components/ui/Progress.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { bucketStagingJobs } from '@/composables/useStaging'
import { ApiError, type StagingJob } from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { stateTone } from '@/lib/stateBadge'
import { errorMessage, formatBytes, formatClock, relativeTime } from '@/lib/utils'
import { ArrowLeft } from '@lucide/vue'

// `nodes`: who to ask, null for this node; every member of a distributed bucket runs its own jobs.
const props = defineProps<{ bucket: string; nodes?: (string | null)[]; quiet?: boolean }>()
// A count of null: the scan stopped early, so no match does not mean none.
const emit = defineEmits<{ (e: 'count', count: number | null): void }>()

const { sessionEpoch, listStagingJobs, getStagingJob, listGroupConnectors } = useAruna()
const { displayName } = useRealmNodes()

type NodeJob = StagingJob & { node: string | null }
const asked = computed(() => props.nodes ?? [null])
const many = computed(() => asked.value.length > 1 || asked.value[0] !== null)
const jobs = ref<NodeJob[]>([])
const silent = ref<string[]>([])
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
  silent.value = []
  try {
    const nodes = asked.value
    const answers = await Promise.allSettled(
      nodes.map((node) => bucketStagingJobs((cursor) => listStagingJobs(cursor, 50, node), props.bucket)),
    )
    if (id !== requestId) return
    const found = answers.flatMap((answer, index) =>
      answer.status === 'fulfilled' ? answer.value.jobs.map((job) => ({ ...job, node: nodes[index] })) : [],
    )
    const failures = answers.flatMap((answer, index) => (answer.status === 'rejected' ? [{ node: nodes[index], cause: answer.reason }] : []))
    const unlisted = (cause: unknown) => cause instanceof ApiError && (cause.status === 404 || cause.status === 405)
    jobs.value = found.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    truncated.value = answers.some((answer) => answer.status === 'fulfilled' && answer.value.truncated)
    if (failures.length === nodes.length) {
      if (failures.every((failure) => unlisted(failure.cause))) noRegistry.value = true
      else error.value = errorMessage(failures.find((failure) => !unlisted(failure.cause))?.cause)
    } else silent.value = failures.filter((failure) => !unlisted(failure.cause)).map((failure) => displayName(failure.node))
    void loadNames(found.map((job) => job.group_id))
  } catch (err) {
    if (id !== requestId) return
    jobs.value = []
    error.value = errorMessage(err)
  } finally {
    if (id === requestId && !disposed) {
      loading.value = false
      const unknown = error.value || noRegistry.value || silent.value.length || (truncated.value && !jobs.value.length)
      emit('count', unknown ? null : jobs.value.length)
      schedulePoll()
    }
  }
}

async function refreshActive() {
  const id = requestId
  const running = jobs.value.filter(active)
  const settled = await Promise.allSettled(running.map((job) => getStagingJob(job.job_id, job.node)))
  if (disposed || id !== requestId) return
  const updates = new Map<string, NodeJob>()
  settled.forEach((result, index) => {
    const { node } = running[index]
    if (result.status === 'fulfilled') updates.set(`${node}/${result.value.job_id}`, { ...result.value, node })
  })
  jobs.value = jobs.value.map((job) => updates.get(`${job.node}/${job.job_id}`) ?? job)
  schedulePoll()
}

// Another account or API base lists other jobs, so the rows start over.
watch(
  () => [props.bucket, asked.value.join(','), sessionEpoch.value],
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
  <p v-else-if="state === 'empty' && truncated" class="surface px-5 py-3.5 text-xs text-muted-foreground">
    None of the newest staging jobs of {{ many ? 'its nodes' : 'this node' }} writes into this bucket. Older ones were not checked.
  </p>
  <template v-else-if="state === 'empty'">
    <p v-if="silent.length" class="surface px-5 py-3.5 text-xs text-muted-foreground">
      Not answered by {{ silent.join(', ') }}, so its staging jobs are not known.
    </p>
    <EmptyState
      v-else-if="!quiet"
      :title="noRegistry ? 'The node does not list staging jobs.' : 'No staging job writes into this bucket.'"
      description="Staging copies data from outside storage into a bucket."
    />
  </template>
  <div v-else class="surface overflow-hidden">
    <ListSkeleton v-if="state === 'loading'" bare :rows="2" />
    <ul v-else class="divide-y divide-border">
      <li v-for="job in jobs" :key="`${job.node}/${job.job_id}`" class="px-5 py-3.5">
        <div class="flex items-center gap-2 text-xs">
          <StatusDot :tone="stateTone(job.state)" :label="job.state" />
          <Badge variant="secondary" size="sm" class="shrink-0">Staging</Badge>
          <Badge v-if="many" variant="outline" size="sm" class="shrink-0" :title="job.node ?? undefined">on {{ displayName(job.node) }}</Badge>
          <Badge variant="outline" size="sm" class="shrink-0">{{ job.strategy === 'snapshot' ? 'Copy' : 'Reference' }}</Badge>
          <ArrowLeft class="size-3.5 shrink-0 text-muted-foreground" aria-label="from" />
          <Badge variant="outline" size="sm" class="shrink-0" :title="job.connector_id">
            {{ connectorNames[job.connector_id] ?? 'Connector' }}
          </Badge>
          <span class="min-w-0 flex-1 truncate font-mono" :title="job.progress.current_path ?? undefined">
            {{ job.progress.current_path ?? job.phase }}
          </span>
          <span class="flex shrink-0 items-center gap-3 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
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
        <p v-if="job.paused_until" class="mt-1 text-xs text-muted-foreground">
          Waiting until {{ formatClock(job.paused_until) }}, the source asked to slow down.
        </p>
        <p v-if="job.error" class="mt-1 break-all text-xs text-destructive">{{ job.error }}</p>
        <p v-else-if="job.errors.length" class="mt-1 break-all text-xs text-destructive">
          {{ job.errors.length }} {{ job.errors.length === 1 ? 'file' : 'files' }} failed, first:
          <span class="font-mono">{{ job.errors[0].source_path }}</span>: {{ job.errors[0].error }}
        </p>
      </li>
    </ul>
    <p v-if="truncated" class="border-t border-border px-5 py-2 text-xs text-muted-foreground">
      Only the newest staging jobs of {{ many ? 'each node' : 'this node' }} were checked.
    </p>
    <p v-if="silent.length" class="border-t border-border px-5 py-2 text-xs text-muted-foreground">
      Not answered by {{ silent.join(', ') }}, so its jobs are missing here.
    </p>
  </div>
</template>
