<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EditMetadataDialog from '@/components/metadata/EditMetadataDialog.vue'
import RunProvenancePanel from '@/components/metadata/RunProvenancePanel.vue'
import AuthorChips from '@/components/metadata/AuthorChips.vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import WatchButton from '@/components/watches/WatchButton.vue'
import { computed, ref, watch } from 'vue'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { CrateNotReadyError, readableIri, useAruna } from '@/composables/useAruna'
import { useS3 } from '@/composables/useS3'
import { ApiError, type MetadataDocumentSummary } from '@/lib/api'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { formatBytes, relativeTime } from '@/lib/utils'
import { metaWatchPathPrefix } from '@/lib/watches'
import { parseRunCrate } from '@/lib/runCrate'
import { crateGraph, crateRootId, dataEntitiesOf, stringProp, type DataEntity } from '@/lib/dataEntities'
import { useCrateReferences } from '@/composables/useCrateReferences'
import type { CrateObjectReference } from '@/lib/crateReferences'
import { ArrowLeft, ListChecks, Code2, Eye, FileJson2, ExternalLink, Link2, Pencil, Trash2, Star } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const s3 = useS3()
const {
  metadata,
  metadataItems,
  profiles,
  currentUser,
  userInfo,
  bootstrapped,
  saving,
  loadRoCrate,
  loadMetadata,
  getMetadataDocument,
  deleteMetadataDocument,
  toggleFavourite,
  fullCrates,
  cratePending,
} = useAruna()

const isFav = computed(() => Boolean(currentUser.value?.favouriteMetadataIds?.includes(detailId.value)))
const favBusy = ref(false)
async function toggleFav() {
  if (favBusy.value) return
  favBusy.value = true
  try {
    await toggleFavourite(detailId.value)
  } catch (err) {
    reportGlobalError(err instanceof Error ? err.message : String(err))
  } finally {
    favBusy.value = false
  }
}

const showEdit = ref(false)
const showDelete = ref(false)
const deleteError = ref<string | null>(null)
// The document's S3 key path, for the delete confirmation copy.
const currentPath = computed(
  () => metadataItems.value.find((i) => i.document_id === detailId.value)?.document_path ?? fetchedSummary.value?.document_path ?? '',
)

async function confirmDelete() {
  if (!current.value) return
  deleteError.value = null
  try {
    await deleteMetadataDocument(current.value.ulid)
    showDelete.value = false
    router.push({ name: 'search' })
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : String(err)
  }
}
// The owning group_id is the document's realmId (see mapMetadataDoc). Membership
// is a UI heuristic; the backend still enforces write permission (a 403 surfaces
// inside the edit dialog).
const canWrite = computed(() => Boolean(userInfo.value?.groups.some((g) => g.group_id === current.value?.realmId)))

// Canonical metadata watch prefix for this document; empty until the owning
// group and document path are both known.
const watchPathPrefix = computed(() => {
  const groupId = current.value?.realmId ?? fetchedSummary.value?.group_id
  if (!groupId || !currentPath.value) return ''
  return metaWatchPathPrefix(groupId, currentPath.value)
})

async function onSaved() {
  await fetchCrate(detailId.value)
}

const showCrate = ref(false)
const loadingCrate = ref(false)
const crateNotReady = ref(false)
const crateError = ref<string | null>(null)

// Honest per-document resolution: the catalog list is not authoritative (it can
// be stale after a create, and a missing id there is indistinguishable from a
// private/deleted document), so we fall back to GET /metadata/{id}.
const docState = ref<'loading' | 'found' | 'not-found' | 'forbidden' | 'error'>('loading')
const docError = ref<string | null>(null)
const fetchedSummary = ref<MetadataDocumentSummary | null>(null)

