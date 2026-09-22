<script setup lang="ts">
// RO-Crate zip transfer: upload-and-import an archive, or package a document
// into one. Both are durable jobs, so progress and the per-entry report come
// from the shared job machinery (useJobDetail) rather than a private poller.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import DetailList, { type Detail } from '@/components/ui/DetailList.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import TransferJobStatus from '@/components/metadata/TransferJobStatus.vue'
import TransferReport from '@/components/metadata/TransferReport.vue'
import TransferTarget from '@/components/metadata/TransferTarget.vue'
import { useAruna } from '@/composables/useAruna'
import { useJobDetail } from '@/composables/useJobs'
import { useNotifications } from '@/composables/useNotifications'
import { preflightExport, type ExportPreflight } from '@/lib/exportPreflight'
import { isTerminalJobState } from '@/lib/jobs'
import { errorMessage, formatBytes } from '@/lib/utils'
import {
  ARCHIVE_FILE_ACCEPT,
  archiveMediaType,
  downloadArchiveArtifact,
  exportJobResult,
  importJobResult,
  submitExport,
  submitImport,
  uploadArchive,
} from '@/lib/rocrateArchive'
import { Download, FileArchive, Upload } from '@lucide/vue'

const CrateGraph = defineAsyncComponent(() => import('@/components/metadata/CrateGraph.vue'))

const props = defineProps<{
  open: boolean
  mode: 'import' | 'export'
  // Export mode only: the document packaged into the archive.
  documentId?: string
  documentPath?: string
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const { apiBaseUrl, authToken, fullCrates, loadRoCrate, getMetadataDocument } = useAruna()
const { bumpDashboard } = useNotifications()
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const isImport = computed(() => props.mode === 'import')

// Export shows what it packages; an archive has no crate to show before it
// is unpacked.
const exportCrate = computed(() => (props.documentId ? fullCrates.value[props.documentId] : undefined))
watch(
  () => [props.open, props.documentId] as const,
  ([open, documentId]) => {
    if (open && !isImport.value && documentId && !exportCrate.value) {
      void loadRoCrate(documentId).catch(() => undefined)
    }
  },
  { immediate: true },
)

// Linked datasets the archive will leave out, checked before the job starts.
// The account and API base are part of the source so their answer never
// outlives a sign-in or realm change.
const preflight = ref<ExportPreflight | null>(null)
let preflightToken = 0
watch(
  () => [props.open, isImport.value, exportCrate.value, apiBaseUrl.value, authToken.value] as const,
  ([open, importing, crate]) => {
    preflight.value = null
    const token = ++preflightToken
    if (!open || importing || !crate) return
    void preflightExport(crate, getMetadataDocument).then((result) => {
      if (token === preflightToken) preflight.value = result
    })
  },
  { immediate: true },
)

const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)
const groupId = ref('')
const documentPath = ref('')
const bucket = ref('')
const prefix = ref('')
const isPublic = ref(false)

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
const importResult = computed(() => importJobResult(job.value?.result))
const exportResult = computed(() => exportJobResult(job.value?.result))
const createdDocumentId = computed(() => importResult.value?.document_id ?? null)
const importDetails = computed<Detail[]>(() => {
  const r = importResult.value
  return r
    ? [
        { label: 'Entries', value: String(r.entries_total) },
        { label: 'Imported', value: String(r.imported) },
        { label: 'Unlisted', value: String(r.unlisted) },
        { label: 'Failed', value: String(r.failed) },
      ]
    : []
})
const exportDetails = computed<Detail[]>(() => {
  const r = exportResult.value
  return r
    ? [
        { label: 'Included', value: String(r.included) },
        { label: 'External', value: String(r.omitted.external) },
        { label: 'Denied', value: String(r.omitted.denied) },
        { label: 'Missing', value: String(r.omitted.missing) },
      ]
    : []
})
const artifactReady = computed(() => job.value?.state === 'succeeded' && Boolean(exportResult.value?.artifact))

watch(terminal, (settled) => {
  // An import creates a document the notification stream only reports to
  // watchers, so tell the dashboard itself that its data moved.
  if (settled && createdDocumentId.value) bumpDashboard()
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
    submitError.value = errorMessage(err)
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
    submitError.value = errorMessage(err)
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
    submitError.value = errorMessage(err)
  } finally {
    busy.value = ''
  }
}

function reset() {
  activeJobId.value = null
  submitError.value = null
  downloadedName.value = null
  uploadId.value = null
  attemptKey.value = ''
  file.value = null
}

