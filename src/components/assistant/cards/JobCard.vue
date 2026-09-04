<script setup lang="ts">
// A job the assistant asked to show: what state it is in, when it ran, and
// which stored files it wrote.
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ObjectLink from '@/components/assistant/ObjectLink.vue'
import type { JobView } from '@/lib/assistant/types'
import { jobWatched, liveJob } from '@/lib/assistant/jobLive'
import { stateVariant } from '@/lib/stateBadge'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import { Cpu } from '@lucide/vue'

const props = defineProps<{ view: JobView }>()

const OUTPUT_CAP = 6
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

const shortJob = computed(() => truncateMiddle(props.view.jobId, 8, 5))
const shortNode = computed(() => truncateMiddle(props.view.nodeId ?? '', 8, 5))
// One attempt is the normal case and says nothing; more is worth naming.
const attempts = computed(() => {
  const value = attemptCount.value
  return value !== undefined && value > 1 ? `${value} attempts` : ''
})

const timings = computed(() =>
  [
    { label: 'Submitted', at: props.view.submittedAt },
    { label: 'Started', at: props.view.startedAt },
    { label: 'Finished', at: finishedAt.value },
  ].flatMap((entry) => (entry.at ? [{ ...entry, at: entry.at, ago: relativeTime(entry.at) }] : [])),
)

const outputs = computed(() => props.view.outputs.slice(0, OUTPUT_CAP))
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
      <Badge v-if="kind" size="sm" variant="secondary">{{ kind }}</Badge>
      <Spinner v-if="following" label="Following this job" class="shrink-0 text-primary" />
      <Badge size="sm" :variant="stateVariant(state)">{{ stateLabel }}</Badge>
    </div>
    <div class="space-y-2 px-3 py-2.5">
      <dl class="space-y-0.5">
        <div class="flex items-center gap-2">
          <dt class="w-16 shrink-0 text-muted-foreground">Job id</dt>
          <dd class="flex min-w-0 items-center gap-1">
            <RouterLink
              :to="target"
              class="hash truncate text-primary hover:underline"
              :title="view.jobId"
            >{{ shortJob }}</RouterLink>
            <CopyButton :value="view.jobId" label="Copy the job id" />
          </dd>
        </div>
        <div v-if="view.nodeId" class="flex items-center gap-2">
          <dt class="w-16 shrink-0 text-muted-foreground">Node</dt>
          <dd class="flex min-w-0 items-center gap-1">
            <span class="hash truncate" :title="view.nodeId">{{ shortNode }}</span>
            <CopyButton :value="view.nodeId" label="Copy the node id" />
          </dd>
        </div>
      </dl>

      <p v-if="following" class="text-muted-foreground">Following this job; this card updates on its own.</p>
      <p v-if="attempts" class="text-muted-foreground">{{ attempts }}</p>

      <ul v-if="timings.length" class="space-y-0.5">
        <li v-for="entry in timings" :key="entry.label" class="flex gap-2">
          <span class="w-16 shrink-0 text-muted-foreground">{{ entry.label }}</span>
          <span class="text-foreground/85" :title="entry.at">{{ entry.ago }}</span>
        </li>
      </ul>

      <Notice v-if="failure" tone="error">{{ failure }}</Notice>

      <div v-if="view.outputs.length">
        <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {{ view.outputs.length }} {{ view.outputs.length === 1 ? 'output' : 'outputs' }}
        </p>
        <ul class="mt-1 space-y-0.5">
          <li v-for="output in outputs" :key="`${output.bucket}/${output.key}`" class="flex items-baseline gap-2">
            <ObjectLink
              :bucket="output.bucket"
              :object-key="output.key"
              :size="output.size"
              class="min-w-0 flex-1 truncate font-mono text-[11px] text-primary hover:underline"
              :title="`${output.bucket}/${output.key}`"
            >{{ output.key }}</ObjectLink>
            <span v-if="output.size !== undefined" class="shrink-0 font-mono text-[10px] text-muted-foreground">
              {{ formatBytes(output.size) }}
            </span>
          </li>
          <li v-if="view.outputs.length > OUTPUT_CAP" class="text-muted-foreground">
            and {{ view.outputs.length - OUTPUT_CAP }} more
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
