<script setup lang="ts">
// Publishes a dataset to a repository such as Zenodo: either a lasting link that
// pushes every change, or a one-time export. The dataset is checked against the
// repository requirements first. The personal access token is held only in this
// component's memory and cleared on every exit.
import { computed, onUnmounted, ref, watch } from 'vue'
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
import RequirementFindings from './RequirementFindings.vue'
import RequirementForm from './RequirementForm.vue'
import { useAruna } from '@/composables/useAruna'
import { useGroupRights, useRepositoryConnectors, useRepositoryKinds } from '@/composables/useRepository'
import { useJobDetail } from '@/composables/useJobs'
import {
  checkRepository,
  createRepositoryLink,
  createRepositoryConnector,
  getRepositoryLink,
  listRepositoryLinks,
  publishRepositoryLink,
  submitRepositoryExport,
  type RepositoryCheck,
  type RepositoryLink,
} from '@/lib/api'
import {
  doiUrl,
  exportRepository,
  failureText,
  isRuleFinding,
  parseOverride,
  pullsParent,
  REPOSITORY_PRESETS,
  repositoryError,
  repositoryLabel,
  reviewText,
  sourceParent,
  tokenPageUrl,
  unmetFindings,
} from '@/lib/repository'
import { isTerminalJobState } from '@/lib/jobs'
import { follow, POLL_ACTIVE_MS } from '@/lib/poll'
import { listPersistentIds, type PersistentIdView } from '@/lib/pid'
import { errorMessage } from '@/lib/utils'
import { Plus, Send } from '@lucide/vue'

