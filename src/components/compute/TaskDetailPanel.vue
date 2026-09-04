<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Badge from '@/components/ui/Badge.vue'
import Notice from '@/components/ui/Notice.vue'
import Button from '@/components/ui/Button.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import NodeLabel from '@/components/ui/NodeLabel.vue'
import DetailList, { type Detail } from '@/components/ui/DetailList.vue'
import CountedList from '@/components/ui/CountedList.vue'
import Pagination from '@/components/ui/Pagination.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import JobExecutionsTable from '@/components/jobs/JobExecutionsTable.vue'
import JobPlacementFigure from '@/components/jobs/JobPlacementFigure.vue'
import RunLogDialog, { type LogStream } from '@/components/compute/RunLogDialog.vue'
import TaskHeader from '@/components/compute/TaskHeader.vue'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import ClaimWatchStep, { type WatchStage } from '@/components/onboarding/ClaimWatchStep.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useJobs } from '@/composables/useJobs'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useHiddenTasks } from '@/composables/useHiddenTasks'
import { useS3 } from '@/composables/useS3'
import { useRefresh } from '@/composables/useRefresh'
import type { MetadataDocumentListItem } from '@/lib/api'
import { formatJobProgress, type JobStatusResponse } from '@/lib/jobs'
import { detectQuickRun } from '@/lib/quickRuntimes'
import { POLL_IDLE_MS, follow, onWake } from '@/lib/poll'
import {
  TES_GROUP_TAG,
  TES_LABEL_TAG_PREFIX,
  TES_READONLY_TAGS,
  drsDownloadHref,
  drsObjectHref,
  isDrsReference,
  isTerminalTesState,
  parseS3Url,
  tesPlacementTags,
  type TesState,
  type TesTask,
} from '@/lib/tes'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { errorMessage, formatBytes, formatDuration, relativeTime, truncateMiddle } from '@/lib/utils'
import { Ban, Download, Eye, ExternalLink as ExternalLinkIcon, FileText, RotateCcw, Trash2 } from '@lucide/vue'

const NODE_LABEL_KEY = 'aruna-engine.org/node'
const NODE_LABEL_TAG = `${TES_LABEL_TAG_PREFIX}${NODE_LABEL_KEY}`

const props = defineProps<{ taskId: string; open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'canceled'): void; (e: 'hidden'): void }>()

const router = useRouter()
const { getTask, cancelTask, busy } = useTes()
const { getJob: getNativeJob } = useJobs()
const { myGroups, apiBaseUrl, metadataAtPath } = useAruna()
const { displayName } = useRealmNodes()
const { hide } = useHiddenTasks()
const s3 = useS3()

const task = ref<TesTask | null>(null)
const nativeJob = ref<JobStatusResponse | null>(null)
const nativeDetailUnavailable = ref(false)
const runCrate = ref<MetadataDocumentListItem | null>(null)
const runCrateLoading = ref(false)
const loadState = ref<'idle' | 'loading' | 'ready' | 'error' | 'unsupported'>('idle')
const loadError = ref<string | null>(null)
const lastPollError = ref<string | null>(null)
// Read again on every poll so placement, family state and outputs stay live.
const now = ref(Date.now())
let nativeRequestId = 0

const nativeFamily = computed(() => nativeJob.value?.family ?? null)

async function loadNativeJob(jobId: string, requestId: number) {
  try {
    const next = await getNativeJob(jobId)
    if (requestId !== nativeRequestId) return
    nativeJob.value = next
    nativeDetailUnavailable.value = false
  } catch {
    if (requestId !== nativeRequestId) return
    if (!nativeJob.value) nativeDetailUnavailable.value = true
  }
}

// ── Load + poll (view-owned) ─────────────────────────────────────────────────
let stopFollow: (() => void) | undefined
let stopWake: (() => void) | undefined
function stopPolling() {
  stopFollow?.()
  stopWake?.()
  stopFollow = undefined
  stopWake = undefined
}
function startPolling() {
  stopPolling()
  stopFollow = follow(poll, () => POLL_IDLE_MS)
  stopWake = onWake(() => void poll())
}
async function poll() {
  const requestId = nativeRequestId
  try {
    const [next] = await Promise.all([getTask(props.taskId, 'FULL'), loadNativeJob(props.taskId, requestId)])
    if (requestId !== nativeRequestId) return
    task.value = next
    now.value = Date.now()
    lastPollError.value = null
    if (isTerminalTesState(next.state)) stopPolling()
  } catch (err) {
    // A poll error never kills the timer or the rendered task.
    if (requestId !== nativeRequestId) return
    lastPollError.value = errorMessage(err)
  }
}

