<script setup lang="ts">
// Imports one published Invenio or Zenodo record as a new dataset through a
// durable import job.
import { computed, ref, watch } from 'vue'
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
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import InvenioSearchPanel from '@/components/metadata/InvenioSearchPanel.vue'
import TransferJobStatus from '@/components/metadata/TransferJobStatus.vue'
import TransferReport from '@/components/metadata/TransferReport.vue'
import TransferTarget from '@/components/metadata/TransferTarget.vue'
import { useAruna } from '@/composables/useAruna'
import { useRepositoryConnectors } from '@/composables/useInvenio'
import { useJobDetail } from '@/composables/useJobs'
import { useNotifications } from '@/composables/useNotifications'
import { lookupPid, submitInvenioImport, type InvenioImportMode, type PidLookupResult } from '@/lib/api'
import type { InvenioHit } from '@/lib/invenio'
import { isTerminalJobState } from '@/lib/jobs'
import { importJobResult } from '@/lib/rocrateArchive'
import { errorMessage } from '@/lib/utils'
import { Import } from '@lucide/vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { bumpDashboard } = useNotifications()
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const groupId = ref('')
const connectorId = ref('')
const bucket = ref('')
const prefix = ref('')
const recordId = ref('')
const documentPath = ref('')
const mode = ref<InvenioImportMode>('copy')
const allVersions = ref(true)
const isPublic = ref(false)

const { connectors, loading: connectorsLoading, error: connectorsError } = useRepositoryConnectors(() => groupId.value)
const invenioConnectors = computed(() => connectors.value?.filter((entry) => entry.kind === 'invenio') ?? null)
const connectorOptions = computed(() =>
  (invenioConnectors.value ?? []).map((entry) => ({ value: entry.connector_id, label: entry.name })),
)

// Another group has other connectors; a picked one never carries over.
watch(groupId, () => (connectorId.value = ''))
watch(invenioConnectors, (list) => {
  if (list?.length === 1 && !connectorId.value) connectorId.value = list[0].connector_id
})

const MODE_OPTIONS = [
  { value: 'copy', label: 'Copy files' },
  { value: 'reference', label: 'Reference files' },
  { value: 'metadata', label: 'Metadata only' },
]
const MODE_HINT: Record<InvenioImportMode, string> = {
  copy: 'Files are downloaded, checked against their checksums and stored in the target bucket.',
  reference:
    'Files stay in the repository and are read on demand. The target bucket must belong to the same group as the repository.',
  metadata: 'Only the record metadata is imported, without files.',
}

// A path the user typed stays; an automatic one follows the picked record.
let autoPath = ''
function pickHit(hit: InvenioHit) {
  recordId.value = hit.id
  if (!documentPath.value || documentPath.value === autoPath) {
    autoPath = `datasets/invenio-${hit.id}`
    documentPath.value = autoPath
  }
  void checkExisting(hit)
}

// A record already imported is worth knowing about before a second copy.
const existing = ref<PidLookupResult | null>(null)
let lookupGeneration = 0
async function checkExisting(hit: InvenioHit) {
  const current = ++lookupGeneration
  const epoch = sessionEpoch.value
  existing.value = null
  if (!hit.doi) return
  try {
    const found = await lookupPid('doi', hit.doi, client())
    if (current === lookupGeneration && epoch === sessionEpoch.value && recordId.value === hit.id) existing.value = found
  } catch {
    // The hint is optional; a failed lookup proves nothing either way.
  }
}
watch(recordId, () => {
  lookupGeneration++
  existing.value = null
})

// One attempt keeps one idempotency key; any change to the request is a new attempt.
const attemptKey = ref('')
watch([groupId, connectorId, recordId, documentPath, bucket, prefix, mode, allVersions, isPublic], () => {
  attemptKey.value = ''
})

const busy = ref(false)
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
  if (settled && createdDocumentId.value) bumpDashboard()
})

const ready = computed(() =>
  Boolean(groupId.value && connectorId.value && recordId.value.trim() && documentPath.value.trim() && bucket.value.trim()),
)

