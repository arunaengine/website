<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Progress from '@/components/ui/Progress.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ConnectorDialog from '@/components/groups/ConnectorDialog.vue'
import ConnectorEntriesBrowser from '@/components/data/ConnectorEntriesBrowser.vue'
import BucketSearchBox from '@/components/data/BucketSearchBox.vue'
import ObjectBrowserPanel from '@/components/data/ObjectBrowserPanel.vue'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { type FolderEntry, type ObjectEntry } from '@/composables/useS3'
import { invalidSourcePath, invalidSourcePrefix } from '@/composables/useStaging'
import { useBuilderBasket, type BuilderRow } from '@/composables/useBuilderBasket'
import { assessQuota, quotaCountedBytes, type QuotaAssessment } from '@/lib/quota'
import { formatBytes } from '@/lib/utils'
import { ApiError, type BucketSearchHit, type ConnectorEntry, type SourceConnectorSummary, type StagingReferenceEntry, type UsageResponse } from '@/lib/api'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CloudDownload,
  FolderInput,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  UploadCloud,
  X,
} from '@lucide/vue'

// The ONE "Add data" entry point: a basket dialog for local files/folders
// (persistent upload queue) and connector entries (batch staging), plus an
// "Other buckets" source that imports objects from any bucket in the realm
// through sync relationships (copy once or reference).
const props = defineProps<{
  open: boolean
  bucket: string
  prefix: string
  groupId: string | null
  /** Keys visible in the parent's current listing, for overwrite warnings. */
  existingKeys?: ReadonlySet<string>
  existingReferences?: readonly StagingReferenceEntry[]
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'staged'): void
  // A sync relationship was created from the Other buckets tab.
  (e: 'sync-created'): void
}>()

const { myGroups, listGroupConnectors, createSyncRelationship, getGroupUsage } = useAruna()
const { writesDisabled } = useConnectivity()
const realmNodes = useRealmNodes()

const existingKeys = computed<ReadonlySet<string>>(() => props.existingKeys ?? new Set())

const basket = useBuilderBasket({
  bucket: computed(() => props.bucket),
  prefix: computed(() => props.prefix),
  groupId: computed(() => props.groupId),
  existingKeys,
})

// A ready/blocked row whose target key is already listed would overwrite it.
function rowOverwrites(row: BuilderRow): boolean {
  if (row.state !== 'ready' && row.state !== 'blocked') return false
  return existingKeys.value.has(row.targetKey.trim())
}

const tab = ref('local')

// ── Local files & folders ───────────────────────────────────────────────────
const dragActive = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)

function onBrowse(event: Event) {
  const input = event.target as HTMLInputElement
  if (!writesDisabled.value && input.files?.length) basket.addUploads(Array.from(input.files))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  if (writesDisabled.value) return
  const files = event.dataTransfer?.files
  if (files?.length) basket.addUploads(Array.from(files))
}

// ── Connectors ──────────────────────────────────────────────────────────────
const groupSel = ref('')
const connectors = ref<SourceConnectorSummary[]>([])
const connectorsLoading = ref(false)
const connectorsError = ref<string | null>(null)
const registerOpen = ref(false)
let connLoadSeq = 0

const groupOptions = computed(() => myGroups.value.map((group) => ({ value: group.id, label: group.name })))

async function loadConnectors() {
  const groupId = groupSel.value
  if (!groupId) {
    connectors.value = []
    return
  }
  const seq = ++connLoadSeq
  connectorsLoading.value = true
  connectorsError.value = null
  try {
    const response = await listGroupConnectors(groupId)
    if (seq !== connLoadSeq) return
    connectors.value = response.connectors
  } catch (err) {
    if (seq !== connLoadSeq) return
    connectorsError.value = err instanceof Error ? err.message : String(err)
    connectors.value = []
  } finally {
    if (seq === connLoadSeq) connectorsLoading.value = false
  }
}
watch(groupSel, loadConnectors)

function onConnectorSaved(connector: SourceConnectorSummary) {
  connectorSel.value = connector.connector_id
  void loadConnectors()
}

const connectorOptions = computed(() =>
  connectors.value.map((connector) => ({ value: connector.connector_id, label: `${connector.name} (${connector.kind})` })),
)
const STRATEGY_OPTIONS = [
  { value: 'snapshot', label: 'Snapshot: copy the source into the bucket' },
  { value: 'reference', label: 'Reference: register without copying; read on demand' },
]