async function initialLoad() {
  loadState.value = 'loading'
  loadError.value = null
  lastPollError.value = null
  try {
    task.value = await getTask(props.taskId, 'FULL')
    now.value = Date.now()
    loadState.value = 'ready'
    if (!isTerminalTesState(task.value.state)) startPolling()
  } catch (err) {
    if (isTesUnsupported(err)) loadState.value = 'unsupported'
    else {
      loadState.value = 'error'
      loadError.value = errorMessage(err)
    }
  }
}

watch(
  () => [props.open, props.taskId] as const,
  ([open, id]) => {
    const requestId = ++nativeRequestId
    stopPolling()
    task.value = null
    nativeJob.value = null
    nativeDetailUnavailable.value = false
    runCrate.value = null
    if (!open || !id) return
    void initialLoad()
    void loadNativeJob(id, requestId)
    void findRunCrate()
  },
  { immediate: true },
)

onUnmounted(stopPolling)

// ── Derived ──────────────────────────────────────────────────────────────────
const headerTitle = computed(() => task.value?.name || truncateMiddle(props.taskId))
const askPrompt = computed(
  () => `Explain this compute run ${task.value?.id || props.taskId}: its current state, placement verdict, and outputs.`,
)

const groupTagId = computed(() => task.value?.tags?.[TES_GROUP_TAG])
const groupTagLabel = computed(() => {
  const id = groupTagId.value
  if (!id) return null
  return myGroups.value.find((g) => g.id === id)?.name ?? truncateMiddle(id)
})
// The group tag and placement tags have their own blocks, so this only lists
// the caller's remaining tags.
const otherTags = computed(() =>
  Object.entries(task.value?.tags ?? {}).filter(
    ([key]) =>
      key !== TES_GROUP_TAG
      && !key.startsWith(TES_LABEL_TAG_PREFIX)
      && !TES_READONLY_TAGS.includes(key),
  ),
)

const resourceSummary = computed(() => {
  const r = task.value?.resources
  if (!r) return ''
  const parts: string[] = []
  if (r.cpu_cores != null) parts.push(`${r.cpu_cores} cores`)
  if (r.ram_gb != null) parts.push(`${r.ram_gb} GB RAM`)
  if (r.disk_gb != null) parts.push(`${r.disk_gb} GB disk`)
  if (r.preemptible) parts.push('preemptible')
  return parts.join(' · ')
})

const constraintList = computed(() =>
  Object.entries(tesPlacementTags(task.value?.tags).labelConstraints).map(([key, value]) =>
    key === NODE_LABEL_KEY ? `node ${displayName(value)}` : `${key}=${value}`,
  ),
)
const tagList = computed(() => otherTags.value.map(([key, value]) => `${key}=${value}`))
const volumeList = computed(() => task.value?.volumes ?? [])
function countLabel(items: readonly string[], noun: string): string {
  return items.length === 1 ? items[0]! : `${items.length} ${noun}${items.length === 1 ? '' : 's'}`
}

const familySummary = computed(() => {
  const family = nativeFamily.value
  if (!family) return ''
  const aliases = `${family.alias_count} alias${family.alias_count === 1 ? '' : 'es'}`
  return `${aliases} · revision ${family.revision} · ${truncateMiddle(family.projection_digest, 6, 4)}`
})

const requestDetails = computed<Detail[]>(() => {
  const items: Detail[] = [
    {
      key: 'created',
      label: 'Created',
      value: task.value?.creation_time ? relativeTime(task.value.creation_time) : 'not recorded',
    },
    { key: 'group', label: 'Group', value: groupTagLabel.value ?? 'not recorded' },
  ]
  const image = task.value?.executors?.[0]?.image
  if (resourceSummary.value) items.push({ key: 'resources', label: 'Resources', value: resourceSummary.value })
  if (image) items.push({ key: 'image', label: 'Image', value: image, mono: true })
  if (constraintList.value.length) {
    items.push({ key: 'constraints', label: 'Constraints', value: countLabel(constraintList.value, 'constraint') })
  }
  if (familySummary.value) items.push({ key: 'family', label: 'Family', value: familySummary.value })
  if (volumeList.value.length) {
    items.push({ key: 'volumes', label: 'Volumes', value: countLabel(volumeList.value, 'volume') })
  }
  if (tagList.value.length) items.push({ key: 'tags', label: 'Tags', value: countLabel(tagList.value, 'tag') })
  return items
})

// Latest attempt's executor logs, aligned by index with task.executors.
const latestLog = computed(() => {
  const logs = task.value?.logs
  return logs?.length ? logs[logs.length - 1] : undefined
})
function executorLog(i: number) {
  return latestLog.value?.logs?.[i]
}

