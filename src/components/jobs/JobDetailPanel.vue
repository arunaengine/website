<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DetailDialog from '@/components/ui/DetailDialog.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Progress from '@/components/ui/Progress.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import CopyButton from '@/components/nodes/CopyButton.vue'
import type { BadgeVariant } from '@/components/nodes/node-display'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import { useAruna } from '@/composables/useAruna'
import { useJobDetail } from '@/composables/useJobs'
import { ApiError } from '@/lib/api'
import {
  exportRoCrateResult,
  formatJobProgress,
  getJobReport,
  importRoCrateResult,
  isTerminalJobState,
  jobProgressPercent,
  type JobReasonCode,
  type JobReportRow,
} from '@/lib/jobs'
import { formatBytes, relativeTime, truncateMiddle } from '@/lib/utils'
import { Ban, Download, Loader2 } from '@lucide/vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  jobId: string
  open: boolean
  ownerNodeUrl?: string
  reportUrl?: string
  artifactUrl?: string
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void; (e: 'changed'): void }>()

const { apiBaseUrl, authToken } = useAruna()
const { job, loadState, loadError, lastPollError, cancelling, cancelError, load, cancel } = useJobDetail(() =>
  props.open && props.jobId ? props.jobId : null,
  () => props.ownerNodeUrl ?? null,
)

const progressPercent = computed(() => (job.value ? jobProgressPercent(job.value.progress) : null))
const progressText = computed(() => (job.value ? formatJobProgress(job.value.progress) : ''))
const terminal = computed(() => !!job.value && isTerminalJobState(job.value.state))
const canCancel = computed(() => !!job.value && !terminal.value && !job.value.cancel_requested)
const errorKindVariant = computed(() => (job.value?.error?.kind === 'retryable' ? 'warn' : 'destructive'))
const importResult = computed(() => (job.value ? importRoCrateResult(job.value) : null))
const exportResult = computed(() => (job.value ? exportRoCrateResult(job.value) : null))
const omittedCount = computed(() => {
  const omitted = exportResult.value?.omitted
  return omitted
    ? omitted.external + omitted.denied + omitted.missing + omitted.offline + omitted.unsupported
    : 0
})
const omissionRows = computed<Array<[string, number]>>(() => {
  const omitted = exportResult.value?.omitted
  if (!omitted) return []
  const rows: Array<[string, number]> = [
    ['external', omitted.external],
    ['denied', omitted.denied],
    ['missing', omitted.missing],
    ['offline', omitted.offline],
    ['unsupported', omitted.unsupported],
  ]
  return rows.filter(([, count]) => count > 0)
})
const artifactExpired = computed(() => {
  const expiry = exportResult.value?.artifact?.expires_at_ms
  return expiry != null && expiry <= Date.now()
})
const prettyResult = computed(() =>
  job.value?.result !== undefined && !importResult.value && !exportResult.value
    ? JSON.stringify(job.value.result, null, 2)
    : null,
)
const prettyRunCrate = computed(() =>
  job.value?.run_crate !== undefined ? JSON.stringify(job.value.run_crate, null, 2) : null,
)

const reportRows = ref<JobReportRow[]>([])
const reportCursor = ref<string | null>(null)
const reportDigest = ref('')
const reportLoading = ref(false)
const reportError = ref<string | null>(null)
let reportRequest = 0
let reportJobId = ''

function reportClient() {
  return {
    baseUrl: props.ownerNodeUrl || apiBaseUrl.value,
    token: authToken.value,
  }
}

