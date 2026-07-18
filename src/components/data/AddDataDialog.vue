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
import { useAruna } from '@/composables/useAruna'
import { invalidSourcePath } from '@/composables/useStaging'
import { useBuilderBasket, type BuilderRow } from '@/composables/useBuilderBasket'
import { useMetadataSearch } from '@/composables/useMetadataSearch'
import { assessQuota, quotaCountedBytes, type QuotaAssessment } from '@/lib/quota'
import { formatBytes } from '@/lib/utils'
import type { ConnectorEntry, SourceConnectorSummary, UsageResponse } from '@/lib/api'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { computed, ref, watch } from 'vue'
import {
  ArrowRight,
  CloudDownload,
  Database,
  FolderInput,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Upload,
  UploadCloud,
  X,
} from '@lucide/vue'

// The ONE "Add data" entry point: a basket dialog with three sources — local
// files/folders (persistent upload queue), connector entries (batch staging),
// and internal RO-Crate s3:// references — replacing the separate Upload
// button, single-shot ingest tab and the full-page bucket builder.
const props = defineProps<{ open: boolean; bucket: string; prefix: string; groupId: string | null }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'staged'): void
}>()

const { myGroups, listGroupConnectors, loadRoCrate, getGroupUsage } = useAruna()
const { writesDisabled } = useConnectivity()

const basket = useBuilderBasket({
  bucket: computed(() => props.bucket),
  prefix: computed(() => props.prefix),
  groupId: computed(() => props.groupId),
})

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

// ── Connectors (shared by the connector and internal tabs) ──────────────────
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
  { value: 'snapshot', label: 'Snapshot — copy the source into the bucket' },
  { value: 'reference', label: 'Reference — register without copying; read on demand' },
]

// ── Connector tab ───────────────────────────────────────────────────────────
const connectorSel = ref('')
const connectorStrategy = ref<'snapshot' | 'reference'>('snapshot')
// Set when the entries endpoint is absent on this node — the typed source path
// stays available as the fallback.
const entriesUnsupported = ref(false)
const connectorPath = ref('')

watch(connectors, () => {
  if (!connectors.value.some((connector) => connector.connector_id === connectorSel.value)) {
    connectorSel.value = connectors.value[0]?.connector_id ?? ''
  }
})
watch(connectorSel, () => {
  entriesUnsupported.value = false
})

const connectorPathError = computed(() => connectorPath.value.trim() !== '' && invalidSourcePath(connectorPath.value))

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
    ...selection.files.map((entry) => ({ ...base, source: entry.path })),
    ...selection.dirs.map((entry) => ({ ...base, source: `${entry.path.replace(/\/+$/, '')}/`, isPrefix: true })),
  ])
}

function addTypedConnectorPath() {
  if (!groupSel.value || !connectorSel.value || invalidSourcePath(connectorPath.value)) return
  basket.addStaging('connector', [
    {
      source: connectorPath.value.trim(),
      strategy: connectorStrategy.value,
      groupId: groupSel.value,
      connectorId: connectorSel.value,
      connectorName: selectedConnectorName(),
    },
  ])
  connectorPath.value = ''
}

// ── Internal datasets tab (RO-Crate s3:// reference harvesting) ─────────────
const searchQuery = ref('')
const search = useMetadataSearch(searchQuery)
const arunaNativeConnectors = computed(() => connectors.value.filter((connector) => connector.kind === 'aruna_native'))
const internalConnectorOptions = computed(() =>
  arunaNativeConnectors.value.map((connector) => ({ value: connector.connector_id, label: connector.name })),
)
const internalConnectorSel = ref('')
const internalStrategy = ref<'snapshot' | 'reference'>('reference')
watch(arunaNativeConnectors, () => {
  if (!arunaNativeConnectors.value.some((connector) => connector.connector_id === internalConnectorSel.value)) {
    internalConnectorSel.value = arunaNativeConnectors.value[0]?.connector_id ?? ''
  }
})

