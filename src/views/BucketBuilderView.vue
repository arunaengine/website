<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import Progress from '@/components/ui/Progress.vue'
import Breadcrumbs from '@/components/data/Breadcrumbs.vue'
import ConnectorDialog from '@/components/groups/ConnectorDialog.vue'
import { useAruna } from '@/composables/useAruna'
import { useS3, type FolderEntry } from '@/composables/useS3'
import { invalidSourcePath } from '@/composables/useStaging'
import { useMetadataSearch } from '@/composables/useMetadataSearch'
import { useBuilderBasket, builderEnabled, type BuilderRow } from '@/composables/useBuilderBasket'
import type { SourceConnectorSummary } from '@/lib/api'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  Boxes,
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

const route = useRoute()
const router = useRouter()
const enabled = builderEnabled()

const { credentials, myGroups, listGroupConnectors, loadRoCrate } = useAruna()
const s3 = useS3()
const { writesDisabled } = useConnectivity()

function routeString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}
function normalizePrefix(value: string): string {
  return value.replace(/^\/+/, '').replace(/\/+$/, '')
}

const bucket = computed(() => routeString(route.params.bucketId))
const prefixInput = ref(normalizePrefix(routeString(route.query.prefix)))
const prefixKey = computed(() => (prefixInput.value ? `${prefixInput.value}/` : ''))

// The bucket namespace is the active credential's group; connector and internal
// staging must target that group (the node 404s a mismatched bucket).
const activeGroupId = computed(
  () => credentials.value.find((c) => c.access_key_id === s3.activeKey.value?.accessKeyId)?.group_id ?? null,
)
const activeGroupName = computed(
  () => myGroups.value.find((group) => group.id === activeGroupId.value)?.name ?? null,
)

const basket = useBuilderBasket({ bucket, prefix: prefixKey, groupId: activeGroupId })

// ── Prefix picker ─────────────────────────────────────────────────────────
const folders = ref<FolderEntry[]>([])
const foldersLoading = ref(false)
let folderSeq = 0
async function loadFolders() {
  if (!s3.hasActiveKey.value || !s3.endpoint.value || !bucket.value) {
    folders.value = []
    return
  }
  const seq = ++folderSeq
  foldersLoading.value = true
  try {
    const page = await s3.listObjects(bucket.value, prefixKey.value)
    if (seq === folderSeq) folders.value = page.folders
  } catch {
    if (seq === folderSeq) folders.value = []
  } finally {
    if (seq === folderSeq) foldersLoading.value = false
  }
}
watch([bucket, prefixKey, () => s3.activeKey.value, () => s3.endpoint.value], loadFolders, { immediate: true })

function descend(folder: FolderEntry) {
  prefixInput.value = normalizePrefix(folder.prefix)
}

// ── Connectors ────────────────────────────────────────────────────────────
const connectors = ref<SourceConnectorSummary[]>([])
const connectorsLoading = ref(false)
const connectorsError = ref<string | null>(null)
const registerOpen = ref(false)
let connectorSeq = 0
async function loadConnectors() {
  const groupId = activeGroupId.value
  if (!groupId) {
    connectors.value = []
    return
  }
  const seq = ++connectorSeq
  connectorsLoading.value = true
  connectorsError.value = null
  try {
    const response = await listGroupConnectors(groupId)
    if (seq !== connectorSeq) return
    connectors.value = response.connectors
  } catch (err) {
    if (seq !== connectorSeq) return
    connectorsError.value = err instanceof Error ? err.message : String(err)
    connectors.value = []
  } finally {
    if (seq === connectorSeq) connectorsLoading.value = false
  }
}
watch(activeGroupId, loadConnectors, { immediate: true })
function onConnectorSaved() {
  void loadConnectors()
}

const arunaNativeConnectors = computed(() => connectors.value.filter((c) => c.kind === 'aruna_native'))
const connectorOptions = computed(() =>
  connectors.value.map((c) => ({ value: c.connector_id, label: `${c.name} (${c.kind})` })),
)
const internalConnectorOptions = computed(() =>
  arunaNativeConnectors.value.map((c) => ({ value: c.connector_id, label: c.name })),
)
const STRATEGY_OPTIONS = [
  { value: 'snapshot', label: 'Snapshot — copy the source into the bucket' },
  { value: 'reference', label: 'Reference — register without copying; read on demand' },
]