async function loadReport(more = false) {
  if (!job.value || reportLoading.value) return
  const request = ++reportRequest
  reportLoading.value = true
  reportError.value = null
  try {
    const page = await getJobReport(
      job.value.job_id,
      more ? reportCursor.value ?? undefined : undefined,
      reportClient(),
    )
    if (request !== reportRequest) return
    reportRows.value = more ? [...reportRows.value, ...page.rows] : page.rows
    reportCursor.value = page.next_cursor ?? null
    reportDigest.value = page.report_digest
  } catch (err) {
    if (request !== reportRequest) return
    if (err instanceof ApiError && err.status === 404) {
      reportError.value = 'The terminal report is not available yet.'
    } else {
      reportError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    if (request === reportRequest) reportLoading.value = false
  }
}

watch(
  () => [job.value?.job_id, job.value?.state, job.value?.kind] as const,
  ([jobId, state, kind]) => {
    if ((jobId ?? '') !== reportJobId) {
      reportJobId = jobId ?? ''
      ++reportRequest
      reportRows.value = []
      reportCursor.value = null
      reportDigest.value = ''
      reportLoading.value = false
      reportError.value = null
    }
    if (
      state &&
      isTerminalJobState(state) &&
      (kind === 'import_rocrate' || kind === 'export_rocrate') &&
      !reportRows.value.length &&
      !reportLoading.value
    ) {
      void loadReport()
    }
  },
)

function reasonVariant(code: JobReasonCode): BadgeVariant {
  if (code === 'imported' || code === 'included') return 'success'
  if (code === 'failed' || code === 'denied' || code === 'missing') return 'destructive'
  if (
    code === 'not_attempted' ||
    code === 'offline' ||
    code === 'unsupported' ||
    code === 'unsupported_crate_version'
  ) {
    return 'warn'
  }
  return 'outline'
}

function reportSubject(row: JobReportRow): string {
  return 'archive_path' in row.detail ? row.detail.archive_path : row.detail.entity_id
}

function reportTarget(row: JobReportRow): string {
  return 'archive_path' in row.detail
    ? row.detail.target_key ?? ''
    : row.detail.zip_path ?? ''
}

function reportMeta(row: JobReportRow): string {
  if ('archive_path' in row.detail) {
    return [
      row.detail.size != null ? formatBytes(row.detail.size) : '',
      row.detail.version_id ? `version ${row.detail.version_id}` : '',
    ].filter(Boolean).join(' · ')
  }
  return [
    row.detail.source ?? '',
    row.detail.resolved_version ? `version ${row.detail.resolved_version}` : '',
  ].filter(Boolean).join(' · ')
}

const downloading = ref(false)
const downloadError = ref<string | null>(null)
let downloadRegistration: Promise<ServiceWorkerRegistration> | undefined

function artifactName(headers: Headers): string {
  const disposition = headers.get('Content-Disposition') ?? ''
  const name = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `ro-crate-${props.jobId}.zip`
  return name.replace(/[\/\\\u0000-\u001f\u007f]/g, '_').trim() || `ro-crate-${props.jobId}.zip`
}

async function downloadService(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('This browser cannot stream large downloads to disk.')
  }
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
  downloadRegistration ??= navigator.serviceWorker.register(
    new URL('rocrate-download-sw.js', baseUrl),
    { scope: baseUrl.pathname },
  )
  const registration = await downloadRegistration
  if (registration.active) return registration
  const ready = await navigator.serviceWorker.ready
  if (ready.scope !== registration.scope || !ready.active) {
    throw new Error('The streaming download service could not be started.')
  }
  return ready
}

async function streamArtifact(response: Response): Promise<void> {
  if (!response.body) throw new Error('The artifact response did not contain a body.')
  const registration = await downloadService()
  const worker = registration.active
  if (!worker) throw new Error('The streaming download service is not active.')
  const id = crypto.randomUUID()
  const name = artifactName(response.headers)
  const channel = new MessageChannel()
  const reader = response.body.getReader()
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      let reading = false
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        reject(error instanceof Error ? error : new Error(String(error)))
      }

      const sendChunk = async () => {
        if (settled || reading) return
        reading = true
        try {
          const { done, value } = await reader.read()
          if (done) {
            channel.port1.postMessage({ type: 'end' })
          } else {
            const chunk = new Uint8Array(value).buffer
            channel.port1.postMessage({ type: 'chunk', chunk }, [chunk])
          }
        } catch (error) {
          channel.port1.postMessage({
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
          })
          fail(error)
        } finally {
          reading = false
        }
      }

      channel.port1.onmessage = (event: MessageEvent) => {
        const message = event.data as { type?: string; message?: string }
        if (message.type === 'ready') {
          const anchor = document.createElement('a')
          anchor.href = new URL(`__rocrate_download/${id}`, registration.scope).href
          anchor.download = name
          anchor.hidden = true
          document.body.append(anchor)
          anchor.click()
          anchor.remove()
        } else if (message.type === 'pull') {
          void sendChunk()
        } else if (message.type === 'done') {
          if (!settled) {
            settled = true
            resolve()
          }
        } else if (message.type === 'cancel') {
          fail(new Error('The artifact download was cancelled.'))
        } else if (message.type === 'error') {
          fail(new Error(message.message || 'The artifact download failed.'))
        }
      }
      channel.port1.onmessageerror = () => fail(new Error('The artifact download channel failed.'))
      worker.postMessage({
        type: 'rocrate-download',
        id,
        filename: name,
        contentType: response.headers.get('Content-Type') || 'application/zip',
        contentLength: response.headers.get('Content-Length'),
      }, [channel.port2])
    })
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
    channel.port1.close()
  }
}

