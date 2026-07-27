<script setup lang="ts">
// RO-Crate zip transfer: upload-and-import an archive, or package a document
// into one. Both are durable jobs, so progress and the per-entry report come
// from the shared job machinery (useJobDetail) rather than a private poller.
import { computed, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Progress from '@/components/ui/Progress.vue'
import JobStateBadge from '@/components/jobs/JobStateBadge.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import { useAruna } from '@/composables/useAruna'
import { useBuckets } from '@/composables/useBuckets'
import { useBucketShortcuts } from '@/composables/useBucketShortcuts'
import { useJobDetail } from '@/composables/useJobs'
import { useNotifications } from '@/composables/useNotifications'
import { useS3 } from '@/composables/useS3'
import { formatJobProgress, isTerminalJobState, jobProgressPercent } from '@/lib/jobs'
import { formatBytes } from '@/lib/utils'
import { isWorkspaceBucket } from '@/lib/workspaces'
import {
  ARCHIVE_FILE_ACCEPT,
  archiveMediaType,
  downloadArchiveArtifact,
  exportJobResult,
  fetchArchiveReport,
  importJobResult,
  submitExport,
  submitImport,
  uploadArchive,
  type ArchiveReportRow,
  type ExportReportDetail,
  type ImportReportDetail,
} from '@/lib/rocrateArchive'
import { Download, FileArchive, FolderPlus, FolderTree, Loader2, Upload } from '@lucide/vue'

type TransferRow = ArchiveReportRow<Partial<ImportReportDetail & ExportReportDetail>>

const props = defineProps<{
  open: boolean
  mode: 'import' | 'export'
  // Export mode only: the document packaged into the archive.
  documentId?: string
  documentPath?: string
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const { apiBaseUrl, authToken, groups } = useAruna()
const { bumpDashboard } = useNotifications()
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const isImport = computed(() => props.mode === 'import')

const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)
const groupId = ref('')
const documentPath = ref('')
const bucket = ref('')
const prefix = ref('')
const isPublic = ref(false)

const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))

const s3 = useS3()
const bucketList = useBuckets()
const bucketsLoading = bucketList.loading
const bucketsLoaded = bucketList.loaded
const bucketsError = bucketList.error
const shortcuts = useBucketShortcuts()

// Browsing the target needs an S3 session, the import API only needs realm
// auth, so without a key bucket and prefix stay free text.
const canBrowse = computed(() => s3.hasActiveKey.value && Boolean(s3.endpoint.value))
const browseAuthError = ref(false)
const browserOpen = ref(false)
const newSegment = ref('')

const bucketOptions = computed(() => {
  const names = bucketList.buckets.value
    .map((entry) => entry.name)
    .filter((name) => !isWorkspaceBucket(name))
  const typed = bucket.value.trim()
  // A hand-typed target stays selected when the list arrives later.
  if (typed && !names.includes(typed)) names.push(typed)
  return names.map((name) => ({ value: name, label: name }))
})

const authRejected = computed(() => bucketList.authError.value || browseAuthError.value)
const pickBucket = computed(
  () => canBrowse.value && !authRejected.value && bucketOptions.value.length > 0,
)

const browseHint = computed(() => {
  if (!s3.endpoint.value) return 'This node advertises no S3 endpoint, so the target is typed by hand.'
  if (!s3.hasActiveKey.value) return 'S3 credentials (Data manager) unlock the bucket picker; the import itself does not need them.'
  if (authRejected.value) return 'Your S3 credentials were rejected, so the target cannot be browsed.'
  if (bucketList.loaded.value && !bucketOptions.value.length) return 'No buckets are visible with this key, type the target name.'
  return null
})

const targetPath = computed(() => {
  const folder = prefix.value.trim().replace(/^\/+|\/+$/g, '')
  return `s3://${bucket.value.trim() || 'bucket'}/${folder ? `${folder}/` : ''}`
})

const segmentInvalid = computed(() => {
  const name = newSegment.value.trim()
  return !name || name.includes('/')
})

