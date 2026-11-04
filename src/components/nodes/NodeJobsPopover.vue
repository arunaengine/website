<script setup lang="ts">
// A node's status line as a button that lists the jobs the node runs, asked from that node
// only while the list is open. The heartbeat behind the status line may be older than the list.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Popover from '@/components/ui/Popover.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { authToken, nodeClient } from '@/composables/aruna/state'
import { getNodeJobs, type NodeJob, type NodeJobsResponse } from '@/lib/api'
import { formatCount } from '@/lib/formatCount'
import { errorMessage, formatBytes, relativeTime } from '@/lib/utils'
import { jobLabel } from './node-display'
import { Activity, ChevronDown, ChevronUp, Download } from '@lucide/vue'

const props = defineProps<{ nodeId: string; label: string }>()

const REFRESH_MS = 10_000

const open = ref(false)
const answer = ref<NodeJobsResponse | null>(null)
const error = ref<string | null>(null)
let generation = 0
let controller: AbortController | null = null
let timer: ReturnType<typeof setInterval> | undefined

async function load() {
  const asked = ++generation
  controller?.abort()
  controller = new AbortController()
  try {
    const result = await getNodeJobs(nodeClient(props.nodeId), controller.signal)
    if (asked !== generation) return
    answer.value = result
    error.value = null
  } catch (err) {
    if (asked !== generation) return
    error.value = errorMessage(err)
  }
}

function stop() {
  generation++
  controller?.abort()
  controller = null
  clearInterval(timer)
  timer = undefined
}

watch(open, (opened) => {
  stop()
  answer.value = null
  error.value = null
  if (!opened) return
  void load()
  timer = setInterval(() => void load(), REFRESH_MS)
})
// Another account or node must not see the list asked for the one before.
watch([authToken, () => props.nodeId], () => {
  if (open.value) open.value = false
})
onBeforeUnmount(stop)

const signedIn = computed(() => Boolean(authToken.value))
const empty = computed(() => answer.value !== null && !answer.value.jobs.length && !answer.value.hidden)

const kindCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const job of answer.value?.jobs ?? []) counts.set(jobLabel(job.kind), (counts.get(jobLabel(job.kind)) ?? 0) + 1)
  return [...counts]
})

function amount(value: number, unit: string): string {
  return unit === 'bytes' ? formatBytes(value) : `${formatCount(value)} ${unit}`
}

function progress(job: NodeJob): { share: string | null; detail: string } | null {
  const counted = job.progress
  if (!counted) return null
  if (!counted.total) return { share: null, detail: amount(counted.current, counted.unit) }
  const share = `${Math.min(100, Math.floor((counted.current / counted.total) * 100))}%`
  const detail = counted.unit === 'bytes'
    ? `${formatBytes(counted.current)} of ${formatBytes(counted.total)}`
    : `${formatCount(counted.current)} of ${amount(counted.total, counted.unit)}`
  return { share, detail }
}

function others(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'job' : 'jobs'} in other groups`
}
</script>

<template>
  <Popover v-model:open="open" :wide="signedIn">
    <button
      type="button"
      class="inline-flex items-center gap-1 self-start rounded-md text-xs text-sky-700 underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-aruna-aqua"
    >
      <Download class="h-3 w-3" /> {{ label }}
      <ChevronUp v-if="open" class="h-3 w-3" />
      <ChevronDown v-else class="h-3 w-3" />
    </button>
    <template #content>
      <p class="mb-1 flex items-center gap-2 text-sm font-medium">
        <Activity class="size-4 text-muted-foreground" /> Running jobs
      </p>
      <p v-if="error" class="text-xs text-muted-foreground">The node did not answer: {{ error }}</p>
      <Spinner v-else-if="!answer" show-label label="Loading jobs…" />
      <p v-else-if="empty" class="text-xs text-muted-foreground">No jobs running right now</p>
      <template v-else-if="!signedIn">
        <table class="data-table">
          <thead><tr><th class="pl-0">Job</th><th class="num pr-0">Running</th></tr></thead>
          <tbody>
            <tr v-for="[kind, count] in kindCounts" :key="kind">
              <td class="pl-0">{{ kind }}</td>
              <td class="num pr-0">{{ formatCount(count) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-xs text-muted-foreground">Sign in to see what your groups' jobs work on.</p>
      </template>
      <p v-else-if="!answer.jobs.length" class="text-xs text-muted-foreground">{{ others(answer.hidden) }}</p>
      <table v-else class="data-table text-xs">
        <thead>
          <tr><th class="pl-0">Job</th><th>Works on</th><th class="num">Progress</th><th class="pr-0">Started</th></tr>
        </thead>
        <tbody>
          <tr v-for="(job, index) in answer.jobs" :key="index">
            <td class="whitespace-nowrap pl-0">{{ jobLabel(job.kind) }}</td>
            <td class="w-full max-w-0">
              <template v-if="job.target && 'bucket' in job.target">
                <RouterLink :to="{ name: 'bucket', params: { bucketId: job.target.bucket }, query: { node: nodeId } }" class="block truncate text-foreground hover:underline">{{ job.target.bucket }}</RouterLink>
                <span v-if="job.target.path" class="block truncate font-mono text-xs text-muted-foreground">{{ job.target.path }}</span>
              </template>
              <template v-else-if="job.target">
                <RouterLink :to="{ name: 'dataset', params: { id: job.target.dataset_id } }" class="block truncate text-foreground hover:underline">Dataset</RouterLink>
                <span class="block truncate font-mono text-xs text-muted-foreground">{{ job.target.dataset_id }}</span>
              </template>
            </td>
            <td class="num">
              <template v-if="progress(job)">
                <span class="whitespace-nowrap tabular-nums">{{ progress(job)!.share ?? progress(job)!.detail }}</span>
                <span v-if="progress(job)!.share" class="block whitespace-nowrap text-xs text-muted-foreground">{{ progress(job)!.detail }}</span>
              </template>
              <span v-else class="whitespace-nowrap text-muted-foreground">Not known</span>
            </td>
            <td class="whitespace-nowrap pr-0 text-muted-foreground">{{ job.started_at ? relativeTime(job.started_at) : '' }}</td>
          </tr>
          <tr v-if="answer.hidden">
            <td colspan="4" class="pl-0 text-muted-foreground">{{ others(answer.hidden) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </Popover>
</template>
