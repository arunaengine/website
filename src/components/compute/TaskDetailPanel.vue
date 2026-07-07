<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Sheet from '@/components/ui/Sheet.vue'
import SheetContent from '@/components/ui/SheetContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import TaskStateBadge from '@/components/compute/TaskStateBadge.vue'
import ClaimWatchStep, { type WatchStage } from '@/components/onboarding/ClaimWatchStep.vue'
import { useTes, isTesUnsupported } from '@/composables/useTes'
import { useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import {
  TES_GROUP_TAG,
  drsDownloadHref,
  drsObjectHref,
  isDrsReference,
  isTerminalTesState,
  parseS3Url,
  type TesState,
  type TesTask,
} from '@/lib/tes'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import { Ban, Download, ExternalLink, FileText, RefreshCw } from '@lucide/vue'

const props = defineProps<{ taskId: string; open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'canceled'): void }>()

const { getTask, cancelTask, busy } = useTes()
const { myGroups, apiBaseUrl, metadataItems, loadMetadata } = useAruna()
const s3 = useS3()

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const task = ref<TesTask | null>(null)
const loadState = ref<'idle' | 'loading' | 'ready' | 'error' | 'unsupported'>('idle')
const loadError = ref<string | null>(null)
const lastPollError = ref<string | null>(null)

// ── Load + poll (view-owned) ─────────────────────────────────────────────────
let pollTimer: number | undefined
function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = undefined
  }
}
function startPolling() {
  stopPolling()
  pollTimer = window.setInterval(() => {
    if (document.hidden) return
    if (!task.value || isTerminalTesState(task.value.state)) {
      stopPolling()
      return
    }
    void poll()
  }, 5000)
}
async function poll() {
  try {
    task.value = await getTask(props.taskId, 'FULL')
    lastPollError.value = null
    if (isTerminalTesState(task.value.state)) stopPolling()
  } catch (err) {
    // A poll error never kills the timer or the rendered task.
    lastPollError.value = errorMessage(err)
  }
}

async function initialLoad() {
  loadState.value = 'loading'
  loadError.value = null
  lastPollError.value = null
  try {
    task.value = await getTask(props.taskId, 'FULL')
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
    stopPolling()
    task.value = null
    if (!open || !id) return
    void initialLoad()
  },
  { immediate: true },
)

onUnmounted(stopPolling)

// ── Derived ──────────────────────────────────────────────────────────────────
const headerTitle = computed(() => task.value?.name || truncateMiddle(props.taskId))

const groupTagId = computed(() => task.value?.tags?.[TES_GROUP_TAG])
const groupTagLabel = computed(() => {
  const id = groupTagId.value
  if (!id) return null
  return myGroups.value.find((g) => g.id === id)?.name ?? truncateMiddle(id)
})
const otherTags = computed(() => Object.entries(task.value?.tags ?? {}).filter(([k]) => k !== TES_GROUP_TAG))

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

// Latest attempt's executor logs, aligned by index with task.executors.
const latestLog = computed(() => {
  const logs = task.value?.logs
  return logs?.length ? logs[logs.length - 1] : undefined
})
function executorLog(i: number) {
  return latestLog.value?.logs?.[i]
}

// The canonical TES progression IMPLIED by the current state — TES exposes no
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
      return s('done', 'done', 'done', 'failed', undefined, 'executor error')
    case 'SYSTEM_ERROR':
      return s('done', 'done', 'done', 'failed', undefined, 'system error')
    case 'CANCELED':
      return s('done', 'done', 'done', 'failed', undefined, 'canceled')
    case 'PREEMPTED':
      return s('done', 'done', 'done', 'failed', undefined, 'preempted')
    default:
      return s('pending', 'pending', 'pending', 'pending') // UNKNOWN / undefined
  }
}
const stages = computed(() => stagesFor(task.value?.state))

// ── Output links ─────────────────────────────────────────────────────────────
type ResolvedLink =
  | { kind: 's3'; bucketId: string; prefix: string }
  | { kind: 'drs'; object: string; download: string }
  | { kind: 'plain' }

