<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Progress from '@/components/ui/Progress.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import ConnectorEntriesBrowser from '@/components/data/ConnectorEntriesBrowser.vue'
import { useAruna } from '@/composables/useAruna'
import { isJobsUnsupported } from '@/composables/useJobs'
import { invalidSourcePath } from '@/composables/useStaging'
import { ApiError, type SourceConnectorSummary } from '@/lib/api'
import {
  ROCRATE_UPLOAD_MAX_BYTES,
  submitRoCrateImport,
  uploadRoCrate,
  type RoCrateImportSource,
  type RoCrateJobSubmission,
  type RoCrateUpload,
} from '@/lib/rocrate'
import { formatBytes } from '@/lib/utils'
import { ArchiveRestore, FileArchive, Loader2 } from '@lucide/vue'

const props = defineProps<{
  open: boolean
  bucket: string
  prefix: string
  groupId: string | null
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'submitted', value: RoCrateJobSubmission): void
}>()

const { apiBaseUrl, authToken, myGroups, listGroupConnectors } = useAruna()

type SourceKind = 'local' | 'object' | 'connector'

const sourceKind = ref<SourceKind>('local')
const localFile = ref<File | null>(null)
const objectSource = ref<{ bucket: string; key: string; name: string; size?: number } | null>(null)
const objectVersion = ref('')
const connectorGroup = ref('')
const connectorId = ref('')
const connectorPath = ref('')
const connectors = ref<SourceConnectorSummary[]>([])
const connectorsLoading = ref(false)
const connectorsError = ref<string | null>(null)
const targetPrefix = ref('')
const metadataGroup = ref('')
const metadataPath = ref('')
const metadataPublic = ref(false)
const idempotencyKey = ref('')
const submitError = ref<string | null>(null)
const busy = ref(false)
const uploadActive = ref(false)
const uploadLoaded = ref(0)
const uploadTotal = ref(0)
const completedUpload = ref<{
  file: File
  uploadId: string
  ownerNodeUrl: string
} | null>(null)
let activeUpload: RoCrateUpload | null = null
let connectorLoad = 0

const groupOptions = computed(() => myGroups.value.map((group) => ({ value: group.id, label: group.name })))
const connectorOptions = computed(() =>
  connectors.value.map((connector) => ({
    value: connector.connector_id,
    label: `${connector.name} (${connector.kind})`,
  })),
)
const uploadPercent = computed(() =>
  uploadTotal.value > 0 ? Math.min(100, (uploadLoaded.value / uploadTotal.value) * 100) : 0,
)

function reset() {
  sourceKind.value = 'local'
  localFile.value = null
  objectSource.value = null
  objectVersion.value = ''
  connectorGroup.value = props.groupId ?? myGroups.value[0]?.id ?? ''
  connectorId.value = ''
  connectorPath.value = ''
  targetPrefix.value = props.prefix
  metadataGroup.value = props.groupId ?? myGroups.value[0]?.id ?? ''
  metadataPath.value = ''
  metadataPublic.value = false
  idempotencyKey.value = ''
  submitError.value = null
  uploadActive.value = false
  uploadLoaded.value = 0
  uploadTotal.value = 0
  completedUpload.value = null
}

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)
watch(
  [() => props.groupId, myGroups],
  ([groupId, groups]) => {
    const fallback = groupId ?? groups[0]?.id ?? ''
    if (!metadataGroup.value) metadataGroup.value = fallback
    if (!connectorGroup.value) connectorGroup.value = fallback
  },
)

async function loadConnectors() {
  const groupId = connectorGroup.value
  const request = ++connectorLoad
  connectors.value = []
  connectorId.value = ''
  connectorsError.value = null
  if (!groupId) return
  connectorsLoading.value = true
  try {
    const response = await listGroupConnectors(groupId)
    if (request !== connectorLoad) return
    connectors.value = response.connectors
    connectorId.value = response.connectors[0]?.connector_id ?? ''
  } catch (err) {
    if (request !== connectorLoad) return
    connectorsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (request === connectorLoad) connectorsLoading.value = false
  }
}
watch(connectorGroup, () => void loadConnectors())

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  localFile.value = input.files?.[0] ?? null
  completedUpload.value = null
  input.value = ''
}

