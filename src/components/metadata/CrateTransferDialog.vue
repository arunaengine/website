<script setup lang="ts">
// RO-Crate zip export: package a document into an archive. The export is a
// durable job, so progress and the per-entry report come from the shared job
// machinery (useJobDetail) rather than a private poller.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import DetailList, { type Detail } from '@/components/ui/DetailList.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import TransferJobStatus from '@/components/metadata/TransferJobStatus.vue'
import TransferReport from '@/components/metadata/TransferReport.vue'
import { useAruna } from '@/composables/useAruna'
import { useJobDetail } from '@/composables/useJobs'
import { preflightExport, type ExportPreflight } from '@/lib/exportPreflight'
import { isTerminalJobState } from '@/lib/jobs'
import { errorMessage, formatBytes } from '@/lib/utils'
import { downloadArchiveArtifact, exportJobResult, submitExport } from '@/lib/rocrateArchive'
import { Download, FileArchive } from '@lucide/vue'

const CrateGraph = defineAsyncComponent(() => import('@/components/metadata/CrateGraph.vue'))

const props = defineProps<{
  open: boolean
  // The document packaged into the archive.
  documentId?: string
  documentPath?: string
}>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const { apiBaseUrl, authToken, fullCrates, loadRoCrate, getMetadataDocument } = useAruna()
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

// Export shows what it packages.
const exportCrate = computed(() => (props.documentId ? fullCrates.value[props.documentId] : undefined))
watch(
  () => [props.open, props.documentId] as const,
  ([open, documentId]) => {
    if (open && documentId && !exportCrate.value) {
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
  () => [props.open, exportCrate.value, apiBaseUrl.value, authToken.value] as const,
  ([open, crate]) => {
    preflight.value = null
    const token = ++preflightToken
    if (!open || !crate) return
    void preflightExport(crate, getMetadataDocument).then((result) => {
      if (token === preflightToken) preflight.value = result
    })
  },
  { immediate: true },
)

const attemptKey = ref('')
const busy = ref<'' | 'submitting' | 'downloading'>('')
const submitError = ref<string | null>(null)
const activeJobId = ref<string | null>(null)
const downloadedName = ref<string | null>(null)

const { job, loadState, loadError, lastPollError, load } = useJobDetail(() => activeJobId.value)

const terminal = computed(() => Boolean(job.value && isTerminalJobState(job.value.state)))
const exportResult = computed(() => exportJobResult(job.value?.result))
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
  attemptKey.value = ''
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
          Export RO-Crate archive
        </DialogTitle>
        <DialogDescription>
          Package {{ props.documentPath || 'this dataset' }} and its resolvable data into a downloadable RO-Crate zip.
        </DialogDescription>
      </DialogHeader>

      <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <p v-if="!activeJobId" class="text-xs text-muted-foreground">
          Data entities that cannot be resolved (external URLs, denied, missing or unreachable objects) are listed in the
          report instead of being packed.
        </p>
        <Notice
          v-if="!activeJobId && preflight?.restricted.length"
          tone="warning"
          title="Some linked datasets are not accessible"
          :lines="preflight.restricted.map((link) => link.name)"
        >
          The archive keeps these dataset references. Linked datasets and their files are not bundled recursively.
        </Notice>
        <p v-if="!activeJobId && preflight?.failed" class="text-[11px] text-muted-foreground">
          Not every linked dataset could be checked. Their references remain in the metadata.
        </p>
        <div v-if="!activeJobId && exportCrate" class="space-y-1.5">
          <p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Graph</p>
          <CrateGraph :source="exportCrate" mode="view" height="18rem" />
        </div>

        <section v-if="activeJobId" class="space-y-3">
          <TransferJobStatus :job="job" :load-state="loadState" :load-error="loadError" :last-poll-error="lastPollError" @retry="load" />

          <DetailList v-if="exportResult" :items="exportDetails" />
          <Notice v-if="exportResult && exportResult.omitted.denied > 0" tone="warning">
            {{ exportResult.omitted.denied === 1 ? '1 entry was' : `${exportResult.omitted.denied} entries were` }}
            left out because you may not read them; the report marks them as denied.
          </Notice>
          <p v-if="exportResult?.artifact" class="text-[11px] text-muted-foreground">
            Archive {{ formatBytes(exportResult.artifact.size) }}
            <template v-if="downloadedName"> · saved as {{ downloadedName }}</template>
          </p>

          <TransferReport :key="activeJobId" :job-id="activeJobId" :settled="terminal" />
        </section>

        <p v-if="submitError" class="text-xs text-destructive">{{ submitError }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Close</Button>
        <Button v-if="activeJobId && terminal" variant="outline" @click="reset">
          Run again
        </Button>
        <Button v-if="artifactReady" :disabled="busy === 'downloading'" @click="downloadArtifact">
          <Spinner v-if="busy === 'downloading'" class="text-current" aria-hidden="true" />
          <Download v-else class="h-4 w-4" /> Download archive
        </Button>
        <Button v-if="!activeJobId" :disabled="!props.documentId || Boolean(busy)" @click="startExport">
          <Spinner v-if="busy" class="text-current" aria-hidden="true" />
          <FileArchive v-else class="h-4 w-4" /> Start export
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