// ── Connector tab ───────────────────────────────────────────────────────────
const connectorSel = ref('')
const connectorStrategy = ref<'snapshot' | 'reference'>('snapshot')
// Set when the entries endpoint is absent on this node; the typed source path
// stays available as the fallback.
const entriesUnsupported = ref(false)
// Set when the node answered but the source refused a listing (502/504); the
// browser stays visible for retries and the typed path unlocks alongside it.
const entriesListingFailed = ref(false)
const connectorPath = ref('')

watch(connectors, () => {
  if (!connectors.value.some((connector) => connector.connector_id === connectorSel.value)) {
    connectorSel.value = connectors.value[0]?.connector_id ?? ''
  }
})
watch(connectorSel, () => {
  entriesUnsupported.value = false
  entriesListingFailed.value = false
})

function typedConnectorPathIsPrefix(path: string): boolean {
  const trimmed = path.trim()
  return trimmed === '.' || trimmed === './' || trimmed.endsWith('/')
}

const connectorPathError = computed(() => {
  if (!connectorPath.value.trim()) return false
  return typedConnectorPathIsPrefix(connectorPath.value)
    ? invalidSourcePrefix(connectorPath.value)
    : invalidSourcePath(connectorPath.value)
})
const existingConnectorReferenceKeys = computed(() => {
  const map = new Map<string, string>()
  for (const entry of props.existingReferences ?? []) {
    if (entry.referenced && entry.connector_id === connectorSel.value && entry.source_path) {
      map.set(entry.source_path, entry.key)
    }
  }
  return map
})
const existingConnectorPaths = computed<ReadonlySet<string>>(
  () => new Set(existingConnectorReferenceKeys.value.keys()),
)

function selectedConnectorName(): string | null {
  return connectors.value.find((connector) => connector.connector_id === connectorSel.value)?.name ?? null
}

function addConnectorSelection(selection: { files: ConnectorEntry[]; dirs: ConnectorEntry[] }) {
  if (!groupSel.value || !connectorSel.value) return
  const base = {
    strategy: connectorStrategy.value,
    groupId: groupSel.value,
    connectorId: connectorSel.value,
    connectorName: selectedConnectorName(),
  }
  basket.addStaging('connector', [
    ...selection.files.map((entry) => ({
      ...base,
      source: entry.path,
      targetKey: existingConnectorReferenceKeys.value.get(entry.path),
    })),
    ...selection.dirs.map((entry) => ({ ...base, source: `${entry.path.replace(/\/+$/, '')}/`, isPrefix: true })),
  ])
}

function addTypedConnectorPath() {
  const source = connectorPath.value.trim()
  const isPrefix = typedConnectorPathIsPrefix(source)
  if (!groupSel.value || !connectorSel.value || (isPrefix ? invalidSourcePrefix(source) : invalidSourcePath(source))) return
  basket.addStaging('connector', [
    {
      source,
      strategy: connectorStrategy.value,
      groupId: groupSel.value,
      connectorId: connectorSel.value,
      connectorName: selectedConnectorName(),
      ...(isPrefix ? { isPrefix: true } : {}),
      ...(source === '.' || source === './' ? { targetKey: props.prefix } : {}),
    },
  ])
  connectorPath.value = ''
}

// ── Other buckets tab ───────────────────────────────────────────────────────
// Import from any bucket in the realm: search local and remote buckets, browse
// them through their per-node S3 client, then multi-select
// objects/folders and create sync relationships into the current bucket:
// mode "once" copies now, mode "reference" exposes without copying. The
// create request POSTs to the SOURCE node's API (the source is always the
// node receiving the request).
type OtherMode = 'once' | 'reference'

const sourceBucket = ref('')
const sourceNodeId = ref<string | null>(null)
const sourceSearch = ref('')
const otherDefaultMode = ref<OtherMode>('once')

interface OtherBucketRow {
  id: number
  bucket: string
  nodeId: string | null
  /** Exact object key, or a folder prefix ending in '/'. */
  sourcePrefix: string
  isPrefix: boolean
  mode: OtherMode
  state: 'ready' | 'creating' | 'done' | 'error'
  error: string | null
}
const otherRows = ref<OtherBucketRow[]>([])
let otherCounter = 0
const otherBusy = ref(false)

