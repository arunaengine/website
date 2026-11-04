<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Badge from '@/components/ui/Badge.vue'
import IconButton from '@/components/ui/IconButton.vue'
import IconTile from '@/components/ui/IconTile.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
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
import JobKeyWait from '@/components/jobs/JobKeyWait.vue'
import JobPlacementFigure from '@/components/jobs/JobPlacementFigure.vue'
import RunLogDialog, { type LogStream } from '@/components/compute/RunLogDialog.vue'
import TaskHeader from '@/components/compute/TaskHeader.vue'
import SaveRunDialog from '@/components/compute/SaveRunDialog.vue'
import RunDatasetForm from '@/components/compute/RunDatasetForm.vue'
import AskAiButton from '@/components/assistant/AskAiButton.vue'
import type { WatchStage } from '@/components/onboarding/ClaimWatchStep.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useJobs } from '@/composables/useJobs'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useS3 } from '@/composables/useS3'
import { useRefresh } from '@/composables/useRefresh'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { resolveObjectUrl } from '@/composables/s3/endpoints'
import { downloadCrateJson } from '@/lib/crateImport'
import { getLocalRunCrate, requireDevice } from '@/lib/deviceApi'
import { deleteErrorMessage, formatJobProgress, type JobStatusResponse } from '@/lib/jobs'
import { groupInputs, type FileGroup } from '@/lib/fileGroups'
import { POLL_ACTIVE_MS, follow, onWake } from '@/lib/poll'
import { parseRunCrate, servedSource, sourceHost, type RunCrateModel } from '@/lib/runCrate'
import {
  TES_GROUP_TAG,
  TES_IDEMPOTENCY_TAG,
  TES_LABEL_TAG_PREFIX,
  TES_READONLY_TAGS,
  drsDownloadHref,
  drsObjectHref,
  isDrsReference,
  inputPlace,
  isTerminalTesState,
  nativeInput,
  parseS3Url,
  isLocalRun,
  startedRunId,
  tesPlacementTags,
  type TesState,
  type TesTask,
} from '@/lib/tes'
import { sessionRuntime } from '@/lib/notebook/submit'
import { objectHref } from '@/lib/assistant/objectLinks'
import { asyncChunkError } from '@/lib/chunk-recovery'
import { errorMessage, formatBytes, formatClock, formatDateTime, formatDuration, formatNumber, formatResourceGb, relativeTime, truncateMiddle } from '@/lib/utils'
import {
  Activity,
  ArrowLeftRight,
  Ban,
  ChevronDown,
  Code,
  CircleCheck,
  Container,
  Download,
  Eye,
  ExternalLink as ExternalLinkIcon,
  ChevronRight,
  File as FileIcon,
  FileText,
  Flag,
  Folder,
  FolderPlus,
  Hourglass,
  Info,
  LogIn,
  MapPinned,
  Maximize2,
  Play,
  RotateCcw,
  Server,
  SquareTerminal,
  Star,
  Trash2,
} from '@lucide/vue'

const NODE_LABEL_KEY = 'aruna-engine.org/node'
const NODE_LABEL_TAG = `${TES_LABEL_TAG_PREFIX}${NODE_LABEL_KEY}`

// `apiBase` is the API of the node that owns the run, when the serving node does not.
const props = defineProps<{ taskId: string; open: boolean; apiBase?: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'canceled'): void
  (e: 'deleted'): void
  (e: 'resolved', id: string): void
}>()

const router = useRouter()
const { getTask, cancelTask, listTasks, busy } = useTes()
const { getJob: getNativeJob, deleteJob } = useJobs()
const { myGroups, apiBaseUrl, metadataAtPath, downloadProvenanceCrate, getFileOrigin, getRun, loadRoCrate } = useAruna()
const { displayName, targets: realmTargets } = useRealmNodes()
const s3 = useS3()

const task = ref<TesTask | null>(null)
const nativeJob = ref<JobStatusResponse | null>(null)
const nativeDetailUnavailable = ref(false)
const runCrate = ref<{ document_id: string } | null>(null)
const runCrateLoading = ref(false)
const resultsFormOpen = ref(false)
let crateTask: string | null = null
const loadState = ref<'idle' | 'loading' | 'ready' | 'error' | 'unsupported'>('idle')
const loadError = ref<string | null>(null)
const lastPollError = ref<string | null>(null)
// Read again on every poll so placement, family state and outputs stay live.
const now = ref(Date.now())
let nativeRequestId = 0

const nativeFamily = computed(() => nativeJob.value?.family ?? null)
// The node that ran the work writes the run record under its own job; an output's origin names it.
const crateOutput = computed(() => nativeFamily.value?.outputs.find((output) => output.version_id) ?? null)
const crateJob = computed(() => {
  const output = crateOutput.value
  return output ? `${props.taskId}:${output.bucket}/${output.key}@${output.version_id}` : props.taskId
})

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
  // Polling runs only while the run is active, so it takes the active beat.
  stopFollow = follow(poll, () => POLL_ACTIVE_MS)
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
  const requestId = nativeRequestId
  loadState.value = 'loading'
  loadError.value = null
  lastPollError.value = null
  try {
    const next = await getTask(props.taskId, 'FULL')
    // A task opened meanwhile owns the panel; this answer belongs to the previous one.
    if (requestId !== nativeRequestId) return
    task.value = next
    now.value = Date.now()
    loadState.value = 'ready'
    if (!isTerminalTesState(next.state)) startPolling()
  } catch (err) {
    if (requestId !== nativeRequestId) return
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
    resultsFormOpen.value = false
    if (!open || !id) return
    void initialLoad()
    void loadNativeJob(id, requestId)
    void findRunCrate()
  },
  { immediate: true },
)

onUnmounted(stopPolling)

// A run record names the executing node's copy of the run; the started run holds node and placement.
let startedAsked = ''
watch([task, nativeJob], ([current, job]) => {
  const key = current?.tags?.[TES_IDEMPOTENCY_TAG]
  if (!current?.id || !job || job.family || !key || tesPlacementTags(current.tags).logicalState) return
  if (startedAsked === current.id) return
  startedAsked = current.id
  void findStartedRun(current.id, key, nativeRequestId)
})
async function findStartedRun(id: string, key: string, requestId: number) {
  const bases = [undefined, ...realmTargets.value.filter((node) => !node.isLocal && node.apiBase).map((node) => node.apiBase!)]
  const pages = await Promise.all(bases.map((base) =>
    listTasks({ tag_key: TES_IDEMPOTENCY_TAG, tag_value: key, view: 'BASIC' }, base).catch(() => null)))
  const started = startedRunId(pages.flatMap((page) => page?.tasks ?? []), id)
  if (started && requestId === nativeRequestId) emit('resolved', started)
}