// Another document means another export; never show its predecessor's report.
watch(() => props.documentId, reset)
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="flex max-h-[88vh] max-w-xl flex-col">
      <DialogHeader class="pr-8">
        <DialogTitle class="flex items-center gap-2">
          <FileArchive class="h-4 w-4 text-primary" />
          {{ isImport ? 'Import RO-Crate archive' : 'Export RO-Crate archive' }}
        </DialogTitle>
        <DialogDescription>
          <template v-if="isImport">
            Upload a .zip or .eln RO-Crate, unpack its payload into a bucket and register it as a dataset.
          </template>
          <template v-else>
            Package {{ props.documentPath || 'this dataset' }} and its resolvable data into a downloadable RO-Crate zip.
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
            <TransferTarget
              v-model:group-id="groupId"
              v-model:bucket="bucket"
              v-model:prefix="prefix"
              :active="props.open && isImport"
              @navigate="emit('update:open', false)"
            >
              <div>
                <label class="text-xs font-medium text-foreground">Dataset path</label>
                <Input v-model="documentPath" placeholder="datasets/my-dataset" class="mt-1" />
              </div>
            </TransferTarget>
          </div>
          <div class="flex items-center gap-2">
            <Switch :checked="isPublic" aria-label="Publish the imported dataset" @update:checked="isPublic = $event" />
            <span class="text-xs text-foreground">Make the imported dataset public</span>
          </div>
          <p class="text-[11px] text-muted-foreground">
            The archive is uploaded privately first, then unpacked in the background. You need write access to the bucket and the group.
          </p>
        </template>

        <p v-else-if="!isImport && !activeJobId" class="text-xs text-muted-foreground">
          Data entities that cannot be resolved (external URLs, denied, missing or unreachable objects) are listed in the
          report instead of being packed.
        </p>
        <Notice
          v-if="!isImport && !activeJobId && preflight?.restricted.length"
          tone="warning"
          title="Some linked datasets are not accessible"
          :lines="preflight.restricted.map((link) => link.name)"
        >
          The archive keeps these dataset references. Linked datasets and their files are not bundled recursively.
        </Notice>
        <p v-if="!isImport && !activeJobId && preflight?.failed" class="text-[11px] text-muted-foreground">
          Not every linked dataset could be checked. Their references remain in the metadata.
        </p>
        <div v-if="!isImport && !activeJobId && exportCrate" class="space-y-1.5">
          <p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Graph</p>
          <CrateGraph :source="exportCrate" mode="view" height="18rem" />
        </div>

        <section v-if="activeJobId" class="space-y-3">
          <TransferJobStatus :job="job" :load-state="loadState" :load-error="loadError" :last-poll-error="lastPollError" @retry="load" />

          <DetailList v-if="importResult" :items="importDetails" />

          <DetailList v-if="exportResult" :items="exportDetails" />
          <Notice v-if="exportResult && exportResult.omitted.denied > 0" tone="warning">
            {{ exportResult.omitted.denied === 1 ? '1 entry was' : `${exportResult.omitted.denied} entries were` }}
            left out because you may not read them; the report marks them as denied.
          </Notice>
          <p v-if="exportResult?.artifact" class="text-[11px] text-muted-foreground">
            Archive {{ formatBytes(exportResult.artifact.size) }}
            <template v-if="downloadedName"> · saved as {{ downloadedName }}</template>
          </p>

          <Button v-if="createdDocumentId" variant="outline" size="sm" as-child @click="emit('update:open', false)">
            <RouterLink :to="{ name: 'dataset', params: { id: createdDocumentId } }">Open the created dataset</RouterLink>
          </Button>

          <TransferReport :key="activeJobId" :job-id="activeJobId" :settled="terminal" />
        </section>

        <p v-if="submitError" class="text-xs text-destructive">{{ submitError }}</p>
        <p v-if="uploadId && !activeJobId" class="text-[11px] text-muted-foreground">
          Uploaded {{ formatBytes(uploadedBytes) }}; the import has not started yet.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Close</Button>
        <Button v-if="activeJobId && terminal" variant="outline" @click="reset">
          {{ isImport ? 'Import another' : 'Run again' }}
        </Button>
        <Button v-if="artifactReady" :disabled="busy === 'downloading'" @click="downloadArtifact">
          <Spinner v-if="busy === 'downloading'" class="text-current" aria-hidden="true" />
          <Download v-else class="h-4 w-4" /> Download archive
        </Button>
        <Button v-if="isImport && !activeJobId" :disabled="!importReady || Boolean(busy)" @click="startImport">
          <Spinner v-if="busy" class="text-current" aria-hidden="true" />
          <Upload v-else class="h-4 w-4" />
          {{ busy === 'uploading' ? 'Uploading…' : busy === 'submitting' ? 'Starting…' : 'Upload and import' }}
        </Button>
        <Button v-if="!isImport && !activeJobId" :disabled="!props.documentId || Boolean(busy)" @click="startExport">
          <Spinner v-if="busy" class="text-current" aria-hidden="true" />
          <FileArchive v-else class="h-4 w-4" /> Start export
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
