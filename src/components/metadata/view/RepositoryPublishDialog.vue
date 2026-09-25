<script setup lang="ts">
// Publishes a dataset to an Invenio or Zenodo repository: either a lasting link
// that pushes every change and reserves a DOI, or a one-time export. The personal
// access token is held only in this component's memory and cleared on every exit.
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
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
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import TransferJobStatus from '@/components/metadata/TransferJobStatus.vue'
import { useAruna } from '@/composables/useAruna'
import { useGroupRights, useRepositoryConnectors } from '@/composables/useRepository'
import { useJobDetail } from '@/composables/useJobs'
import {
  createRepositoryLink,
  createRepositoryConnector,
  getRepositoryLink,
  listRepositoryLinks,
  publishRepositoryLink,
  submitRepositoryExport,
  type RepositoryLink,
} from '@/lib/api'
import {
  creatorsMetadata,
  doiUrl,
  exportRepository,
  failureText,
  fieldLabel,
  missingFields,
  parseOverride,
  pullsParent,
  REPOSITORY_PRESETS,
  repositoryLabel,
  requiredMetadata,
  reviewText,
  sourceParent,
  tokenPageUrl,
  type CreatorDraft,
} from '@/lib/repository'
import { isTerminalJobState } from '@/lib/jobs'
import { follow, POLL_ACTIVE_MS } from '@/lib/poll'
import { listPersistentIds, type PersistentIdView } from '@/lib/pid'
import { errorMessage } from '@/lib/utils'
import { Plus, Send, Trash2 } from '@lucide/vue'

const props = defineProps<{ open: boolean; documentId: string; groupId: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'linked', link: RepositoryLink): void
}>()

const { apiBaseUrl, authToken, sessionEpoch, currentUser } = useAruna()
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const mode = ref<'link' | 'export'>('link')
const connectorId = ref('')
const accessToken = ref('')
const continueSource = ref(false)
const autoPublish = ref(false)
const publishNow = ref(false)
const publicFiles = ref(true)
const showAdvanced = ref(false)
const overrideText = ref('')
const busy = ref(false)
const submitError = ref<string | null>(null)
const activeJobId = ref<string | null>(null)
// Fields the repository still needs, from a 400 answer, and the values typed for them.
const missing = ref<string[] | null>(null)
const creators = ref<CreatorDraft[]>([])
const title = ref('')
const publicationDate = ref('')
const publisher = ref('')
const missingBox = ref<HTMLFieldSetElement | null>(null)
// The link this dialog created; it is followed until its draft exists.
const link = ref<RepositoryLink | null>(null)
const publishing = ref(false)
const publishError = ref<string | null>(null)

const {
  connectors,
  loading: connectorsLoading,
  error: connectorsError,
  load: loadConnectors,
} = useRepositoryConnectors(() => props.groupId)
const { canWriteMeta } = useGroupRights(() => props.groupId)
const invenioConnectors = computed(() => connectors.value?.filter((entry) => entry.kind === 'invenio') ?? null)
const connectorOptions = computed(() =>
  (invenioConnectors.value ?? []).map((entry) => ({ value: entry.connector_id, label: `${entry.name} (${entry.endpoint})` })),
)
const connector = computed(() => invenioConnectors.value?.find((entry) => entry.connector_id === connectorId.value) ?? null)
const label = computed(() => repositoryLabel(connector.value))
const tokenPage = computed(() => (connector.value ? tokenPageUrl(connector.value.endpoint) : null))
const publishName = computed(() => (label.value.startsWith('Zenodo') ? `Publish to ${label.value}` : 'Publish to repository'))
// Another group has other connectors; a picked one never carries over.
watch(
  () => props.groupId,
  () => (connectorId.value = ''),
)
watch(
  invenioConnectors,
  (list) => {
    if (list?.length === 1 && !connectorId.value) connectorId.value = list[0].connector_id
  },
  { immediate: true },
)