async function startImport() {
  if (!ready.value || busy.value) return
  submitError.value = null
  busy.value = true
  const epoch = sessionEpoch.value
  if (!attemptKey.value) attemptKey.value = crypto.randomUUID()
  try {
    const submitted = await submitInvenioImport(
      {
        group_id: groupId.value,
        connector_id: connectorId.value,
        record_id: recordId.value.trim(),
        mode: mode.value,
        all_versions: allVersions.value,
        target: { bucket: bucket.value.trim(), prefix: prefix.value.trim() },
        metadata: { group_id: groupId.value, path: documentPath.value.trim(), public: isPublic.value },
        idempotency_key: attemptKey.value,
      },
      client(),
    )
    if (epoch === sessionEpoch.value) activeJobId.value = submitted.job_id
  } catch (err) {
    if (epoch === sessionEpoch.value) submitError.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}

function reset() {
  activeJobId.value = null
  submitError.value = null
  attemptKey.value = ''
  recordId.value = ''
  documentPath.value = ''
  autoPath = ''
}

// A job started by another account or on another realm is not followed here.
watch(sessionEpoch, () => {
  reset()
  groupId.value = ''
  if (props.open) emit('update:open', false)
})
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="flex max-h-[88vh] max-w-2xl flex-col">
      <DialogHeader class="pr-8">
        <DialogTitle class="flex items-center gap-2">
          <Import class="h-4 w-4 text-primary" /> Import from Invenio or Zenodo
        </DialogTitle>
        <DialogDescription>
          Find a published record in a repository of your group and register it as a new dataset.
        </DialogDescription>
      </DialogHeader>

      <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <template v-if="!activeJobId">
          <div class="grid gap-3 sm:grid-cols-2">
            <TransferTarget
              v-model:group-id="groupId"
              v-model:bucket="bucket"
              v-model:prefix="prefix"
              :active="props.open"
              @navigate="emit('update:open', false)"
            >
              <div>
                <label class="text-xs font-medium text-foreground">Repository</label>
                <Select
                  v-if="connectorOptions.length"
                  v-model="connectorId"
                  :options="connectorOptions"
                  placeholder="Choose a repository"
                  aria-label="Repository"
                  class="mt-1"
                />
                <p v-else-if="!groupId" class="mt-2 text-[11px] text-muted-foreground">Choose a group first.</p>
                <Spinner v-else-if="connectorsLoading" show-label label="Loading repositories…" class="mt-2 flex text-[11px]" />
                <p v-else-if="connectorsError" class="mt-2 text-[11px] text-destructive">{{ connectorsError }}</p>
                <p v-else-if="invenioConnectors" class="mt-2 text-[11px] text-muted-foreground">
                  This group has no Invenio repository yet. Add one under the group's Sources.
                  <RouterLink
                    :to="{ name: 'group', params: { id: groupId }, query: { tab: 'sources' } }"
                    class="text-primary hover:underline"
                    @click="emit('update:open', false)"
                  >Open the group</RouterLink>
                </p>
              </div>
            </TransferTarget>
          </div>

          <InvenioSearchPanel
            v-if="groupId && connectorId"
            :group-id="groupId"
            :connector-id="connectorId"
            :selected-id="recordId"
            @pick="pickHit"
          />

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Record id</label>
              <Input v-model="recordId" placeholder="1234567" class="mt-1 font-mono text-xs" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Dataset path</label>
              <Input v-model="documentPath" placeholder="datasets/my-dataset" class="mt-1" />
            </div>
          </div>
          <Notice v-if="existing" tone="info">
            A dataset already holds this record's DOI.
            <RouterLink
              :to="{ name: 'dataset', params: { id: existing.document_id } }"
              class="font-medium text-primary hover:underline"
              @click="emit('update:open', false)"
            >Open it</RouterLink>
          </Notice>

          <div class="space-y-1.5">
            <OptionToggle v-model="mode" :options="MODE_OPTIONS" aria-label="What to import" />
            <p class="text-[11px] text-muted-foreground">{{ MODE_HINT[mode] }}</p>
          </div>
          <label class="flex items-center gap-2 text-xs text-foreground">
            <Switch :checked="allVersions" aria-label="Import all versions" @update:checked="allVersions = $event" />
            Import all published versions
          </label>
          <label class="flex items-center gap-2 text-xs text-foreground">
            <Switch :checked="isPublic" aria-label="Make the imported dataset public" @update:checked="isPublic = $event" />
            Make the imported dataset public
          </label>
        </template>

        <section v-else class="space-y-3">
          <TransferJobStatus :job="job" :load-state="loadState" :load-error="loadError" :last-poll-error="lastPollError" @retry="load" />
          <DetailList v-if="importResult" :items="importDetails" />
          <div class="flex flex-wrap gap-2">
            <Button v-if="createdDocumentId" variant="outline" size="sm" as-child @click="emit('update:open', false)">
              <RouterLink :to="{ name: 'dataset', params: { id: createdDocumentId } }">Open the created dataset</RouterLink>
            </Button>
            <Button variant="ghost" size="sm" as-child @click="emit('update:open', false)">
              <RouterLink :to="{ name: 'job', params: { jobId: activeJobId } }">Open the job</RouterLink>
            </Button>
          </div>
          <TransferReport :key="activeJobId" :job-id="activeJobId" :settled="terminal" />
        </section>

        <p v-if="submitError" class="text-xs text-destructive">{{ submitError }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Close</Button>
        <Button v-if="activeJobId && terminal" variant="outline" @click="reset">Import another</Button>
        <Button v-if="!activeJobId" :disabled="!ready || busy" @click="startImport">
          <Spinner v-if="busy" class="text-current" aria-hidden="true" />
          <Import v-else class="h-4 w-4" />
          {{ busy ? 'Starting…' : 'Import record' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