const detailId = computed(() => (route.params.id as string) || '')
const current = computed(() => metadata.value.find((doc) => doc.ulid === detailId.value))
// Reconcile the two independent v-if chains: once the doc resolves via the
// catalog (e.g. a retry after a transient error repopulates `metadata`), flip
// docState to 'found' so a stale error/not-found/forbidden panel can't render
// alongside the rich article.
watch(current, (c) => {
  if (c && docState.value !== 'found') docState.value = 'found'
})
const currentCrate = computed(() => fullCrates.value[detailId.value] ?? current.value?.roCrate ?? {})
const currentProfile = computed(() => profiles.value.find((profile) => profile.id === current.value?.profileId))
// When no local profile resolves, fall back to the first raw conformsTo IRI so an external
// profile association stays visible instead of reading "No profile".
const conformsIri = computed(() => (currentProfile.value ? '' : current.value?.conformsToIds?.[0] ?? ''))
const profileName = computed(() => currentProfile.value?.name ?? (conformsIri.value ? readableIri(conformsIri.value) : 'No profile'))
const profileShortName = computed(() => currentProfile.value?.shortName ?? (conformsIri.value ? readableIri(conformsIri.value) : 'No profile'))

let crateFetchToken = 0

async function fetchCrate(id: string) {
  const token = ++crateFetchToken
  crateError.value = null
  crateNotReady.value = false
  loadingCrate.value = true
  try {
    await loadRoCrate(id)
  } catch (err) {
    if (token !== crateFetchToken) return
    if (err instanceof CrateNotReadyError) crateNotReady.value = true
    else crateError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (token === crateFetchToken) loadingCrate.value = false
  }
}

let resolveToken = 0

async function resolveDoc(id: string) {
  const token = ++resolveToken
  docError.value = null
  fetchedSummary.value = null
  docState.value = 'loading'
  if (!id) return
  // Already in the catalog: render the rich article and fetch its crate.
  if (metadata.value.some((doc) => doc.ulid === id)) {
    docState.value = 'found'
    await fetchCrate(id)
    return
  }
  // Otherwise ask the backend directly so we can tell missing/private/error
  // apart from a merely stale catalog list.
  try {
    const summary = await getMetadataDocument(id)
    if (token !== resolveToken) return
    fetchedSummary.value = summary
    // The list may be stale right after a create; refresh so the rich article
    // can appear. A failing refresh must not flip us out of 'found'.
    await loadMetadata().catch(() => undefined)
    if (token !== resolveToken) return
    docState.value = 'found'
    await fetchCrate(id)
  } catch (err) {
    if (token !== resolveToken) return
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) docState.value = 'not-found'
    else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) docState.value = 'forbidden'
    else {
      docState.value = 'error'
      docError.value = err instanceof Error ? err.message : String(err)
    }
  }
}

watch(
  // Wait for the initial bootstrap before deciding — the catalog list is empty
  // during the very first load, so an unknown id must not read as not-found.
  [detailId, bootstrapped],
  async ([id, ready]) => {
    showCrate.value = false
    crateError.value = null
    crateNotReady.value = false
    if (!id || !ready) {
      docState.value = 'loading'
      return
    }
    await resolveDoc(id)
  },
  { immediate: true },
)

// The union of entities referenced from the root's hasPart and every File/Dataset
// entity (excluding the root and the metadata descriptor), shared with the editor.
const dataEntities = computed<DataEntity[]>(() =>
  dataEntitiesOf(fullCrates.value[detailId.value] ?? current.value?.roCrate),
)

// Which OTHER catalog documents reference each file entity here, from the cache-fed
// reverse index (keyed by the row's @id, so self-references are dropped).
const { referencesFor } = useCrateReferences()
const referencedBy = computed(() => {
  const map = new Map<string, CrateObjectReference[]>()
  for (const row of dataEntities.value) {
    const seen = new Set<string>()
    const refs: CrateObjectReference[] = []
    for (const url of [row.id, row.contentUrl]) {
      if (!url) continue
      for (const ref of referencesFor(url)) {
        if (ref.documentId === detailId.value || seen.has(ref.documentId)) continue
        seen.add(ref.documentId)
        refs.push(ref)
      }
    }
    if (refs.length) map.set(row.id, refs)
  }
  return map
})

// A compute run crate (written by the backend at runs/{jobId}) parses into a
// provenance model; anything else — including a runs/ document whose expected
// CreateAction is missing — renders the generic data-entity table below.
const runProvenance = computed(() => parseRunCrate(currentCrate.value, currentPath.value))

