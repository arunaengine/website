<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ConnectorDialog from '@/components/groups/ConnectorDialog.vue'
import { useAruna } from '@/composables/useAruna'
import { useStaging, stagingErrorMessage, invalidSourcePath } from '@/composables/useStaging'
import { builderEnabled } from '@/composables/useBuilderBasket'
import { useRouter } from 'vue-router'
import { formatBytes, relativeTime } from '@/lib/utils'
import type { SourceConnectorSummary, StageBlobResponse } from '@/lib/api'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { computed, ref, watch } from 'vue'
import { CloudDownload, Loader2, Plus, Upload, UploadCloud } from '@lucide/vue'

const props = defineProps<{ open: boolean; bucket: string; prefix: string; groupId: string | null }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'upload', files: File[]): void
  (e: 'staged', result: StageBlobResponse): void
}>()

const { myGroups, listGroupConnectors } = useAruna()
const staging = useStaging()
const { writesDisabled } = useConnectivity()
const router = useRouter()
const builderOn = builderEnabled()

function openBuilder() {
  emit('update:open', false)
  const target = props.prefix.replace(/\/+$/, '')
  void router.push({ name: 'bucket-builder', params: { bucketId: props.bucket }, query: target ? { prefix: target } : {} })
}

const tab = ref('upload')

// ── Upload tab ──────────────────────────────────────────────────────────────
const dragActive = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function emitUpload(files: File[]) {
  // The parent runs requestUpload so the #250 quota precheck still guards
  // every upload path.
  emit('upload', files)
  emit('update:open', false)
}

function onBrowse(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) emitUpload(Array.from(input.files))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  // Dropped files while offline must not enqueue doomed uploads (aruna#273).
  if (writesDisabled.value) return
  const files = event.dataTransfer?.files
  if (files?.length) emitUpload(Array.from(files))
}

// ── Ingest tab ──────────────────────────────────────────────────────────────
const groupSel = ref('')
const connectors = ref<SourceConnectorSummary[]>([])
const connectorsLoading = ref(false)
const connectorsError = ref<string | null>(null)
const connectorSel = ref('')
const sourcePath = ref('')
const targetKey = ref('')
const keyTouched = ref(false)
const strategy = ref<'snapshot' | 'reference'>('snapshot')
const busy = ref(false)
const submitError = ref<string | null>(null)
const lastResult = ref<StageBlobResponse | null>(null)
const registerOpen = ref(false)

function onConnectorSaved(connector: SourceConnectorSummary) {
  connectorSel.value = connector.connector_id
  void loadConnectors()
}

const groupOptions = computed(() => myGroups.value.map((group) => ({ value: group.id, label: group.name })))
const connectorOptions = computed(() =>
  connectors.value.map((connector) => ({ value: connector.connector_id, label: `${connector.name} (${connector.kind})` })),
)
const STRATEGY_OPTIONS = [
  { value: 'snapshot', label: 'Snapshot — copy the source into the bucket' },
  { value: 'reference', label: 'Reference — register without copying; read on demand' },
]

const trimmedSourcePath = computed(() => sourcePath.value.trim())
const sourcePathInvalid = computed(() => invalidSourcePath(sourcePath.value))
// Only surface the reason once the user has typed something wrong.
const sourcePathError = computed(() => Boolean(trimmedSourcePath.value) && sourcePathInvalid.value)

const submitDisabled = computed(
  () =>
    busy.value ||
    sourcePathInvalid.value ||
    !groupSel.value ||
    !connectorSel.value ||
    !targetKey.value.trim() ||
    targetKey.value.trim().endsWith('/'),
)

let connLoadSeq = 0
async function loadConnectors() {
  const groupId = groupSel.value
  if (!groupId) {
    connectors.value = []
    connectorSel.value = ''
    return
  }
  const seq = ++connLoadSeq
  connectorsLoading.value = true
  connectorsError.value = null
  try {
    const response = await listGroupConnectors(groupId)
    if (seq !== connLoadSeq) return
    connectors.value = response.connectors
    if (!connectors.value.some((connector) => connector.connector_id === connectorSel.value)) {
      connectorSel.value = connectors.value[0]?.connector_id ?? ''
    }
  } catch (err) {
    if (seq !== connLoadSeq) return
    connectorsError.value = err instanceof Error ? err.message : String(err)
    connectors.value = []
    connectorSel.value = ''
  } finally {
    if (seq === connLoadSeq) connectorsLoading.value = false
  }
}

// Auto-fill the target key from the source file name until the user edits it.
watch(sourcePath, (value) => {
  if (keyTouched.value) return
  const base = value.split('/').filter(Boolean).pop() ?? ''
  targetKey.value = `${props.prefix}${base}`
})

watch(groupSel, loadConnectors)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    tab.value = 'upload'
    const groups = myGroups.value
    groupSel.value =
      props.groupId && groups.some((group) => group.id === props.groupId)
        ? props.groupId
        : groups[0]?.id ?? ''
    sourcePath.value = ''
    keyTouched.value = false
    targetKey.value = props.prefix
    strategy.value = 'snapshot'
    submitError.value = null
    lastResult.value = null
    void loadConnectors()
  },
  { immediate: true },
)

async function submit() {
  if (submitDisabled.value) return
  busy.value = true
  submitError.value = null
  try {
    const connector = connectors.value.find((entry) => entry.connector_id === connectorSel.value)
    const result = await staging.submitStaging({
      strategy: strategy.value,
      groupId: groupSel.value,
      connectorId: connectorSel.value,
      connectorName: connector?.name ?? connectorSel.value,
      sourcePath: trimmedSourcePath.value,
      bucket: props.bucket,
      key: targetKey.value.trim(),
    })
    lastResult.value = result
    emit('staged', result)
    // Reset the source for the next ingest; keep the group/connector selection.
    keyTouched.value = false
    sourcePath.value = ''
    targetKey.value = props.prefix
  } catch (err) {
    submitError.value = stagingErrorMessage(err)
  } finally {
    busy.value = false
  }
}