const OTHER_MODE_OPTIONS: Array<{ value: OtherMode; label: string }> = [
  { value: 'once', label: 'Copy (once)' },
  { value: 'reference', label: 'Reference' },
]

function pickSearchHit(hit: BucketSearchHit) {
  sourceBucket.value = hit.bucket
  sourceNodeId.value = realmNodes.isLocalNode(hit.node_id) ? null : hit.node_id
}

function addOtherSelection(selection: { objects: ObjectEntry[]; folders: FolderEntry[] }) {
  const bucket = sourceBucket.value
  if (!bucket) return
  const seeds = [
    ...selection.objects.map((object) => ({ sourcePrefix: object.key, isPrefix: false })),
    ...selection.folders.map((folder) => ({ sourcePrefix: folder.prefix, isPrefix: true })),
  ]
  for (const seed of seeds) {
    const duplicate = otherRows.value.some(
      (row) =>
        row.bucket === bucket &&
        (row.nodeId ?? null) === (sourceNodeId.value ?? null) &&
        row.sourcePrefix === seed.sourcePrefix,
    )
    if (duplicate) continue
    otherRows.value.push({
      id: ++otherCounter,
      bucket,
      nodeId: sourceNodeId.value,
      ...seed,
      mode: otherDefaultMode.value,
      state: 'ready',
      error: null,
    })
  }
}

function removeOtherRow(id: number) {
  otherRows.value = otherRows.value.filter((row) => row.id !== id)
}

// Sync semantics map source-prefix remainders under the target prefix, so a
// folder lands as `<current prefix><folder>/…` and an exact object key (its
// remainder is empty) as `<current prefix><name>`.
function otherTargetPrefix(row: OtherBucketRow): string {
  const base = row.sourcePrefix.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? row.sourcePrefix
  return row.isPrefix ? `${props.prefix}${base}/` : `${props.prefix}${base}`
}

function syncCreateError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'This sync relationship already exists.'
    if (err.status === 501) return 'Reference mode is not supported by the source node yet.'
    if (err.status === 502) return 'The source node could not reach this node right now.'
    if (err.status === 401 || err.status === 403) return 'You need read access on the source bucket to import from it.'
    return err.message
  }
  return err instanceof Error ? err.message : String(err)
}

const otherPendingCount = computed(
  () => otherRows.value.filter((row) => row.state === 'ready' || row.state === 'error').length,
)

async function createOtherRelationships() {
  const targetNode = realmNodes.localNodeId.value
  if (!targetNode || !props.bucket || otherBusy.value) return
  otherBusy.value = true
  let created = false
  try {
    for (const row of otherRows.value) {
      if (row.state === 'done' || row.state === 'creating') continue
      const sourceApiBase = row.nodeId ? (realmNodes.nodeById(row.nodeId)?.apiBase ?? null) : null
      if (row.nodeId && !sourceApiBase) {
        row.state = 'error'
        row.error = `${realmNodes.displayName(row.nodeId)} does not publish an API URL, so the import cannot be created from here.`
        continue
      }
      row.state = 'creating'
      row.error = null
      try {
        await createSyncRelationship(
          {
            source: { bucket: row.bucket, prefix: row.sourcePrefix },
            target: { node_id: targetNode, bucket: props.bucket, prefix: otherTargetPrefix(row) },
            mode: row.mode,
            reference_handling: row.mode === 'reference' ? 'preserve' : 'materialize',
          },
          sourceApiBase ? { baseUrl: sourceApiBase } : {},
        )
        row.state = 'done'
        created = true
      } catch (err) {
        row.state = 'error'
        row.error = syncCreateError(err)
      }
    }
  } finally {
    otherBusy.value = false
    if (created) {
      emit('sync-created')
      emit('staged')
    }
  }
}

// ── Quota precheck (advisory, never blocks) ─────────────────────────────────
let cachedUsage: { groupId: string; at: number; usage: UsageResponse } | null = null
async function groupUsageFresh(groupId: string): Promise<UsageResponse | null> {
  if (cachedUsage && cachedUsage.groupId === groupId && Date.now() - cachedUsage.at < 30_000) {
    return cachedUsage.usage
  }
  try {
    const usage = await getGroupUsage(groupId)
    cachedUsage = { groupId, at: Date.now(), usage }
    return usage
  } catch {
    return null
  }
}

