<script setup lang="ts">
// Publishes a dataset to an Invenio or Zenodo repository: either a lasting link
// that pushes every change, or a one-time export. The personal access token is
// held only in this component's memory and cleared on every exit.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import Select from '@/components/ui/Select.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import TransferJobStatus from '@/components/metadata/TransferJobStatus.vue'
import { useAruna } from '@/composables/useAruna'
import { useRepositoryConnectors } from '@/composables/useInvenio'
import { useJobDetail } from '@/composables/useJobs'
import { createInvenioLink, submitInvenioExport, type InvenioLink } from '@/lib/api'
import { parseOverride, sourceParent } from '@/lib/invenio'
import { listPersistentIds, type PersistentIdView } from '@/lib/pid'
import { errorMessage } from '@/lib/utils'
import { Send } from '@lucide/vue'

const props = defineProps<{ open: boolean; documentId: string; groupId: string }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'linked', link: InvenioLink): void
}>()

const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
function client() {
  return { baseUrl: apiBaseUrl.value, token: authToken.value }
}

const mode = ref<'link' | 'export'>('link')
const MODE_OPTIONS = [
  { value: 'link', label: 'Keep linked' },
  { value: 'export', label: 'Export once' },
]
const connectorId = ref('')
const accessToken = ref('')
const continueSource = ref(true)
const autoPublish = ref(false)
const publishNow = ref(false)
const publicFiles = ref(false)
const showAdvanced = ref(false)
const overrideText = ref('')
const busy = ref(false)
const submitError = ref<string | null>(null)
const activeJobId = ref<string | null>(null)

const { connectors, loading: connectorsLoading, error: connectorsError } = useRepositoryConnectors(() => props.groupId)
const invenioConnectors = computed(() => connectors.value?.filter((entry) => entry.kind === 'invenio') ?? null)
const connectorOptions = computed(() =>
  (invenioConnectors.value ?? []).map((entry) => ({ value: entry.connector_id, label: `${entry.name} (${entry.endpoint})` })),
)
const connector = computed(() => invenioConnectors.value?.find((entry) => entry.connector_id === connectorId.value) ?? null)
watch(
  invenioConnectors,
  (list) => {
    if (list?.length === 1 && !connectorId.value) connectorId.value = list[0].connector_id
  },
  { immediate: true },
)

// The imported source record, when there is one on the chosen endpoint.
const pidRows = ref<PersistentIdView[]>([])
let pidGeneration = 0
async function loadPids() {
  const current = ++pidGeneration
  const documentId = props.documentId
  pidRows.value = []
  try {
    const rows = await listPersistentIds(documentId, client())
    if (current === pidGeneration) pidRows.value = rows
  } catch {
    // Without identifiers the link simply starts a new record.
  }
}
const parentId = computed(() => (connector.value ? sourceParent(pidRows.value, connector.value.endpoint) : null))

const override = computed(() => parseOverride(overrideText.value))
const ready = computed(
  () => Boolean(connectorId.value && accessToken.value.trim() && !override.value.error) && !busy.value,
)

const { job, loadState, loadError, lastPollError, load } = useJobDetail(() => activeJobId.value)