const recentSubmissions = computed(() => staging.submissions.value.slice(0, 5))
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Upload class="h-4 w-4 text-primary" /> Add data
        </DialogTitle>
        <DialogDescription>
          Upload files from this browser or ingest data from a registered source connector into
          <span class="font-mono text-xs">{{ bucket }}/{{ prefix }}</span>.
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="tab">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="ingest">Ingest</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" class="space-y-3">
          <div
            class="rounded-md border-2 border-dashed p-8 text-center transition-colors"
            :class="dragActive ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2' : 'border-border'"
            @dragover.prevent="dragActive = true"
            @dragleave="dragActive = false"
            @drop.prevent="onDrop"
          >
            <UploadCloud class="mx-auto h-8 w-8 text-muted-foreground" />
            <p class="mt-2 text-sm text-foreground">Drop files here to upload</p>
            <p class="mt-1 text-xs text-muted-foreground">or</p>
            <input ref="fileInput" type="file" multiple class="hidden" @change="onBrowse" />
            <Button variant="outline" size="sm" class="mt-2" @click="fileInput?.click()">Browse files</Button>
          </div>
          <p class="text-[11px] text-muted-foreground">
            Uploads are multipart (16 MiB parts), run up to three at a time, and keep going while you navigate. Cancel or retry them from the Uploads panel.
          </p>
        </TabsContent>

        <TabsContent value="ingest" class="space-y-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-xs font-medium text-foreground">Group</label>
              <Select v-model="groupSel" :options="groupOptions" placeholder="Select a group" class="mt-1" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Source connector</label>
              <Select
                v-model="connectorSel"
                :options="connectorOptions"
                placeholder="Select a connector"
                class="mt-1"
                :disabled="!connectorOptions.length"
              />
            </div>
          </div>

          <p v-if="connectorsLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading connectors…
          </p>
          <p v-else-if="connectorsError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {{ connectorsError }}
          </p>
          <EmptyState
            v-else-if="!connectors.length"
            title="No source connectors"
            description="This group has no registered source connectors yet. Register one to ingest data from an external HTTP, S3, WebDAV, or FTP source."
          >
            <Button
              v-if="groupSel"
              size="sm"
              :disabled="writesDisabled"
              :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
              @click="registerOpen = true"
            >
              <Plus class="h-3.5 w-3.5" /> Register a connector
            </Button>
          </EmptyState>

          <template v-if="connectors.length">
            <div>
              <label class="text-xs font-medium text-foreground">Source path</label>
              <Input v-model="sourcePath" class="mt-1 font-mono text-xs" placeholder="folder/file.fastq.gz" />
              <p v-if="sourcePathError" class="mt-1 text-[11px] text-destructive">
                Use a relative path without leading '/', backslashes, or '.'/'..' segments.
              </p>
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Target key</label>
              <Input v-model="targetKey" class="mt-1 font-mono text-xs" placeholder="prefix/name" @input="keyTouched = true" />
            </div>
            <div>
              <label class="text-xs font-medium text-foreground">Strategy</label>
              <Select v-model="strategy" :options="STRATEGY_OPTIONS" class="mt-1" />
              <p class="mt-1 text-[11px] text-muted-foreground">The <span class="font-mono">sync</span> strategy is not implemented by the backend (501).</p>
            </div>

            <div v-if="lastResult" class="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
              Staged <span class="font-mono">{{ lastResult.key }}</span> ({{ formatBytes(lastResult.size) }}, version {{ lastResult.version_id }}).
            </div>
            <p v-if="submitError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {{ submitError }}
            </p>

            <div class="flex justify-end">
              <Button :disabled="submitDisabled" @click="submit">
                <CloudDownload class="h-4 w-4" /> {{ busy ? 'Staging…' : 'Stage data' }}
              </Button>
            </div>
          </template>

          <div v-if="staging.submissions.value.length" class="space-y-2 border-t border-border pt-3">
            <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This session</p>
            <div v-for="submission in recentSubmissions" :key="submission.id" class="space-y-0.5">
              <div class="flex items-center gap-2 text-xs">
                <Loader2 v-if="submission.state === 'running'" class="h-3 w-3 shrink-0 animate-spin text-primary" />
                <Badge
                  :variant="submission.state === 'running' ? 'secondary' : submission.state === 'done' ? 'success' : 'destructive'"
                  class="text-[10px] uppercase"
                >{{ submission.state }}</Badge>
                <span class="min-w-0 flex-1 truncate font-mono">{{ submission.bucket }}/{{ submission.key }}</span>
                <Badge variant="outline" class="shrink-0 text-[10px]">{{ submission.strategy }}</Badge>
                <span class="shrink-0 text-muted-foreground">{{ relativeTime(submission.submittedAt) }}</span>
              </div>
              <p v-if="submission.error" class="pl-1 text-[11px] text-destructive">{{ submission.error }}</p>
            </div>
            <p class="text-[11px] text-muted-foreground">Staging runs synchronously on the node; this list is local to your session.</p>
          </div>
        </TabsContent>
      </Tabs>

      <div v-if="builderOn && bucket" class="flex justify-center border-t border-border pt-3">
        <button class="text-xs text-primary hover:underline" @click="openBuilder">
          Importing many sources at once? Open the builder
        </button>
      </div>

      <ConnectorDialog v-model:open="registerOpen" :group-id="groupSel" @saved="onConnectorSaved" />
    </DialogContent>
  </Dialog>
</template>