const precheck = ref<{ totalBytes: number; projected: QuotaAssessment; current: QuotaAssessment } | null>(null)

async function submitAll() {
  if (!basket.canSubmit.value) return
  const uploadBytes = basket.rows.value
    .filter((row) => row.state === 'ready' && row.sourceKind === 'upload')
    .reduce((sum, row) => sum + (row.size ?? 0), 0)
  if (uploadBytes > 0 && props.groupId) {
    const usage = await groupUsageFresh(props.groupId)
    const quota = usage?.quota
    if (usage && quota && quota.quota_bytes != null) {
      const used = quotaCountedBytes(usage)
      const projected = assessQuota(quota, used + uploadBytes)
      if (projected.state === 'over-quota' || projected.state === 'over-ceiling') {
        precheck.value = { totalBytes: uploadBytes, projected, current: assessQuota(quota, used) }
        return
      }
    }
  }
  await runSubmit()
}

async function confirmPrecheckSubmit() {
  precheck.value = null
  await runSubmit()
}

async function runSubmit() {
  await basket.submit()
  emit('staged')
}

// ── Basket table ────────────────────────────────────────────────────────────
const kindLabel: Record<BuilderRow['sourceKind'], string> = {
  internal: 'Internal',
  connector: 'Connector',
  upload: 'Upload',
}
function stateVariant(state: BuilderRow['state']): 'secondary' | 'success' | 'destructive' | 'outline' {
  if (state === 'done') return 'success'
  if (state === 'error') return 'destructive'
  if (state === 'blocked') return 'outline'
  return 'secondary'
}
function rowEditable(row: BuilderRow): boolean {
  return row.state === 'ready' || row.state === 'blocked'
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const groups = myGroups.value
    groupSel.value =
      props.groupId && groups.some((group) => group.id === props.groupId)
        ? props.groupId
        : ''
    void loadConnectors()
    // Fresh Other-buckets session per dialog visit.
    sourceBucket.value = ''
    sourceNodeId.value = null
    sourceSearch.value = ''
    otherRows.value = []
  },
  { immediate: true },
)
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="flex max-h-[88vh] max-w-4xl flex-col">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Upload class="h-4 w-4 text-primary" /> Add data
        </DialogTitle>
        <DialogDescription>
          Collect local files, connector sources and objects from other buckets, then submit them into
          <span class="font-mono text-xs">{{ bucket }}/{{ prefix }}</span>.
        </DialogDescription>
      </DialogHeader>

      <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
        <Tabs v-model="tab">
          <TabsList>
            <TabsTrigger value="local"><Upload class="mr-1 h-3.5 w-3.5" /> Local files</TabsTrigger>
            <TabsTrigger value="connector"><CloudDownload class="mr-1 h-3.5 w-3.5" /> From connector</TabsTrigger>
            <TabsTrigger value="other"><Boxes class="mr-1 h-3.5 w-3.5" /> Other buckets</TabsTrigger>
          </TabsList>

          <!-- Local files & folders -->
          <TabsContent value="local" class="space-y-3">
            <div
              class="rounded-md border-2 border-dashed p-8 text-center transition-colors"
              :class="dragActive ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2' : 'border-border'"
              @dragover.prevent="dragActive = true"
              @dragleave="dragActive = false"
              @drop.prevent="onDrop"
            >
              <UploadCloud class="mx-auto h-8 w-8 text-muted-foreground" />
              <p class="mt-2 text-sm text-foreground">Drop files here to add them to the basket</p>
              <p class="mt-1 text-xs text-muted-foreground">or</p>
              <input ref="fileInput" type="file" multiple class="hidden" @change="onBrowse" />
              <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="onBrowse" />
              <div class="mt-2 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="writesDisabled"
                  :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                  @click="fileInput?.click()"
                >
                  Browse files
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="writesDisabled"
                  :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                  @click="folderInput?.click()"
                >
                  <FolderInput class="h-3.5 w-3.5" /> Browse folder
                </Button>
              </div>
            </div>
            <p class="text-[11px] text-muted-foreground">
              Uploads are multipart (16 MiB parts), run up to three at a time, and keep going while you navigate.
              A picked folder keeps its structure under the target prefix.
            </p>
          </TabsContent>

          <!-- From connector -->
          <TabsContent value="connector" class="space-y-3">
            <div class="grid gap-3 sm:grid-cols-3">
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
              <div>
                <label class="text-xs font-medium text-foreground">Strategy</label>
                <Select v-model="connectorStrategy" :options="STRATEGY_OPTIONS" class="mt-1" />
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

            <template v-else-if="connectorSel">
              <ConnectorEntriesBrowser
                v-if="!entriesUnsupported"
                :group-id="groupSel"
                :connector-id="connectorSel"
                :checked-paths="existingConnectorPaths"
                selectable
                @add="addConnectorSelection"
                @unsupported="entriesUnsupported = true"
                @list-failed="entriesListingFailed = true"
              />
              <div v-if="entriesUnsupported || entriesListingFailed" class="space-y-2">
                <p v-if="entriesUnsupported" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                  Browsing connector contents is not supported by this node yet. Type the source path instead.
                </p>
                <div>
                  <label class="text-xs font-medium text-foreground">Source path</label>
                  <div class="mt-1 flex items-center gap-2">
                    <Input v-model="connectorPath" class="font-mono text-xs" placeholder="folder/file.fastq.gz" @keyup.enter="addTypedConnectorPath" />
                    <Button size="sm" class="shrink-0" :disabled="!connectorPath.trim() || connectorPathError" @click="addTypedConnectorPath">
                      <Plus class="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                  <p v-if="connectorPathError" class="mt-1 text-[11px] text-destructive">
                    Use a relative path without leading '/', backslashes, or '.'/'..' segments.
                  </p>
                  <p v-else class="mt-1 text-[11px] text-muted-foreground">
                    End a folder path with '/' or use '.' to add the connector root.
                  </p>
                </div>
              </div>
              <div class="flex justify-end">
                <button class="text-xs text-primary hover:underline" @click="registerOpen = true">Register another connector</button>
              </div>
            </template>
          </TabsContent>

          <!-- Other buckets -->
          <TabsContent value="other" class="space-y-3">
            <p class="text-[11px] text-muted-foreground">
              Import objects from another bucket, local or on another realm node. "Copy (once)" duplicates the
              selection into <span class="font-mono">{{ bucket }}/{{ prefix }}</span> now; "Reference" exposes it
              there without copying the data.
            </p>

            <div>
              <label class="text-xs font-medium text-foreground">Source bucket</label>
              <div class="mt-1">
                <BucketSearchBox
                  v-model="sourceSearch"
                  mode="picker"
                  :exclude-local-bucket="bucket"
                  placeholder="Find a bucket on any node…"
                  @select="pickSearchHit"
                />
              </div>
            </div>

            <template v-if="sourceBucket">
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="font-medium text-foreground">Browsing</span>
                <span class="font-mono">{{ sourceBucket }}</span>
                <Badge v-if="sourceNodeId" variant="outline" class="text-[10px]" :title="sourceNodeId">
                  on {{ realmNodes.displayName(sourceNodeId) }}
                </Badge>
                <div class="ml-auto flex items-center gap-1.5">
                  <label class="text-[11px] text-muted-foreground">Add as</label>
                  <Select v-model="otherDefaultMode" :options="OTHER_MODE_OPTIONS" class="h-8 w-36 text-xs" />
                </div>
              </div>
              <ObjectBrowserPanel :bucket="sourceBucket" :node-id="sourceNodeId" selectable @add="addOtherSelection" />
            </template>

            <section v-if="otherRows.length" class="overflow-hidden rounded-md border border-border">
              <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-2">
                <div class="flex items-center gap-2">
                  <ArrowLeftRight class="h-4 w-4 text-primary" />
                  <h3 class="text-sm font-semibold text-foreground">Imports</h3>
                  <Badge variant="outline">{{ otherRows.length }}</Badge>
                </div>
                <Button
                  size="sm"
                  :disabled="!otherPendingCount || otherBusy || writesDisabled"
                  :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                  @click="createOtherRelationships"
                >
                  <Loader2 v-if="otherBusy" class="h-3.5 w-3.5 animate-spin" />
                  Import {{ otherPendingCount || '' }}
                </Button>
              </header>
              <ul class="divide-y divide-border">
                <li v-for="row in otherRows" :key="row.id" class="space-y-1 px-3 py-2">
                  <div class="flex items-center gap-2 text-xs">
                    <Badge v-if="row.isPrefix" variant="outline" class="shrink-0 text-[10px] uppercase">folder</Badge>
                    <span class="min-w-0 truncate font-mono" :title="`${row.bucket}/${row.sourcePrefix}`">
                      {{ row.bucket }}/{{ row.sourcePrefix }}
                    </span>
                    <Badge v-if="row.nodeId" variant="outline" class="shrink-0 text-[10px]" :title="row.nodeId">
                      on {{ realmNodes.displayName(row.nodeId) }}
                    </Badge>
                    <div class="ml-auto flex shrink-0 items-center gap-1.5">
                      <Select
                        v-if="row.state === 'ready' || row.state === 'error'"
                        :model-value="row.mode"
                        :options="OTHER_MODE_OPTIONS"
                        class="h-7 w-32 text-xs"
                        :aria-label="`Import mode for ${row.sourcePrefix}`"
                        @update:model-value="(v: string) => (row.mode = v as OtherMode)"
                      />
                      <Badge v-else variant="outline" class="text-[10px]">{{ row.mode === 'once' ? 'Copy (once)' : 'Reference' }}</Badge>
                      <Loader2 v-if="row.state === 'creating'" class="h-3.5 w-3.5 animate-spin text-primary" />
                      <Badge v-else-if="row.state === 'done'" variant="success" class="text-[10px] uppercase">done</Badge>
                      <Badge v-else-if="row.state === 'error'" variant="destructive" class="text-[10px] uppercase">failed</Badge>
                      <Button
                        v-if="row.state !== 'creating'"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove import"
                        @click="removeOtherRow(row.id)"
                      >
                        <X class="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p class="truncate text-[10px] text-muted-foreground" :title="`${bucket}/${otherTargetPrefix(row)}`">
                    into {{ bucket }}/{{ otherTargetPrefix(row) }}
                  </p>
                  <p v-if="row.error" class="text-[10px] text-destructive">{{ row.error }}</p>
                </li>
              </ul>
              <p class="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
                Each import becomes a sync relationship; created ones appear under the bucket's sync status.
              </p>
            </section>
          </TabsContent>
        </Tabs>

        <!-- Basket -->
        <section class="overflow-hidden rounded-md border border-border">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-2">
            <div class="flex items-center gap-2">
              <FolderInput class="h-4 w-4 text-primary" />
              <h3 class="text-sm font-semibold text-foreground">Basket</h3>
              <Badge variant="outline">{{ basket.summary.value.total }}</Badge>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span v-if="basket.summary.value.ready">{{ basket.summary.value.ready }} ready</span>
              <span v-if="basket.summary.value.blocked" class="text-amber-700 dark:text-amber-400">{{ basket.summary.value.blocked }} blocked</span>
              <span v-if="basket.summary.value.submitting" class="text-primary">{{ basket.summary.value.submitting }} running</span>
              <span v-if="basket.summary.value.done" class="text-emerald-700 dark:text-emerald-400">{{ basket.summary.value.done }} done</span>
              <span v-if="basket.summary.value.error" class="text-destructive">{{ basket.summary.value.error }} failed</span>
              <Button v-if="basket.summary.value.done" variant="ghost" size="sm" @click="basket.clearDone">Clear done</Button>
            </div>
          </header>
          <div v-if="!basket.rows.value.length" class="px-4 py-8 text-center text-xs text-muted-foreground">
            The basket is empty. Add files or connector sources from the tabs above.
          </div>
          <table v-else class="w-full text-sm">
            <thead class="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th class="px-3 py-1.5 text-left font-semibold">Source</th>
                <th class="px-3 py-1.5 text-left font-semibold">Target key</th>
                <th class="px-3 py-1.5 text-left font-semibold">State</th>
                <th class="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in basket.rows.value" :key="row.id" class="border-t border-border align-top">
                <td class="px-3 py-2">
                  <div class="flex items-center gap-2">
                    <Badge variant="secondary" class="text-[10px] uppercase">{{ kindLabel[row.sourceKind] }}</Badge>
                    <Badge v-if="row.isPrefix" variant="outline" class="text-[10px] uppercase">folder</Badge>
                    <span class="min-w-0 truncate font-mono text-xs" :title="row.source">{{ row.source }}</span>
                  </div>
                  <Select
                    v-if="row.strategy && rowEditable(row)"
                    :model-value="row.strategy"
                    :options="STRATEGY_OPTIONS"
                    class="mt-1 h-7 w-56 text-[10px]"
                    :aria-label="`Staging strategy for ${row.source}`"
                    @update:model-value="(value: string) => (row.strategy = value as 'snapshot' | 'reference')"
                  />
                  <span v-else-if="row.strategy" class="text-[10px] text-muted-foreground">{{ row.strategy }}</span>
                  <span v-else-if="row.size !== null" class="text-[10px] text-muted-foreground">{{ formatBytes(row.size) }}</span>
                </td>
                <td class="px-3 py-2">
                  <Input
                    :model-value="row.targetKey"
                    :disabled="!rowEditable(row)"
                    class="h-8 font-mono text-xs"
                    @update:model-value="(v: string | number) => basket.editKey(row.id, String(v))"
                  />
                  <p v-if="rowOverwrites(row)" class="mt-1 flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                    <AlertTriangle class="h-3 w-3 shrink-0" /> Overwrites existing object
                  </p>
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-2">
                    <Loader2 v-if="row.state === 'submitting'" class="h-3 w-3 shrink-0 animate-spin text-primary" />
                    <Badge :variant="stateVariant(row.state)" class="text-[10px] uppercase">{{ row.state }}</Badge>
                    <Progress
                      v-if="row.state === 'submitting'"
                      :value="row.progress"
                      :indeterminate="row.sourceKind !== 'upload' && row.progressTotal == null"
                      :warn="101"
                      :critical="101"
                      class="h-1.5 w-16"
                    />
                  </div>
                  <p v-if="row.state === 'submitting' && row.phase" class="mt-1 text-[10px] text-muted-foreground">
                    {{ row.phase }}
                    <template v-if="row.progressTotal != null">
                      · {{ row.progressUnit === 'bytes' ? formatBytes(row.progressCurrent ?? 0) : row.progressCurrent }}
                      / {{ row.progressUnit === 'bytes' ? formatBytes(row.progressTotal) : row.progressTotal }}
                    </template>
                    <span v-if="row.currentPath" class="block truncate font-mono" :title="row.currentPath">{{ row.currentPath }}</span>
                  </p>
                  <p v-if="row.blockedReason && row.state === 'blocked'" class="mt-1 text-[10px] text-amber-700 dark:text-amber-400">{{ row.blockedReason }}</p>
                  <p v-if="row.error" class="mt-1 text-[10px] text-destructive">{{ row.error }}</p>
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center justify-end gap-1">
                    <Button
                      v-if="row.state === 'error' || row.state === 'blocked'"
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2"
                      @click="basket.retryRow(row.id)"
                    >Retry</Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove" @click="basket.removeRow(row.id)"><X class="size-3.5" /></Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Advisory quota precheck (same rules as the old toolbar upload). -->
        <div v-if="precheck" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          <p
            v-if="precheck.projected.state === 'over-ceiling'"
            class="text-destructive"
          >
            These uploads add <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
            <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>, past the hard cap of
            <strong>{{ formatBytes(precheck.projected.ceilingBytes ?? 0) }}</strong>; the node rejects writes above it with <code>QuotaExceeded</code>.
          </p>
          <p v-else class="text-amber-800 dark:text-amber-300">
            These uploads add <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
            <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong>, past the quota of
            <strong>{{ formatBytes(precheck.projected.quotaBytes ?? 0) }}</strong> into the grace headroom.
          </p>
          <p class="mt-1 text-muted-foreground">Counters on remote nodes can lag, so these numbers are approximate. The check is advisory; you can still submit.</p>
          <div class="mt-2 flex items-center gap-2">
            <Button size="sm" @click="confirmPrecheckSubmit">Submit anyway</Button>
            <Button variant="ghost" size="sm" @click="precheck = null">Cancel</Button>
          </div>
        </div>
      </div>

      <DialogFooter class="sm:justify-between">
        <DialogClose as-child><Button variant="outline">Close</Button></DialogClose>
        <Button
          :disabled="!basket.canSubmit.value || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          @click="submitAll"
        >
          <RefreshCw v-if="basket.busy.value" class="h-4 w-4 animate-spin" /><CloudDownload v-else class="h-4 w-4" />
          Submit {{ basket.summary.value.ready || '' }}
        </Button>
      </DialogFooter>

      <ConnectorDialog v-model:open="registerOpen" :group-id="groupSel" @saved="onConnectorSaved" />
    </DialogContent>
  </Dialog>
</template>