// While the displayed run is still executing, silently re-fetch its crate so
// provenance grows live (no loading flag — the article must not flicker).
const runActive = computed(() => {
  const run = runProvenance.value
  if (!run) return false
  return run.actionStatus !== 'CompletedActionStatus' && run.actionStatus !== 'FailedActionStatus'
})
const crateVisibility = useDocumentVisibility()
useIntervalFn(() => {
  if (crateVisibility.value !== 'visible') return
  if (!runActive.value || !detailId.value || loadingCrate.value) return
  void loadRoCrate(detailId.value).catch(() => undefined)
}, 12_000)

function entityLink(row: DataEntity): string | undefined {
  const target = row.contentUrl ?? row.id
  return target.startsWith('http') ? target : undefined
}

function s3RefOf(id: string): { bucket: string; key: string } | null {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(id)
  return match ? { bucket: match[1] as string, key: match[2] as string } : null
}

// Profile artifacts carry a content-addressed W3ID as @id and the real S3
// location in contentUrl, so the preview target prefers contentUrl.
function previewRef(row: DataEntity): { bucket: string; key: string } | null {
  return (row.contentUrl ? s3RefOf(row.contentUrl) : null) ?? s3RefOf(row.id)
}

function canPreview(row: DataEntity): boolean {
  return Boolean(s3.hasActiveKey.value && s3.endpoint.value && previewRef(row))
}

const previewOpen = ref(false)
const previewTarget = ref<{ bucket: string; key: string; name: string; size?: number; contentType?: string } | null>(null)

function openPreview(row: DataEntity) {
  const parsed = previewRef(row)
  if (!parsed) return
  const bytes = Number(row.contentSize)
  previewTarget.value = {
    bucket: parsed.bucket,
    key: parsed.key,
    name: row.name,
    size: row.contentSize && Number.isFinite(bytes) ? bytes : undefined,
    contentType: row.encodingFormat,
  }
  previewOpen.value = true
}

// Cross-document references from the root's mentions/citation/about, split
// into in-portal links (a catalog document's graph IRI or document id) and
// plain external IRIs.
interface RelatedDocRow {
  iri: string
  label: string
  documentId?: string
}
const relatedDocs = computed<RelatedDocRow[]>(() => {
  const crate = fullCrates.value[detailId.value] ?? current.value?.roCrate
  const g = crateGraph(crate)
  if (!g.length) return []
  const rootId = crateRootId(crate)
  const root = rootId ? g.find((e) => e['@id'] === rootId) : undefined
  if (!root) return []
  const rows: RelatedDocRow[] = []
  const seen = new Set<string>()
  for (const property of ['mentions', 'citation', 'about'] as const) {
    const refs = root[property]
    for (const ref of Array.isArray(refs) ? refs : refs ? [refs] : []) {
      const iri = stringProp(ref)
      if (!iri || seen.has(iri)) continue
      seen.add(iri)
      const item = metadataItems.value.find((entry) => entry.graph_iri === iri || entry.document_id === iri)
      const entity = g.find((e) => e['@id'] === iri)
      const catalogDoc = item ? metadata.value.find((doc) => doc.ulid === item.document_id) : undefined
      rows.push({
        iri,
        documentId: item?.document_id,
        label: catalogDoc?.title || stringProp(entity?.name) || item?.document_path || iri,
      })
    }
  }
  return rows
})

function entitySize(row: DataEntity): string {
  if (!row.contentSize) return '-'
  const n = Number(row.contentSize)
  return row.contentSize.trim() !== '' && Number.isFinite(n) ? formatBytes(n) : row.contentSize
}
</script>