// The source record, when there is one on the chosen endpoint, and the links
// that may already import updates from it.
const pidRows = ref<PersistentIdView[]>([])
const datasetLinks = ref<RepositoryLink[]>([])
let pidGeneration = 0
async function loadPids() {
  const current = ++pidGeneration
  const documentId = props.documentId
  pidRows.value = []
  datasetLinks.value = []
  try {
    // Links a caller may not read count as none.
    const links = listRepositoryLinks(documentId, client()).catch(() => [])
    const [rows, pulled] = await Promise.all([listPersistentIds(documentId, client()), links])
    if (current === pidGeneration) {
      pidRows.value = rows
      datasetLinks.value = pulled
    }
  } catch {
    // Without identifiers the link simply starts a new record.
  }
}
const parent = computed(() => (connector.value ? sourceParent(pidRows.value, connector.value.endpoint) : null))
const parentId = computed(() => parent.value?.value ?? null)
// Pushing into a record this dataset also imports updates from would loop.
const parentPulled = computed(() =>
  Boolean(parent.value && connector.value && pullsParent(datasetLinks.value, parent.value.value, connector.value.endpoint)),
)

// One click creates the Zenodo preset when the group has no repository yet.
const addingPreset = ref(false)
const presetError = ref<string | null>(null)
async function addPreset() {
  if (addingPreset.value) return
  const preset = REPOSITORY_PRESETS[0]
  const groupId = props.groupId
  const epoch = sessionEpoch.value
  const current = () => groupId === props.groupId && epoch === sessionEpoch.value
  addingPreset.value = true
  presetError.value = null
  try {
    const created = await createRepositoryConnector(
      groupId,
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

const override = computed(() => parseOverride(overrideText.value))
const needs = (field: string) => Boolean(missing.value?.includes(field))
const missingText = computed(() => (missing.value ?? []).map(fieldLabel).join(', '))
const metadata = computed(() => {
  const people = needs('creators') ? creatorsMetadata(creators.value) : []
  const typed = requiredMetadata(missing.value ?? [], {
    title: title.value,
    publicationDate: publicationDate.value,
    publisher: publisher.value,
  })
  const merged = { ...(override.value.value ?? {}), ...typed, ...(people.length ? { creators: people } : {}) }
  return Object.keys(merged).length ? merged : undefined
})
const filled = computed(
  () =>
    !(needs('creators') && !creatorsMetadata(creators.value).length) &&
    !(needs('title') && !title.value.trim()) &&
    !(needs('publication_date') && !publicationDate.value) &&
    !(needs('publisher') && !publisher.value.trim()),
)
const ready = computed(
  () =>
    Boolean(connectorId.value && accessToken.value.trim() && !override.value.error) && filled.value && !busy.value,
)

const { job, loadState, loadError, lastPollError, load } = useJobDetail(() => activeJobId.value)
const jobDone = computed(() => Boolean(job.value && isTerminalJobState(job.value.state)))
const exported = computed(() => (job.value?.state === 'succeeded' ? exportRepository(job.value.result) : null))

// The draft appears after the first push; publish waits for that push.
const canPublish = computed(
  () =>
    Boolean(link.value?.remote.draft_id && !link.value.pending && link.value.remote.review !== 'pending') &&
    !publishing.value &&
    !(activeJobId.value && !jobDone.value),
)
const followLink = computed(() => {
  const current = link.value
  if (!current || !props.open || current.status === 'failed') return false
  return current.pending || !current.remote.draft_id || (Boolean(activeJobId.value) && !jobDone.value)
})
async function refreshLink() {
  const current = link.value
  if (!current) return
  const epoch = sessionEpoch.value
  try {
    const answer = await getRepositoryLink(current.document_id, current.link_id, client())
    if (epoch === sessionEpoch.value && link.value?.link_id === answer.link_id) link.value = answer
  } catch {
    // The next tick asks again; the link list on the page stays the record.
  }
}
const stopFollow = follow(refreshLink, () => POLL_ACTIVE_MS, () => !followLink.value)
onUnmounted(stopFollow)
watch(jobDone, (done) => {
  if (!done || !link.value) return
  void refreshLink()
  emit('linked', link.value)
})

async function publish() {
  const current = link.value
  if (!current || !canPublish.value) return
  publishing.value = true
  publishError.value = null
  try {
    const started = await publishRepositoryLink(current.document_id, current.link_id, client())
    if (link.value?.link_id === current.link_id) activeJobId.value = started.job_id
  } catch (err) {
    if (link.value?.link_id === current.link_id) publishError.value = errorMessage(err)
  } finally {
    publishing.value = false
  }
}

function addCreator() {
  creators.value = [...creators.value, { name: '', orcid: '' }]
}

function removeCreator(index: number) {
  creators.value = creators.value.filter((_, at) => at !== index)
}

function clearForm() {
  accessToken.value = ''
  submitError.value = null
  activeJobId.value = null
  overrideText.value = ''
  showAdvanced.value = false
  mode.value = 'link'
  publishNow.value = false
  autoPublish.value = false
  publicFiles.value = true
  continueSource.value = false
  missing.value = null
  creators.value = []
  title.value = ''
  publicationDate.value = ''
  publisher.value = ''
  link.value = null
  publishError.value = null
  presetError.value = null
}

watch(
  () => [props.open, props.documentId] as const,
  ([open]) => {
    clearForm()
    pidGeneration++
    if (open) void loadPids()
  },
  { immediate: true },
)
watch(sessionEpoch, () => {
  clearForm()
  pidGeneration++
  if (props.open) emit('update:open', false)
})

async function submit() {
  if (!ready.value) return
  const token = accessToken.value.trim()
  // The token leaves memory with this request, whatever its outcome.
  accessToken.value = ''
  submitError.value = null
  busy.value = true
  const epoch = sessionEpoch.value
  const documentId = props.documentId
  const current = () => epoch === sessionEpoch.value && documentId === props.documentId && props.open
  try {
    if (mode.value === 'link') {
      const created = await createRepositoryLink(
        documentId,
        {
          group_id: props.groupId,
          connector_id: connectorId.value,
          access_token: token,
          ...(parentId.value && continueSource.value && !parentPulled.value ? { parent_id: parentId.value } : {}),
          auto_publish: autoPublish.value,
          public_files: publicFiles.value,
          ...(metadata.value ? { metadata: metadata.value } : {}),
        },
        client(),
      )
      if (!current()) return
      link.value = created
      emit('linked', created)
    } else {
      const submitted = await submitRepositoryExport(
        documentId,
        {
          group_id: props.groupId,
          connector_id: connectorId.value,
          access_token: token,
          publish: publishNow.value,
          public_files: publicFiles.value,
          ...(metadata.value ? { metadata: metadata.value } : {}),
        },
        crypto.randomUUID(),
        client(),
      )
      if (current()) activeJobId.value = submitted.job_id
    }
  } catch (err) {
    if (!current()) return
    const fields = missingFields(err)
    if (!fields) {
      submitError.value = errorMessage(err)
      return
    }
    // Nothing was sent to the repository, so the typed token stays for the retry.
    accessToken.value = token
    missing.value = fields
    if (fields.includes('creators') && !creators.value.length) {
      creators.value = [{ name: currentUser.value?.name ?? '', orcid: currentUser.value?.orcid ?? '' }]
    }
    if (fields.includes('publication_date') && !publicationDate.value) {
      publicationDate.value = new Date().toISOString().slice(0, 10)
    }
    await nextTick()
    missingBox.value?.querySelector?.('input')?.focus()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="flex max-h-[88vh] max-w-xl flex-col">
      <DialogHeader class="pr-8">
        <DialogTitle class="flex items-center gap-2"><Send class="h-4 w-4 text-primary" /> Publish to {{ label === 'the repository' ? 'a repository' : label }}</DialogTitle>
        <DialogDescription>
          Publishing to Zenodo or another Invenio repository is how this dataset gets a DOI. The repository mints it.
        </DialogDescription>
      </DialogHeader>

      <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <template v-if="!link && !activeJobId">
          <p class="text-[11px] text-muted-foreground">
            {{ mode === 'link'
              ? 'Aruna creates a draft, reserves its DOI and keeps the draft in step with this dataset. You publish when it is ready.'
              : 'Creates one repository draft from the dataset as it is now. Later changes are not sent.' }}
          </p>

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
            <Spinner v-else-if="connectorsLoading" show-label label="Loading repositories…" class="mt-2 flex text-[11px]" />
            <p v-else-if="connectorsError" class="mt-2 text-[11px] text-destructive">{{ connectorsError }}</p>
            <div v-else-if="invenioConnectors && canWriteMeta" class="mt-2 space-y-1">
              <Button size="sm" variant="outline" :disabled="addingPreset" @click="addPreset">
                <Plus class="h-3.5 w-3.5" /> Add Zenodo
              </Button>
              <p class="text-[11px] text-muted-foreground">
                This group has no repository yet. Other repositories can be added under the group's
                <RouterLink
                  :to="{ name: 'group', params: { id: props.groupId }, query: { tab: 'sources' } }"
                  class="text-primary hover:underline"
                  @click="emit('update:open', false)"
                >Sources</RouterLink>.
              </p>
              <p v-if="presetError" role="alert" class="text-[11px] text-destructive">{{ presetError }}</p>
            </div>
            <p v-else-if="invenioConnectors" class="mt-2 text-[11px] text-muted-foreground">
              This dataset's group has no repository yet. Ask someone who manages the group's metadata to add Zenodo.
            </p>
            <p v-if="connector?.community" class="mt-1 text-[11px] text-muted-foreground">
              Records are submitted to the community {{ connector.community }} for review.
            </p>
          </div>

          <div>
            <label class="text-xs font-medium text-foreground">Personal access token</label>
            <Input
              v-model="accessToken"
              type="password"
              autocomplete="new-password"
              aria-label="Personal access token"
              class="mt-1 font-mono text-xs"
            />
            <p class="mt-1 text-[11px] text-muted-foreground">
              Create a token
              <ExternalLink v-if="tokenPage" :href="tokenPage" :label="`on ${label}`" />
              <template v-else>in your repository account</template>
              with the scopes deposit:write and deposit:actions.
              <template v-if="mode === 'link'">
                Aruna stores it sealed for this one repository endpoint and never shows it again.
              </template>
              <template v-else>Aruna uses it for this export only.</template>
              Aruna never asks for your repository password.
            </p>
          </div>

          <p v-if="mode === 'link' && parentPulled" class="text-[11px] text-muted-foreground">
            This dataset imports updates from its source record ({{ parentId }}), so the new link starts a new record.
          </p>
          <label v-else-if="mode === 'link' && parent" class="flex items-start gap-2 text-xs text-foreground">
            <Switch :checked="continueSource" aria-label="Continue the source record" @update:checked="continueSource = $event" />
            <span>
              {{ parent.origin === 'published' ? 'Continue the published record' : 'Continue the source record' }}
              <span class="block text-[11px] text-muted-foreground">
                <template v-if="parent.origin === 'published'">
                  New versions then join the record this dataset was published to before ({{ parentId }}) instead of
                  starting a new one.
                </template>
                <template v-else>
                  Only if you own that record on the repository. New versions then join the record this dataset
                  was imported from ({{ parentId }}) instead of starting a new one.
                </template>
              </span>
            </span>
          </label>
          <label v-if="mode === 'link'" class="flex items-center gap-2 text-xs text-foreground">
            <Switch :checked="autoPublish" aria-label="Publish automatically" @update:checked="autoPublish = $event" />
            Publish automatically when the draft has been unchanged for 15 minutes
          </label>
          <label v-else class="flex items-center gap-2 text-xs text-foreground">
            <Switch :checked="publishNow" aria-label="Publish right away" @update:checked="publishNow = $event" />
            Publish right away
          </label>
          <label class="flex items-start gap-2 text-xs text-foreground">
            <Switch :checked="publicFiles" aria-label="Files are public on the repository" @update:checked="publicFiles = $event" />
            <span>
              Files are public on the repository
              <span class="block text-[11px] text-muted-foreground">
                {{ publicFiles ? 'Anyone can download the files once the record is published.' : 'Only the metadata is public; files stay restricted.' }}
              </span>
            </span>
          </label>
          <Notice v-if="autoPublish || publishNow" tone="warning">
            A published repository record cannot be deleted. Its files stay citable under their DOI.
          </Notice>

          <fieldset v-if="missing" ref="missingBox" class="space-y-2 rounded-md border border-border p-3">
            <legend class="px-1 text-xs font-semibold text-foreground">More metadata needed</legend>
            <p class="text-[11px] text-muted-foreground">
              {{ label === 'the repository' ? 'The repository' : label }} needs {{ missingText }}.
              <template v-if="needs('resource_type')">The resource type is set to dataset.</template>
              <template v-if="missing.some((field) => !['title', 'publication_date', 'publisher', 'resource_type', 'creators'].includes(field))">
                Add the other fields in the dataset or in the advanced override.
              </template>
            </p>
            <Input v-if="needs('title')" v-model="title" class="h-8 text-xs" placeholder="Title" aria-label="Title" />
            <label v-if="needs('publication_date')" class="flex items-center gap-2 text-xs text-foreground">
              Publication date
              <Input v-model="publicationDate" type="date" class="h-8 w-44 text-xs" aria-label="Publication date" />
            </label>
            <Input v-if="needs('publisher')" v-model="publisher" class="h-8 text-xs" placeholder="Publisher, for example your institution" aria-label="Publisher" />
            <template v-if="needs('creators')">
              <div v-for="(creator, index) in creators" :key="index" class="flex flex-wrap items-center gap-2">
                <Input v-model="creator.name" class="h-8 min-w-40 flex-1 text-xs" placeholder="Family, Given" :aria-label="`Creator ${index + 1} name`" />
                <Input v-model="creator.orcid" class="h-8 w-44 font-mono text-xs" placeholder="ORCID (optional)" :aria-label="`Creator ${index + 1} ORCID`" />
                <Button variant="ghost" size="icon-sm" :aria-label="`Remove creator ${index + 1}`" @click="removeCreator(index)">
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" class="h-6 px-1 text-xs" @click="addCreator">
                <Plus class="h-3.5 w-3.5" /> Add creator
              </Button>
            </template>
          </fieldset>

          <div>
            <Button variant="ghost" size="sm" class="h-6 px-1 text-xs" @click="showAdvanced = !showAdvanced">
              {{ showAdvanced ? 'Hide advanced' : 'Advanced options' }}
            </Button>
            <template v-if="showAdvanced">
              <label class="mt-1 flex items-start gap-2 text-xs text-foreground">
                <Switch :checked="mode === 'export'" aria-label="Export once" @update:checked="mode = $event ? 'export' : 'link'" />
                <span>
                  Export once
                  <span class="block text-[11px] text-muted-foreground">No lasting link. Later changes are not sent.</span>
                </span>
              </label>
              <Textarea
                v-model="overrideText"
                rows="5"
                class="mt-1 text-xs"
                placeholder='{"resource_type": {"id": "dataset"}}'
                :invalid="override.error ? 'error' : undefined"
                aria-label="Metadata override"
              />
              <p class="mt-1 text-[11px]" :class="override.error ? 'text-destructive' : 'text-muted-foreground'">
                {{ override.error ?? 'Repository metadata fields written over the ones mapped from the dataset.' }}
              </p>
            </template>
          </div>
        </template>

        <section v-else-if="link" class="space-y-3 text-xs">
          <p v-if="link.status === 'failed'" class="text-destructive">{{ failureText(link.reason) }}</p>
          <p v-else-if="!link.remote.draft_id" class="flex items-center gap-2 text-muted-foreground">
            <Spinner class="text-primary" aria-hidden="true" /> Creating the draft and reserving a DOI…
          </p>
          <p v-else-if="!link.remote.doi" class="text-muted-foreground">
            No DOI was reserved. The repository assigns one on publish.
          </p>
          <div v-if="link.remote.doi" class="space-y-1">
            <p class="font-medium text-foreground">DOI</p>
            <p class="flex flex-wrap items-center gap-1">
              <span v-if="link.remote.doi_reserved" class="font-mono">{{ link.remote.doi }}</span>
              <ExternalLink v-else :href="doiUrl(link.remote.doi)" :label="link.remote.doi" />
              <CopyButton :value="link.remote.doi" label="Copy DOI" />
            </p>
            <p class="text-[11px] text-muted-foreground">
              {{ link.remote.doi_reserved ? 'Reserved, becomes active when published.' : 'Published and active.' }}
            </p>
          </div>
          <p v-if="link.warning" class="text-amber-700 dark:text-amber-400">{{ link.warning }}</p>
          <p v-if="reviewText(link.remote.review)" class="text-muted-foreground">{{ reviewText(link.remote.review) }}.</p>
          <template v-if="link.remote.draft_id && !link.remote.published && link.remote.review !== 'pending'">
            <p class="text-muted-foreground">
              {{ connector?.community
                ? `Submitting sends the record to the community ${connector.community} for review. It is published once accepted.`
                : 'Publishing is permanent. A published record cannot be deleted.' }}
            </p>
            <Button size="sm" :disabled="!canPublish" @click="publish">
              <Spinner v-if="publishing" class="text-current" aria-hidden="true" />
              {{ connector?.community ? 'Submit for review' : 'Publish' }}
            </Button>
            <p v-if="link.pending" class="text-[11px] text-muted-foreground">Publishing waits until the running push has finished.</p>
          </template>
          <p v-if="publishError" role="alert" class="text-destructive">{{ publishError }}</p>
          <TransferJobStatus
            v-if="activeJobId"
            :job="job"
            :load-state="loadState"
            :load-error="loadError"
            :last-poll-error="lastPollError"
            @retry="load"
          />
        </section>

        <section v-else class="space-y-3">
          <TransferJobStatus :job="job" :load-state="loadState" :load-error="loadError" :last-poll-error="lastPollError" @retry="load" />
          <dl v-if="exported" class="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <dt class="text-muted-foreground">DOI</dt>
            <dd class="flex min-w-0 items-center gap-1">
              <template v-if="exported.doi">
                <ExternalLink v-if="exported.published" :href="doiUrl(exported.doi)" :label="exported.doi" />
                <span v-else class="font-mono">{{ exported.doi }}</span>
                <CopyButton :value="exported.doi" label="Copy DOI" />
                <span v-if="!exported.published" class="text-muted-foreground">Reserved, becomes active when published.</span>
              </template>
              <span v-else class="text-muted-foreground">Assigned when the record is published</span>
            </dd>
            <dt class="text-muted-foreground">State</dt>
            <dd>{{ exported.published ? 'Published' : exported.in_review ? 'Waiting for community review' : 'Draft, not published' }}</dd>
            <template v-if="exported.concept_doi">
              <dt class="text-muted-foreground">All versions</dt>
              <dd class="flex min-w-0 items-center gap-1">
                <ExternalLink :href="doiUrl(exported.concept_doi)" :label="exported.concept_doi" />
                <CopyButton :value="exported.concept_doi" label="Copy concept DOI" />
              </dd>
            </template>
            <template v-if="exported.html_url">
              <dt class="text-muted-foreground">Record</dt>
              <dd><ExternalLink :href="exported.html_url" label="Open in the repository" /></dd>
            </template>
          </dl>
          <p v-if="exported?.warning" class="text-xs text-amber-700 dark:text-amber-400">{{ exported.warning }}</p>
          <Button variant="ghost" size="sm" as-child @click="emit('update:open', false)">
            <RouterLink :to="{ name: 'job', params: { jobId: activeJobId } }">Open the job</RouterLink>
          </Button>
        </section>

        <Notice v-if="submitError" tone="error">{{ submitError }} Enter the token again to retry.</Notice>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Close</Button>
        <Button v-if="!link && !activeJobId" :disabled="!ready" @click="submit">
          <Spinner v-if="busy" class="text-current" aria-hidden="true" />
          <Send v-else class="h-4 w-4" />
          {{ busy ? 'Starting…' : mode === 'link' ? publishName : 'Start export' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
