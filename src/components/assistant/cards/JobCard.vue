<script setup lang="ts">
// A job the assistant asked to show: its state, when and where it ran, and
// the stored files it wrote. Unknown facts are left out.
import { computed, onMounted, watch } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { apiBaseUrl, authToken } from '@/composables/aruna/state'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import Notice from '@/components/ui/Notice.vue'
import ObjectLink from '@/components/assistant/ObjectLink.vue'
import type { JobView } from '@/lib/assistant/types'
import { jobFacts, jobTiming, jobWatched, liveJob, noteJob, outputSummary } from '@/lib/assistant/jobLive'
import { getJob } from '@/lib/jobs'
import { stateVariant } from '@/lib/stateBadge'
import { formatDateTime, relativeTime } from '@/lib/utils'
import { useNow } from '@/composables/useNow'
import { Cpu } from '@lucide/vue'

const props = defineProps<{ view: JobView }>()

const OUTPUT_CAP = 3
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled'])

// A watcher's last poll wins over the facts the card was drawn with, so the
// card follows the run without the model taking another turn.
const live = computed(() => liveJob(props.view.jobId))
const state = computed(() => live.value?.state || props.view.state)
const kind = computed(() => live.value?.kind || props.view.jobKind)
const attemptCount = computed(() => live.value?.attempts ?? props.view.attempts)
const failure = computed(() => live.value?.error || props.view.error)
const finishedAt = computed(() => live.value?.finishedAt || props.view.finishedAt)
const following = computed(() => jobWatched(props.view.jobId) && !TERMINAL.has(state.value))

// A run opens on the run page; every other job kind is a system job.
const target = computed<RouteLocationRaw>(() => (kind.value === 'execution'
  ? { name: 'task', params: { taskId: props.view.jobId } }
  : { name: 'job', params: { jobId: props.view.jobId } }))

const stateLabel = computed(() => {
  const value = state.value.trim()
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown'
})

// One attempt is the normal case and says nothing; more is worth naming.
const attempts = computed(() => {
  const value = attemptCount.value
  return value !== undefined && value > 1 ? `${value} attempts` : ''
})

// The clock is read so the labels move on while the card stays on screen.
const now = useNow()
const timing = computed(() => jobTiming({
  state: state.value,
  submittedAt: props.view.submittedAt,
  startedAt: live.value?.startedAt || props.view.startedAt,
  finishedAt: finishedAt.value,
}))
const when = computed(() => {
  void now.value
  const entry = timing.value.when
  return entry ? { ...entry, text: formatDateTime(entry.at), ago: relativeTime(entry.at) } : null
})
const took = computed(() => timing.value.took)

const outputs = computed(() => props.view.outputs.slice(0, OUTPUT_CAP))
const outputText = computed(() => outputSummary(props.view.outputs))

// A card restored after a reload, or read back from the node, holds the facts
// from submission; one read brings it up to date. Polling is the watcher's job.
async function readJob() {
  const jobId = props.view.jobId
  if (!jobId || liveJob(jobId) || TERMINAL.has(props.view.state)) return
  try {
    noteJob(jobId, jobFacts(await getJob(jobId, { baseUrl: apiBaseUrl.value, token: authToken.value })))
  } catch {
    // The stored facts stay on the card; the watcher or the next reload tries again.
  }
}
onMounted(readJob)
watch(() => props.view.jobId, readJob)
</script>

<template>
  <div class="surface-inline overflow-hidden text-xs">
    <div class="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
      <Cpu class="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <RouterLink
        :to="target"
        class="min-w-0 flex-1 truncate font-medium text-foreground hover:text-primary hover:underline"
        :title="`Open ${view.jobId}`"
      >{{ view.title }}</RouterLink>
      <Badge size="sm" :variant="stateVariant(state)">{{ stateLabel }}</Badge>
      <CopyButton :value="view.jobId" label="Copy the job id" />
    </div>
    <div class="space-y-2 px-3 py-2.5">
      <dl v-if="when || took || view.nodeId || view.outputs.length" class="space-y-1">
        <div v-if="when" class="flex gap-2">
          <dt class="w-16 shrink-0 text-muted-foreground">{{ when.label }}</dt>
          <dd class="text-foreground/85" :title="when.at">
            {{ when.text }} <span class="text-muted-foreground">({{ when.ago }})</span>
          </dd>
        </div>
        <div v-if="took" class="flex gap-2">
          <dt class="w-16 shrink-0 text-muted-foreground">Took</dt>
          <dd class="text-foreground/85">{{ took }}</dd>
        </div>
        <div v-if="view.nodeId" class="flex gap-2">
          <dt class="w-16 shrink-0 text-muted-foreground">{{ timing.settled ? 'Ran on' : 'Runs on' }}</dt>
          <dd class="min-w-0">
            <RouterLink :to="{ name: 'status', query: { node: view.nodeId } }" class="text-primary hover:underline">
              <NodeLabel :node-id="view.nodeId" />
            </RouterLink>
          </dd>
        </div>
        <div v-if="view.outputs.length" class="flex gap-2">
          <dt class="w-16 shrink-0 text-muted-foreground">Outputs</dt>
          <dd class="min-w-0 space-y-0.5">
            <p class="text-foreground/85">{{ outputText }}</p>
            <ObjectLink
              v-for="output in outputs"
              :key="`${output.bucket}/${output.key}`"
              :bucket="output.bucket"
              :object-key="output.key"
              :size="output.size"
              class="block truncate font-mono text-[11px] text-primary hover:underline"
              :title="`${output.bucket}/${output.key}`"
            >{{ output.key }}</ObjectLink>
          </dd>
        </div>
      </dl>

      <p v-if="following" class="text-muted-foreground">This card updates on its own.</p>
      <p v-if="attempts" class="text-muted-foreground">{{ attempts }}</p>
      <Notice v-if="failure" tone="error">{{ failure }}</Notice>
    </div>
  </div>
</template>