interface FileEntity {
  ref: string
  name: string
  contentSize?: string
}
function crateGraph(crate: unknown): Array<Record<string, unknown>> {
  if (!crate || typeof crate !== 'object') return []
  const graphValue = (crate as Record<string, unknown>)['@graph']
  return Array.isArray(graphValue)
    ? graphValue.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
    : []
}
function crateRootId(crate: unknown): string | undefined {
  const entries = crateGraph(crate)
  const descriptor = entries.find((entry) => entry['@id'] === 'ro-crate-metadata.json')
  const about = descriptor?.about
  if (about && typeof about === 'object' && !Array.isArray(about)) {
    const id = (about as Record<string, unknown>)['@id']
    if (typeof id === 'string') return id
  }
  return entries.find((entry) => entry['@id'] !== 'ro-crate-metadata.json')?.['@id'] as string | undefined
}
function stringProp(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return stringProp(value[0])
  if (value && typeof value === 'object') {
    const id = (value as Record<string, unknown>)['@id']
    return typeof id === 'string' ? id : undefined
  }
  return undefined
}
function typesOf(entity: Record<string, unknown>): string[] {
  const value = entity['@type']
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  return []
}
// Only s3:// file references can be staged through an aruna_native connector;
// external URLs are surfaced by the metadata manager, not this dialog.
function fileEntities(crate: unknown): FileEntity[] {
  const entries = crateGraph(crate)
  if (!entries.length) return []
  const rootId = crateRootId(crate)
  const root = rootId ? entries.find((entry) => entry['@id'] === rootId) : undefined
  const hasPartIds = new Set<string>()
  const hasPart = root?.hasPart
  for (const part of Array.isArray(hasPart) ? hasPart : hasPart ? [hasPart] : []) {
    const id = stringProp(part)
    if (id) hasPartIds.add(id)
  }
  const out: FileEntity[] = []
  const seen = new Set<string>()
  for (const entity of entries) {
    const id = typeof entity['@id'] === 'string' ? (entity['@id'] as string) : ''
    if (!id || id === 'ro-crate-metadata.json' || id === rootId || seen.has(id)) continue
    if (!hasPartIds.has(id) && !typesOf(entity).includes('File')) continue
    const reference = stringProp(entity.contentUrl) ?? id
    if (!reference.startsWith('s3://')) continue
    seen.add(id)
    out.push({
      ref: reference,
      name: stringProp(entity.name) || reference.split('/').filter(Boolean).pop() || reference,
      contentSize: stringProp(entity.contentSize),
    })
  }
  return out
}

const expandedId = ref<string | null>(null)
const expandedEntities = ref<FileEntity[]>([])
const expandLoading = ref(false)
const expandError = ref<string | null>(null)
const selectedRefs = ref<Set<string>>(new Set())
const crateCache = new Map<string, FileEntity[]>()