function selectObject(entry: { bucket: string; key: string; name: string; size?: number }) {
  objectSource.value = entry
  if (!metadataPath.value) metadataPath.value = suggestedPath(entry.name)
}

function selectConnector(selection: {
  files: Array<{ path: string }>
  dirs: Array<{ path: string }>
}) {
  if (selection.files.length !== 1 || selection.dirs.length) {
    submitError.value = 'Choose exactly one connector file containing the RO-Crate archive.'
    return
  }
  connectorPath.value = selection.files[0]?.path ?? ''
  submitError.value = null
  if (!metadataPath.value) metadataPath.value = suggestedPath(connectorPath.value)
}

function suggestedPath(name: string): string {
  const base = name.split('/').pop()?.replace(/\.(?:zip|eln)$/i, '') || 'imported-crate'
  return `imports/${base}`
}

watch(localFile, (file) => {
  if (file && !metadataPath.value) metadataPath.value = suggestedPath(file.name)
})

function invalidRelative(value: string, allowEmpty = false): boolean {
  const trimmed = value.trim()
  if (!trimmed) return !allowEmpty
  if (trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.includes('\0')) return true
  return trimmed.split('/').some((segment) => segment === '.' || segment === '..')
}

function localFileError(): string | null {
  const file = localFile.value
  if (!file) return 'Choose a .zip or .eln file.'
  if (!/\.(zip|eln)$/i.test(file.name)) return 'The local source must be a .zip or .eln file.'
  if (file.size > ROCRATE_UPLOAD_MAX_BYTES) {
    return 'Direct uploads are limited to 8 GiB. Use an existing S3 object or connector for larger crates.'
  }
  return null
}

const validationError = computed(() => {
  if (!props.bucket) return 'Select a destination bucket.'
  if (invalidRelative(targetPrefix.value, true)) return 'The target prefix must be a relative S3 key prefix.'
  if (new TextEncoder().encode(targetPrefix.value.trim()).length > 1024) {
    return 'The target prefix exceeds the 1,024-byte key limit.'
  }
  if (!metadataGroup.value) return 'Select the metadata group.'
  if (invalidRelative(metadataPath.value)) return 'Enter a relative metadata path without . or .. segments.'
  if (sourceKind.value === 'local') return localFileError()
  if (sourceKind.value === 'object') {
    if (!objectSource.value) return 'Choose an existing S3 object.'
    if (
      objectVersion.value.trim() &&
      !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(objectVersion.value.trim())
    ) {
      return 'The optional object version must be a 26-character uppercase ULID.'
    }
    return null
  }
  if (!connectorGroup.value || !connectorId.value) return 'Select a configured connector.'
  if (invalidSourcePath(connectorPath.value)) return 'Enter or choose one relative connector file path.'
  return null
})

function mediaType(file: File): 'application/zip' | 'application/vnd.eln+zip' {
  return file.name.toLowerCase().endsWith('.eln')
    ? 'application/vnd.eln+zip'
    : 'application/zip'
}

function sourceFromForm(): RoCrateImportSource {
  if (sourceKind.value === 'object' && objectSource.value) {
    return {
      kind: 'object',
      bucket: objectSource.value.bucket,
      key: objectSource.value.key,
      ...(objectVersion.value.trim() ? { version: objectVersion.value.trim() } : {}),
    }
  }
  if (sourceKind.value === 'connector') {
    return {
      kind: 'connector',
      group_id: connectorGroup.value,
      connector_id: connectorId.value,
      path: connectorPath.value.trim(),
    }
  }
  throw new Error('The local upload has not completed.')
}

function errorMessage(err: unknown): string {
  if (isJobsUnsupported(err)) {
    return 'This backend does not support attached RO-Crate imports yet.'
  }
  if (err instanceof ApiError && err.status === 409) {
    return err.message || 'The idempotency key conflicts with another job, or the active job limit was reached.'
  }
  return err instanceof Error ? err.message : String(err)
}