// ── Connector pane ────────────────────────────────────────────────────────
const connectorSel = ref('')
const connectorPath = ref('')
const connectorStrategy = ref<'snapshot' | 'reference'>('snapshot')
watch(connectors, () => {
  if (!connectors.value.some((c) => c.connector_id === connectorSel.value)) {
    connectorSel.value = connectors.value[0]?.connector_id ?? ''
  }
})
const connectorPathError = computed(() => connectorPath.value.trim() !== '' && invalidSourcePath(connectorPath.value))
const addConnectorDisabled = computed(
  () => !activeGroupId.value || !connectorSel.value || invalidSourcePath(connectorPath.value),
)
function addConnectorRow() {
  if (addConnectorDisabled.value) return
  const connector = connectors.value.find((c) => c.connector_id === connectorSel.value)
  basket.addStaging('connector', [
    {
      source: connectorPath.value.trim(),
      strategy: connectorStrategy.value,
      groupId: activeGroupId.value ?? '',
      connectorId: connectorSel.value,
      connectorName: connector?.name ?? connectorSel.value,
    },
  ])
  connectorPath.value = ''
}

// ── Internal pane ─────────────────────────────────────────────────────────
const searchQuery = ref('')
const search = useMetadataSearch(searchQuery)
const internalConnectorSel = ref('')
const internalStrategy = ref<'snapshot' | 'reference'>('reference')
watch(arunaNativeConnectors, () => {
  if (!arunaNativeConnectors.value.some((c) => c.connector_id === internalConnectorSel.value)) {
    internalConnectorSel.value = arunaNativeConnectors.value[0]?.connector_id ?? ''
  }
})