// The browsed folder is the target; it is a plain prefix, so navigating is
// enough to pick it.
function onNavigate(location: { bucket: string; prefix: string }) {
  if (location.bucket !== bucket.value) return
  prefix.value = location.prefix.replace(/\/+$/, '')
}

// Import targets usually do not exist yet: the job writes the keys, so a new
// segment is appended to the browsed folder instead of being created here.
function addSegment() {
  if (segmentInvalid.value) return
  const base = prefix.value.trim().replace(/^\/+|\/+$/g, '')
  prefix.value = base ? `${base}/${newSegment.value.trim()}` : newSegment.value.trim()
  newSegment.value = ''
}

function onBrowseFailure() {
  browseAuthError.value = true
  browserOpen.value = false
}

// Another bucket is another key space; the picked prefix never carries over.
function onBucketPick(next: string) {
  bucket.value = next
  prefix.value = ''
  newSegment.value = ''
}

// Prefer the last browsed bucket, then the only one on offer.
function preselectBucket() {
  if (bucket.value || !bucketOptions.value.length) return
  const names = new Set(bucketOptions.value.map((option) => option.value))
  const known = [...shortcuts.recent.value, ...shortcuts.pinned.value].find(
    (entry) => !entry.nodeId && names.has(entry.bucket),
  )
  const only = bucketOptions.value.length === 1 ? bucketOptions.value[0] : undefined
  if (known) bucket.value = known.bucket
  else if (only) bucket.value = only.value
}

watch(
  [() => props.open, () => s3.activeKey.value, () => s3.endpoint.value],
  ([open, key, endpoint]) => {
    if (!open || !isImport.value) return
    browseAuthError.value = false
    if (!key || !endpoint) return
    void bucketList.ensure().then(preselectBucket)
  },
  { immediate: true },
)

// One attempt = one uploaded archive: keeping the key across a retried submit
// replays the first job instead of racing a second one for the same upload.
const attemptKey = ref('')
const uploadId = ref<string | null>(null)
const uploadedBytes = ref(0)
const busy = ref<'' | 'uploading' | 'submitting' | 'downloading'>('')
const submitError = ref<string | null>(null)
const activeJobId = ref<string | null>(null)
const downloadedName = ref<string | null>(null)

const { job, loadState, loadError, lastPollError, load } = useJobDetail(() => activeJobId.value)

const terminal = computed(() => Boolean(job.value && isTerminalJobState(job.value.state)))
const progressPercent = computed(() => (job.value ? jobProgressPercent(job.value.progress) : null))
const progressText = computed(() => (job.value ? formatJobProgress(job.value.progress) : ''))
const importResult = computed(() => importJobResult(job.value?.result))
const exportResult = computed(() => exportJobResult(job.value?.result))
const createdDocumentId = computed(() => importResult.value?.document_id ?? null)
const artifactReady = computed(() => job.value?.state === 'succeeded' && Boolean(exportResult.value?.artifact))

const rows = ref<TransferRow[]>([])
const reportCursor = ref<string | null>(null)
const reportPending = ref(false)
const reportError = ref<string | null>(null)
const reportLoading = ref(false)
let reportTimer: number | undefined
let reportAttempts = 0

const REPORT_PAGE = 200
// A frozen report lands shortly after the terminal transition; bound the wait.
const REPORT_RETRY_MS = 2_000
const REPORT_MAX_RETRIES = 15

function stopReportRetry() {
  if (reportTimer !== undefined) window.clearTimeout(reportTimer)
  reportTimer = undefined
}