async function submit() {
  if (validationError.value || busy.value) return
  busy.value = true
  submitError.value = null
  uploadLoaded.value = 0
  uploadTotal.value = 0
  const localClient = { baseUrl: apiBaseUrl.value, token: authToken.value }
  try {
    let source: RoCrateImportSource
    let submitClient = localClient
    if (sourceKind.value === 'local' && localFile.value) {
      if (completedUpload.value?.file === localFile.value) {
        source = { kind: 'upload', upload_id: completedUpload.value.uploadId }
        submitClient = { baseUrl: completedUpload.value.ownerNodeUrl, token: authToken.value }
      } else {
        uploadTotal.value = localFile.value.size
        activeUpload = uploadRoCrate(
          localFile.value,
          mediaType(localFile.value),
          localClient,
          (loaded, total) => {
            uploadLoaded.value = loaded
            uploadTotal.value = total
          },
        )
        uploadActive.value = true
        const uploaded = await activeUpload.promise
        activeUpload = null
        uploadActive.value = false
        completedUpload.value = {
          file: localFile.value,
          uploadId: uploaded.upload_id,
          ownerNodeUrl: uploaded.owner_node_url,
        }
        source = { kind: 'upload', upload_id: uploaded.upload_id }
        submitClient = { baseUrl: uploaded.owner_node_url, token: authToken.value }
      }
    } else {
      source = sourceFromForm()
    }
    const submitted = await submitRoCrateImport(
      {
        source,
        target: { bucket: props.bucket, prefix: targetPrefix.value.trim() },
        metadata: {
          group_id: metadataGroup.value,
          path: metadataPath.value.trim(),
          public: metadataPublic.value,
        },
        ...(idempotencyKey.value.trim() ? { idempotency_key: idempotencyKey.value.trim() } : {}),
      },
      submitClient,
    )
    emit('submitted', submitted)
    emit('update:open', false)
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) submitError.value = errorMessage(err)
  } finally {
    activeUpload = null
    uploadActive.value = false
    busy.value = false
  }
}

function close(value: boolean) {
  if (!value && busy.value) return
  emit('update:open', value)
}