interface FileEntity {
  ref: string
  name: string
  encodingFormat?: string
  contentSize?: string
}
function crateGraph(crate: unknown): Array<Record<string, unknown>> {
  if (!crate || typeof crate !== 'object') return []
  const g = (crate as Record<string, unknown>)['@graph']
  return Array.isArray(g)
    ? g.filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object' && !Array.isArray(e)))
    : []
}
function crateRootId(crate: unknown): string | undefined {
  const g = crateGraph(crate)
  const descriptor = g.find((e) => e['@id'] === 'ro-crate-metadata.json')
  const about = descriptor?.about
  if (about && typeof about === 'object' && !Array.isArray(about)) {
    const id = (about as Record<string, unknown>)['@id']
    if (typeof id === 'string') return id
  }
  return g.find((e) => e['@id'] !== 'ro-crate-metadata.json')?.['@id'] as string | undefined
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
  const t = entity['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
}
// Only s3:// file references can be staged through an aruna_native connector;
// external URLs are surfaced by the metadata manager, not the builder.
function fileEntities(crate: unknown): FileEntity[] {
  const g = crateGraph(crate)
  if (!g.length) return []
  const rootId = crateRootId(crate)
  const root = rootId ? g.find((e) => e['@id'] === rootId) : undefined
  const hasPartIds = new Set<string>()
  const hasPart = root?.hasPart
  for (const part of Array.isArray(hasPart) ? hasPart : hasPart ? [hasPart] : []) {
    const id = stringProp(part)
    if (id) hasPartIds.add(id)
  }
  const out: FileEntity[] = []
  const seen = new Set<string>()
  for (const entity of g) {
    const id = typeof entity['@id'] === 'string' ? (entity['@id'] as string) : ''
    if (!id || id === 'ro-crate-metadata.json' || id === rootId || seen.has(id)) continue
    if (!hasPartIds.has(id) && !typesOf(entity).includes('File')) continue
    const reference = stringProp(entity.contentUrl) ?? id
    if (!reference.startsWith('s3://')) continue
    seen.add(id)
    out.push({
      ref: reference,
      name: stringProp(entity.name) || reference.split('/').filter(Boolean).pop() || reference,
      encodingFormat: stringProp(entity.encodingFormat),
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
function addSelected() {
  const groupId = activeGroupId.value
  if (!groupId || !selectedRefs.value.size) return
  const connectorId = internalConnectorSel.value || null
  const connectorName = arunaNativeConnectors.value.find((c) => c.connector_id === connectorId)?.name ?? null
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

// ── Local upload pane ─────────────────────────────────────────────────────
const dragActive = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
function onBrowse(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) basket.addUploads(Array.from(input.files))
  input.value = ''
}
function onDrop(event: DragEvent) {
  dragActive.value = false
  if (writesDisabled.value) return
  const files = event.dataTransfer?.files
  if (files?.length) basket.addUploads(Array.from(files))
}

// ── Basket ────────────────────────────────────────────────────────────────
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
  return row.sourceKind !== 'upload' && (row.state === 'ready' || row.state === 'blocked')
}
function backToBucket() {
  void router.push({ name: 'bucket', params: { bucketId: bucket.value }, query: prefixInput.value ? { prefix: prefixInput.value } : {} })
}
</script>

<template>
  <div v-if="!enabled" class="container py-16">
    <EmptyState title="Builder disabled" description="The bucket builder is turned off for this deployment." />
  </div>
  <div v-else>
    <PageHeader title="Bucket builder" description="Assemble a bucket from internal datasets, source connectors and local files.">
      <template #actions>
        <Button variant="outline" size="sm" @click="backToBucket"><Boxes class="h-4 w-4" /> Back to bucket</Button>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <section v-if="!s3.hasActiveKey.value || !s3.endpoint.value" class="surface p-5 text-sm text-muted-foreground">
        Set up S3 credentials in the bucket browser before using the builder.
      </section>

      <template v-else>
        <!-- Target header + prefix picker -->
        <section class="surface space-y-3 p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2 text-sm">
              <Boxes class="h-4 w-4 shrink-0 text-primary" />
              <span class="font-semibold text-foreground">{{ bucket || 'No bucket' }}</span>
              <Badge v-if="activeGroupName" variant="outline" class="text-[10px]">{{ activeGroupName }}</Badge>
            </div>
            <span class="font-mono text-xs text-muted-foreground">target: {{ bucket }}/{{ prefixKey }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Breadcrumbs :bucket="bucket" :path="prefixInput" @navigate="(p: string) => (prefixInput = p)" />
            <Loader2 v-if="foldersLoading" class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Input v-model="prefixInput" placeholder="prefix/path" class="h-8 max-w-xs font-mono text-xs" />
            <div v-if="folders.length" class="flex flex-wrap gap-1">
              <button
                v-for="folder in folders"
                :key="folder.prefix"
                class="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                @click="descend(folder)"
              >
                <FolderInput class="h-3 w-3" /> {{ folder.name }}
              </button>
            </div>
          </div>
        </section>

        <!-- Source panes -->
        <Tabs default-value="internal">
          <TabsList>
            <TabsTrigger value="internal"><Database class="mr-1 h-3.5 w-3.5" /> Internal</TabsTrigger>
            <TabsTrigger value="connectors"><CloudDownload class="mr-1 h-3.5 w-3.5" /> Connectors</TabsTrigger>
            <TabsTrigger value="upload"><Upload class="mr-1 h-3.5 w-3.5" /> Local upload</TabsTrigger>
          </TabsList>

          <!-- Internal -->
          <TabsContent value="internal" class="space-y-3">
            <div class="surface space-y-3 p-4">
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
                This group has no aruna_native connector, so internal references cannot be staged. Add files to review them; register a connector under Connectors to import.
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
                        <Button size="sm" :disabled="!selectedRefs.size" @click="addSelected">
                          <Plus class="h-3.5 w-3.5" /> Add {{ selectedRefs.size || '' }} to basket
                        </Button>
                      </div>
                    </template>
                  </div>
                </li>
              </ul>
            </div>
          </TabsContent>

          <!-- Connectors -->
          <TabsContent value="connectors" class="space-y-3">
            <div class="surface space-y-3 p-4">
              <p v-if="connectorsLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading connectors…
              </p>
              <p v-else-if="connectorsError" class="text-xs text-destructive">{{ connectorsError }}</p>
              <EmptyState
                v-else-if="!connectors.length"
                title="No source connectors"
                description="Register a source connector to ingest from HTTP, S3, WebDAV, FTP or another Aruna group."
              >
                <Button
                  v-if="activeGroupId"
                  size="sm"
                  :disabled="writesDisabled"
                  :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
                  @click="registerOpen = true"
                >
                  <Plus class="h-3.5 w-3.5" /> Register a connector
                </Button>
              </EmptyState>

              <template v-if="connectors.length">
                <div class="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label class="text-xs font-medium text-foreground">Connector</label>
                    <Select v-model="connectorSel" :options="connectorOptions" placeholder="Select a connector" class="mt-1" />
                  </div>
                  <div>
                    <label class="text-xs font-medium text-foreground">Strategy</label>
                    <Select v-model="connectorStrategy" :options="STRATEGY_OPTIONS" class="mt-1" />
                  </div>
                </div>
                <div>
                  <label class="text-xs font-medium text-foreground">Source path</label>
                  <Input v-model="connectorPath" class="mt-1 font-mono text-xs" placeholder="folder/file.fastq.gz" @keyup.enter="addConnectorRow" />
                  <p v-if="connectorPathError" class="mt-1 text-[11px] text-destructive">
                    Use a relative path without leading '/', backslashes, or '.'/'..' segments.
                  </p>
                </div>
                <div class="flex items-center justify-between">
                  <button class="text-xs text-primary hover:underline" @click="registerOpen = true">Register another connector</button>
                  <Button size="sm" :disabled="addConnectorDisabled" @click="addConnectorRow"><Plus class="h-3.5 w-3.5" /> Add to basket</Button>
                </div>
              </template>
            </div>
          </TabsContent>

          <!-- Local upload -->
          <TabsContent value="upload" class="space-y-3">
            <div
              class="surface border-2 border-dashed p-8 text-center transition-colors"
              :class="dragActive ? 'border-primary bg-primary/5 ring-2 ring-primary ring-offset-2' : 'border-border'"
              @dragover.prevent="dragActive = true"
              @dragleave="dragActive = false"
              @drop.prevent="onDrop"
            >
              <UploadCloud class="mx-auto h-8 w-8 text-muted-foreground" />
              <p class="mt-2 text-sm text-foreground">Drop files here to add them to the basket</p>
              <p class="mt-1 text-xs text-muted-foreground">or</p>
              <input ref="fileInput" type="file" multiple class="hidden" @change="onBrowse" />
              <Button variant="outline" size="sm" class="mt-2" @click="fileInput?.click()">Browse files</Button>
              <p class="mt-3 text-[11px] text-muted-foreground">
                Uploads run up to three at a time and keep going while you navigate. Their target key follows the picked prefix.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <!-- Basket -->
        <section class="surface overflow-hidden">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div class="flex items-center gap-2">
              <FolderInput class="h-4 w-4 text-primary" />
              <h2 class="text-sm font-semibold text-foreground">Basket</h2>
              <Badge variant="outline">{{ basket.summary.value.total }}</Badge>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span v-if="basket.summary.value.ready">{{ basket.summary.value.ready }} ready</span>
              <span v-if="basket.summary.value.blocked" class="text-amber-700 dark:text-amber-400">{{ basket.summary.value.blocked }} blocked</span>
              <span v-if="basket.summary.value.submitting" class="text-primary">{{ basket.summary.value.submitting }} running</span>
              <span v-if="basket.summary.value.done" class="text-emerald-700 dark:text-emerald-400">{{ basket.summary.value.done }} done</span>
              <span v-if="basket.summary.value.error" class="text-destructive">{{ basket.summary.value.error }} failed</span>
              <Button v-if="basket.summary.value.done" variant="ghost" size="sm" @click="basket.clearDone">Clear done</Button>
              <Button size="sm" :disabled="!basket.canSubmit.value" @click="basket.submit">
                <RefreshCw v-if="basket.busy.value" class="h-4 w-4 animate-spin" /><CloudDownload v-else class="h-4 w-4" />
                Submit {{ basket.summary.value.ready || '' }}
              </Button>
            </div>
          </header>

          <div v-if="!basket.rows.value.length" class="px-4 py-10 text-center text-xs text-muted-foreground">
            The basket is empty. Add datasets, connector sources or files from the panes above.
          </div>
          <table v-else class="w-full text-sm">
            <thead class="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th class="px-4 py-2 text-left font-semibold">Source</th>
                <th class="px-4 py-2 text-left font-semibold">Target key</th>
                <th class="px-4 py-2 text-left font-semibold">State</th>
                <th class="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in basket.rows.value" :key="row.id" class="border-t border-border align-top">
                <td class="px-4 py-2.5">
                  <div class="flex items-center gap-2">
                    <Badge variant="secondary" class="text-[10px] uppercase">{{ kindLabel[row.sourceKind] }}</Badge>
                    <span class="min-w-0 truncate font-mono text-xs" :title="row.source">{{ row.source }}</span>
                  </div>
                  <span v-if="row.strategy" class="text-[10px] text-muted-foreground">{{ row.strategy }}</span>
                </td>
                <td class="px-4 py-2.5">
                  <Input
                    :model-value="row.targetKey"
                    :disabled="!rowEditable(row)"
                    class="h-8 font-mono text-xs"
                    @update:model-value="(v: string | number) => basket.editKey(row.id, String(v))"
                  />
                </td>
                <td class="px-4 py-2.5">
                  <div class="flex items-center gap-2">
                    <Loader2 v-if="row.state === 'submitting'" class="h-3 w-3 shrink-0 animate-spin text-primary" />
                    <Badge :variant="stateVariant(row.state)" class="text-[10px] uppercase">{{ row.state }}</Badge>
                    <Progress v-if="row.sourceKind === 'upload' && row.state === 'submitting'" :value="row.progress" :warn="101" :critical="101" class="h-1.5 w-16" />
                  </div>
                  <p v-if="row.blockedReason && row.state === 'blocked'" class="mt-1 text-[10px] text-amber-700 dark:text-amber-400">{{ row.blockedReason }}</p>
                  <p v-if="row.error" class="mt-1 text-[10px] text-destructive">{{ row.error }}</p>
                </td>
                <td class="px-4 py-2.5">
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
      </template>
    </div>

    <ConnectorDialog v-model:open="registerOpen" :group-id="activeGroupId ?? ''" @saved="onConnectorSaved" />
  </div>
</template>