async function downloadArtifact() {
  const url =
    props.artifactUrl ||
    `${(props.ownerNodeUrl || apiBaseUrl.value).replace(/\/$/, '')}/jobs/${encodeURIComponent(props.jobId)}/artifacts/rocrate`
  downloading.value = true
  downloadError.value = null
  try {
    const pickerWindow = (
      window as unknown as {
        showSaveFilePicker?: (options: {
          suggestedName: string
          types: Array<{ description: string; accept: Record<string, string[]> }>
        }) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>
      }
    )
    const fileHandle = pickerWindow.showSaveFilePicker
      ? await pickerWindow.showSaveFilePicker({
          suggestedName: `ro-crate-${props.jobId}.zip`,
          types: [{ description: 'RO-Crate ZIP', accept: { 'application/zip': ['.zip'] } }],
        })
      : null
    const headers = new Headers()
    if (authToken.value) headers.set('Authorization', `Bearer ${authToken.value}`)
    const response = await fetch(url, { headers })
    if (!response.ok) {
      throw new ApiError(
        response.status,
        response.status === 410 ? 'This export artifact has expired.' : `${response.status} ${response.statusText}`,
      )
    }
    if (fileHandle && response.body) {
      await response.body.pipeTo(await fileHandle.createWritable())
      return
    }
    await streamArtifact(response)
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      downloadError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    downloading.value = false
  }
}

// Two-step inline confirm (TaskDetailPanel pattern).
const confirmingCancel = ref(false)
let cancelResetTimer: number | undefined
function requestCancel() {
  confirmingCancel.value = true
  window.clearTimeout(cancelResetTimer)
  cancelResetTimer = window.setTimeout(() => (confirmingCancel.value = false), 4000)
}
async function confirmCancel() {
  confirmingCancel.value = false
  window.clearTimeout(cancelResetTimer)
  if (await cancel()) emit('changed')
}
</script>