async function loadReport(cursor?: string) {
  const jobId = activeJobId.value
  if (!jobId || reportLoading.value) return
  reportLoading.value = true
  reportError.value = null
  try {
    const result = await fetchArchiveReport<Partial<ImportReportDetail & ExportReportDetail>>(jobId, client(), {
      limit: REPORT_PAGE,
      cursor,
    })
    if (jobId !== activeJobId.value) return
    if (result.status === 'pending') {
      reportPending.value = true
      if (++reportAttempts <= REPORT_MAX_RETRIES) {
        stopReportRetry()
        reportTimer = window.setTimeout(() => void loadReport(cursor), REPORT_RETRY_MS)
      }
      return
    }
    reportPending.value = false
    rows.value = cursor ? [...rows.value, ...result.page.rows] : result.page.rows
    reportCursor.value = result.page.next_cursor ?? null
  } catch (err) {
    if (jobId === activeJobId.value) reportError.value = err instanceof Error ? err.message : String(err)
  } finally {
    reportLoading.value = false
  }
}

function retryReport() {
  reportAttempts = 0
  void loadReport()
}

// The report is frozen at the terminal transition, so fetch it exactly once the
// polled job settles.
watch(terminal, (settled) => {
  if (!settled) return
  // An import creates a document the notification stream only reports to
  // watchers, so tell the dashboard itself that its data moved.
  if (createdDocumentId.value) bumpDashboard()
  if (rows.value.length || reportLoading.value) return
  reportAttempts = 0
  void loadReport()
})

function pickFile(next: File | null) {
  submitError.value = null
  if (!next) return
  if (!archiveMediaType(next.name)) {
    submitError.value = 'Only .zip and .eln archives can be imported.'
    return
  }
  file.value = next
  // A different archive is a different attempt: drop the claimed upload and key.
  uploadId.value = null
  attemptKey.value = ''
  if (!documentPath.value) documentPath.value = `datasets/${next.name.replace(/\.(zip|eln)$/i, '')}`
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  pickFile(event.dataTransfer?.files?.[0] ?? null)
}

function onBrowse(event: Event) {
  const input = event.target as HTMLInputElement
  pickFile(input.files?.[0] ?? null)
  input.value = ''
}

const importReady = computed(
  () => Boolean(file.value && groupId.value && documentPath.value.trim() && bucket.value.trim()),
)

async function startImport() {
  const selected = file.value
  if (!selected || !importReady.value || busy.value) return
  submitError.value = null
  try {
    let uploaded = uploadId.value
    if (!uploaded) {
      attemptKey.value = crypto.randomUUID()
      busy.value = 'uploading'
      const upload = await uploadArchive(selected, client())
      uploaded = upload.upload_id
      uploadId.value = upload.upload_id
      uploadedBytes.value = upload.size
    }
    busy.value = 'submitting'
    const submitted = await submitImport(
      {
        source: { kind: 'upload', upload_id: uploaded },
        target: { bucket: bucket.value.trim(), prefix: prefix.value.trim() },
        metadata: { group_id: groupId.value, path: documentPath.value.trim(), public: isPublic.value },
        idempotency_key: attemptKey.value,
      },
      client(),
    )
    activeJobId.value = submitted.job_id
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = ''
  }
}

async function startExport() {
  if (!props.documentId || busy.value) return
  submitError.value = null
  busy.value = 'submitting'
  try {
    attemptKey.value = crypto.randomUUID()
    const submitted = await submitExport(props.documentId, client(), attemptKey.value)
    activeJobId.value = submitted.job_id
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = ''
  }
}

async function downloadArtifact() {
  const jobId = activeJobId.value
  if (!jobId || busy.value) return
  busy.value = 'downloading'
  submitError.value = null
  try {
    downloadedName.value = await downloadArchiveArtifact(jobId, client())
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = ''
  }
}

function reset() {
  stopReportRetry()
  activeJobId.value = null
  rows.value = []
  reportCursor.value = null
  reportPending.value = false
  reportError.value = null
  reportAttempts = 0
  submitError.value = null
  downloadedName.value = null
  uploadId.value = null
  attemptKey.value = ''
  file.value = null
}

// Another document means another export; never show its predecessor's report.
watch(() => props.documentId, reset)
watch(
  () => props.open,
  (open) => {
    if (!open) stopReportRetry()
  },
)
onUnmounted(stopReportRetry)