<template>
  <div>
    <PageHeader
      :title="current ? current.title : fetchedSummary ? fetchedSummary.document_path : 'Metadata'"
      :description="current ? `${profileName} · ${current.ulid}` : fetchedSummary ? fetchedSummary.document_id : 'Live RO-Crate metadata document.'"
    >
      <template #actions>
        <Button
          v-if="current && currentUser"
          variant="outline"
          size="icon"
          :disabled="favBusy"
          :aria-label="isFav ? 'Remove from favourites' : 'Add to favourites'"
          @click="toggleFav"
        >
          <Star class="h-4 w-4" :class="isFav ? 'text-amber-500' : ''" :fill="isFav ? 'currentColor' : 'none'" />
        </Button>
        <WatchButton
          v-if="watchPathPrefix"
          :path-prefix="watchPathPrefix"
          event-kind="metadata_created"
          :resource-label="currentPath"
        />
        <Button v-if="current && canWrite" variant="outline" @click="showEdit = true"><Pencil class="h-4 w-4" /> Edit</Button>
        <Button v-if="current && canWrite" variant="outline" class="text-destructive hover:text-destructive" @click="deleteError = null; showDelete = true"><Trash2 class="h-4 w-4" /> Delete</Button>
        <RouterLink :to="{ name: 'search' }">
          <Button variant="outline"><ArrowLeft class="h-4 w-4" /> Discover</Button>
        </RouterLink>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <template v-if="current">
        <article class="surface p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <RouterLink v-if="currentProfile" :to="{ name: 'profile-detail', params: { profileId: currentProfile.id } }" class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:opacity-80">
                <ListChecks class="h-3 w-3" /> {{ currentProfile.name }}
              </RouterLink>
              <span v-else-if="conformsIri" class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary" :title="conformsIri">
                <ListChecks class="h-3 w-3" /> {{ profileName }}
              </span>
              <h1 class="mt-3 font-display text-2xl font-semibold tracking-tight text-aruna-navy">{{ current.title }}</h1>
              <p class="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/85">{{ current.description || 'No description in RO-Crate summary.' }}</p>
              <div class="mt-4 flex flex-wrap gap-1.5">
                <span v-for="keyword in current.keywords" :key="keyword" class="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80">#{{ keyword }}</span>
              </div>
              <AuthorChips :crate="currentCrate" class="mt-4" />
            </div>
            <Badge variant="secondary">{{ relativeTime(current.updatedAt) }}</Badge>
          </div>

          <dl class="mt-6 grid gap-3 sm:grid-cols-4">
            <div class="surface-muted p-3">
              <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Document ID</dt>
              <dd class="mt-1 break-all font-mono text-[11px] text-foreground">{{ current.ulid }}</dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Profile</dt>
              <dd class="mt-1 break-all text-sm font-medium text-foreground" :title="conformsIri || undefined">{{ profileShortName }}</dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">License</dt>
              <dd class="mt-1 truncate text-sm">
                <a v-if="current.license" :href="current.license" target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-medium text-primary hover:underline">License <ExternalLink class="h-3 w-3" /></a>
                <span v-else class="text-muted-foreground">Not set</span>
              </dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Updated</dt>
              <dd class="mt-1 text-sm font-medium text-foreground">{{ relativeTime(current.updatedAt) }}</dd>
            </div>
          </dl>
        </article>
      </template>

      <!-- Resolved directly but not (yet) in the catalog listing: registry summary. -->
      <article v-else-if="docState === 'found' && fetchedSummary" class="surface p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h1 class="break-all font-display text-xl font-semibold tracking-tight text-aruna-navy">{{ fetchedSummary.document_path }}</h1>
            <p class="mt-2 text-sm text-muted-foreground">Showing this document's registry summary; it is not in the catalog listing yet.</p>
          </div>
          <Badge :variant="fetchedSummary.public ? 'success' : 'secondary'" class="text-[10px] uppercase">{{ fetchedSummary.public ? 'public' : 'private' }}</Badge>
        </div>
        <dl class="mt-6 grid gap-3 sm:grid-cols-4">
          <div class="surface-muted p-3">
            <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Document ID</dt>
            <dd class="mt-1 break-all font-mono text-[11px] text-foreground">{{ fetchedSummary.document_id }}</dd>
          </div>
          <div class="surface-muted p-3">
            <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Group</dt>
            <dd class="mt-1 break-all font-mono text-[11px] text-foreground">{{ fetchedSummary.group_id }}</dd>
          </div>
          <div class="surface-muted p-3">
            <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Created</dt>
            <dd class="mt-1 text-sm font-medium text-foreground">{{ relativeTime(fetchedSummary.created_at) }}</dd>
          </div>
          <div class="surface-muted p-3">
            <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Updated</dt>
            <dd class="mt-1 text-sm font-medium text-foreground">{{ relativeTime(fetchedSummary.updated_at) }}</dd>
          </div>
        </dl>
      </article>

      <!-- Crate + referenced data for any resolved document (keyed on detailId). -->
      <template v-if="docState === 'found'">
        <section class="surface p-4">
          <button type="button" class="flex w-full items-center justify-between text-sm font-medium text-foreground/80 hover:text-foreground" @click="showCrate = !showCrate">
            <span class="inline-flex items-center gap-2"><Code2 class="h-3.5 w-3.5 text-muted-foreground" /> RO-Crate JSON-LD</span>
            <span class="text-xs text-muted-foreground">{{ showCrate ? 'hide' : 'show' }}</span>
          </button>
          <div v-if="loadingCrate && cratePending[detailId]" class="mt-3 text-xs text-muted-foreground">Preparing the crate…</div>
          <div v-else-if="loadingCrate" class="mt-3 text-xs text-muted-foreground">Loading full RO-Crate…</div>
          <div v-if="crateNotReady" class="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>The crate is still being prepared.</span>
            <Button variant="outline" size="sm" @click="fetchCrate(detailId)">Retry</Button>
          </div>
          <div v-if="crateError" class="mt-3 text-xs text-destructive">{{ crateError }}</div>
          <pre v-if="showCrate" class="mt-3 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-4 font-mono text-[11.5px] leading-relaxed text-foreground/85 scrollbar-thin"><code>{{ JSON.stringify(currentCrate, null, 2) }}</code></pre>
        </section>

        <RunProvenancePanel v-if="runProvenance" :run="runProvenance" />

        <section v-else class="surface overflow-hidden">
          <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
            <FileJson2 class="h-4 w-4 text-primary" /> Referenced data
            <span v-if="dataEntities.length" class="text-xs font-normal text-muted-foreground">{{ dataEntities.length }}</span>
          </div>

          <table v-if="loadingCrate || dataEntities.length" class="w-full text-sm">
            <thead class="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th class="px-5 py-2 text-left font-semibold">Name</th>
                <th class="px-5 py-2 text-left font-semibold">Type</th>
                <th class="px-5 py-2 text-left font-semibold">Format</th>
                <th class="px-5 py-2 text-right font-semibold">Size</th>
                <th class="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              <template v-if="loadingCrate && !dataEntities.length">
                <tr v-for="n in 3" :key="n" class="border-t border-border">
                  <td class="px-5 py-2.5"><Skeleton class="h-4 w-40" /></td>
                  <td class="px-5 py-2.5"><Skeleton class="h-4 w-16" /></td>
                  <td class="px-5 py-2.5"><Skeleton class="h-4 w-20" /></td>
                  <td class="px-5 py-2.5"><Skeleton class="ml-auto h-4 w-12" /></td>
                  <td class="px-5 py-2.5"></td>
                </tr>
              </template>
              <tr
                v-for="row in dataEntities"
                v-else
                :key="row.id"
                class="border-t border-border"
                :class="canPreview(row) ? 'cursor-pointer hover:bg-muted/30' : ''"
                @click="canPreview(row) && openPreview(row)"
              >
                <td class="px-5 py-2.5 font-medium text-foreground" :title="row.id">
                  {{ row.name }}
                  <span v-if="referencedBy.get(row.id)?.length" class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-normal text-muted-foreground">
                    <Link2 class="h-3 w-3 shrink-0" /> Referenced by
                    <template v-for="(ref, i) in referencedBy.get(row.id) ?? []" :key="ref.documentId">
                      <RouterLink :to="{ name: 'metadata-detail', params: { id: ref.documentId } }" class="text-primary hover:underline">{{ ref.title }}</RouterLink><span v-if="i < (referencedBy.get(row.id)?.length ?? 0) - 1">,</span>
                    </template>
                  </span>
                </td>
                <td class="px-5 py-2.5 text-muted-foreground">{{ row.types.join(', ') || '-' }}</td>
                <td class="px-5 py-2.5 text-muted-foreground">{{ row.encodingFormat || '-' }}</td>
                <td class="px-5 py-2.5 text-right font-mono text-xs text-muted-foreground">{{ entitySize(row) }}</td>
                <td class="px-5 py-2.5 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <Button v-if="canPreview(row)" variant="ghost" size="icon-sm" aria-label="Preview" @click.stop="openPreview(row)">
                      <Eye class="size-3.5" />
                    </Button>
                    <a v-if="entityLink(row)" :href="entityLink(row)" target="_blank" rel="noopener" class="inline-flex text-primary hover:opacity-80" :aria-label="`Open ${row.name} in a new tab`" @click.stop>
                      <ExternalLink class="h-3.5 w-3.5" />
                    </a>
                    <span v-if="!canPreview(row) && !entityLink(row)" class="text-muted-foreground">-</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="crateNotReady" class="flex items-center gap-3 px-5 py-4 text-xs text-muted-foreground">
            <span>The crate is still being prepared.</span>
            <Button variant="outline" size="sm" @click="fetchCrate(detailId)">Retry</Button>
          </div>
          <p v-else-if="!loadingCrate && !dataEntities.length" class="px-5 py-6 text-xs text-muted-foreground">
            This document does not reference any data files. Files can be attached by editing the crate.
          </p>
        </section>

        <section v-if="relatedDocs.length" class="surface overflow-hidden">
          <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
            <Link2 class="h-4 w-4 text-primary" /> Related datasets
            <span class="text-xs font-normal text-muted-foreground">{{ relatedDocs.length }}</span>
          </div>
          <ul class="divide-y divide-border">
            <li v-for="row in relatedDocs" :key="row.iri" class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <RouterLink
                v-if="row.documentId"
                :to="{ name: 'metadata-detail', params: { id: row.documentId } }"
                class="min-w-0 truncate font-medium text-primary hover:underline"
                :title="row.iri"
              >
                {{ row.label }}
              </RouterLink>
              <a
                v-else-if="row.iri.startsWith('http')"
                :href="row.iri"
                target="_blank"
                rel="noopener"
                class="inline-flex min-w-0 items-center gap-1 truncate text-primary hover:underline"
                :title="row.iri"
              >
                {{ row.label }} <ExternalLink class="h-3 w-3 shrink-0" />
              </a>
              <span v-else class="min-w-0 truncate text-muted-foreground" :title="row.iri">{{ row.label }}</span>
              <Badge variant="outline" class="shrink-0 text-[10px] uppercase">{{ row.documentId ? 'in portal' : 'external' }}</Badge>
            </li>
          </ul>
        </section>
      </template>

      <div v-else-if="docState === 'loading'" class="surface p-12 text-center text-sm text-muted-foreground">
        Loading metadata…
      </div>

      <div v-else-if="docState === 'not-found'" class="surface px-5 py-12 text-center">
        <p class="text-sm font-medium text-foreground">This metadata document does not exist (or has been deleted).</p>
        <p class="mx-auto mt-2 max-w-md break-all font-mono text-xs text-muted-foreground">{{ detailId }}</p>
        <RouterLink :to="{ name: 'search' }" class="mt-5 inline-flex">
          <Button variant="outline"><ArrowLeft class="h-4 w-4" /> Discover</Button>
        </RouterLink>
      </div>

      <div v-else-if="docState === 'forbidden'" class="surface px-5 py-12 text-center">
        <p class="text-sm font-medium text-foreground">This document is not public.</p>
        <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {{ currentUser ? 'Sign in with an account that can see it.' : 'Sign in with an account that can see it, using the button in the top bar.' }}
        </p>
        <RouterLink :to="{ name: 'search' }" class="mt-5 inline-flex">
          <Button variant="outline"><ArrowLeft class="h-4 w-4" /> Discover</Button>
        </RouterLink>
      </div>

      <ErrorPanel
        v-else-if="docState === 'error'"
        :message="docError ?? 'Failed to load this document.'"
        @retry="resolveDoc(detailId)"
      />
    </div>

    <PreviewPane
      v-if="previewTarget"
      v-model:open="previewOpen"
      :bucket="previewTarget.bucket"
      :object-key="previewTarget.key"
      :name="previewTarget.name"
      :size="previewTarget.size"
      :content-type="previewTarget.contentType"
    />

    <EditMetadataDialog v-if="current" v-model:open="showEdit" :document-id="current.ulid" :profile="currentProfile" @saved="onSaved" />

    <Dialog :open="showDelete" @update:open="(v: boolean) => (showDelete = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete metadata document</DialogTitle>
          <DialogDescription>
            Deletes <span class="font-medium text-foreground">{{ current?.title }}</span>
            (<span class="font-mono text-xs">{{ currentPath }}</span>) and its graph from the catalog. This removes only the RO-Crate metadata; any S3 objects it references are not touched.
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ deleteError }}</p>
        <DialogFooter>
          <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="saving" @click="confirmDelete">{{ saving ? 'Deleting…' : 'Delete' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