function resolveUrl(url: string): ResolvedLink {
  const parsed = parseS3Url(url, s3.endpoint.value)
  if (parsed) {
    // Slash-less parent prefix, matching DataManagerView.navigateTo (which
    // appends its own trailing '/'); a trailing slash here would list the
    // bucket at "prefix//" — an always-empty folder view.
    const prefix = parsed.key.includes('/') ? parsed.key.slice(0, parsed.key.lastIndexOf('/')) : ''
    return { kind: 's3', bucketId: parsed.bucket, prefix }
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
const declaredOutputs = computed<OutRow[]>(() =>
  (task.value?.outputs ?? []).map((o) => ({ url: o.url, path: o.path, link: resolveUrl(o.url) })),
)
const capturedOutputs = computed<OutRow[]>(() =>
  (task.value?.logs ?? [])
    .flatMap((l) => l.outputs ?? [])
    .map((o) => ({ url: o.url, path: o.path, size: Number(o.size_bytes), link: resolveUrl(o.url) })),
)

// ── Process Run crate (cache-only honest lookup) ─────────────────────────────
const runCrate = computed(() => metadataItems.value.find((d) => d.document_path.includes(`runs/${props.taskId}`)))

const systemLogsOpen = ref(false)

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
const canCancel = computed(() => !!task.value && !isTerminalTesState(task.value.state))
</script>

<template>
  <Sheet :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <SheetContent side="right" class="w-full p-6 sm:max-w-2xl">
      <div v-if="loadState === 'loading'" class="space-y-4">
        <Skeleton class="h-8 w-2/3" />
        <Skeleton class="h-40 w-full" />
        <Skeleton class="h-40 w-full" />
      </div>

      <div v-else-if="loadState === 'unsupported'" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        This backend does not serve a TES endpoint yet (aruna#290). Task details cannot be loaded.
      </div>

      <ErrorPanel v-else-if="loadState === 'error'" :message="loadError || 'Failed to load the task.'" @retry="initialLoad" />

      <div v-else-if="task" class="space-y-6">
        <!-- Header -->
        <div class="space-y-2 pr-8">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="font-display text-lg font-semibold text-aruna-navy">{{ headerTitle }}</h2>
            <TaskStateBadge :state="task.state" />
          </div>
          <div class="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span class="truncate">{{ task.id || taskId }}</span>
            <CopyButton :value="task.id || taskId" label="Copy task id" />
          </div>
          <p v-if="task.description" class="text-sm text-muted-foreground">{{ task.description }}</p>
        </div>

        <!-- State progression -->
        <ClaimWatchStep :stages="stages" :error="lastPollError" />

        <!-- Details -->
        <dl class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt class="text-muted-foreground">Created</dt>
          <dd class="text-foreground">{{ task.creation_time ? relativeTime(task.creation_time) : '—' }}</dd>
          <dt class="text-muted-foreground">Group</dt>
          <dd class="text-foreground">
            <span v-if="groupTagLabel" :class="groupTagId && !myGroups.find((g) => g.id === groupTagId) ? 'font-mono' : ''">{{ groupTagLabel }}</span>
            <span v-else class="text-muted-foreground">—</span>
          </dd>
          <template v-if="resourceSummary">
            <dt class="text-muted-foreground">Resources</dt>
            <dd class="text-foreground">{{ resourceSummary }}</dd>
          </template>
          <template v-if="task.volumes?.length">
            <dt class="text-muted-foreground">Volumes</dt>
            <dd class="space-y-0.5 font-mono text-[11px] text-foreground">
              <div v-for="v in task.volumes" :key="v">{{ v }}</div>
            </dd>
          </template>
        </dl>
        <div v-if="otherTags.length" class="flex flex-wrap items-center gap-1.5">
          <Badge v-for="[k, v] in otherTags" :key="k" variant="outline" class="font-mono">{{ k }}={{ v }}</Badge>
        </div>

        <!-- Executors & logs -->
        <section class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Executors</h3>
          <p v-if="!task.logs?.length" class="text-xs text-muted-foreground">No execution log yet.</p>
          <div v-for="(executor, i) in task.executors" :key="i" class="surface space-y-2 p-3">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="font-mono text-[11px] text-foreground">{{ executor.image }}</div>
                <div class="whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">{{ executor.command.join(' ') }}</div>
              </div>
              <Badge
                v-if="executorLog(i)"
                :variant="executorLog(i)!.exit_code === 0 ? 'success' : 'destructive'"
                class="shrink-0"
              >
                exit {{ executorLog(i)!.exit_code }}
              </Badge>
            </div>
            <div v-if="executor.env && Object.keys(executor.env).length" class="text-[11px] text-muted-foreground">
              {{ Object.keys(executor.env).length }} environment variable(s)
            </div>
            <template v-if="executorLog(i)">
              <div class="text-[11px] text-muted-foreground">
                <span v-if="executorLog(i)!.start_time">start {{ relativeTime(executorLog(i)!.start_time!) }}</span>
                <span v-if="executorLog(i)!.end_time"> · end {{ relativeTime(executorLog(i)!.end_time!) }}</span>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">stdout</div>
                <pre v-if="executorLog(i)!.stdout" class="mt-0.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]">{{ executorLog(i)!.stdout }}</pre>
                <p v-else class="text-[11px] text-muted-foreground">no stdout captured</p>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground">stderr</div>
                <pre v-if="executorLog(i)!.stderr" class="mt-0.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]">{{ executorLog(i)!.stderr }}</pre>
                <p v-else class="text-[11px] text-muted-foreground">no stderr captured</p>
              </div>
            </template>
          </div>
          <!-- Task-level metadata & system logs -->
          <div v-if="latestLog?.metadata && Object.keys(latestLog.metadata).length" class="flex flex-wrap items-center gap-1.5">
            <Badge v-for="[k, v] in Object.entries(latestLog.metadata)" :key="k" variant="outline" class="font-mono">{{ k }}={{ v }}</Badge>
          </div>
          <div v-if="latestLog?.system_logs?.length">
            <Button variant="ghost" size="sm" @click="systemLogsOpen = !systemLogsOpen">
              {{ systemLogsOpen ? 'Hide' : 'Show' }} system logs ({{ latestLog.system_logs.length }})
            </Button>
            <pre v-if="systemLogsOpen" class="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]">{{ latestLog.system_logs.join('\n') }}</pre>
          </div>
        </section>

        <!-- Outputs -->
        <section v-if="declaredOutputs.length || capturedOutputs.length" class="space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outputs</h3>

          <div v-if="declaredOutputs.length" class="space-y-1.5">
            <div class="text-[11px] font-medium text-foreground">Declared</div>
            <div v-for="(row, i) in declaredOutputs" :key="'d' + i" class="flex flex-wrap items-center gap-2 text-[11px]">
              <span class="font-mono text-muted-foreground">{{ row.path }}</span>
              <span class="text-muted-foreground">→</span>
              <RouterLink v-if="row.link.kind === 's3'" class="font-mono text-primary hover:underline" :to="{ name: 'bucket', params: { bucketId: row.link.bucketId }, query: row.link.prefix ? { prefix: row.link.prefix } : {} }">{{ row.url }}</RouterLink>
              <template v-else-if="row.link.kind === 'drs'">
                <a class="inline-flex items-center gap-1 font-mono text-primary hover:underline" :href="row.link.object" target="_blank" rel="noopener">{{ truncateMiddle(row.url, 24, 12) }} <ExternalLink class="h-3 w-3" /></a>
                <a class="text-muted-foreground hover:text-foreground" :href="row.link.download" target="_blank" rel="noopener" aria-label="Download"><Download class="h-3.5 w-3.5" /></a>
              </template>
              <span v-else class="font-mono text-muted-foreground">{{ row.url }}</span>
            </div>
          </div>

          <div v-if="capturedOutputs.length" class="space-y-1.5">
            <div class="text-[11px] font-medium text-foreground">Captured</div>
            <div v-for="(row, i) in capturedOutputs" :key="'c' + i" class="flex flex-wrap items-center gap-2 text-[11px]">
              <span class="font-mono text-muted-foreground">{{ row.path }}</span>
              <span v-if="row.size !== undefined && !Number.isNaN(row.size)" class="text-muted-foreground">{{ formatBytes(row.size) }}</span>
              <span class="text-muted-foreground">→</span>
              <RouterLink v-if="row.link.kind === 's3'" class="font-mono text-primary hover:underline" :to="{ name: 'bucket', params: { bucketId: row.link.bucketId }, query: row.link.prefix ? { prefix: row.link.prefix } : {} }">{{ row.url }}</RouterLink>
              <template v-else-if="row.link.kind === 'drs'">
                <a class="inline-flex items-center gap-1 font-mono text-primary hover:underline" :href="row.link.object" target="_blank" rel="noopener">{{ truncateMiddle(row.url, 24, 12) }} <ExternalLink class="h-3 w-3" /></a>
                <a class="text-muted-foreground hover:text-foreground" :href="row.link.download" target="_blank" rel="noopener" aria-label="Download"><Download class="h-3.5 w-3.5" /></a>
              </template>
              <span v-else class="font-mono text-muted-foreground">{{ row.url }}</span>
            </div>
          </div>
        </section>

        <!-- Process Run crate -->
        <section class="space-y-1.5">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Process Run crate</h3>
          <RouterLink v-if="runCrate" class="inline-flex items-center gap-1.5 text-xs text-primary hover:underline" :to="{ name: 'metadata-detail', params: { id: runCrate.document_id } }">
            <FileText class="h-3.5 w-3.5" /> Open Process Run crate
          </RouterLink>
          <div v-else class="flex flex-wrap items-center gap-2">
            <p class="text-xs text-muted-foreground">No Process Run crate found in the loaded catalog yet (expected under the group's <code class="rounded bg-muted px-1">runs/&lt;task-id&gt;</code> path once the run completes).</p>
            <Button variant="ghost" size="sm" @click="loadMetadata()"><RefreshCw class="h-3.5 w-3.5" /> Refresh catalog</Button>
          </div>
        </section>

        <!-- Cancel -->
        <section v-if="canCancel" class="border-t border-border pt-4">
          <div class="flex items-center gap-2">
            <template v-if="!confirmingCancel">
              <Button variant="outline" size="sm" class="text-destructive hover:text-destructive" :disabled="busy" @click="requestCancel"><Ban class="h-3.5 w-3.5" /> Cancel task</Button>
            </template>
            <template v-else>
              <Button variant="destructive" size="sm" :disabled="busy" @click="confirmCancel"><Ban class="h-3.5 w-3.5" /> Confirm cancel</Button>
              <Button variant="ghost" size="sm" :disabled="busy" @click="confirmingCancel = false">Keep running</Button>
            </template>
          </div>
          <p v-if="cancelError" class="mt-2 text-[11px] text-destructive">{{ cancelError }}</p>
        </section>
      </div>
    </SheetContent>
  </Sheet>
</template>