async function toggleExpand(documentId: string) {
  if (expandedId.value === documentId) {
    expandedId.value = null
    return
  }
  expandedId.value = documentId
  selectedRefs.value = new Set()
  expandError.value = null
  const cached = crateCache.get(documentId)
  if (cached) {
    expandedEntities.value = cached
    return
  }
  expandLoading.value = true
  expandedEntities.value = []
  try {
    const entities = fileEntities(await loadRoCrate(documentId))
    crateCache.set(documentId, entities)
    if (expandedId.value === documentId) expandedEntities.value = entities
  } catch (err) {
    if (expandedId.value === documentId) expandError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (expandedId.value === documentId) expandLoading.value = false
  }
}
function toggleRef(reference: string) {
  const next = new Set(selectedRefs.value)
  if (next.has(reference)) next.delete(reference)
  else next.add(reference)
  selectedRefs.value = next
}
function addSelectedInternal() {
  const groupId = groupSel.value
  if (!groupId || !selectedRefs.value.size) return
  const connectorId = internalConnectorSel.value || null
  const connectorName = arunaNativeConnectors.value.find((connector) => connector.connector_id === connectorId)?.name ?? null
  const blockedReason = connectorId
    ? undefined
    : 'Register an aruna_native connector in this group to import internal references.'
  basket.addStaging(
    'internal',
    [...selectedRefs.value].map((reference) => ({
      source: reference,
      strategy: internalStrategy.value,
      groupId,
      connectorId,
      connectorName,
      blockedReason,
    })),
  )
  selectedRefs.value = new Set()
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
        : groups[0]?.id ?? ''
    void loadConnectors()
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
          Collect local files, connector sources and internal references in the basket, then submit them into
          <span class="font-mono text-xs">{{ bucket }}/{{ prefix }}</span>.
        </DialogDescription>
      </DialogHeader>

      <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
        <Tabs v-model="tab">
          <TabsList>
            <TabsTrigger value="local"><Upload class="mr-1 h-3.5 w-3.5" /> Local files</TabsTrigger>
            <TabsTrigger value="connector"><CloudDownload class="mr-1 h-3.5 w-3.5" /> From connector</TabsTrigger>
            <TabsTrigger value="internal"><Database class="mr-1 h-3.5 w-3.5" /> Internal datasets</TabsTrigger>
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
                selectable
                @add="addConnectorSelection"
                @unsupported="entriesUnsupported = true"
              />
              <div v-if="entriesUnsupported" class="space-y-2">
                <p class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                  Browsing connector contents is not supported by this node yet — type the source path instead.
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
                </div>
              </div>
              <div class="flex justify-end">
                <button class="text-xs text-primary hover:underline" @click="registerOpen = true">Register another connector</button>
              </div>
            </template>
          </TabsContent>

          <!-- Internal datasets -->
          <TabsContent value="internal" class="space-y-3">
            <div class="relative">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input v-model="searchQuery" placeholder="Search datasets…" class="pl-9" />
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-xs font-medium text-foreground">Stage via (aruna_native)</label>
                <Select
                  v-model="internalConnectorSel"
                  :options="internalConnectorOptions"
                  placeholder="No aruna_native connector"
                  class="mt-1"
                  :disabled="!internalConnectorOptions.length"
                />
              </div>
              <div>
                <label class="text-xs font-medium text-foreground">Strategy</label>
                <Select v-model="internalStrategy" :options="STRATEGY_OPTIONS" class="mt-1" />
              </div>
            </div>
            <p v-if="!arunaNativeConnectors.length" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
              This group has no aruna_native connector, so internal references cannot be staged. Add files to review them; register a connector to import.
            </p>

            <p v-if="search.pending.value" class="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 class="h-3.5 w-3.5 animate-spin" /> Searching…
            </p>
            <p v-else-if="search.error.value" class="text-xs text-destructive">{{ search.error.value }}</p>
            <EmptyState
              v-else-if="search.searched.value && !search.results.value.length"
              title="No datasets"
              description="No datasets match this search."
            />

            <ul v-if="search.results.value.length" class="divide-y divide-border rounded-md border border-border">
              <li v-for="line in search.results.value" :key="line.hit.document_id">
                <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50" @click="toggleExpand(line.hit.document_id)">
                  <Layers class="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span class="min-w-0 flex-1 truncate">{{ line.title || line.hit.document_path }}</span>
                  <ArrowRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" :class="expandedId === line.hit.document_id ? 'rotate-90' : ''" />
                </button>
                <div v-if="expandedId === line.hit.document_id" class="space-y-2 border-t border-border bg-muted/20 px-3 py-2">
                  <p v-if="expandLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading files…
                  </p>
                  <p v-else-if="expandError" class="text-xs text-destructive">{{ expandError }}</p>
                  <p v-else-if="!expandedEntities.length" class="text-xs text-muted-foreground">No s3:// file references in this dataset.</p>
                  <template v-else>
                    <label
                      v-for="entity in expandedEntities"
                      :key="entity.ref"
                      class="flex items-center gap-2 text-xs"
                    >
                      <input type="checkbox" class="accent-primary" :checked="selectedRefs.has(entity.ref)" @change="toggleRef(entity.ref)" />
                      <span class="min-w-0 flex-1 truncate">{{ entity.name }}</span>
                      <span class="shrink-0 font-mono text-[10px] text-muted-foreground">{{ entity.contentSize ?? '' }}</span>
                    </label>
                    <div class="flex justify-end pt-1">
                      <Button size="sm" :disabled="!selectedRefs.size" @click="addSelectedInternal">
                        <Plus class="h-3.5 w-3.5" /> Add {{ selectedRefs.size || '' }} to basket
                      </Button>
                    </div>
                  </template>
                </div>
              </li>
            </ul>
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
            The basket is empty. Add files, connector sources or internal references from the tabs above.
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
                  <span v-if="row.strategy" class="text-[10px] text-muted-foreground">{{ row.strategy }}</span>
                  <span v-else-if="row.size !== null" class="text-[10px] text-muted-foreground">{{ formatBytes(row.size) }}</span>
                </td>
                <td class="px-3 py-2">
                  <Input
                    :model-value="row.targetKey"
                    :disabled="!rowEditable(row)"
                    class="h-8 font-mono text-xs"
                    @update:model-value="(v: string | number) => basket.editKey(row.id, String(v))"
                  />
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-2">
                    <Loader2 v-if="row.state === 'submitting'" class="h-3 w-3 shrink-0 animate-spin text-primary" />
                    <Badge :variant="stateVariant(row.state)" class="text-[10px] uppercase">{{ row.state }}</Badge>
                    <Progress v-if="row.sourceKind === 'upload' && row.state === 'submitting'" :value="row.progress" :warn="101" :critical="101" class="h-1.5 w-16" />
                  </div>
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
            <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong> — past the hard cap of
            <strong>{{ formatBytes(precheck.projected.ceilingBytes ?? 0) }}</strong>; the node rejects writes above it with <code>QuotaExceeded</code>.
          </p>
          <p v-else class="text-amber-800 dark:text-amber-300">
            These uploads add <strong>{{ formatBytes(precheck.totalBytes) }}</strong> to a group already using
            <strong>{{ formatBytes(precheck.current.usedBytes) }}</strong> — past the quota of
            <strong>{{ formatBytes(precheck.projected.quotaBytes ?? 0) }}</strong> into the grace headroom.
          </p>
          <p class="mt-1 text-muted-foreground">Counters on remote nodes can lag, so these numbers are approximate. The check is advisory — you can still submit.</p>
          <div class="mt-2 flex items-center gap-2">
            <Button size="sm" @click="confirmPrecheckSubmit">Submit anyway</Button>
            <Button variant="ghost" size="sm" @click="precheck = null">Cancel</Button>
          </div>
        </div>
      </div>

      <DialogFooter class="sm:justify-between">
        <DialogClose><Button variant="outline">Close</Button></DialogClose>
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
