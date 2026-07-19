<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import TaskStateBadge from '@/components/compute/TaskStateBadge.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useS3, s3ErrorMessage } from '@/composables/useS3'
import { isTerminalTesState, type TesTask } from '@/lib/tes'
import { formatBytes, formatDuration, relativeTime, truncateMiddle } from '@/lib/utils'
import { ArrowDownToLine, ArrowUpFromLine, CornerDownRight, Download, ExternalLink, FolderOpen, RefreshCw } from '@lucide/vue'

const props = defineProps<{
  taskId: string
  /** Declared output destinations, resolved to download links on completion. */
  outputs: { bucket: string; key: string; path: string }[]
}>()

const { getTask } = useTes()
const s3 = useS3()

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const task = ref<TesTask | null>(null)
const loadState = ref<'loading' | 'ready' | 'error' | 'unsupported'>('loading')
const loadError = ref<string | null>(null)
const lastPollError = ref<string | null>(null)

// ── Poll to terminal (view-owned, mirrors TaskDetailPanel) ───────────────────
let pollTimer: number | undefined
function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = undefined
  }
}
async function poll() {
  try {
    task.value = await getTask(props.taskId, 'FULL')
    lastPollError.value = null
    if (isTerminalTesState(task.value.state)) {
      stopPolling()
      void listOutputs()
    }
  } catch (err) {
    lastPollError.value = errorMessage(err)
  }
}
async function load() {
  loadState.value = 'loading'
  loadError.value = null
  stopPolling()
  try {
    task.value = await getTask(props.taskId, 'FULL')
    loadState.value = 'ready'
    if (isTerminalTesState(task.value.state)) void listOutputs()
    else pollTimer = window.setInterval(() => !document.hidden && void poll(), 5000)
  } catch (err) {
    if (isTesUnsupported(err)) loadState.value = 'unsupported'
    else {
      loadState.value = 'error'
      loadError.value = errorMessage(err)
    }
  }
}

watch(() => props.taskId, load, { immediate: true })
onUnmounted(stopPolling)

// ── Executor logs ────────────────────────────────────────────────────────────
const latestLog = computed(() => {
  const logs = task.value?.logs
  return logs?.length ? logs[logs.length - 1] : undefined
})
const executorLog = computed(() => latestLog.value?.logs?.[0])
const isTerminal = computed(() => isTerminalTesState(task.value?.state))

const duration = computed(() => {
  const log = latestLog.value
  if (!log?.start_time) return ''
  const start = Date.parse(log.start_time)
  const end = log.end_time ? Date.parse(log.end_time) : isTerminal.value ? NaN : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return ''
  const label = formatDuration(end - start)
  if (!label) return ''
  return log.end_time ? label : `${label} so far`
})

// ── Declared output resolution (useS3) ───────────────────────────────────────
interface OutputFile {
  bucket: string
  key: string
  size?: number
  href?: string
  missing: boolean
}
const resolvedOutputs = ref<OutputFile[]>([])
const outputsState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const outputsError = ref<string | null>(null)

async function listOutputs() {
  if (!s3.hasActiveKey.value || !s3.endpoint.value || !props.outputs.length) return
  outputsState.value = 'loading'
  outputsError.value = null
  try {
    resolvedOutputs.value = await Promise.all(
      props.outputs.map(async (declared) => {
        try {
          const head = await s3.headObject(declared.bucket, declared.key)
          return {
            bucket: declared.bucket,
            key: declared.key,
            size: head.size,
            href: await s3.downloadUrl(declared.bucket, declared.key),
            missing: false,
          }
        } catch {
          // A missing object is a per-file outcome, not a listing failure.
          return { bucket: declared.bucket, key: declared.key, missing: true }
        }
      }),
    )
    outputsState.value = 'ready'
  } catch (err) {
    outputsError.value = s3ErrorMessage(err)
    outputsState.value = 'error'
  }
}

const multiBucket = computed(() => new Set(props.outputs.map((output) => output.bucket)).size > 1)
const firstBucket = computed(() => props.outputs[0]?.bucket ?? '')
</script>