// The native result carries the same bounded tails for every node, so it
// backs the first executor when the TES log has none.
const nativeResult = computed(() => {
  const result = nativeJob.value?.result
  if (!result || typeof result !== 'object') return null
  return result as { exit_code?: number | null; stdout?: string; stderr?: string }
})
function executorStdout(i: number): string {
  return executorLog(i)?.stdout || (i === 0 ? nativeResult.value?.stdout || '' : '')
}
function executorStderr(i: number): string {
  return executorLog(i)?.stderr || (i === 0 ? nativeResult.value?.stderr || '' : '')
}
function executorExit(i: number): number | undefined {
  const code = executorLog(i)?.exit_code
  if (code != null) return code
  if (i === 0 && nativeResult.value?.exit_code != null) return nativeResult.value.exit_code
  return undefined
}

const exitCode = computed(() => executorExit(0))
const nodeConstraint = computed(() => task.value?.tags?.[NODE_LABEL_TAG] || null)
const executorKind = computed(
  () => tesPlacementTags(task.value?.tags).executorKind ?? nativeFamily.value?.placement?.executor_kind ?? null,
)

const runDuration = computed(() => {
  const log = latestLog.value
  const start = log?.start_time ? Date.parse(log.start_time) : NaN
  if (!Number.isFinite(start)) return null
  const end = log?.end_time ? Date.parse(log.end_time) : now.value
  return formatDuration(end - start) || null
})

const failed = computed(() => task.value?.state === 'EXECUTOR_ERROR' || task.value?.state === 'SYSTEM_ERROR')

// The one line that says what happened; the badge, the stages and this line
// tell the same story.
const failureMessage = computed(() => {
  const native = nativeJob.value?.error?.message?.trim()
  if (native) return native
  const system = latestLog.value?.system_logs
  const last = system?.length ? system[system.length - 1] : ''
  if (last) return last
  if (task.value?.state === 'SYSTEM_ERROR') return 'The node could not run it.'
  return exitCode.value === undefined ? 'The script failed.' : `The script exited with code ${exitCode.value}`
})

// The node reports how far the input copy got; without a total there is
// nothing to say beyond the state itself.
const copyProgress = computed(() => {
  const progress = nativeJob.value?.progress
  return progress && progress.total != null ? formatJobProgress(progress) : ''
})

interface Summary {
  tone: 'error' | 'warning' | 'info' | 'success'
  headline: string
}
const summary = computed<Summary | null>(() => {
  const state = task.value?.state
  if (!state) return null
  const duration = runDuration.value
  const where = executorKind.value ? ` on ${executorKind.value}` : ''
  switch (state) {
    case 'QUEUED':
      return {
        tone: 'info',
        headline: nodeConstraint.value
          ? `Waiting for a response from ${displayName(nodeConstraint.value)}`
          : 'Queued, waiting for a node',
      }
    case 'INITIALIZING':
      return { tone: 'info', headline: copyProgress.value ? `Copying inputs · ${copyProgress.value}` : 'Copying inputs' }
    case 'RUNNING':
      return { tone: 'info', headline: duration ? `Running for ${duration}${where}` : `Running${where}` }
    case 'PAUSED':
      return { tone: 'warning', headline: 'Paused' }
    case 'CANCELING':
      return { tone: 'warning', headline: 'Cancelling' }
    case 'COMPLETE':
      return { tone: 'success', headline: duration ? `Completed in ${duration}` : 'Completed' }
    case 'EXECUTOR_ERROR':
    case 'SYSTEM_ERROR':
      return { tone: 'error', headline: duration ? `Failed after ${duration}` : 'Failed' }
    case 'CANCELED':
      return { tone: 'warning', headline: 'Cancelled' }
    case 'PREEMPTED':
      return { tone: 'warning', headline: 'Preempted' }
    default:
      return { tone: 'info', headline: 'State unknown' }
  }
})