// ── Derived ──────────────────────────────────────────────────────────────────
const headerTitle = computed(() => task.value?.name || truncateMiddle(props.taskId))
// What ran in one line: the tool and its version, then what the run says about itself.
const headerSubtitle = computed(() => {
  const image = task.value?.executors?.[0]?.image ?? ''
  // The tag names a version, a digest does not; a description naming the tool says it already.
  const [name, version] = (image.split('/').pop() ?? '').split('@')[0]!.split(':')
  const description = task.value?.description ?? ''
  const tool = name && !description.includes(name) ? [name, version].filter(Boolean).join(' ') : ''
  const notebook = sessionRuntime(task.value?.tags) !== null ? 'notebook session' : ''
  return [tool, description, notebook].filter(Boolean).join(', ')
})
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
  if (r.cpu_cores != null) parts.push(`${r.cpu_cores} core${r.cpu_cores === 1 ? '' : 's'}`)
  if (r.ram_gb != null) parts.push(`${formatResourceGb(r.ram_gb)} RAM`)
  if (r.disk_gb != null) parts.push(`${formatResourceGb(r.disk_gb)} disk`)
  if (r.preemptible) parts.push('preemptible')
  return parts.join(', ')
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
  return `${aliases}, revision ${family.revision}, ${truncateMiddle(family.projection_digest, 6, 4)}`
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

// Counted from the first start, so a run placed again keeps its real elapsed time.
const runDuration = computed(() => {
  const log = latestLog.value
  const starts = [
    nativeFamily.value?.started_at_ms ?? NaN,
    ...(task.value?.logs ?? []).map((entry) => (entry.start_time ? Date.parse(entry.start_time) : NaN)),
  ].filter(Number.isFinite)
  if (!starts.length || !log?.start_time) return null
  const start = Math.min(...starts)
  const end = log?.end_time ? Date.parse(log.end_time) : now.value
  return formatDuration(end - start) || null
})

const failed = computed(() => task.value?.state === 'EXECUTOR_ERROR' || task.value?.state === 'SYSTEM_ERROR')

// The node that ran the work, as the plan or the node constraint names it.
const runNode = computed(() => nativeFamily.value?.placement?.target_node_id ?? nodeConstraint.value)
const resourceShort = computed(() => {
  const r = task.value?.resources
  const parts = [r?.cpu_cores != null ? `${r.cpu_cores}\u00a0CPU` : '', r?.ram_gb != null ? formatResourceGb(r.ram_gb) : '']
  return parts.filter(Boolean).join(', ')
})
function when(iso: string | undefined): string {
  const at = iso ? Date.parse(iso) : NaN
  return Number.isFinite(at) ? formatDateTime(at) : ''
}
function clock(iso: string | undefined): string {
  const at = iso ? Date.parse(iso) : NaN
  return Number.isFinite(at) ? formatClock(at) : ''
}
const facts = computed<Detail[]>(() => {
  const done = isTerminalTesState(task.value?.state)
  return [
    { key: 'duration', label: 'Duration', value: runDuration.value ?? 'Not started yet' },
    { key: 'node', label: 'Node', value: runNode.value ? displayName(runNode.value) : done ? 'Not recorded' : 'Not placed yet' },
    { key: 'resources', label: 'Resources', value: resourceShort.value || 'No limits requested' },
    { key: 'group', label: 'Group', value: groupTagLabel.value ?? 'Not recorded' },
    { key: 'started', label: 'Started', value: when(latestLog.value?.start_time) || 'Not yet' },
    { key: 'finished', label: 'Finished', value: when(latestLog.value?.end_time) || (done ? 'Not recorded' : 'Not yet') },
  ]
})

// A finished run of this computer keeps its own run record here until it is published.
const { deviceClient } = useDeviceStatus()
const localRecordJob = computed(() =>
  task.value?.state === 'COMPLETE' && isLocalRun(task.value.tags) ? tesPlacementTags(task.value.tags).jobId ?? null : null,
)
const recordError = ref<string | null>(null)
async function downloadRunRecord() {
  const jobId = localRecordJob.value
  if (!jobId) return
  recordError.value = null
  try {
    downloadCrateJson(await getLocalRunCrate(jobId, requireDevice(deviceClient.value, 'The run record')))
  } catch (cause) {
    recordError.value = errorMessage(cause)
  }
}

// The plan's input record wins over its totals; an older node sends only the estimate.
const INPUTS_SHOWN = 20
const placementInputs = computed(() => nativeFamily.value?.placement?.inputs ?? [])
const movedBytes = computed(() =>
  placementInputs.value.length
    ? placementInputs.value.reduce((sum, input) => (input.source_node_id ? sum + input.bytes : sum), 0)
    : (nativeFamily.value?.placement?.estimated_transfer_bytes ?? 0))
const stayedBytes = computed(() =>
  placementInputs.value.reduce((sum, input) => (input.source_node_id ? sum : sum + input.bytes), 0))
// The line and the run's facts already say what moved and where it ran.
const placementInfo = 'Estimated at planning time, not measured.'

const attemptCount = computed(() => nativeJob.value?.attempts || task.value?.logs?.length || 0)
const executorLabel = computed(() => {
  const kind = executorKind.value
  return kind ? `${kind.charAt(0).toUpperCase()}${kind.slice(1)}` : 'Not recorded'
})
function executorDetails(i: number): Detail[] {
  const executor = task.value?.executors?.[i]
  if (!executor) return []
  return [
    { key: 'image', label: task.value!.executors.length > 1 ? `Image ${i + 1}` : 'Image', value: executor.image, mono: true },
    { key: 'command', label: 'Command', value: executor.command.join(' '), mono: true },
  ]
}
// An input from a bucket opens the folder it came from, on the node a pinned input names.
function inputLink(url: string | undefined) {
  if (!url) return null
  const native = nativeInput({ url, path: '' })
  const link = resolveUrl(native.url ?? url)
  if (link.kind !== 's3') return null
  const route = bucketRoute(link.bucketId, link.prefix)
  return native.source_node_id ? { ...route, query: { ...route.query, node: native.source_node_id } } : route
}
// Inputs of one bucket folder read as one row, as the run record lists them, opened on request.
const inputGroups = computed(() => groupInputs(task.value?.inputs ?? []))
const openedInputs = ref(new Set<string>())
function toggleInputs(key: string) {
  const next = new Set(openedInputs.value)
  if (!next.delete(key)) next.add(key)
  openedInputs.value = next
}
function groupLink(group: FileGroup) {
  if (!group.bucket) return null
  const route = bucketRoute(group.bucket, group.folder.replace(/\/$/, ''))
  return group.nodeId ? { ...route, query: { ...route.query, node: group.nodeId } } : route
}
// The source a whole group was read from, when every file names the same one.
function groupSource(urls: (string | undefined)[]): string {
  const hosts = new Set(urls.map((url) => (readFrom(url) ? sourceHost(readFrom(url)!) : '')))
  return hosts.size === 1 ? [...hosts][0]! : ''
}
// The node holding each output bucket, read from where the run wrote, so its folder opens there.
const outputNodes = computed(() => new Map((nativeFamily.value?.outputs ?? []).flatMap((output) => {
  const owner = output.endpoint_url ? resolveObjectUrl(`${output.endpoint_url.replace(/\/+$/, '')}/${output.bucket}/${output.key}`) : null
  return owner?.nodeId ? [[output.bucket, owner.nodeId] as const] : []
})))
function bucketRoute(bucketId: string, prefix: string) {
  const node = outputNodes.value.get(bucketId)
  return { name: 'bucket', params: { bucketId }, query: { ...(prefix ? { prefix } : {}), ...(node ? { node } : {}) } }
}

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