<template>
  <div class="space-y-5">
    <div v-if="loadState === 'loading'" class="space-y-3">
      <Skeleton class="h-7 w-1/3" />
      <Skeleton class="h-32 w-full" />
    </div>

    <div v-else-if="loadState === 'unsupported'" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      This node does not expose the TES endpoint. The task cannot be tracked here.
    </div>

    <ErrorPanel v-else-if="loadState === 'error'" :message="loadError || 'Failed to load the task.'" @retry="load" />

    <template v-else-if="task">
      <!-- Header -->
      <div class="surface flex flex-wrap items-center gap-3 px-5 py-4">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm font-semibold text-foreground">{{ task.name || 'Quick run' }}</h3>
            <TaskStateBadge :state="task.state" />
            <span v-if="!isTerminal" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw class="h-3.5 w-3.5 animate-spin" /> Tracking…
            </span>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span class="font-mono" :title="taskId">{{ truncateMiddle(taskId) }}</span>
            <span v-if="task.creation_time">· submitted {{ relativeTime(task.creation_time) }}</span>
            <span v-if="duration" class="tabular-nums">· {{ duration }}</span>
            <span v-if="executorLog?.exit_code != null">· exit code <span class="font-mono text-foreground">{{ executorLog.exit_code }}</span></span>
          </div>
        </div>
        <RouterLink
          class="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
          :to="{ name: 'compute-task', params: { taskId } }"
        >
          Open full task detail <ExternalLink class="h-3 w-3" />
        </RouterLink>
      </div>
      <p v-if="lastPollError" class="text-[11px] text-muted-foreground">Auto-refresh failed: {{ lastPollError }}</p>

      <!-- In / out — mirrors the wizard's data step. -->
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="surface-muted space-y-2 p-4">
          <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ArrowDownToLine class="h-3.5 w-3.5 text-primary" /> Into the container
          </div>
          <ul v-if="task.inputs?.length" class="space-y-1.5 font-mono text-[11px]">
            <li v-for="input in task.inputs" :key="input.path">
              <div class="truncate text-foreground" :title="input.url">{{ input.name || input.url }}</div>
              <div class="flex items-center gap-1 text-muted-foreground"><CornerDownRight class="h-3 w-3 shrink-0" /> {{ input.path }}</div>
            </li>
          </ul>
          <p v-else class="text-[11px] text-muted-foreground">No input data was staged.</p>
        </section>

        <section class="surface-muted space-y-2 p-4">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ArrowUpFromLine class="h-3.5 w-3.5 text-primary" /> Out of the container
            </div>
            <RouterLink
              v-if="firstBucket"
              class="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              :to="{ name: 'bucket', params: { bucketId: firstBucket } }"
            >
              <FolderOpen class="h-3.5 w-3.5" /> Open in Data
            </RouterLink>
          </div>
          <p v-if="!outputs.length" class="text-[11px] text-muted-foreground">
            No output files were declared; stdout and stderr live in the streams below.
          </p>
          <p v-else-if="!isTerminal" class="text-[11px] text-muted-foreground">
            Declared output files are uploaded to their destinations when the run finishes.
          </p>
          <div v-else-if="outputsState === 'loading'" class="text-[11px] text-muted-foreground">Checking the declared outputs…</div>
          <p v-else-if="outputsState === 'error'" class="text-[11px] text-destructive">{{ outputsError }}</p>
          <ul v-else class="divide-y divide-border/70 overflow-hidden rounded-md border border-border/70 bg-card">
            <li v-for="file in resolvedOutputs" :key="`${file.bucket}/${file.key}`" class="flex items-center gap-3 px-3 py-2 text-xs">
              <span class="min-w-0 flex-1 truncate font-mono text-foreground" :title="`s3://${file.bucket}/${file.key}`">
                <template v-if="multiBucket">{{ file.bucket }}/</template>{{ file.key }}
              </span>
              <span v-if="file.size !== undefined" class="text-muted-foreground">{{ formatBytes(file.size) }}</span>
              <span v-if="file.missing" class="text-muted-foreground">not written</span>
              <a v-else class="inline-flex items-center gap-1 text-primary hover:underline" :href="file.href" target="_blank" rel="noopener">
                <Download class="h-3.5 w-3.5" /> Download
              </a>
            </li>
          </ul>
        </section>
      </div>

      <!-- stdout / stderr in the editor's mono pane style -->
      <section class="space-y-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output streams</h3>
        <p v-if="!isTerminal" class="text-xs text-muted-foreground">
          stdout and stderr are captured once the task reaches a terminal state.
        </p>
        <template v-else-if="executorLog">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">stdout</div>
            <pre v-if="executorLog.stdout" class="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md border border-input bg-field p-3 font-mono text-[11.5px] leading-relaxed shadow-sm">{{ executorLog.stdout }}</pre>
            <p v-else class="text-[11px] text-muted-foreground">no stdout captured</p>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-muted-foreground">stderr</div>
            <pre v-if="executorLog.stderr" class="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md border border-input bg-field p-3 font-mono text-[11.5px] leading-relaxed shadow-sm">{{ executorLog.stderr }}</pre>
            <p v-else class="text-[11px] text-muted-foreground">no stderr captured</p>
          </div>
        </template>
        <p v-else class="text-xs text-muted-foreground">No execution log was recorded.</p>
      </section>
    </template>
  </div>
</template>