<template>
  <DetailDialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
      <DialogTitle class="sr-only">Job details</DialogTitle>

      <div v-if="loadState === 'loading'" class="space-y-4">
        <Skeleton class="h-8 w-2/3" />
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-24 w-full" />
      </div>

      <div
        v-else-if="loadState === 'unsupported'"
        class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
      >
        This backend does not serve the durable jobs API yet. Job details cannot be loaded.
      </div>

      <ErrorPanel v-else-if="loadState === 'error'" :message="loadError || 'Failed to load the job.'" @retry="load" />

      <div v-else-if="job" class="space-y-6">
        <div class="space-y-2 pr-8">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="font-display text-lg font-semibold capitalize text-aruna-navy">{{ job.kind }} job</h2>
            <JobStateBadge :state="job.state" />
            <Badge v-if="job.cancel_requested && !terminal" variant="warn">cancel requested</Badge>
          </div>
          <div class="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span :title="job.job_id">{{ truncateMiddle(job.job_id) }}</span>
            <CopyButton :value="job.job_id" label="Copy job id" />
          </div>
        </div>

        <section class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progress</h3>
          <Progress
            v-if="progressPercent !== null"
            :value="progressPercent"
            :label="`Job progress: ${progressText}`"
          />
          <p class="text-xs text-foreground">{{ progressText }}</p>
          <p v-if="lastPollError" class="text-[11px] text-muted-foreground">Auto-refresh failed: {{ lastPollError }}</p>
        </section>

        <dl class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt class="text-muted-foreground">Attempts</dt>
          <dd class="text-foreground">{{ job.attempts }}</dd>
          <dt class="text-muted-foreground">Created</dt>
          <dd class="text-foreground" :title="job.created_at">{{ relativeTime(job.created_at) }}</dd>
          <dt class="text-muted-foreground">Updated</dt>
          <dd class="text-foreground" :title="job.updated_at">{{ relativeTime(job.updated_at) }}</dd>
          <template v-if="job.finished_at">
            <dt class="text-muted-foreground">Finished</dt>
            <dd class="text-foreground" :title="job.finished_at">{{ relativeTime(job.finished_at) }}</dd>
          </template>
          <template v-if="job.workspace_bucket">
            <dt class="text-muted-foreground">Workspace</dt>
            <dd class="break-all font-mono text-[11px] text-foreground">
              <RouterLink
                :to="{ name: 'bucket', params: { bucketId: job.workspace_bucket } }"
                class="text-primary hover:underline"
                title="Open this workspace bucket in the data manager"
              >{{ job.workspace_bucket }}</RouterLink>
              <Badge v-if="job.workspace_mode" variant="outline" class="ml-1.5 text-[10px] uppercase">{{ job.workspace_mode }}</Badge>
            </dd>
          </template>
          <template v-else-if="job.workspace_mode">
            <dt class="text-muted-foreground">Workspace</dt>
            <dd class="text-foreground">{{ job.workspace_mode }}</dd>
          </template>
        </dl>

        <section v-if="job.error" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last error</h3>
          <div class="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <Badge :variant="errorKindVariant" class="text-[10px] uppercase">{{ job.error.kind }}</Badge>
            <p class="whitespace-pre-wrap break-words text-xs text-foreground">{{ job.error.message }}</p>
          </div>
        </section>

        <section v-if="importResult" class="space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Import summary</h3>
          <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="surface-muted p-3">
              <dt class="text-[10px] uppercase text-muted-foreground">Entries</dt>
              <dd class="mt-1 text-sm font-semibold text-foreground">{{ importResult.entries_total }}</dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[10px] uppercase text-muted-foreground">Imported</dt>
              <dd class="mt-1 text-sm font-semibold text-foreground">{{ importResult.imported }}</dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[10px] uppercase text-muted-foreground">Unlisted</dt>
              <dd class="mt-1 text-sm font-semibold text-foreground">{{ importResult.unlisted }}</dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[10px] uppercase text-muted-foreground">Failed</dt>
              <dd class="mt-1 text-sm font-semibold" :class="importResult.failed ? 'text-destructive' : 'text-foreground'">
                {{ importResult.failed }}
              </dd>
            </div>
          </dl>
          <RouterLink
            v-if="importResult.document_id"
            :to="{ name: 'metadata-detail', params: { id: importResult.document_id } }"
            class="inline-flex text-xs font-medium text-primary hover:underline"
          >
            Open imported metadata document
          </RouterLink>
          <p v-else class="text-xs text-muted-foreground">No metadata document was created.</p>
        </section>

        <section v-if="exportResult" class="space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Export summary</h3>
          <div
            v-if="omittedCount"
            class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            This export is incomplete: {{ omittedCount }} referenced file{{ omittedCount === 1 ? '' : 's' }}
            could not be included. The archive contains a completeness report.
          </div>
          <div v-if="omissionRows.length" class="flex flex-wrap gap-1.5">
            <Badge v-for="[reason, count] in omissionRows" :key="reason" variant="warn" class="text-[10px]">
              {{ reason }} {{ count }}
            </Badge>
          </div>
          <dl class="grid grid-cols-2 gap-2">
            <div class="surface-muted p-3">
              <dt class="text-[10px] uppercase text-muted-foreground">Included</dt>
              <dd class="mt-1 text-sm font-semibold text-foreground">{{ exportResult.included }}</dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[10px] uppercase text-muted-foreground">Omitted</dt>
              <dd class="mt-1 text-sm font-semibold" :class="omittedCount ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'">
                {{ omittedCount }}
              </dd>
            </div>
          </dl>
          <dl v-if="exportResult.artifact" class="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
            <dt class="text-muted-foreground">Size</dt>
            <dd>{{ formatBytes(exportResult.artifact.size) }}</dd>
            <dt class="text-muted-foreground">Expires</dt>
            <dd :title="new Date(exportResult.artifact.expires_at_ms).toISOString()">
              {{ new Date(exportResult.artifact.expires_at_ms).toLocaleString() }}
            </dd>
            <dt class="text-muted-foreground">BLAKE3</dt>
            <dd class="break-all font-mono text-[10px]">{{ exportResult.artifact.blake3 }}</dd>
          </dl>
          <div v-if="exportResult.artifact" class="space-y-2">
            <Button size="sm" :disabled="downloading || artifactExpired" @click="downloadArtifact">
              <Loader2 v-if="downloading" class="h-3.5 w-3.5 animate-spin" />
              <Download v-else class="h-3.5 w-3.5" />
              {{ downloading ? 'Downloading…' : artifactExpired ? 'Artifact expired' : 'Download RO-Crate' }}
            </Button>
            <p v-if="downloadError" class="text-xs text-destructive">{{ downloadError }}</p>
          </div>
          <p v-else class="text-xs text-muted-foreground">No artifact was published.</p>
        </section>

        <section
          v-if="terminal && (job.kind === 'import_rocrate' || job.kind === 'export_rocrate')"
          class="space-y-2"
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Report</h3>
            <span v-if="reportDigest" class="font-mono text-[10px] text-muted-foreground" :title="reportDigest">
              {{ truncateMiddle(reportDigest, 10, 8) }}
            </span>
          </div>
          <div v-if="reportRows.length" class="overflow-hidden rounded-md border border-border">
            <table class="w-full text-xs">
              <thead class="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th class="px-3 py-2 text-left font-semibold">Outcome</th>
                  <th class="px-3 py-2 text-left font-semibold">Source</th>
                  <th class="px-3 py-2 text-left font-semibold">Target</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in reportRows" :key="row.entry_key" class="border-t border-border align-top">
                  <td class="px-3 py-2">
                    <Badge :variant="reasonVariant(row.code)" class="text-[9px] uppercase">
                      {{ row.code.replaceAll('_', ' ') }}
                    </Badge>
                    <p v-if="row.message" class="mt-1 max-w-xs break-words text-[10px] text-muted-foreground">
                      {{ row.message }}
                    </p>
                  </td>
                  <td class="max-w-xs break-all px-3 py-2 font-mono text-[10px]">{{ reportSubject(row) }}</td>
                  <td class="max-w-xs break-all px-3 py-2 font-mono text-[10px]">
                    {{ reportTarget(row) || '-' }}
                    <span v-if="reportMeta(row)" class="mt-1 block text-muted-foreground">{{ reportMeta(row) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else-if="!reportLoading && !reportError" class="text-xs text-muted-foreground">The report has no rows.</p>
          <p v-if="reportError" class="text-xs text-destructive">{{ reportError }}</p>
          <div class="flex items-center gap-2">
            <Button
              v-if="reportCursor"
              variant="outline"
              size="sm"
              :disabled="reportLoading"
              @click="loadReport(true)"
            >
              Load more
            </Button>
            <span v-if="reportLoading" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading report…
            </span>
            <Button v-else-if="reportError" variant="outline" size="sm" @click="loadReport()">Retry</Button>
          </div>
        </section>

        <section v-if="prettyResult !== null" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Result</h3>
          <pre
            class="max-h-64 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]"
          >{{ prettyResult }}</pre>
        </section>

        <section v-if="prettyRunCrate !== null" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Run crate</h3>
          <pre
            class="max-h-64 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]"
          >{{ prettyRunCrate }}</pre>
        </section>

        <section v-if="!terminal" class="border-t border-border pt-4">
          <div class="flex items-center gap-2">
            <template v-if="canCancel && !confirmingCancel">
              <Button
                variant="outline"
                size="sm"
                class="text-destructive hover:text-destructive"
                :disabled="cancelling"
                @click="requestCancel"
              >
                <Ban class="h-3.5 w-3.5" /> Cancel job
              </Button>
            </template>
            <template v-else-if="canCancel">
              <Button variant="destructive" size="sm" :disabled="cancelling" @click="confirmCancel">
                <Ban class="h-3.5 w-3.5" /> Confirm cancel
              </Button>
              <Button variant="ghost" size="sm" :disabled="cancelling" @click="confirmingCancel = false">
                Keep running
              </Button>
            </template>
            <p v-else class="text-xs text-muted-foreground">
              Cancellation was requested; the job stops once the executor observes it.
            </p>
          </div>
          <p v-if="cancelError" class="mt-2 text-[11px] text-destructive">{{ cancelError }}</p>
        </section>
      </div>
    </div>
  </DetailDialog>
</template>