// How long a run that has not started yet has waited since it was sent.
const waited = computed(() => {
  const created = task.value?.creation_time ? Date.parse(task.value.creation_time) : NaN
  const time = Number.isFinite(created) ? formatDuration(now.value - created) : ''
  return time ? `, ${time} so far` : ''
})

interface Summary {
  tone: 'error' | 'warning' | 'info' | 'success'
  headline: string
}
// TES has no state for a run that waits for a locked bucket; the native job says so.
const awaitingKey = computed(() => nativeJob.value?.state === 'awaiting_key' && !isTerminalTesState(task.value?.state))
// An active run that carries an error is retrying a failed attempt, such as a failed results upload.
const retryError = computed(() =>
  task.value && !isTerminalTesState(task.value.state) ? nativeJob.value?.error?.message?.trim() ?? '' : '',
)

const summary = computed<Summary | null>(() => {
  const state = task.value?.state
  if (!state) return null
  if (awaitingKey.value) return { tone: 'warning', headline: 'Waiting for a bucket unlock' }
  const duration = runDuration.value
  const where = executorKind.value ? ` on ${executorKind.value}` : ''
  switch (state) {
    case 'QUEUED':
      return {
        tone: 'info',
        headline: (nodeConstraint.value
          ? `Waiting for a response from ${displayName(nodeConstraint.value)}`
          : 'Queued, waiting for a node') + waited.value,
      }
    case 'INITIALIZING':
      return { tone: 'info', headline: (copyProgress.value ? `Copying inputs, ${copyProgress.value}` : 'Copying inputs') + waited.value }
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
      return retryError.value
        ? { tone: 'warning', headline: 'Retrying after a failed attempt' }
        : { tone: 'info', headline: 'State unknown' }
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
// Each stage with its icon and, where the run records one, the time it was reached.
const STAGE_ICONS = [Hourglass, Container, Play, Flag]
const stages = computed(() => {
  const times = [task.value?.creation_time, undefined, latestLog.value?.start_time, latestLog.value?.end_time]
  const running = task.value?.state === 'RUNNING' ? runDuration.value : null
  return stagesFor(task.value?.state).map((stage, i) => ({
    ...stage,
    // The running step counts up while the run works, so its progress shows at a glance.
    detail: (stage.key === 'running' && running) || stage.detail,
    icon: STAGE_ICONS[i]!,
    time: stage.state === 'pending' ? '' : clock(times[i]),
  }))
})
const STAGE_LOOK: Record<WatchStage['state'], string> = {
  done: 'bg-status-ok/10 text-status-ok',
  active: 'bg-status-running/10 text-status-running',
  failed: 'bg-status-failed/10 text-status-failed',
  pending: 'bg-muted text-muted-foreground',
}
// Only a state the header does not already say gets a line of its own.
const showSummary = computed(() => failed.value || active.value || awaitingKey.value)

// ── Output links ─────────────────────────────────────────────────────────────
type ResolvedLink =
  | { kind: 's3'; bucketId: string; prefix: string; objectKey: string; versionId?: string }
  | { kind: 'drs'; object: string; download: string }
  | { kind: 'plain' }

function resolveUrl(url: string): ResolvedLink {
  const parsed = parseS3Url(url, s3.endpoint.value)
  if (parsed) {
    // A captured output names its exact version as `?versionId=`; the key is
    // what stands before it, the version travels beside it.
    const query = parsed.key.indexOf('?')
    const objectKey = query >= 0 ? parsed.key.slice(0, query) : parsed.key
    const versionId = query >= 0 ? new URLSearchParams(parsed.key.slice(query + 1)).get('versionId') : null
    // Slash-less parent prefix, matching DataManagerView.navigateTo (which
    // appends its own trailing '/'); a trailing slash here would list the
    // bucket at "prefix//", an always-empty folder view.
    const prefix = objectKey.includes('/') ? objectKey.slice(0, objectKey.lastIndexOf('/')) : ''
    return { kind: 's3', bucketId: parsed.bucket, prefix, objectKey, ...(versionId ? { versionId } : {}) }
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
  /** True once the run wrote the file; a declared-only row is still a promise. */
  captured: boolean
}

// A captured file opens in the portal's own file dialog, the same surface the
// data browser and the assistant use; it loads only once one is asked for.
const FileDetailsDialog = defineAsyncComponent({
  loader: () => import('@/components/data/FileDetailsDialog.vue'),
  onError: asyncChunkError,
})
const previewing = ref<OutRow | null>(null)
const previewTab = ref('preview')
// The run page opens no S3 session of its own, so the first preview asks for
// one on the run's group before the dialog reads the object.
async function openPreview(row: OutRow) {
  const groupId = groupTagId.value
  if (groupId && !s3.hasActiveKey.value) {
    try {
      await s3.ensureSession(groupId)
    } catch {
      // The dialog reports the missing session itself and offers a retry.
    }
  }
  previewing.value = row
  previewTab.value = 'preview'
}
function objectName(key: string): string {
  return key.split('/').filter(Boolean).pop() || key
}
/** Where a row lands, without the version, so a declared and a captured row meet. */
function destination(link: ResolvedLink, url: string): string {
  return link.kind === 's3' ? `${link.bucketId}/${link.objectKey}` : url
}

// One table: every declared output is a row from the start, and the file the
// run captured for it upgrades that row in place with its size and exact
// version. A captured file nothing declared is appended.
const outputRows = computed<OutRow[]>(() => {
  const rows: OutRow[] = (task.value?.outputs ?? []).map((o) => ({
    url: o.url,
    path: o.path,
    link: resolveUrl(o.url),
    captured: false,
  }))
  for (const o of (task.value?.logs ?? []).flatMap((l) => l.outputs ?? [])) {
    const link = resolveUrl(o.url)
    const written: OutRow = { url: o.url, path: o.path, size: Number(o.size_bytes), link, captured: true }
    const at = rows.findIndex((row) =>
      !row.captured && (row.path === o.path || destination(row.link, row.url) === destination(link, o.url)))
    if (at >= 0) rows[at] = written
    else rows.push(written)
  }
  return rows
})
const capturedCount = computed(() => outputRows.value.filter((row) => row.captured).length)
const capturedBytes = computed(() =>
  outputRows.value.reduce((sum, row) => (row.captured && row.size !== undefined && !Number.isNaN(row.size) ? sum + row.size : sum), 0))
// The folder holding the first written file in a bucket; the file list below names every destination.
const resultsFolder = computed(() => {
  const row = outputRows.value.find((entry) => entry.captured && entry.link.kind === 's3') ?? outputRows.value.find((entry) => entry.link.kind === 's3')
  if (!row || row.link.kind !== 's3') return null
  const { bucketId } = row.link
  // A declared folder capture names the folder itself, not a file in it.
  const prefix = !row.captured && /[/*]$/.test(row.path) ? row.link.objectKey.replace(/\/+$/, '') : row.link.prefix
  return {
    path: `${bucketId}/${prefix ? `${prefix}/` : ''}`,
    to: bucketRoute(bucketId, prefix),
  }
})
const outputSummary = computed(() => {
  const total = outputRows.value.length
  return `${total} ${total === 1 ? 'output' : 'outputs'}, ${capturedCount.value} captured`
})
const resultsTitle = computed(() => {
  const count = capturedCount.value
  if (count) return `${count} ${count === 1 ? 'file' : 'files'}`
  if (active.value) return 'Results are written when the run ends'
  return outputRows.value.length ? 'No files captured yet' : 'No files captured for this run'
})

// A run may capture hundreds of files, so the table pages.
const OUTPUT_PAGE = 8
const outputPage = ref(1)
const outputsShown = computed(() =>
  outputRows.value.slice((outputPage.value - 1) * OUTPUT_PAGE, outputPage.value * OUTPUT_PAGE))
const outputPages = computed(() => Math.max(1, Math.ceil(outputRows.value.length / OUTPUT_PAGE)))
const outputRange = computed(() => {
  const total = outputRows.value.length
  const first = (outputPage.value - 1) * OUTPUT_PAGE + 1
  const span = total > OUTPUT_PAGE ? `${first}–${Math.min(outputPage.value * OUTPUT_PAGE, total)} of ` : ''
  return `${span}${total} output${total === 1 ? '' : 's'}, ${capturedCount.value} captured`
})

// ── Run dataset (at runs/{taskId}, else through the run an output names) ─────
async function recordOfOutput(): Promise<{ document_id: string } | null> {
  const output = crateOutput.value
  if (!output) return null
  // The node owning the version answers its origin; another node may not hold it.
  const owner = output.endpoint_url ? resolveObjectUrl(`${output.endpoint_url.replace(/\/+$/, '')}/${output.bucket}/${output.key}`) : null
  const origin = await getFileOrigin(output.bucket, { key: output.key, version_id: output.version_id }, undefined, owner?.nodeId)
  if (origin.origin?.kind !== 'job') return null
  const run = await getRun(origin.origin.run_id)
  return run.run_crate ? { document_id: run.run_crate } : null
}

async function findRunCrate() {
  const id = crateJob.value
  if (runCrateLoading.value && crateTask === id) return
  crateTask = id
  runCrateLoading.value = true
  try {
    const crate = (await metadataAtPath(`runs/${props.taskId}`)) ?? (await recordOfOutput())
    if (crateTask === id) runCrate.value = crate
  } catch {
    // The crate is written when the run completes; a failed lookup just keeps
    // the section in its "not found yet" state.
    if (crateTask === id) runCrate.value = null
  } finally {
    if (crateTask === id) runCrateLoading.value = false
  }
}

// The run record, read for what it says about each input, such as the source that served it.
const runRecord = ref<RunCrateModel | null>(null)
watch(runCrate, async (record) => {
  runRecord.value = null
  if (!record) return
  const crate = await loadRoCrate(record.document_id).catch(() => null)
  if (runCrate.value === record) runRecord.value = parseRunCrate(crate, `runs/${props.taskId}`)
})
function readFrom(url: string | undefined): string | undefined {
  if (!url) return undefined
  const s3Url = nativeInput({ url, path: '' }).url ?? url
  return servedSource(runRecord.value, [url, `https://w3id.org/aruna/data/${url}`, s3Url])
}

// A finished run with a record can describe its results as a dataset of its group.
const canCreateResults = computed(() =>
  task.value?.state === 'COMPLETE' && Boolean(runCrate.value && runRecord.value?.outputs.length && groupTagId.value))
function openResults(documentId: string) {
  resultsFormOpen.value = false
  void router.push({ name: 'dataset', params: { id: documentId } })
}

// A finished run, or one whose output just became known, may have its record now.
watch([crateJob, () => isTerminalTesState(task.value?.state)], ([job, done], [previousJob, wasDone]) => {
  if (props.open && !runCrate.value && (job !== previousJob || (done && !wasDone))) void findRunCrate()
})

const recordState = computed(() => {
  if (runCrate.value) return 'Inputs, results and provenance'
  if (localRecordJob.value) return 'Kept on this computer until you publish the run'
  if (sessionRuntime(task.value?.tags) !== null) return 'None, a notebook session keeps its report instead'
  if (runCrateLoading.value) return 'Looking for it'
  if (active.value) return 'Written once the run completes'
  return 'Not written yet, Refresh checks again'
})
const developerIds = computed<Detail[]>(() => [
  { key: 'runId', label: 'Run id', value: task.value?.id || props.taskId },
  { key: 'api', label: 'API path', value: `/ga4gh/tes/v1/tasks/${task.value?.id || props.taskId}` },
])

const exporting = ref(false)
const exportError = ref<string | null>(null)
const exported = ref<string | null>(null)
async function exportCrate() {
  if (!runCrate.value) return
  exporting.value = true
  exportError.value = null
  exported.value = null
  // The panel may show another run before the node has assembled this one.
  const name = `run-${props.taskId}.zip`
  try {
    const blob = await downloadProvenanceCrate({ dataset: runCrate.value.document_id })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = name
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(anchor.href)
    exported.value = name
  } catch (cause) {
    exportError.value = errorMessage(cause)
  } finally {
    exporting.value = false
  }
}

// One refresh for the panel: the run itself and the dataset it writes.
const { busy: refreshing, refresh: onRefresh } = useRefresh(async () => {
  await Promise.all([poll(), findRunCrate()])
})

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
  return `${lines.length} line${lines.length === 1 ? '' : 's'}, last: ${lines[lines.length - 1]}`
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
    await cancelTask(props.taskId, props.apiBase)
    task.value = await getTask(props.taskId, 'FULL')
    emit('canceled')
  } catch (err) {
    cancelError.value = errorMessage(err)
  }
}
const active = computed(() => !!task.value && !isTerminalTesState(task.value.state))
const canCancel = active

// ── Re-run ───────────────────────────────────────────────────────────────────
// The run page reads ?rerun=<taskId> and prefills from the FULL run record; the
// template it lands on comes from the run itself.
function rerun() {
  if (!task.value) return
  void router.push({ name: 'compute-new', query: { rerun: props.taskId } })
}
const saveOpen = ref(false)
const savedRun = ref(false)

// ── Delete (finished runs; the node removes it for every client) ─────────────
const confirmingDelete = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)
function requestDelete() {
  confirmingDelete.value = true
  deleteError.value = null
}
// A run still working is cancelled with Cancel first; one already gone counts as deleted.
async function confirmDelete() {
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deleteJob(props.taskId, props.apiBase)
  } catch (err) {
    deleteError.value = deleteErrorMessage(err)
  } finally {
    deleteBusy.value = false
  }
  if (deleteError.value) return
  confirmingDelete.value = false
  emit('deleted')
  emit('update:open', false)
}
</script>

<template>
  <DetailDialog :open="props.open" content-class="max-w-4xl" fit @update:open="(v: boolean) => emit('update:open', v)">
    <template #header>
      <DialogTitle class="sr-only">Run details</DialogTitle>
      <TaskHeader v-if="task" :title="headerTitle" :state="task.state" :subtitle="headerSubtitle" />
      <Skeleton v-else-if="loadState === 'loading'" class="h-6 w-2/3" />
    </template>
    <template v-if="task" #actions>
      <RefreshButton :busy="refreshing" sr-label="Refresh this run" @click="onRefresh" />
      <IconButton v-if="runCrate" label="Open as page" variant="outline" as-child>
        <RouterLink :to="{ name: 'dataset', params: { id: runCrate.document_id } }"><Maximize2 class="h-4 w-4" /></RouterLink>
      </IconButton>
      <AskAiButton :prompt="askPrompt" :subject="`run ${taskId}`" icon-only />
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

      <div v-else-if="task" class="space-y-6">
        <!-- What happened, in one place -->
        <Notice v-if="summary && showSummary" :tone="summary.tone" class="space-y-2 px-4 py-3">
          <p class="text-sm font-semibold">{{ summary.headline }}</p>
          <p v-if="failed" class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{{ failureMessage }}</p>
          <p v-if="retryError" class="whitespace-pre-wrap break-words text-xs leading-relaxed">
            Attempt {{ nativeJob?.attempts }} failed, retrying: <span class="font-mono">{{ retryError }}</span>
          </p>
          <div v-if="failed || nodeConstraint" class="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge v-if="failed && nativeJob?.error?.kind" variant="destructive" size="sm">{{ nativeJob.error.kind }}</Badge>
            <Badge v-if="failed && exitCode !== undefined" variant="outline" size="sm">exit {{ exitCode }}</Badge>
            <Badge v-if="failed && nativeJob?.attempts" variant="outline" size="sm">
              {{ nativeJob.attempts }} attempt{{ nativeJob.attempts === 1 ? '' : 's' }}
            </Badge>
            <span v-if="nodeConstraint" class="inline-flex items-center gap-1">node <NodeLabel :node-id="nodeConstraint" size="sm" /></span>
          </div>
          <p v-if="failed && stderrTail" class="truncate font-mono text-xs" :title="executorStderr(0)">
            stderr: {{ stderrTail }}
          </p>
          <p v-if="task.state === 'QUEUED' && !awaitingKey" class="flex flex-wrap items-center gap-2 text-xs">
            One node answers and runs it; another steps in after a while without a response.
            <DocsLink topic="compute-run" section="Follow the run" />
          </p>
        </Notice>
        <JobKeyWait v-if="awaitingKey" :waits="nativeJob?.awaiting_keys ?? []" />
        <p v-if="lastPollError" class="text-xs text-muted-foreground">Refresh failed, retrying.</p>

        <DetailList :items="facts" class="grid-cols-2 md:grid-cols-4">
          <template #node>
            <RouterLink v-if="runNode" :to="{ name: 'node', params: { nodeId: runNode } }" class="text-primary hover:underline">{{ displayName(runNode) }}</RouterLink>
            <template v-else>{{ facts[1]!.value }}</template>
          </template>
          <template #group>
            <RouterLink v-if="groupTagId" :to="{ name: 'group', params: { id: groupTagId } }" class="text-primary hover:underline">{{ groupTagLabel }}</RouterLink>
            <template v-else>{{ facts[3]!.value }}</template>
          </template>
        </DetailList>

        <section>
          <h3 class="mb-3 flex items-center gap-2 type-card-title"><Activity class="size-4 text-muted-foreground" aria-hidden="true" />Progress</h3>
          <ol class="flex">
            <li v-for="(stage, i) in stages" :key="stage.key" class="relative flex min-w-0 flex-1 flex-col items-center text-center">
              <!-- The connector leaves a small gap before this icon and the next one. -->
              <span
                v-if="i < stages.length - 1"
                aria-hidden="true"
                class="absolute left-[calc(50%+1.5rem)] top-[15px] h-0.5 w-[calc(100%-3rem)]"
                :class="stage.state === 'done' && stages[i + 1]!.state !== 'pending' ? 'bg-status-ok/40' : 'bg-border'"
              />
              <span class="relative grid size-8 place-items-center rounded-full" :class="STAGE_LOOK[stage.state]">
                <component :is="stage.icon" class="size-4" aria-hidden="true" />
              </span>
              <span class="mt-2 text-[13px] font-medium" :class="stage.state === 'pending' ? 'text-muted-foreground' : 'text-foreground'">{{ stage.label }}</span>
              <span v-if="stage.detail" class="text-xs text-muted-foreground">{{ stage.detail }}</span>
              <span v-if="stage.time" class="text-xs tabular-nums text-muted-foreground">{{ stage.time }}</span>
            </li>
          </ol>
        </section>

        <div class="grid items-start gap-6 lg:grid-cols-2">
        <section>
          <h3 class="mb-2 flex items-center gap-2 type-card-title"><LogIn class="size-4 text-muted-foreground" aria-hidden="true" />Inputs</h3>
          <div v-if="task.inputs?.length" class="overflow-x-auto rounded-lg border border-border-subtle">
            <table class="w-full text-sm">
              <thead class="border-b border-border-subtle bg-muted/40 text-xs text-muted-foreground">
                <tr><th scope="col" class="h-9 px-3 text-left font-medium">Input</th><th scope="col" class="h-9 px-3 text-left font-medium">From</th></tr>
              </thead>
              <tbody class="divide-y divide-border-subtle">
                <template v-for="entry in inputGroups" :key="entry.group.key">
                <tr v-if="entry.inputs.length > 1" class="h-10 text-xs">
                  <td class="max-w-0 px-3 py-1.5">
                    <button type="button" class="flex max-w-full items-center gap-1 text-left font-mono text-foreground hover:text-primary" :aria-expanded="openedInputs.has(entry.group.key)" :title="entry.mount" @click="toggleInputs(entry.group.key)">
                      <ChevronRight class="h-3.5 w-3.5 shrink-0 transition-transform" :class="openedInputs.has(entry.group.key) ? 'rotate-90' : ''" aria-hidden="true" />
                      <span class="truncate">{{ entry.mount || 'Inputs' }}</span>
                    </button>
                    <span class="block pl-[1.125rem] text-muted-foreground">{{ entry.inputs.length }} files</span>
                  </td>
                  <td class="max-w-0 px-3 py-1.5">
                    <RouterLink v-if="groupLink(entry.group)" :to="groupLink(entry.group)!" class="block truncate font-mono text-primary hover:underline">{{ entry.group.bucket }}/{{ entry.group.folder }}</RouterLink>
                    <span v-if="entry.group.nodeId" class="block truncate text-muted-foreground">on {{ displayName(entry.group.nodeId) }}</span>
                    <span v-if="groupSource(entry.inputs.map((input) => input.url))" class="block truncate text-muted-foreground">Read from {{ groupSource(entry.inputs.map((input) => input.url)) }}</span>
                  </td>
                </tr>
                <tr v-for="(input, i) in entry.inputs.length === 1 || openedInputs.has(entry.group.key) ? entry.inputs : []" :key="`${input.path}:${i}`" class="h-10 text-xs">
                  <td class="max-w-0 px-3 py-1.5" :class="entry.inputs.length > 1 ? 'pl-8' : ''"><span class="block truncate font-mono text-foreground" :title="input.path">{{ input.path }}</span></td>
                  <td class="max-w-0 px-3 py-1.5">
                    <RouterLink v-if="inputLink(input.url)" :to="inputLink(input.url)!" class="block truncate font-mono text-primary hover:underline" :title="input.url">{{ inputPlace(input.url!).text }}</RouterLink>
                    <span v-else-if="input.url" class="block truncate font-mono text-muted-foreground" :title="input.url">{{ inputPlace(input.url).text }}</span>
                    <span v-else class="text-muted-foreground">Inline content</span>
                    <span v-if="input.url && inputPlace(input.url).nodeId" class="block truncate text-muted-foreground">on {{ displayName(inputPlace(input.url).nodeId!) }}</span>
                    <span v-if="readFrom(input.url)" class="block truncate text-muted-foreground" :title="readFrom(input.url)">Read from {{ sourceHost(readFrom(input.url)!) }}</span>
                  </td>
                </tr>
                </template>
              </tbody>
            </table>
          </div>
          <p v-else class="text-xs text-muted-foreground">This run reads no input files.</p>
        </section>
        <section data-tutorial="run-artifacts">
          <h3 class="mb-2 flex items-center gap-2 type-card-title"><Folder class="size-4 text-muted-foreground" aria-hidden="true" />Results</h3>
          <div class="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle">
            <component
              :is="resultsFolder ? RouterLink : 'div'"
              :to="resultsFolder?.to"
              class="flex items-center gap-3 px-4 py-3"
              :class="resultsFolder ? 'transition-colors hover:bg-muted/40' : ''"
            >
              <IconTile :icon="Folder" tone="aqua" size="sm" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-foreground">
                  {{ resultsTitle }}<span v-if="capturedBytes" class="ml-2 text-xs font-normal tabular-nums text-muted-foreground">{{ formatBytes(capturedBytes) }}</span>
                </p>
                <p v-if="resultsFolder" class="truncate font-mono text-xs text-muted-foreground">{{ resultsFolder.path }}</p>
              </div>
              <ChevronRight v-if="resultsFolder" class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </component>
            <component
              :is="runCrate ? RouterLink : 'div'"
              :to="runCrate ? { name: 'dataset', params: { id: runCrate.document_id } } : undefined"
              class="flex items-center gap-3 px-4 py-3"
              :class="runCrate ? 'transition-colors hover:bg-muted/40' : ''"
            >
              <IconTile :icon="FileText" :tone="runCrate ? 'royal' : 'muted'" size="sm" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-foreground">{{ runCrate ? 'Open the run record' : 'Run record' }}</p>
                <p class="text-xs text-muted-foreground">{{ recordState }}</p>
              </div>
              <ChevronRight v-if="runCrate" class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </component>
            <button
              v-if="canCreateResults"
              type="button"
              class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              :aria-expanded="resultsFormOpen"
              @click="resultsFormOpen = !resultsFormOpen"
            >
              <IconTile :icon="FolderPlus" tone="aqua" size="sm" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-foreground">Create results dataset</p>
                <p class="text-xs text-muted-foreground">The results as a dataset, linked to this run</p>
              </div>
            </button>
          </div>
          <RunDatasetForm
            v-if="resultsFormOpen && canCreateResults"
            class="mt-3"
            :run="runRecord!"
            :record-id="runCrate!.document_id"
            :task-id="props.taskId"
            :group-id="groupTagId!"
            :run-name="task.name || props.taskId"
            @created="openResults"
            @close="resultsFormOpen = false"
          />
          <details v-if="outputRows.length" class="mt-3 text-sm">
            <summary class="cursor-pointer font-medium text-foreground">{{ outputSummary }}</summary>
            <div class="mt-2 space-y-1.5">
              <div class="overflow-x-auto rounded-lg border border-border-subtle">
                <table class="w-full min-w-[48rem] text-left text-xs">
                  <thead class="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th scope="col" class="px-3 py-2 font-medium">File</th>
                      <th scope="col" class="px-3 py-2 font-medium">Path in the container</th>
                      <th scope="col" class="px-3 py-2 font-medium">Destination</th>
                      <th scope="col" class="px-3 py-2 text-right font-medium">Size</th>
                      <th scope="col" class="px-3 py-2 font-medium">Status</th>
                      <th scope="col" class="px-3 py-2"><span class="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    <tr v-for="(row, i) in outputsShown" :key="row.url + i">
                      <td class="max-w-64 break-all px-3 py-2 font-mono text-foreground">
                        {{ objectName(row.link.kind === 's3' ? row.link.objectKey : row.path) }}
                      </td>
                      <td class="px-3 py-2 font-mono text-muted-foreground">{{ row.path }}</td>
                      <td class="px-3 py-2">
                        <RouterLink v-if="row.link.kind === 's3'" class="break-all font-mono text-primary hover:underline" :to="bucketRoute(row.link.bucketId, row.link.prefix)">{{ row.url }}</RouterLink>
                        <span v-else-if="row.link.kind === 'drs'" class="inline-flex items-center gap-1">
                          <a class="font-mono text-primary hover:underline" :href="row.link.object" target="_blank" rel="noopener noreferrer">{{ truncateMiddle(row.url, 24, 12) }}</a>
                          <Tooltip label="Download this output">
                            <a class="text-muted-foreground hover:text-foreground" :href="row.link.download" target="_blank" rel="noopener noreferrer" aria-label="Download this output"><Download class="h-3.5 w-3.5" /></a>
                          </Tooltip>
                        </span>
                        <ExternalLink v-else :href="row.url" :label="row.url" class="break-all font-mono text-muted-foreground hover:text-primary" />
                      </td>
                      <td class="whitespace-nowrap px-3 py-2 text-right text-foreground">
                        {{ row.size !== undefined && !Number.isNaN(row.size) ? formatBytes(row.size) : '' }}
                      </td>
                      <td class="px-3 py-2">
                        <Badge size="sm" :variant="row.captured ? 'success' : 'secondary'">{{ row.captured ? 'Captured' : 'Declared' }}</Badge>
                      </td>
                      <td class="px-3 py-2 text-right">
                        <Button
                          v-if="row.captured && row.link.kind === 's3'"
                          variant="ghost"
                          size="sm"
                          class="h-6 px-1.5"
                          :aria-label="`Preview ${objectName(row.link.objectKey)}`"
                          @click="openPreview(row)"
                        >
                          <Eye class="h-3.5 w-3.5" /> Preview
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span v-if="outputRows.length > OUTPUT_PAGE" class="text-xs text-muted-foreground">{{ outputRange }}</span>
                <Pagination
                  v-if="outputRows.length > OUTPUT_PAGE"
                  :page="outputPage"
                  :page-count="outputPages"
                  :has-next="outputPage < outputPages"
                  @update:page="(page: number) => (outputPage = page)"
                />
              </div>
            </div>
          </details>
        </section>

        <section data-tutorial="run-executors">
          <h3 class="mb-2 flex items-center gap-2 type-card-title"><Server class="size-4 text-muted-foreground" aria-hidden="true" />Execution</h3>
          <div class="overflow-x-auto rounded-lg border border-border-subtle">
            <table class="w-full text-sm">
              <thead class="border-b border-border-subtle bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" class="h-9 px-3 text-left font-medium">Attempt</th>
                  <th scope="col" class="h-9 px-3 text-left font-medium">Executor</th>
                  <th scope="col" class="h-9 px-3 text-right font-medium">Exit code</th>
                  <th scope="col" class="h-9 w-px px-3"><span class="sr-only">Logs</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle">
                <tr v-for="(_, i) in task.executors" :key="i" class="h-10">
                  <td class="px-3 py-1.5 tabular-nums">{{ attemptCount || '-' }}</td>
                  <td class="px-3 py-1.5">{{ executorLabel }}<span v-if="task.executors.length > 1" class="text-muted-foreground">, step {{ i + 1 }}</span></td>
                  <td class="px-3 py-1.5 text-right tabular-nums">{{ executorExit(i) ?? (active ? 'Running' : '-') }}</td>
                  <td class="w-px whitespace-nowrap px-3 py-1.5 text-right">
                    <IconButton v-if="executorStdout(i) || executorStderr(i) || systemLogLines.length" label="Show logs" @click="openLog(i)"><SquareTerminal class="h-4 w-4" /></IconButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="executorStdout(0) || stderrSummary(0)" class="mt-3 space-y-2">
            <div v-if="executorStdout(0)" class="relative">
              <p class="type-label">
                {{ executorStderr(0) ? 'stdout' : 'output' }}<span v-if="hidden(executorStdout(0))">, last {{ tail(executorStdout(0)).length }} lines</span>
              </p>
              <pre class="mt-1 overflow-x-auto whitespace-pre rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed">{{ tail(executorStdout(0)).join('\n') }}</pre>
            </div>
            <p v-if="stderrSummary(0)" class="truncate font-mono text-xs text-destructive" :title="executorStderr(0)">
              stderr: {{ stderrSummary(0) }}
            </p>
          </div>
        </section>
        <section>
          <h3 class="mb-2 flex items-center gap-2 type-card-title">
            <MapPinned class="size-4 text-muted-foreground" aria-hidden="true" />Placement
            <Tooltip :label="placementInfo">
              <span class="inline-flex text-muted-foreground" tabindex="0" :aria-label="placementInfo"><Info class="size-4" aria-hidden="true" /></span>
            </Tooltip>
          </h3>
          <template v-if="nativeFamily?.placement">
            <p class="flex items-center gap-1.5 text-sm tabular-nums text-foreground">
              <CircleCheck v-if="!movedBytes" class="size-4 shrink-0 text-status-ok" aria-hidden="true" />
              <ArrowLeftRight v-else class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {{ formatBytes(stayedBytes) }} stayed, {{ formatBytes(movedBytes) }} moved
            </p>
            <details v-if="placementInputs.length" class="mt-3 text-sm">
              <summary class="cursor-pointer font-medium text-foreground">
                {{ formatNumber(placementInputs.length) }} {{ placementInputs.length === 1 ? 'input file' : 'input files' }}, {{ formatBytes(stayedBytes + movedBytes) }}
              </summary>
              <ul class="mt-2 divide-y divide-border-subtle rounded-lg border border-border-subtle">
                <li v-for="(input, i) in placementInputs.slice(0, INPUTS_SHOWN)" :key="`${input.destination_key}:${i}`" class="flex items-center gap-3 px-3 py-2.5">
                  <FileIcon class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span class="min-w-0 flex-1 truncate font-mono text-xs text-foreground" :title="input.destination_key">{{ input.destination_key }}</span>
                  <RouterLink v-if="input.source_node_id" :to="{ name: 'node', params: { nodeId: input.source_node_id } }" class="shrink-0 text-xs text-primary hover:underline">
                    from {{ displayName(input.source_node_id) }}
                  </RouterLink>
                  <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ formatBytes(input.bytes) }}</span>
                </li>
              </ul>
              <p v-if="placementInputs.length > INPUTS_SHOWN" class="mt-2 text-xs text-muted-foreground">
                {{ placementInputs.length - INPUTS_SHOWN }} more under For developers.
              </p>
            </details>
          </template>
          <p v-else-if="nativeDetailUnavailable" class="text-xs text-muted-foreground">
            Distributed execution detail could not be loaded.
          </p>
          <p v-else class="text-xs text-muted-foreground">No placement record for this run yet.</p>
        </section>

        </div>

        <section>
          <h3 class="mb-2 type-card-title">What ran</h3>
          <div class="space-y-4">
            <DetailList v-for="(executor, i) in task.executors" :key="i" :items="executorDetails(i)">
              <template #command>
                <code class="block whitespace-pre-wrap break-all rounded-md bg-muted/50 px-3 py-2 font-mono text-xs leading-relaxed">{{ executor.command.join(' ') }}</code>
              </template>
            </DetailList>
          </div>
        </section>

        <details data-tutorial="run-details" class="text-sm">
          <summary class="flex cursor-pointer list-none items-center gap-2 type-card-title"><Code class="size-4 text-muted-foreground" aria-hidden="true" />For developers<ChevronDown class="size-4 text-muted-foreground" aria-hidden="true" /></summary>
          <div class="mt-4 space-y-6">
            <DetailList :items="developerIds">
              <template #runId="{ item }">
                <span class="flex min-w-0 items-center gap-1">
                  <span class="min-w-0 truncate font-mono text-[12.5px]" :title="item.value">{{ item.value }}</span>
                  <CopyButton :value="item.value" label="Copy run id" />
                </span>
              </template>
              <template #api="{ item }">
                <span class="flex min-w-0 items-center gap-1">
                  <span class="min-w-0 truncate font-mono text-[12.5px]" :title="item.value">{{ item.value }}</span>
                  <CopyButton :value="item.value" label="Copy API path" />
                </span>
              </template>
            </DetailList>
            <div v-if="runCrate || localRecordJob" class="flex flex-wrap items-center gap-2 text-xs">
              <Button v-if="runCrate" variant="outline" size="sm" :disabled="exporting" @click="exportCrate">
                <Download class="h-3.5 w-3.5" /> {{ exporting ? 'Exporting…' : 'Export as crate' }}
              </Button>
              <Button v-else variant="outline" size="sm" @click="downloadRunRecord"><Download class="h-3.5 w-3.5" /> Download the run record</Button>
              <span v-if="exportError || recordError" class="text-destructive">{{ exportError || recordError }}</span>
              <span v-else-if="exported" role="status" class="text-muted-foreground">Saved as {{ exported }}.</span>
            </div>
            <section v-if="nativeFamily" class="space-y-2">
              <h4 class="type-card-title">Placement plan</h4>
              <JobPlacementFigure :placement="nativeFamily.placement" />
            </section>
            <section v-if="nativeFamily" class="space-y-2">
              <h4 class="type-card-title">Executions</h4>
              <JobExecutionsTable :family="nativeFamily" />
            </section>
            <section class="space-y-2">
              <h4 class="type-card-title">Request</h4>
              <DetailList :items="requestDetails">
                <template #constraints><CountedList :items="constraintList" noun="constraint" /></template>
                <template #volumes><CountedList :items="volumeList" noun="volume" mono /></template>
                <template #tags><CountedList :items="tagList" noun="tag" mono /></template>
              </DetailList>
            </section>
          </div>
        </details>
      </div>
    </div>

    <template v-if="task" #footer>
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <Button v-if="!active" variant="outline" size="sm" title="Starts a new run prefilled from this one" @click="rerun"><RotateCcw class="h-3.5 w-3.5" /> Run again</Button>
          <Button v-if="!active" variant="outline" size="sm" @click="saveOpen = true"><Star class="h-3.5 w-3.5" /> Save as run template</Button>
          <span v-if="savedRun" role="status" class="text-xs text-muted-foreground max-sm:sr-only">Saved to run templates.</span>
          <SaveRunDialog v-model:open="saveOpen" :task="task" @saved="savedRun = true" />
          <template v-if="canCancel">
            <template v-if="!confirmingCancel">
              <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" :disabled="busy" @click="requestCancel"><Ban class="h-3.5 w-3.5" /> Cancel run</Button>
            </template>
            <template v-else>
              <Button variant="destructive" size="sm" :disabled="busy" @click="confirmCancel"><Ban class="h-3.5 w-3.5" /> Confirm cancel</Button>
              <Button variant="ghost" size="sm" :disabled="busy" @click="confirmingCancel = false">Keep running</Button>
            </template>
          </template>
          <div v-if="!canCancel" class="ml-auto flex items-center gap-2">
            <template v-if="!confirmingDelete">
              <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive max-sm:w-8 max-sm:px-0" aria-label="Delete" :disabled="deleteBusy" @click="requestDelete">
                <Trash2 class="h-3.5 w-3.5" /><span class="max-sm:sr-only">Delete</span>
              </Button>
            </template>
            <template v-else>
              <Button variant="destructive" size="sm" :disabled="deleteBusy || busy" @click="confirmDelete">
                <Trash2 class="h-3.5 w-3.5" /> {{ deleteBusy ? 'Deleting…' : 'Confirm delete' }}
              </Button>
              <Button variant="ghost" size="sm" :disabled="deleteBusy" @click="confirmingDelete = false">Keep</Button>
            </template>
          </div>
        </div>
        <p v-if="confirmingDelete" class="text-xs text-muted-foreground">
          Removes the run from the run list in every browser. Its outputs and run dataset stay.
        </p>
        <p v-if="cancelError" class="text-xs text-destructive">{{ cancelError }}</p>
        <p v-if="deleteError" class="text-xs text-destructive">{{ deleteError }}</p>
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
  <FileDetailsDialog
    v-if="previewing && previewing.link.kind === 's3'"
    :open="true"
    :tab="previewTab"
    :bucket="previewing.link.bucketId"
    :object-key="previewing.link.objectKey"
    :name="objectName(previewing.link.objectKey)"
    :version-id="previewing.link.versionId ?? null"
    :size="previewing.size !== undefined && !Number.isNaN(previewing.size) ? previewing.size : undefined"
    :group-id="groupTagId ?? null"
    :browse-href="objectHref({ bucket: previewing.link.bucketId, key: previewing.link.objectKey })"
    @update:open="(value: boolean) => { if (!value) previewing = null }"
    @update:tab="(value: string) => (previewTab = value)"
  />
</template>