// The canonical TES progression IMPLIED by the current state; TES exposes no
// recorded state history, so this is a projection, not a timeline.
function stagesFor(state: TesState | undefined): WatchStage[] {
  const s = (q: WatchStage['state'], i: WatchStage['state'], r: WatchStage['state'], f: WatchStage['state'], rd?: string, fd?: string): WatchStage[] => [
    { key: 'queued', label: 'Queued', state: q },
    { key: 'init', label: 'Initializing', state: i },
    { key: 'running', label: 'Running', state: r, detail: rd },
    { key: 'finished', label: 'Finished', state: f, detail: fd },
  ]
  switch (state) {
    case 'QUEUED':
      return s('active', 'pending', 'pending', 'pending')
    case 'INITIALIZING':
      return s('done', 'active', 'pending', 'pending')
    case 'RUNNING':
      return s('done', 'done', 'active', 'pending')
    case 'PAUSED':
      return s('done', 'done', 'active', 'pending', 'paused')
    case 'CANCELING':
      return s('done', 'done', 'active', 'pending', 'canceling')
    case 'COMPLETE':
      return s('done', 'done', 'done', 'done')
    case 'EXECUTOR_ERROR':
      return s('done', 'done', 'done', 'failed', undefined, 'the script failed')
    case 'SYSTEM_ERROR':
      return s('done', 'done', 'done', 'failed', undefined, 'the node failed to run it')
    case 'CANCELED':
      return s('done', 'done', 'done', 'failed', undefined, 'cancelled')
    case 'PREEMPTED':
      return s('done', 'done', 'done', 'failed', undefined, 'preempted')
    default:
      return s('pending', 'pending', 'pending', 'pending') // UNKNOWN / undefined
  }
}
const stages = computed(() => {
  const list = stagesFor(task.value?.state)
  const where = [
    nodeConstraint.value ? `node ${displayName(nodeConstraint.value)}` : '',
    executorKind.value ? `executor ${executorKind.value}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const queued = list[0]
  const running = list[2]
  if (queued && queued.state !== 'pending') queued.detail = where || 'any node with an executor'
  if (running && running.state !== 'pending' && where) running.detail = [where, running.detail].filter(Boolean).join(' · ')
  return list
})

// ── Output links ─────────────────────────────────────────────────────────────
type ResolvedLink =
  | { kind: 's3'; bucketId: string; prefix: string; objectKey: string }
  | { kind: 'drs'; object: string; download: string }
  | { kind: 'plain' }

function resolveUrl(url: string): ResolvedLink {
  const parsed = parseS3Url(url, s3.endpoint.value)
  if (parsed) {
    // Slash-less parent prefix, matching DataManagerView.navigateTo (which
    // appends its own trailing '/'); a trailing slash here would list the
    // bucket at "prefix//", an always-empty folder view.
    const prefix = parsed.key.includes('/') ? parsed.key.slice(0, parsed.key.lastIndexOf('/')) : ''
    return { kind: 's3', bucketId: parsed.bucket, prefix, objectKey: parsed.key }
  }
  // Only node-resolvable id forms (w3id URL / content-hash ARN) get a DRS href;
  // `drs://` URIs are accepted for TES input but the node's DRS route rejects
  // them (parse_requested_object_id), so they fall through to plain rendering.
  if (isDrsReference(url) && !/^drs:\/\//i.test(url)) {
    return { kind: 'drs', object: drsObjectHref(apiBaseUrl.value, url), download: drsDownloadHref(apiBaseUrl.value, url) }
  }
  return { kind: 'plain' }
}

interface OutRow {
  url: string
  path: string
  size?: number
  link: ResolvedLink
}

// One captured file previewed in place, through the same viewer stack the Data
// view uses; the viewers themselves stay in their own chunks.
const PreviewBody = defineAsyncComponent({
  loader: () => import('@/components/preview/PreviewBody.vue'),
  onError: asyncChunkError,
})
const previewing = ref<string | null>(null)
function togglePreview(row: OutRow) {
  previewing.value = previewing.value === row.url ? null : row.url
}
function objectName(key: string): string {
  return key.split('/').filter(Boolean).pop() || key
}
const declaredOutputs = computed<OutRow[]>(() =>
  (task.value?.outputs ?? []).map((o) => ({ url: o.url, path: o.path, link: resolveUrl(o.url) })),
)
const capturedOutputs = computed<OutRow[]>(() =>
  (task.value?.logs ?? [])
    .flatMap((l) => l.outputs ?? [])
    .map((o) => ({ url: o.url, path: o.path, size: Number(o.size_bytes), link: resolveUrl(o.url) })),
)

// A run may capture hundreds of files, so both lists page.
const OUTPUT_PAGE = 8
const declaredPage = ref(1)
const capturedPage = ref(1)
const declaredShown = computed(() => pageSlice(declaredOutputs.value, declaredPage.value))
const capturedShown = computed(() => pageSlice(capturedOutputs.value, capturedPage.value))
function pageSlice(rows: OutRow[], page: number): OutRow[] {
  return rows.slice((page - 1) * OUTPUT_PAGE, page * OUTPUT_PAGE)
}
function pageTotal(rows: OutRow[]): number {
  return Math.max(1, Math.ceil(rows.length / OUTPUT_PAGE))
}
function pageRange(rows: OutRow[], page: number): string {
  const first = (page - 1) * OUTPUT_PAGE + 1
  return `${first}–${Math.min(page * OUTPUT_PAGE, rows.length)} of ${rows.length} output${rows.length === 1 ? '' : 's'}`
}

// ── Run dataset (targeted lookup at runs/{taskId}) ───────────────────────────
async function findRunCrate() {
  if (runCrateLoading.value) return
  runCrateLoading.value = true
  try {
    runCrate.value = await metadataAtPath(`runs/${props.taskId}`)
  } catch {
    // The crate is written when the run completes; a failed lookup just keeps
    // the section in its "not found yet" state.
    runCrate.value = null
  } finally {
    runCrateLoading.value = false
  }
}

const { busy: crateBusy, refresh: onFindCrate } = useRefresh(findRunCrate)
const spinning = computed(() => crateBusy.value || runCrateLoading.value)

// The summary already prints the failure message, so a failed run lists only
// the system log lines that add something.
const systemLogLines = computed(() => {
  const lines = latestLog.value?.system_logs ?? []
  if (!failed.value) return lines
  const message = failureMessage.value.trim()
  return lines.filter((line) => line.trim() !== message)
})

// The last error line next to the failure message, unless it says the same.
const stderrTail = computed(() => {
  const lines = executorStderr(0).split('\n').filter((line) => line.trim())
  const last = lines[lines.length - 1]?.trim() ?? ''
  return last && last !== failureMessage.value.trim() ? last : ''
})

const PREVIEW_LINES = 8
function tail(text: string): string[] {
  return text.split('\n').slice(-PREVIEW_LINES)
}
function hidden(text: string): number {
  return Math.max(0, text.split('\n').length - PREVIEW_LINES)
}
// One line for the error stream: how much there is, and the last thing it said.
function stderrSummary(i: number): string {
  const lines = executorStderr(i).split('\n').filter((line) => line.trim())
  if (!lines.length) return ''
  return `${lines.length} line${lines.length === 1 ? '' : 's'} · last: ${lines[lines.length - 1]}`
}

const logOpen = ref(false)
const logIndex = ref(0)
function openLog(i: number) {
  logIndex.value = i
  logOpen.value = true
}
const logStreams = computed<LogStream[]>(() => {
  const i = logIndex.value
  const streams: LogStream[] = [{ key: 'stdout', label: 'stdout', text: executorStdout(i) }]
  if (executorStderr(i)) streams.push({ key: 'stderr', label: 'stderr', text: executorStderr(i) })
  if (systemLogLines.value.length) {
    streams.push({ key: 'system', label: 'system', text: systemLogLines.value.join('\n') })
  }
  return streams
})

// ── Cancel (two-step inline confirm) ─────────────────────────────────────────
const confirmingCancel = ref(false)
const cancelError = ref<string | null>(null)
let cancelResetTimer: number | undefined
function requestCancel() {
  confirmingCancel.value = true
  window.clearTimeout(cancelResetTimer)
  cancelResetTimer = window.setTimeout(() => (confirmingCancel.value = false), 4000)
}
async function confirmCancel() {
  confirmingCancel.value = false
  window.clearTimeout(cancelResetTimer)
  cancelError.value = null
  try {
    await cancelTask(props.taskId)
    task.value = await getTask(props.taskId, 'FULL')
    emit('canceled')
  } catch (err) {
    cancelError.value = errorMessage(err)
  }
}
const active = computed(() => !!task.value && !isTerminalTesState(task.value.state))
const canCancel = active

// ── Re-run ───────────────────────────────────────────────────────────────────
// Quick runs reopen the quick-run wizard, anything else the custom-run wizard;
// both read ?rerun=<taskId> and prefill from the FULL run record.
function rerun() {
  if (!task.value) return
  const target = detectQuickRun(task.value) ? 'compute-quick' : 'compute-new'
  void router.push({ name: target, query: { rerun: props.taskId } })
}

// ── Delete (client-side hide; TES has no delete endpoint yet) ────────────────
const confirmingDelete = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)
function requestDelete() {
  confirmingDelete.value = true
  deleteError.value = null
}
// An active task is canceled first so the hide never orphans a running job.
async function confirmDelete() {
  deleteBusy.value = true
  deleteError.value = null
  try {
    if (canCancel.value) {
      await cancelTask(props.taskId)
      emit('canceled')
    }
    hide(props.taskId)
    confirmingDelete.value = false
    emit('hidden')
    emit('update:open', false)
  } catch (err) {
    deleteError.value = errorMessage(err)
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <DetailDialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <template #header>
      <DialogTitle class="sr-only">Run details</DialogTitle>
      <div v-if="task" class="flex items-start justify-between gap-3">
        <TaskHeader
          :title="headerTitle"
          :run-id="task.id || taskId"
          :state="task.state"
          :tags="task.tags"
          :description="task.description"
        />
        <AskAiButton :prompt="askPrompt" icon-only class="shrink-0" />
      </div>
      <Skeleton v-else-if="loadState === 'loading'" class="h-6 w-2/3" />
    </template>

    <div>
      <div v-if="loadState === 'loading'" class="space-y-4">
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-40 w-full" />
      </div>

      <Notice v-else-if="loadState === 'unsupported'" tone="warning">
        This node does not accept runs, so the run detail cannot be loaded.
      </Notice>

      <ErrorPanel v-else-if="loadState === 'error'" :message="loadError || 'Failed to load the run.'" @retry="initialLoad" />

      <div v-else-if="task" class="space-y-8">
        <!-- What happened, in one place -->
        <Notice v-if="summary" :tone="summary.tone" class="space-y-2 px-4 py-3">
          <p class="text-sm font-semibold">{{ summary.headline }}</p>
          <p v-if="failed" class="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">{{ failureMessage }}</p>
          <div v-if="failed || nodeConstraint" class="flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge v-if="failed && nativeJob?.error?.kind" variant="destructive" size="sm" class="uppercase">{{ nativeJob.error.kind }}</Badge>
            <Badge v-if="failed && exitCode !== undefined" variant="outline" size="sm">exit {{ exitCode }}</Badge>
            <Badge v-if="failed && nativeJob?.attempts" variant="outline" size="sm">
              {{ nativeJob.attempts }} attempt{{ nativeJob.attempts === 1 ? '' : 's' }}
            </Badge>
            <span v-if="nodeConstraint" class="inline-flex items-center gap-1">node <NodeLabel :node-id="nodeConstraint" size="sm" /></span>
          </div>
          <p v-if="failed && stderrTail" class="truncate font-mono text-[11px]" :title="executorStderr(0)">
            stderr: {{ stderrTail }}
          </p>
          <p v-if="task.state === 'QUEUED'" class="flex flex-wrap items-center gap-2 text-[11px]">
            One node answers and runs it; another steps in after a while without a response.
            <DocsLink topic="compute-run" section="Follow the run" />
          </p>
        </Notice>
        <p v-if="lastPollError" class="text-[11px] text-muted-foreground">Refresh failed, retrying.</p>

        <section class="space-y-3">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Progress</h3>
          <ClaimWatchStep :stages="stages" />
        </section>

        <section class="space-y-3">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Placement</h3>
          <JobPlacementFigure v-if="nativeFamily" :placement="nativeFamily.placement" />
          <p v-else-if="nativeDetailUnavailable" class="text-xs text-muted-foreground">
            Distributed execution detail could not be loaded.
          </p>
          <p v-else class="text-xs text-muted-foreground">No placement record for this run yet.</p>
        </section>

        <section v-if="nativeFamily" class="space-y-3">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Executions</h3>
          <JobExecutionsTable :family="nativeFamily" />
        </section>

        <section data-tutorial="run-executors" class="space-y-3">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Output</h3>
          <p v-if="!task.logs?.length && !nativeResult" class="text-xs text-muted-foreground">Nothing captured yet.</p>
          <div v-for="(executor, i) in task.executors" :key="i" class="surface space-y-3 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-0.5">
                <div class="font-mono text-[11px] text-foreground">{{ executor.image }}</div>
                <div class="whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">{{ executor.command.join(' ') }}</div>
              </div>
              <Badge
                v-if="executorExit(i) !== undefined"
                :variant="executorExit(i) === 0 ? 'success' : 'destructive'"
                class="shrink-0"
              >
                exit {{ executorExit(i) }}
              </Badge>
            </div>
            <div v-if="executorLog(i)?.start_time || executorLog(i)?.end_time" class="text-[11px] text-muted-foreground">
              <span v-if="executorLog(i)!.start_time">started {{ relativeTime(executorLog(i)!.start_time!) }}</span>
              <span v-if="executorLog(i)!.end_time"> · ended {{ relativeTime(executorLog(i)!.end_time!) }}</span>
            </div>
            <template v-if="executorStdout(i) || executorStderr(i)">
              <div v-if="executorStdout(i)">
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {{ executorStderr(i) ? 'stdout' : 'output' }}<span v-if="hidden(executorStdout(i))"> · last {{ tail(executorStdout(i)).length }} lines</span>
                </div>
                <div class="relative mt-1">
                  <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">{{ tail(executorStdout(i)).join('\n') }}</pre>
                  <div
                    v-if="hidden(executorStdout(i))"
                    aria-hidden="true"
                    class="pointer-events-none absolute inset-x-0 top-0 h-8 rounded-t bg-gradient-to-b from-background to-transparent"
                  />
                </div>
              </div>
              <p v-if="stderrSummary(i)" class="truncate font-mono text-[11px] text-destructive" :title="executorStderr(i)">
                stderr: {{ stderrSummary(i) }}
              </p>
            </template>
            <p v-else-if="executorLog(i) || nativeResult" class="text-[11px] text-muted-foreground">No output captured.</p>
            <Button variant="outline" size="sm" @click="openLog(i)">
              <FileText class="h-3.5 w-3.5" /> Open full log
            </Button>
          </div>
        </section>

        <!-- Outputs and the run dataset -->
        <section data-tutorial="run-artifacts" class="space-y-3">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Outputs</h3>

          <div v-if="declaredOutputs.length" class="space-y-1.5">
            <div class="text-[11px] font-medium text-foreground">Declared</div>
            <div v-for="(row, i) in declaredShown" :key="'d' + row.url + i" class="flex flex-wrap items-center gap-2 text-[11px]">
              <span class="font-mono text-muted-foreground">{{ row.path }}</span>
              <span class="text-muted-foreground">to</span>
              <RouterLink v-if="row.link.kind === 's3'" class="font-mono text-primary hover:underline" :to="{ name: 'bucket', params: { bucketId: row.link.bucketId }, query: row.link.prefix ? { prefix: row.link.prefix } : {} }">{{ row.url }}</RouterLink>
              <template v-else-if="row.link.kind === 'drs'">
                <a class="inline-flex items-center gap-1 font-mono text-primary hover:underline" :href="row.link.object" target="_blank" rel="noopener noreferrer">{{ truncateMiddle(row.url, 24, 12) }} <ExternalLinkIcon class="h-3 w-3" /></a>
                <Tooltip label="Download this output">
                  <a class="text-muted-foreground hover:text-foreground" :href="row.link.download" target="_blank" rel="noopener noreferrer" aria-label="Download this output" title="Download this output"><Download class="h-3.5 w-3.5" /></a>
                </Tooltip>
              </template>
              <ExternalLink v-else :href="row.url" :label="row.url" class="font-mono text-muted-foreground hover:text-primary" />
            </div>
            <div v-if="declaredOutputs.length > OUTPUT_PAGE" class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-[11px] text-muted-foreground">{{ pageRange(declaredOutputs, declaredPage) }}</span>
              <Pagination
                :page="declaredPage"
                :page-count="pageTotal(declaredOutputs)"
                :has-next="declaredPage < pageTotal(declaredOutputs)"
                @update:page="(page: number) => (declaredPage = page)"
              />
            </div>
          </div>

          <div v-if="capturedOutputs.length" class="space-y-1.5">
            <div class="text-[11px] font-medium text-foreground">Captured</div>
            <div v-for="(row, i) in capturedShown" :key="'c' + row.url + i" class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-2 text-[11px]">
                <Button
                  v-if="row.link.kind === 's3'"
                  variant="ghost"
                  size="sm"
                  class="h-6 px-1.5"
                  :aria-label="`Preview ${objectName(row.link.objectKey)}`"
                  @click="togglePreview(row)"
                >
                  <Eye class="h-3.5 w-3.5" /> {{ previewing === row.url ? 'Hide' : 'Preview' }}
                </Button>
                <span class="font-mono text-muted-foreground">{{ row.path }}</span>
                <span v-if="row.size !== undefined && !Number.isNaN(row.size)" class="text-muted-foreground">{{ formatBytes(row.size) }}</span>
                <span class="text-muted-foreground">to</span>
                <RouterLink v-if="row.link.kind === 's3'" class="font-mono text-primary hover:underline" :to="{ name: 'bucket', params: { bucketId: row.link.bucketId }, query: row.link.prefix ? { prefix: row.link.prefix } : {} }">{{ row.url }}</RouterLink>
                <template v-else-if="row.link.kind === 'drs'">
                  <a class="inline-flex items-center gap-1 font-mono text-primary hover:underline" :href="row.link.object" target="_blank" rel="noopener noreferrer">{{ truncateMiddle(row.url, 24, 12) }} <ExternalLinkIcon class="h-3 w-3" /></a>
                  <Tooltip label="Download this output">
                    <a class="text-muted-foreground hover:text-foreground" :href="row.link.download" target="_blank" rel="noopener noreferrer" aria-label="Download this output" title="Download this output"><Download class="h-3.5 w-3.5" /></a>
                  </Tooltip>
                </template>
                <ExternalLink v-else :href="row.url" :label="row.url" class="font-mono text-muted-foreground hover:text-primary" />
              </div>
              <PreviewBody
                v-if="previewing === row.url && row.link.kind === 's3'"
                active
                :bucket="row.link.bucketId"
                :object-key="row.link.objectKey"
                :name="objectName(row.link.objectKey)"
                :size="row.size !== undefined && !Number.isNaN(row.size) ? row.size : undefined"
              />
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-[11px] text-muted-foreground">
                {{ pageRange(capturedOutputs, capturedPage) }} · all in the run dataset
              </span>
              <Pagination
                v-if="capturedOutputs.length > OUTPUT_PAGE"
                :page="capturedPage"
                :page-count="pageTotal(capturedOutputs)"
                :has-next="capturedPage < pageTotal(capturedOutputs)"
                @update:page="(page: number) => (capturedPage = page)"
              />
            </div>
          </div>
          <p v-if="!declaredOutputs.length && !capturedOutputs.length" class="text-xs text-muted-foreground">No files captured for this run.</p>

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="text-muted-foreground">Run dataset:</span>
            <RouterLink v-if="runCrate" class="inline-flex items-center gap-1.5 text-primary hover:underline" :to="{ name: 'dataset', params: { id: runCrate.document_id } }">
              <FileText class="h-3.5 w-3.5" /> Open
            </RouterLink>
            <template v-else>
              <span class="text-muted-foreground">written once the run completes</span>
              <RefreshButton :busy="spinning" label="Check again" @click="onFindCrate" />
            </template>
          </div>
        </section>

        <section data-tutorial="run-details" class="space-y-3">
          <h3 class="font-display text-sm font-semibold text-aruna-navy">Request</h3>
          <DetailList :items="requestDetails">
            <template #constraints><CountedList :items="constraintList" noun="constraint" /></template>
            <template #volumes><CountedList :items="volumeList" noun="volume" mono /></template>
            <template #tags><CountedList :items="tagList" noun="tag" mono /></template>
          </DetailList>
        </section>
      </div>
    </div>

    <template v-if="task" #footer>
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <Button v-if="!active" variant="outline" size="sm" title="Starts a new run prefilled from this one" @click="rerun"><RotateCcw class="h-3.5 w-3.5" /> Run again</Button>
          <template v-if="canCancel">
            <template v-if="!confirmingCancel">
              <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" :disabled="busy" @click="requestCancel"><Ban class="h-3.5 w-3.5" /> Cancel run</Button>
            </template>
            <template v-else>
              <Button variant="destructive" size="sm" :disabled="busy" @click="confirmCancel"><Ban class="h-3.5 w-3.5" /> Confirm cancel</Button>
              <Button variant="ghost" size="sm" :disabled="busy" @click="confirmingCancel = false">Keep running</Button>
            </template>
          </template>
          <div class="ml-auto flex items-center gap-2">
            <template v-if="!confirmingDelete">
              <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" :disabled="deleteBusy" @click="requestDelete">
                <Trash2 class="h-3.5 w-3.5" /> {{ canCancel ? 'Cancel and delete' : 'Delete' }}
              </Button>
            </template>
            <template v-else>
              <Button variant="destructive" size="sm" :disabled="deleteBusy || busy" @click="confirmDelete">
                <Trash2 class="h-3.5 w-3.5" /> {{ deleteBusy ? 'Deleting…' : canCancel ? 'Confirm cancel and delete' : 'Confirm delete' }}
              </Button>
              <Button variant="ghost" size="sm" :disabled="deleteBusy" @click="confirmingDelete = false">Keep</Button>
            </template>
          </div>
        </div>
        <p v-if="confirmingDelete" class="text-[11px] text-muted-foreground">
          {{ canCancel ? 'Cancels the run first, then removes' : 'Removes' }} it from the run list in this browser only; the record stays on the node and reappears via the Deleted filter.
        </p>
        <p v-if="cancelError" class="text-[11px] text-destructive">{{ cancelError }}</p>
        <p v-if="deleteError" class="text-[11px] text-destructive">{{ deleteError }}</p>
      </div>
    </template>
  </DetailDialog>
  <RunLogDialog
    v-if="task"
    :open="logOpen"
    :streams="logStreams"
    :name="headerTitle"
    @update:open="(value: boolean) => (logOpen = value)"
  />
</template>