function clearForm() {
  accessToken.value = ''
  submitError.value = null
  activeJobId.value = null
  overrideText.value = ''
  showAdvanced.value = false
  publishNow.value = false
  autoPublish.value = false
  publicFiles.value = false
  continueSource.value = true
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
      const link = await createInvenioLink(
        documentId,
        {
          group_id: props.groupId,
          connector_id: connectorId.value,
          access_token: token,
          ...(parentId.value && continueSource.value ? { parent_id: parentId.value } : {}),
          auto_publish: autoPublish.value,
          public_files: publicFiles.value,
          ...(override.value.value ? { metadata: override.value.value } : {}),
        },
        client(),
      )
      if (!current()) return
      emit('linked', link)
      emit('update:open', false)
    } else {
      const submitted = await submitInvenioExport(
        documentId,
        {
          group_id: props.groupId,
          connector_id: connectorId.value,
          access_token: token,
          publish: publishNow.value,
          public_files: publicFiles.value,
          ...(override.value.value ? { metadata: override.value.value } : {}),
        },
        crypto.randomUUID(),
        client(),
      )
      if (current()) activeJobId.value = submitted.job_id
    }
  } catch (err) {
    if (current()) submitError.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="flex max-h-[88vh] max-w-xl flex-col">
      <DialogHeader class="pr-8">
        <DialogTitle class="flex items-center gap-2"><Send class="h-4 w-4 text-primary" /> Publish to repository</DialogTitle>
        <DialogDescription>
          Deposit this dataset in an Invenio or Zenodo repository. Aruna itself mints no DOI; the repository does.
        </DialogDescription>
      </DialogHeader>

      <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <template v-if="!activeJobId">
          <div class="space-y-1.5">
            <OptionToggle v-model="mode" :options="MODE_OPTIONS" aria-label="Kind of publication" />
            <p class="text-[11px] text-muted-foreground">
              {{ mode === 'link'
                ? 'A link pushes every later change of this dataset to one open draft in the repository.'
                : 'Creates one repository draft from the dataset as it is now. Later changes are not sent.' }}
            </p>
          </div>

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
            <p v-else-if="invenioConnectors" class="mt-2 text-[11px] text-muted-foreground">
              This dataset's group has no Invenio repository yet.
              <RouterLink
                :to="{ name: 'group', params: { id: props.groupId }, query: { tab: 'sources' } }"
                class="text-primary hover:underline"
                @click="emit('update:open', false)"
              >Add one under the group's Sources</RouterLink>
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
              Create a token with deposit rights in your repository account settings.
              <template v-if="mode === 'link'">
                Aruna stores it sealed for this one repository endpoint and never shows it again.
              </template>
              <template v-else>Aruna uses it for this export only.</template>
              Aruna never asks for your repository password.
            </p>
          </div>

          <label v-if="mode === 'link' && parentId" class="flex items-start gap-2 text-xs text-foreground">
            <Switch :checked="continueSource" aria-label="Continue the source record" @update:checked="continueSource = $event" />
            <span>
              Continue the source record
              <span class="block text-[11px] text-muted-foreground">
                New versions join the record this dataset was imported from ({{ parentId }}) instead of starting a new one.
              </span>
            </span>
          </label>
          <label v-if="mode === 'link'" class="flex items-center gap-2 text-xs text-foreground">
            <Switch :checked="autoPublish" aria-label="Publish automatically" @update:checked="autoPublish = $event" />
            Publish every push automatically
          </label>
          <label v-else class="flex items-center gap-2 text-xs text-foreground">
            <Switch :checked="publishNow" aria-label="Publish right away" @update:checked="publishNow = $event" />
            Publish right away
          </label>
          <label class="flex items-center gap-2 text-xs text-foreground">
            <Switch :checked="publicFiles" aria-label="Make files public" @update:checked="publicFiles = $event" />
            Make files public in the repository
          </label>
          <Notice v-if="autoPublish || publishNow" tone="warning">
            A published repository record cannot be deleted. Its files stay citable under their DOI.
          </Notice>

          <div>
            <Button variant="ghost" size="sm" class="h-6 px-1 text-xs" @click="showAdvanced = !showAdvanced">
              {{ showAdvanced ? 'Hide advanced' : 'Advanced metadata override' }}
            </Button>
            <template v-if="showAdvanced">
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

        <section v-else class="space-y-3">
          <TransferJobStatus :job="job" :load-state="loadState" :load-error="loadError" :last-poll-error="lastPollError" @retry="load" />
          <Button variant="ghost" size="sm" as-child @click="emit('update:open', false)">
            <RouterLink :to="{ name: 'job', params: { jobId: activeJobId } }">Open the job</RouterLink>
          </Button>
        </section>

        <Notice v-if="submitError" tone="error">{{ submitError }} Enter the token again to retry.</Notice>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Close</Button>
        <Button v-if="!activeJobId" :disabled="!ready" @click="submit">
          <Spinner v-if="busy" class="text-current" aria-hidden="true" />
          <Send v-else class="h-4 w-4" />
          {{ busy ? 'Starting…' : mode === 'link' ? 'Create link' : 'Start export' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