function cancel() {
  if (activeUpload) {
    activeUpload.abort()
    emit('update:open', false)
    return
  }
  if (!busy.value) emit('update:open', false)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="close">
    <DialogContent class="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Import attached RO-Crate</DialogTitle>
        <DialogDescription>
          Validate an attached RO-Crate or ELN archive, write its files into
          <span class="font-mono text-xs">{{ bucket }}</span>, then create its metadata document.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-5">
        <Tabs v-model="sourceKind">
          <TabsList class="grid w-full grid-cols-3">
            <TabsTrigger value="local">Local file</TabsTrigger>
            <TabsTrigger value="object">S3 object</TabsTrigger>
            <TabsTrigger value="connector">Connector</TabsTrigger>
          </TabsList>

          <TabsContent value="local" class="mt-3">
            <label class="grid cursor-pointer place-items-center rounded-md border border-dashed border-border px-5 py-8 text-center hover:border-primary/50">
              <FileArchive class="h-7 w-7 text-primary" />
              <span class="mt-2 text-sm font-medium text-foreground">
                {{ localFile?.name ?? 'Choose a .zip or .eln archive' }}
              </span>
              <span class="mt-1 text-xs text-muted-foreground">
                {{ localFile ? formatBytes(localFile.size) : 'Direct upload limit: 8 GiB' }}
              </span>
              <input
                class="sr-only"
                type="file"
                accept=".zip,.eln,application/zip,application/vnd.eln+zip"
                :disabled="busy"
                @change="onFile"
              />
            </label>
          </TabsContent>

          <TabsContent value="object" class="mt-3 space-y-3">
            <ObjectBrowserPanel @select="selectObject" />
            <p v-if="objectSource" class="rounded-md bg-muted/40 px-3 py-2 text-xs">
              Selected <span class="font-mono">{{ objectSource.bucket }}/{{ objectSource.key }}</span>
            </p>
            <div>
              <label class="text-xs font-medium text-foreground">Exact version (optional)</label>
              <Input
                v-model="objectVersion"
                class="mt-1 font-mono text-xs"
                maxlength="26"
                placeholder="01J… uppercase ULID"
              />
            </div>
          </TabsContent>

          <TabsContent value="connector" class="mt-3 space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-xs font-medium text-foreground">Connector group</label>
                <Select
                  v-model="connectorGroup"
                  class="mt-1"
                  :options="groupOptions"
                  placeholder="Choose group"
                  aria-label="Connector group"
                />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Connector</label>
                <Select
                  v-model="connectorId"
                  class="mt-1"
                  :options="connectorOptions"
                  :placeholder="connectorsLoading ? 'Loading…' : 'Choose connector'"
                  aria-label="Connector"
                />
              </div>
            </div>
            <p v-if="connectorsError" class="text-xs text-destructive">{{ connectorsError }}</p>
            <ConnectorEntriesBrowser
              v-if="connectorGroup && connectorId"
              :group-id="connectorGroup"
              :connector-id="connectorId"
              selectable
              @add="selectConnector"
            />
            <div>
              <label class="text-xs font-medium text-foreground">Archive path</label>
              <Input
                v-model="connectorPath"
                class="mt-1 font-mono text-xs"
                placeholder="exports/dataset.eln"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div class="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-foreground">Target prefix</label>
            <Input v-model="targetPrefix" class="mt-1 font-mono text-xs" placeholder="optional/prefix/" />
            <p class="mt-1 text-[11px] text-muted-foreground">
              Payload files are written under <span class="font-mono">{{ bucket }}/{{ targetPrefix }}</span>.
            </p>
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Metadata group</label>
            <Select
              v-model="metadataGroup"
              class="mt-1"
              :options="groupOptions"
              placeholder="Choose group"
              aria-label="Metadata group"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Metadata path</label>
            <Input v-model="metadataPath" class="mt-1 font-mono text-xs" placeholder="imports/my-dataset" />
          </div>
          <div class="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <p class="text-xs font-medium text-foreground">Public metadata</p>
              <p class="text-[11px] text-muted-foreground">Defaults to private.</p>
            </div>
            <Switch v-model:checked="metadataPublic" aria-label="Make imported metadata public" />
          </div>
        </div>

        <div>
          <label class="text-xs font-medium text-foreground">Idempotency key (optional)</label>
          <Input v-model="idempotencyKey" class="mt-1 font-mono text-xs" placeholder="repeat-safe submission key" />
        </div>

        <div class="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          <p class="font-medium">Before importing</p>
          <ul class="mt-1 list-disc space-y-1 pl-4">
            <li>RO-Crate 1.1, RO-Crate 1.2 and ELN Consortium archives are accepted.</li>
            <li>Existing target keys receive new object versions; they are not replaced in place.</li>
            <li>Files not listed in the metadata are imported and reported as unlisted.</li>
            <li>Direct uploads are capped at 8 GiB; object and connector sources and expanded data at 100 GiB; metadata at 16 MiB and entries at 100,000.</li>
            <li>If a later entry fails, already written versions remain, but no metadata document is created.</li>
          </ul>
        </div>

        <div v-if="uploadActive && sourceKind === 'local'" class="space-y-2">
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>Uploading archive</span>
            <span>{{ formatBytes(uploadLoaded) }} / {{ formatBytes(uploadTotal) }}</span>
          </div>
          <Progress :value="uploadPercent" />
        </div>

        <p v-if="validationError" class="text-xs text-destructive">{{ validationError }}</p>
        <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {{ submitError }}
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="busy && !uploadActive" @click="cancel">
          {{ uploadActive ? 'Cancel upload' : 'Cancel' }}
        </Button>
        <Button :disabled="Boolean(validationError) || busy" @click="submit">
          <Loader2 v-if="busy" class="h-4 w-4 animate-spin" />
          <ArchiveRestore v-else class="h-4 w-4" />
          {{ busy ? (uploadActive ? 'Uploading…' : 'Submitting…') : 'Start import' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
