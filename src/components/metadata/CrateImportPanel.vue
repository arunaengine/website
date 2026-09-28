<script setup lang="ts">
// Uploads a .zip or .eln RO-Crate and imports it as a new dataset. The import is
// a durable job, so progress and the report come from the shared job machinery.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import DetailList, { type Detail } from '@/components/ui/DetailList.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Input from '@/components/ui/Input.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import TransferJobStatus from '@/components/metadata/TransferJobStatus.vue'
import TransferReport from '@/components/metadata/TransferReport.vue'
import TransferTarget from '@/components/metadata/TransferTarget.vue'
import { useAruna } from '@/composables/useAruna'
import { useJobDetail } from '@/composables/useJobs'
import { useNotifications } from '@/composables/useNotifications'
import { isTerminalJobState } from '@/lib/jobs'
import { errorMessage, formatBytes } from '@/lib/utils'
import { ARCHIVE_FILE_ACCEPT, archiveMediaType, importJobResult, submitImport, uploadArchive } from '@/lib/rocrateArchive'
import { Upload } from '@lucide/vue'

// active: the panel is on screen, so its target pickers may load.
const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { apiBaseUrl, authToken } = useAruna()
const { bumpDashboard } = useNotifications()
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

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
const busy = ref<'' | 'uploading' | 'submitting'>('')
const submitError = ref<string | null>(null)
const activeJobId = ref<string | null>(null)

const { job, loadState, loadError, lastPollError, load } = useJobDetail(() => activeJobId.value)

const terminal = computed(() => Boolean(job.value && isTerminalJobState(job.value.state)))
const importResult = computed(() => importJobResult(job.value?.result))
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

function reset() {
  activeJobId.value = null
  submitError.value = null
  uploadId.value = null
  attemptKey.value = ''
  file.value = null
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      <template v-if="!activeJobId">
        <p class="text-xs text-muted-foreground">
          Upload a .zip or .eln RO-Crate, unpack its payload into a bucket and register it as a dataset.
        </p>
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
            :active="props.active"
            @navigate="emit('close')"
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

      <section v-else class="space-y-3">
        <TransferJobStatus :job="job" :load-state="loadState" :load-error="loadError" :last-poll-error="lastPollError" @retry="load" />
        <DetailList v-if="importResult" :items="importDetails" />
        <Button v-if="createdDocumentId" variant="outline" size="sm" as-child @click="emit('close')">
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
      <Button variant="outline" @click="emit('close')">Close</Button>
      <Button v-if="activeJobId && terminal" variant="outline" @click="reset">Import another</Button>
      <Button v-if="!activeJobId" :disabled="!importReady || Boolean(busy)" @click="startImport">
        <Spinner v-if="busy" class="text-current" aria-hidden="true" />
        <Upload v-else class="h-4 w-4" />
        {{ busy === 'uploading' ? 'Uploading…' : busy === 'submitting' ? 'Starting…' : 'Upload and import' }}
      </Button>
    </DialogFooter>
  </div>
</template>
