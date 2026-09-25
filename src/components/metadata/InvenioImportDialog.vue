<script setup lang="ts">
// Imports one published Invenio or Zenodo record as a new dataset through a
// durable import job. By default a pull link keeps the dataset updated.
import { computed, ref, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
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
import { useGroupRights, useRepositoryConnectors } from '@/composables/useInvenio'
import { useJobDetail } from '@/composables/useJobs'
import { useNotifications } from '@/composables/useNotifications'
import {
  ApiError,
  createRepositoryConnector,
  lookupPid,
  submitInvenioImport,
  type InvenioImportMode,
  type InvenioRecordSource,
  type PidLookupMatch,
  type SecondaryIdentifier,
} from '@/lib/api'
import { doiUrl, recordSource, REPOSITORY_PRESETS, secondaryIdentifiers, type InvenioHit } from '@/lib/invenio'
import { isTerminalJobState } from '@/lib/jobs'
import { listPersistentIds } from '@/lib/pid'
import { importJobResult } from '@/lib/rocrateArchive'
import { errorMessage } from '@/lib/utils'
import { Import } from '@lucide/vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
const { bumpDashboard } = useNotifications()
const uid = useId()
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const groupId = ref('')
const connectorId = ref('')
const bucket = ref('')
const prefix = ref('')
// A record id, a version or concept DOI, or a record URL.
const recordInput = ref('')
const documentPath = ref('')
const mode = ref<InvenioImportMode>('copy')
const allVersions = ref(false)
const keepUpdated = ref(true)
const autoUpdate = ref(false)
const isPublic = ref(false)
const source = computed(() => recordSource(recordInput.value))

const {
  connectors,
  loading: connectorsLoading,
  error: connectorsError,
  load: loadConnectors,
} = useRepositoryConnectors(() => groupId.value)
const { canWriteMeta } = useGroupRights(() => groupId.value)
// Keeping an import updated needs metadata WRITE in the connector's group.
watch(canWriteMeta, (allowed) => (keepUpdated.value = allowed), { immediate: true })
const invenioConnectors = computed(() => connectors.value?.filter((entry) => entry.kind === 'invenio') ?? null)
const connectorOptions = computed(() =>
  (invenioConnectors.value ?? []).map((entry) => ({ value: entry.connector_id, label: entry.name })),
)

// Another group has other connectors; a picked one never carries over.
watch(groupId, () => (connectorId.value = ''))
watch(
  invenioConnectors,
  (list) => {
    if (list?.length === 1 && !connectorId.value) connectorId.value = list[0].connector_id
  },
  { immediate: true },
)

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

// One click creates the Zenodo preset when the group has no repository yet.
const addingPreset = ref(false)
const presetError = ref<string | null>(null)
async function addPreset() {
  const group = groupId.value
  if (addingPreset.value || !group) return
  const preset = REPOSITORY_PRESETS[0]
  const epoch = sessionEpoch.value
  const current = () => group === groupId.value && epoch === sessionEpoch.value
  addingPreset.value = true
  presetError.value = null
  try {
    const created = await createRepositoryConnector(
      group,
      { name: preset.name, kind: 'invenio', endpoint: preset.endpoint, secret_config: {} },
      client(),
    )
    if (!current()) return
    await loadConnectors()
    if (current()) connectorId.value = created.connector_id
  } catch (err) {
    if (current()) presetError.value = errorMessage(err)
  } finally {
    addingPreset.value = false
  }
}

function pathName(found: InvenioRecordSource): string {
  if ('doi' in found) return found.doi.split('/').pop() ?? found.doi
  const id = 'record_id' in found ? found.record_id : found.url.replace(/\/+$/, '').split('/').pop() ?? ''
  return `invenio-${id}`
}

// A path the user typed stays; an automatic one follows the named record.
let autoPath = ''
watch(source, (found) => {
  if (!found || (documentPath.value && documentPath.value !== autoPath)) return
  autoPath = `datasets/${pathName(found).replace(/[^A-Za-z0-9._-]+/g, '-')}`
  documentPath.value = autoPath
})

let pickedDoi = ''
function pickHit(hit: InvenioHit) {
  // The same hit again changes nothing, so no watcher would clear the DOI.
  if (recordInput.value === hit.id) return
  pickedDoi = hit.doi
  recordInput.value = hit.id
}

// A record already imported is worth knowing about before a second copy.
const existing = ref<PidLookupMatch[]>([])
// Some node did not answer and nothing matched, so the check is open.
const lookupOpen = ref(false)
let lookupGeneration = 0
let lookupDoi = ''
async function checkExisting(doi: string) {
  lookupDoi = doi
  const current = ++lookupGeneration
  const epoch = sessionEpoch.value
  const input = recordInput.value
  const fresh = () => current === lookupGeneration && epoch === sessionEpoch.value && recordInput.value === input
  existing.value = []
  lookupOpen.value = false
  if (!doi) return
  try {
    const found = await lookupPid('doi', doi, client())
    if (fresh()) existing.value = found
  } catch (err) {
    // The hint is optional; only an unanswered realm is worth a retry.
    if (fresh() && err instanceof ApiError && err.status === 503) lookupOpen.value = true
  }
}
watch(recordInput, () => {
  const found = source.value
  const doi = found && 'doi' in found ? found.doi : found && 'record_id' in found ? pickedDoi : ''
  pickedDoi = ''
  void checkExisting(doi)
})

// One attempt keeps one idempotency key; any change to the request is a new attempt.
const attemptKey = ref('')
watch([groupId, connectorId, recordInput, documentPath, bucket, prefix, mode, allVersions, keepUpdated, autoUpdate, isPublic], () => {
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

// The DOIs the new dataset holds from the imported record.
const importedDois = ref<SecondaryIdentifier[] | null>(null)
async function loadImportedDois(documentId: string) {
  const epoch = sessionEpoch.value
  try {
    const rows = await listPersistentIds(documentId, client())
    if (epoch === sessionEpoch.value && createdDocumentId.value === documentId) {
      importedDois.value = secondaryIdentifiers(rows, 'doi')
    }
  } catch {
    // The dataset page shows them as well.
  }
}

watch(terminal, (settled) => {
  if (!settled || !createdDocumentId.value) return
  bumpDashboard()
  void loadImportedDois(createdDocumentId.value)
})

const ready = computed(() =>
  Boolean(groupId.value && connectorId.value && source.value && documentPath.value.trim() && bucket.value.trim()),
)

async function startImport() {
  const found = source.value
  if (!ready.value || busy.value || !found) return
  submitError.value = null
  busy.value = true
  const epoch = sessionEpoch.value
  if (!attemptKey.value) attemptKey.value = crypto.randomUUID()
  try {
    const submitted = await submitInvenioImport(
      {
        ...found,
        group_id: groupId.value,
        connector_id: connectorId.value,
        mode: mode.value,
        all_versions: allVersions.value,
        keep_updated: keepUpdated.value,
        ...(keepUpdated.value ? { auto_update: autoUpdate.value } : {}),
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
  recordInput.value = ''
  documentPath.value = ''
  autoPath = ''
  importedDois.value = null
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
          <Import class="h-4 w-4 text-primary" /> Import from Zenodo or Invenio
        </DialogTitle>
        <DialogDescription>
          Name a published record by its DOI, link or id, or search for it, and register it as a new dataset.
          Its DOIs stay with the dataset.
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
                <div v-else-if="invenioConnectors && canWriteMeta" class="mt-2 space-y-1">
                  <Button size="sm" variant="outline" :disabled="addingPreset" @click="addPreset">Add Zenodo</Button>
                  <p v-if="presetError" role="alert" class="text-[11px] text-destructive">{{ presetError }}</p>
                </div>
                <p v-else-if="invenioConnectors" class="mt-2 text-[11px] text-muted-foreground">
                  This group has no repository yet. Ask someone who manages the group's metadata to add Zenodo.
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
            :selected-id="recordInput"
            @pick="pickHit"
          />

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label :for="`${uid}-record`" class="text-xs font-medium text-foreground">Record</label>
              <Input
                :id="`${uid}-record`"
                v-model="recordInput"
                placeholder="10.5281/zenodo.1234567"
                class="mt-1 font-mono text-xs"
              />
              <p class="mt-1 text-[11px]" :class="recordInput.trim() && !source ? 'text-destructive' : 'text-muted-foreground'">
                A DOI, a record link or a record id.
              </p>
            </div>
            <div>
              <label :for="`${uid}-path`" class="text-xs font-medium text-foreground">Dataset path</label>
              <Input :id="`${uid}-path`" v-model="documentPath" placeholder="datasets/my-dataset" class="mt-1" />
            </div>
          </div>
          <p v-if="lookupOpen" class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            Not every node answered, so Aruna could not check whether a dataset already holds this DOI.
            <Button variant="ghost" size="sm" class="h-6 px-1 text-xs" @click="checkExisting(lookupDoi)">Retry</Button>
          </p>
          <Notice v-if="existing.length" tone="info">
            {{ existing.length === 1 ? 'A dataset already holds' : `${existing.length} datasets already hold` }} this DOI
            <template v-if="existing[0].origin === 'published'"> as its own published record</template>.
            <RouterLink
              :to="{ name: 'dataset', params: { id: existing[0].document_id } }"
              class="font-medium text-primary hover:underline"
              @click="emit('update:open', false)"
            >Open it</RouterLink>
          </Notice>

          <div class="space-y-1.5">
            <OptionToggle v-model="mode" :options="MODE_OPTIONS" aria-label="What to import" />
            <p class="text-[11px] text-muted-foreground">{{ MODE_HINT[mode] }}</p>
          </div>
          <label class="flex items-start gap-2 text-xs text-foreground">
            <Switch
              :checked="keepUpdated"
              :disabled="!canWriteMeta"
              aria-label="Keep updated"
              @update:checked="keepUpdated = $event"
            />
            <span>
              Keep updated
              <span class="block text-[11px] text-muted-foreground">
                {{ canWriteMeta
                  ? 'Aruna checks the record once a day and offers new versions.'
                  : "Needs write access to the group's metadata." }}
              </span>
            </span>
          </label>
          <label v-if="keepUpdated" class="flex items-center gap-2 text-xs text-foreground">
            <Switch :checked="autoUpdate" aria-label="Import new versions automatically" @update:checked="autoUpdate = $event" />
            Import new versions automatically
          </label>
          <label class="flex items-center gap-2 text-xs text-foreground">
            <Switch :checked="allVersions" aria-label="Import all versions" @update:checked="allVersions = $event" />
            Import all published versions, not only the latest
          </label>
          <label class="flex items-center gap-2 text-xs text-foreground">
            <Switch :checked="isPublic" aria-label="Make the imported dataset public" @update:checked="isPublic = $event" />
            Make the imported dataset public
          </label>
        </template>

        <section v-else class="space-y-3">
          <TransferJobStatus :job="job" :load-state="loadState" :load-error="loadError" :last-poll-error="lastPollError" @retry="load" />
          <DetailList v-if="importResult" :items="importDetails" />
          <div v-if="importedDois?.length" class="space-y-1 text-xs">
            <p class="font-medium text-foreground">DOIs of the imported record</p>
            <p v-for="doi in importedDois" :key="doi.value" class="flex flex-wrap items-center gap-1">
              <ExternalLink :href="doiUrl(doi.value)" :label="doi.value" />
              <CopyButton :value="doi.value" label="Copy DOI" />
            </p>
          </div>
          <p v-else-if="importedDois" class="text-[11px] text-muted-foreground">
            The record DOIs appear on the dataset page once they are registered.
          </p>
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

        <p v-if="submitError" role="alert" class="text-xs text-destructive">{{ submitError }}</p>
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