const props = defineProps<{ open: boolean; documentId: string; groupId: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'linked', link: RepositoryLink): void
}>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
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
// The requirement check of the chosen repository, or the findings of a refusal.
const check = ref<RepositoryCheck | null>(null)
const checking = ref(false)
const checkError = ref<string | null>(null)
const showMapping = ref(false)
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
const { kinds, error: kindsError, kindOf } = useRepositoryKinds()
// Connectors of a kind the node can publish to; unknown until both lists answered.
const repositoryConnectors = computed(() =>
  connectors.value && kinds.value ? connectors.value.filter((entry) => kindOf(entry.kind)) : null,
)
const connectorOptions = computed(() =>
  (repositoryConnectors.value ?? []).map((entry) => ({ value: entry.connector_id, label: `${entry.name} (${entry.endpoint})` })),
)
const connector = computed(() => repositoryConnectors.value?.find((entry) => entry.connector_id === connectorId.value) ?? null)
const capabilities = computed(() => kindOf(connector.value?.kind)?.capabilities ?? null)
const reserves = computed(() => Boolean(capabilities.value?.reserve_identifier))
// A community submission only happens where the repository kind has reviews.
const community = computed(() => (capabilities.value?.review ? connector.value?.community ?? null : null))
const label = computed(() => repositoryLabel(connector.value))
const tokenPage = computed(() => (connector.value ? tokenPageUrl(connector.value.endpoint) : null))
const publishName = computed(() => (label.value.startsWith('Zenodo') ? `Publish to ${label.value}` : 'Publish to repository'))
// Another group has other connectors; a picked one never carries over.
watch(
  () => props.groupId,
  () => (connectorId.value = ''),
)
watch(
  repositoryConnectors,
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

// Repository-only extras; required fields always come from the dataset.
const override = computed(() => parseOverride(overrideText.value))
const metadata = computed(() => override.value.value)
const findings = computed(() => check.value?.findings ?? [])
const blocked = computed(() => findings.value.some((finding) => finding.severity === 'violation'))
const blockedBy = (rule: boolean) =>
  findings.value.some((finding) => finding.severity === 'violation' && isRuleFinding(finding) === rule)
// The requirement profile the check used, as Turtle for the missing-fields form.
const profileShapes = computed(() => {
  const iri = check.value?.profile?.iri
  const profile = kindOf(check.value?.kind ?? connector.value?.kind)?.profiles.find((entry) => entry.iri === iri)
  return profile ? profile.shapes.join('\n') : ''
})
// A failed check does not block: the node checks again before it writes anything.
const ready = computed(
  () =>
    Boolean(connectorId.value && accessToken.value.trim() && !override.value.error) &&
    !checking.value &&
    !blocked.value &&
    !busy.value,
)

let checkGeneration = 0
async function runCheck() {
  const current = ++checkGeneration
  const epoch = sessionEpoch.value
  const documentId = props.documentId
  const chosen = connectorId.value
  const fresh = () => current === checkGeneration && epoch === sessionEpoch.value && documentId === props.documentId
  check.value = null
  checkError.value = null
  checking.value = Boolean(props.open && chosen)
  if (!checking.value) return
  try {
    const answer = await checkRepository(
      documentId,
      { group_id: props.groupId, connector_id: chosen, ...(metadata.value ? { metadata: metadata.value } : {}) },
      client(),
    )
    if (fresh()) check.value = answer
  } catch (err) {
    if (fresh()) checkError.value = repositoryError(err, true)
  } finally {
    if (fresh()) checking.value = false
  }
}
watch([() => props.open, () => props.documentId, connectorId], () => void runCheck(), { immediate: true })

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
    if (link.value?.link_id === current.link_id) publishError.value = repositoryError(err)
  } finally {
    publishing.value = false
  }
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
  showMapping.value = false
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
  checkGeneration++
  check.value = null
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
    const unmet = unmetFindings(err)
    if (!unmet) {
      submitError.value = repositoryError(err, true)
      return
    }
    // Nothing was sent to the repository, so the typed token stays for the retry.
    accessToken.value = token
    checkGeneration++
    checking.value = false
    check.value = { kind: connector.value?.kind ?? '', profile: check.value?.profile ?? { iri: '' }, ready: false, findings: unmet, mapping: check.value?.mapping ?? [] }
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
          Publishing to a repository such as Zenodo is how this dataset gets a DOI. The repository mints it.
        </DialogDescription>
      </DialogHeader>

      <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <template v-if="!link && !activeJobId">
          <p class="text-[11px] text-muted-foreground">
            {{ mode === 'link'
              ? `Aruna creates a draft${reserves ? ', reserves its DOI' : ''} and keeps the draft in step with this dataset. You publish when it is ready.`
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
            <p v-else-if="kindsError" class="mt-2 text-[11px] text-destructive">{{ kindsError }}</p>
            <p v-else-if="connectorsError" class="mt-2 text-[11px] text-destructive">{{ connectorsError }}</p>
            <Spinner v-else-if="connectorsLoading || !repositoryConnectors" show-label label="Loading repositories…" class="mt-2 flex text-[11px]" />
            <div v-else-if="canWriteMeta" class="mt-2 space-y-1">
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
            <p v-else class="mt-2 text-[11px] text-muted-foreground">
              This dataset's group has no repository yet. Ask someone who manages the group's metadata to add Zenodo.
            </p>
            <p v-if="community" class="mt-1 text-[11px] text-muted-foreground">
              Records are submitted to the community {{ community }} for review.
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

          <section v-if="connectorId" class="space-y-2 rounded-md border border-border p-3" aria-label="Repository requirements">
            <p v-if="checking" class="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Spinner class="text-primary" aria-hidden="true" /> Checking the dataset against {{ label }}…
            </p>
            <p v-else-if="checkError" class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              The check did not run: {{ checkError }}
              <Button variant="ghost" size="sm" class="h-6 px-1 text-xs" @click="runCheck">Retry</Button>
            </p>
            <template v-else-if="check">
              <p class="text-xs font-medium" :class="blocked ? 'text-destructive' : 'text-foreground'">
                {{ blocked ? `${label === 'the repository' ? 'The repository' : label} needs more metadata.` : 'The dataset meets the requirements.' }}
              </p>
              <RequirementFindings :findings="findings" />
              <RequirementForm
                v-if="findings.length && profileShapes"
                :document-id="props.documentId"
                :findings="findings"
                :shapes="profileShapes"
                @saved="runCheck"
              />
              <p v-if="blockedBy(false)" class="text-[11px] text-muted-foreground">
                Fields without an input here can be added in the dataset editor.
              </p>
              <p v-if="blockedBy(true)" class="text-[11px] text-muted-foreground">
                Points about files or entities are fixed in the dataset itself, for example by removing files.
              </p>
              <template v-if="check.mapping.length">
                <Button variant="ghost" size="sm" class="h-6 px-1 text-xs" @click="showMapping = !showMapping">
                  {{ showMapping ? 'Hide what goes where' : 'Show what goes where' }}
                </Button>
                <ul v-if="showMapping" class="space-y-0.5 text-[11px] text-muted-foreground">
                  <li v-for="(entry, index) in check.mapping" :key="index">
                    <span class="font-mono">{{ entry.entity_id }}</span>
                    to {{ entry.target }}<template v-if="entry.field">, field {{ entry.field }}</template>
                  </li>
                </ul>
              </template>
            </template>
          </section>

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
                {{ override.error ?? 'Extra repository fields the dataset cannot hold. Required fields always come from the dataset.' }}
              </p>
            </template>
          </div>
        </template>

        <section v-else-if="link" class="space-y-3 text-xs">
          <p v-if="link.status === 'failed'" class="text-destructive">{{ failureText(link.reason) }}</p>
          <p v-else-if="!link.remote.draft_id" class="flex items-center gap-2 text-muted-foreground">
            <Spinner class="text-primary" aria-hidden="true" /> {{ reserves ? 'Creating the draft and reserving a DOI…' : 'Creating the draft…' }}
          </p>
          <p v-else-if="!link.remote.doi && reserves" class="text-muted-foreground">
            No DOI was reserved. The repository assigns one on publish.
          </p>
          <div v-if="link.remote.doi" class="space-y-1">
            <p class="font-medium text-foreground">DOI</p>
            <p class="flex flex-wrap items-center gap-1">
              <span v-if="link.remote.doi_reserved" class="font-mono">{{ link.remote.doi }}</span>
              <ExternalLink v-else :href="doiUrl(link.remote.doi)" :label="link.remote.doi" />
              <CopyButton :value="link.remote.doi" label="Copy DOI" />
            </p>
            <p v-if="!link.remote.doi_reserved || reserves" class="text-[11px] text-muted-foreground">
              {{ link.remote.doi_reserved ? 'Reserved, becomes active when published.' : 'Published and active.' }}
            </p>
          </div>
          <p v-if="link.warning" class="text-amber-700 dark:text-amber-400">{{ link.warning }}</p>
          <p v-if="capabilities?.review && reviewText(link.remote.review)" class="text-muted-foreground">{{ reviewText(link.remote.review) }}.</p>
          <template v-if="link.remote.draft_id && !link.remote.published && link.remote.review !== 'pending'">
            <p class="text-muted-foreground">
              {{ community
                ? `Submitting sends the record to the community ${community} for review. It is published once accepted.`
                : 'Publishing is permanent. A published record cannot be deleted.' }}
            </p>
            <Button size="sm" :disabled="!canPublish" @click="publish">
              <Spinner v-if="publishing" class="text-current" aria-hidden="true" />
              {{ community ? 'Submit for review' : 'Publish' }}
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
                <span v-if="!exported.published && reserves" class="text-muted-foreground">Reserved, becomes active when published.</span>
              </template>
              <span v-else class="text-muted-foreground">Assigned when the record is published</span>
            </dd>
            <dt class="text-muted-foreground">State</dt>
            <dd>{{ exported.published ? 'Published' : exported.in_review && capabilities?.review ? 'Waiting for community review' : 'Draft, not published' }}</dd>
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