const GOOD_CODES = new Set(['imported', 'included'])
const BAD_CODES = new Set(['failed', 'denied', 'missing', 'unsupported', 'unsupported_crate_version'])

function codeVariant(code: string): 'success' | 'destructive' | 'warn' {
  if (GOOD_CODES.has(code)) return 'success'
  if (BAD_CODES.has(code)) return 'destructive'
  return 'warn'
}

function rowSource(row: TransferRow): string {
  return row.detail.archive_path || row.detail.entity_id || row.entry_key
}

function rowTarget(row: TransferRow): string {
  return row.detail.target_key || row.detail.zip_path || ''
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="flex max-h-[88vh] max-w-2xl flex-col">
      <DialogHeader class="pr-8">
        <DialogTitle class="flex items-center gap-2">
          <FileArchive class="h-4 w-4 text-primary" />
          {{ isImport ? 'Import RO-Crate archive' : 'Export RO-Crate archive' }}
        </DialogTitle>
        <DialogDescription>
          <template v-if="isImport">
            Upload a .zip or .eln RO-Crate, unpack its payload into a bucket and register the crate as a metadata document.
          </template>
          <template v-else>
            Package {{ props.documentPath || 'this document' }} and its resolvable data into a downloadable RO-Crate zip.
          </template>
        </DialogDescription>
      </DialogHeader>

      <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <template v-if="isImport && !activeJobId">
          <div
            class="rounded-md border-2 border-dashed p-6 text-center transition-colors"
            :class="dragActive ? 'border-primary bg-primary/5' : 'border-border'"
            @dragover.prevent="dragActive = true"
            @dragleave="dragActive = false"
            @drop.prevent="onDrop"
          >
            <Upload class="mx-auto h-7 w-7 text-muted-foreground" />
            <p v-if="file" class="mt-2 break-all text-sm font-medium text-foreground">
              {{ file.name }} <span class="text-muted-foreground">({{ formatBytes(file.size) }})</span>
            </p>
            <p v-else class="mt-2 text-sm text-foreground">Drop an RO-Crate .zip or .eln here</p>
            <input ref="fileInput" type="file" :accept="ARCHIVE_FILE_ACCEPT" class="hidden" @change="onBrowse" />
            <Button variant="outline" size="sm" class="mt-3" @click="fileInput?.click()">
              {{ file ? 'Choose another file' : 'Choose a file' }}
            </Button>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Group</label>
              <Select v-model="groupId" :options="groupOptions" placeholder="Choose a group" class="mt-1" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Document path</label>
              <Input v-model="documentPath" placeholder="datasets/my-crate" class="mt-1" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Target bucket</label>
              <Select
                v-if="pickBucket"
                :model-value="bucket"
                :options="bucketOptions"
                placeholder="Choose a bucket"
                aria-label="Target bucket"
                class="mt-1"
                @update:model-value="onBucketPick"
              />
              <Input v-else v-model="bucket" placeholder="my-bucket" class="mt-1" />
              <p v-if="bucketsLoading && !bucketsLoaded" class="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 class="h-3 w-3 animate-spin" /> Loading buckets…
              </p>
              <p v-else-if="bucketsError && !authRejected" class="mt-1 text-[11px] text-destructive">{{ bucketsError }}</p>
            </div>
            <div>
              <div class="flex items-center justify-between gap-2">
                <label class="text-xs font-medium text-foreground">Key prefix</label>
                <Button
                  v-if="canBrowse && !authRejected && bucket"
                  variant="ghost"
                  size="sm"
                  class="h-5 px-1 text-[11px]"
                  @click="browserOpen = !browserOpen"
                >
                  <FolderTree class="size-3" /> {{ browserOpen ? 'Hide folders' : 'Browse folders' }}
                </Button>
              </div>
              <Input v-model="prefix" placeholder="optional/prefix" class="mt-1" />
            </div>

            <div v-if="browserOpen && canBrowse && bucket" class="space-y-2 rounded-md border border-border p-2 sm:col-span-2">
              <ObjectBrowserPanel :bucket="bucket" :prefix="prefix" @navigate="onNavigate" @auth-error="onBrowseFailure" />
              <div class="flex flex-wrap items-center gap-2">
                <Input
                  v-model="newSegment"
                  class="h-8 w-44 font-mono text-xs"
                  placeholder="new-subfolder"
                  aria-label="New subfolder name"
                  @keydown.enter.prevent="addSegment"
                />
                <Button variant="outline" size="sm" :disabled="segmentInvalid" @click="addSegment">
                  <FolderPlus class="size-3.5" /> Add subfolder
                </Button>
                <span class="text-[11px] text-muted-foreground">The prefix does not have to exist, the import creates it.</span>
              </div>
            </div>

            <p class="text-[11px] text-muted-foreground sm:col-span-2">
              Payload lands in <code class="rounded bg-muted px-1 font-mono">{{ targetPath }}</code>
              <template v-if="browseHint"> · {{ browseHint }}</template>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Switch :checked="isPublic" aria-label="Publish the imported document" @update:checked="isPublic = $event" />
            <span class="text-xs text-foreground">Make the imported metadata document public</span>
          </div>
          <p class="text-[11px] text-muted-foreground">
            The archive is uploaded privately first, then unpacked by a durable job. You need write access to the bucket and the group.
          </p>
        </template>

        <p v-else-if="!isImport && !activeJobId" class="text-xs text-muted-foreground">
          Data entities that cannot be resolved (external URLs, denied, missing or offline objects) are listed in the
          report instead of being packed.
        </p>

        <section v-if="activeJobId" class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <JobStateBadge v-if="job" :state="job.state" />
            <Loader2 v-if="job && !terminal" class="h-3.5 w-3.5 animate-spin text-primary" />
            <span class="text-xs text-muted-foreground">{{ progressText }}</span>
          </div>
          <Progress v-if="progressPercent !== null && !terminal" :value="progressPercent" :warn="101" :critical="101" />
          <p v-if="loadState === 'unsupported'" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            This backend does not serve the durable jobs API, so the transfer cannot be followed here.
          </p>
          <div v-else-if="loadState === 'error'" class="space-y-1">
            <p class="text-xs text-destructive">{{ loadError }}</p>
            <Button variant="outline" size="sm" @click="load">Try again</Button>
          </div>
          <p v-if="lastPollError" class="text-[11px] text-muted-foreground">Auto-refresh failed: {{ lastPollError }}</p>
          <p v-if="job?.error" class="whitespace-pre-wrap break-words text-xs text-destructive">{{ job.error.message }}</p>

          <dl v-if="importResult" class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div class="surface-muted p-2">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Entries</dt>
              <dd class="mt-0.5 font-medium text-foreground">{{ importResult.entries_total }}</dd>
            </div>
            <div class="surface-muted p-2">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Imported</dt>
              <dd class="mt-0.5 font-medium text-foreground">{{ importResult.imported }}</dd>
            </div>
            <div class="surface-muted p-2">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Unlisted</dt>
              <dd class="mt-0.5 font-medium text-foreground">{{ importResult.unlisted }}</dd>
            </div>
            <div class="surface-muted p-2">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Failed</dt>
              <dd class="mt-0.5 font-medium text-foreground">{{ importResult.failed }}</dd>
            </div>
          </dl>

          <dl v-if="exportResult" class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div class="surface-muted p-2">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Included</dt>
              <dd class="mt-0.5 font-medium text-foreground">{{ exportResult.included }}</dd>
            </div>
            <div class="surface-muted p-2">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">External</dt>
              <dd class="mt-0.5 font-medium text-foreground">{{ exportResult.omitted.external }}</dd>
            </div>
            <div class="surface-muted p-2">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Denied</dt>
              <dd class="mt-0.5 font-medium text-foreground">{{ exportResult.omitted.denied }}</dd>
            </div>
            <div class="surface-muted p-2">
              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Missing</dt>
              <dd class="mt-0.5 font-medium text-foreground">{{ exportResult.omitted.missing }}</dd>
            </div>
          </dl>
          <p v-if="exportResult?.artifact" class="text-[11px] text-muted-foreground">
            Archive {{ formatBytes(exportResult.artifact.size) }}
            <template v-if="downloadedName"> · saved as {{ downloadedName }}</template>
          </p>

          <RouterLink v-if="createdDocumentId" :to="{ name: 'metadata-detail', params: { id: createdDocumentId } }">
            <Button variant="outline" size="sm" @click="emit('update:open', false)">Open the created document</Button>
          </RouterLink>

          <div v-if="terminal" class="space-y-2">
            <div class="flex items-center gap-2">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Report</p>
              <span v-if="rows.length" class="text-[11px] text-muted-foreground">{{ rows.length }} rows</span>
            </div>
            <div v-if="reportPending || reportError" class="flex items-center gap-2">
              <p class="text-xs" :class="reportError ? 'text-destructive' : 'text-muted-foreground'">
                {{ reportError || 'The job report is still being written…' }}
              </p>
              <Button variant="ghost" size="sm" :disabled="reportLoading" @click="retryReport">Retry</Button>
            </div>
            <p v-else-if="!rows.length && !reportLoading" class="text-xs text-muted-foreground">This job produced no report rows.</p>
            <div v-else-if="rows.length" class="max-h-64 overflow-y-auto rounded-md border border-border">
              <table class="w-full text-[11px]">
                <tbody>
                  <tr v-for="row in rows" :key="row.entry_key" class="border-b border-border last:border-0 align-top">
                    <td class="px-2 py-1.5">
                      <Badge :variant="codeVariant(row.code)" class="text-[10px] uppercase">{{ row.code }}</Badge>
                    </td>
                    <td class="px-2 py-1.5">
                      <p class="break-all font-mono text-foreground">{{ rowSource(row) }}</p>
                      <p v-if="rowTarget(row)" class="break-all font-mono text-muted-foreground">→ {{ rowTarget(row) }}</p>
                      <p v-if="row.message" class="text-muted-foreground">{{ row.message }}</p>
                      <p v-if="row.detail.validation" class="text-destructive">
                        {{ row.detail.validation.code }}: {{ row.detail.validation.message }}
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Button v-if="reportCursor" variant="outline" size="sm" :disabled="reportLoading" @click="loadReport(reportCursor ?? undefined)">
              {{ reportLoading ? 'Loading…' : 'Load more rows' }}
            </Button>
          </div>
        </section>

        <p v-if="submitError" class="text-xs text-destructive">{{ submitError }}</p>
        <p v-if="uploadId && !activeJobId" class="text-[11px] text-muted-foreground">
          Uploaded {{ formatBytes(uploadedBytes) }}; the import has not been submitted yet.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Close</Button>
        <Button v-if="activeJobId && terminal" variant="outline" @click="reset">
          {{ isImport ? 'Import another' : 'Run again' }}
        </Button>
        <Button v-if="artifactReady" :disabled="busy === 'downloading'" @click="downloadArtifact">
          <Loader2 v-if="busy === 'downloading'" class="h-4 w-4 animate-spin" />
          <Download v-else class="h-4 w-4" /> Download archive
        </Button>
        <Button v-if="isImport && !activeJobId" :disabled="!importReady || Boolean(busy)" @click="startImport">
          <Loader2 v-if="busy" class="h-4 w-4 animate-spin" />
          <Upload v-else class="h-4 w-4" />
          {{ busy === 'uploading' ? 'Uploading…' : busy === 'submitting' ? 'Submitting…' : 'Upload and import' }}
        </Button>
        <Button v-if="!isImport && !activeJobId" :disabled="!props.documentId || Boolean(busy)" @click="startExport">
          <Loader2 v-if="busy" class="h-4 w-4 animate-spin" />
          <FileArchive v-else class="h-4 w-4" /> Start export
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
