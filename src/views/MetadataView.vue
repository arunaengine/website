<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EditMetadataDialog from '@/components/metadata/EditMetadataDialog.vue'
import ProfileChip from '@/components/metadata/ProfileChip.vue'
import DetailsSection from '@/components/metadata/DetailsSection.vue'
import PeopleSection from '@/components/metadata/PeopleSection.vue'
import ContextSection from '@/components/metadata/ContextSection.vue'
import CrateImportExport from '@/components/metadata/CrateImportExport.vue'
import CrateTransferDialog from '@/components/metadata/CrateTransferDialog.vue'
import SubcratesSection from '@/components/metadata/SubcratesSection.vue'
import PersistentIdSection from '@/components/metadata/PersistentIdSection.vue'
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
import ExternalLink from '@/components/ui/ExternalLink.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownMenuTrigger from '@/components/ui/DropdownMenuTrigger.vue'
import DropdownMenuContent from '@/components/ui/DropdownMenuContent.vue'
import DropdownMenuItem from '@/components/ui/DropdownMenuItem.vue'
import DropdownMenuLabel from '@/components/ui/DropdownMenuLabel.vue'
import DropdownMenuSeparator from '@/components/ui/DropdownMenuSeparator.vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { CrateNotReadyError, readableIri, useAruna } from '@/composables/useAruna'
import { documentIdFromIri, isDocumentId } from '@/lib/graphIri'
import { useS3 } from '@/composables/useS3'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ApiError, type MetadataDocumentSummary } from '@/lib/api'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { isHttpUrl, relativeTime, truncateMiddle } from '@/lib/utils'
import { metaWatchPathPrefix } from '@/lib/watches'
import { parseRunCrate, runClaimedIds } from '@/lib/runCrate'
import { presentCrate } from '@/lib/cratePresenter'
import { licenseLabelOf } from '@/lib/licenses'
import { crateGraph, crateRootId, dataEntityTreeOf, formatContentSize, stringProp, type DataEntity, type DataEntityNode } from '@/lib/dataEntities'
import { termNameFromUri } from '@/lib/profiles/uri'
import { isProjectCrate, subcrateLinksOf } from '@/lib/subcrates'
import { useCrateReferences } from '@/composables/useCrateReferences'
import type { CrateObjectReference } from '@/lib/crateReferences'
import {
  preflightBacklinks,
  type BacklinkPreflightResponse,
} from '@/lib/backlinks'
import { downloadCrateJson } from '@/lib/crateImport'
import { useJobs } from '@/composables/useJobs'
import { ArrowDownUp, ArrowLeft, ChevronDown, Code2, FileArchive, Folder, Info, ListChecks, Eye, FileJson2, ExternalLink as ExternalLinkIcon, Layers, Link2, Pencil, Trash2, Star, Upload } from '@lucide/vue'
import DataEntityDialog from '@/components/metadata/DataEntityDialog.vue'

const route = useRoute()
const router = useRouter()
const s3 = useS3()
const { hasActiveKey: hasS3Access, endpoint: s3Endpoint } = s3
const { localNodeId, displayName: nodeDisplayName } = useRealmNodes()
const {
  metadata,
  profiles,
  currentUser,
  userInfo,
  bootstrapped,
  saving,
  loadRoCrate,
  getMetadataDocument,
  getMetadataItem,
  deleteMetadataDocument,
  toggleFavourite,
  toMetadataDoc,
  fullCrates,
  cratePending,
  authToken,
  apiBaseUrl,
} = useAruna()

const { jobsEnabled } = useJobs()
const showCrateExport = ref(false)

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
const currentPath = computed(() => fetchedSummary.value?.document_path ?? '')

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
// The owning group_id is the document's realmId (see mapMetadataDoc), with the
// registry summary as fallback so documents not (yet) in the catalog listing
// still expose write actions to group members. Membership is a UI heuristic;
// the backend still enforces write permission (a 403 surfaces inline).
const canWrite = computed(() => {
  const groupId = current.value?.realmId ?? fetchedSummary.value?.group_id
  return Boolean(groupId && userInfo.value?.groups.some((g) => g.group_id === groupId))
})

// Canonical metadata watch prefix for this document; empty until the owning
// group and document path are both known.
const watchPathPrefix = computed(() => {
  const groupId = current.value?.realmId ?? fetchedSummary.value?.group_id
  if (!groupId || !currentPath.value) return ''
  return metaWatchPathPrefix(groupId, currentPath.value)
})

// The edit dialog returns the stored summary; adopt it so visibility and
// timestamps update without another catalog round trip.
async function onSaved(summary?: MetadataDocumentSummary) {
  if (summary) fetchedSummary.value = summary
  await fetchCrate(detailId.value)
}

const loadingCrate = ref(false)
const crateNotReady = ref(false)
const crateError = ref<string | null>(null)

// Honest per-document resolution: the catalog list is not authoritative (it can
// be stale after a create, and a missing id there is indistinguishable from a
// private/deleted document), so we fall back to GET /metadata/{id}.
const docState = ref<'loading' | 'found' | 'preparing' | 'not-found' | 'forbidden' | 'error'>('loading')
const docError = ref<string | null>(null)
const fetchedSummary = ref<MetadataDocumentSummary | null>(null)
const resolvingDoc = ref(false)
const acceptedPreparing = ref(false)

const detailId = computed(() => (route.params.id as string) || '')
// Built from this document's own fetch (registry summary plus its crate), not
// from the catalog listing: the catalog is paged, so most documents are never
// in it. A loaded catalog row only serves as a placeholder until the fetch
// lands, so the header does not flash an empty title.
const current = computed(() => {
  const summary = fetchedSummary.value
  if (!summary) return metadata.value.find((doc) => doc.ulid === detailId.value)
  return toMetadataDoc({ ...summary, rocrate_summary: fullCrates.value[summary.document_id] })
})
const currentCrate = computed(() => fullCrates.value[detailId.value] ?? current.value?.roCrate ?? {})
// Header export/import: export is enabled once the crate has entities; import
// delegates to the crate section's panel (scrolled into view on open).
const crateHasEntities = computed(() => crateGraph(currentCrate.value).length > 0)
const crateSection = ref<InstanceType<typeof CrateImportExport> | null>(null)
const currentProfile = computed(() => profiles.value.find((profile) => profile.id === current.value?.profileId))
// Keep unresolved conformance paths visible without treating their order as meaningful.
const conformsIris = computed(() => (currentProfile.value ? [] : current.value?.conformsToIds ?? []))
const conformsTitle = computed(() => conformsIris.value.join('\n'))
// A conformsTo IRI that carries its own CreativeWork entity in the crate (e.g.
// the Process Run Crate profile) shows that entity's name and version; a bare
// spec URI with no entity falls back to its IRI tail.
const conformsLabel = computed(() => {
  const iris = conformsIris.value
  if (!iris.length) return 'No profile'
  if (iris.length > 1) return `${iris.length} profiles`
  let iri = ''
  for (const value of iris) iri = value
  const entity = crateGraph(currentCrate.value).find((e) => e['@id'] === iri)
  const name = stringProp(entity?.name)
  if (!name) return readableIri(iri)
  const version = stringProp(entity?.version)
  return version ? `${name} ${version}` : name
})
const profileName = computed(() => currentProfile.value?.name ?? conformsLabel.value)
const profileShortName = computed(() => currentProfile.value?.shortName ?? conformsLabel.value)

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

// The document's own registry entry is the authority: it tells missing,
// private and error apart, which a catalog listing never could.
async function resolveDoc(id: string) {
  const token = ++resolveToken
  docError.value = null
  fetchedSummary.value = null
  docState.value = 'loading'
  acceptedPreparing.value = false
  if (!id) return
  resolvingDoc.value = true
  try {
    const summary = await getMetadataDocument(id, {
      pollPreparing: true,
      onPreparing: (recentlyCreated) => {
        if (token === resolveToken) {
          acceptedPreparing.value = recentlyCreated
          docState.value = 'preparing'
        }
      },
    })
    if (token !== resolveToken) return
    fetchedSummary.value = summary
    docState.value = 'found'
    await fetchCrate(id)
  } catch (err) {
    if (token !== resolveToken) return
    if (err instanceof CrateNotReadyError) docState.value = 'preparing'
    else if (err instanceof ApiError && (err.status === 404 || err.status === 400)) docState.value = 'not-found'
    else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) docState.value = 'forbidden'
    else {
      docState.value = 'error'
      docError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    if (token === resolveToken) resolvingDoc.value = false
  }
}

watch(
  // Wait for the initial bootstrap before deciding — the catalog list is empty
  // during the very first load, so an unknown id must not read as not-found.
  [detailId, bootstrapped],
  async ([id, ready]) => {
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

// Subcrate links (RO-Crate 1.2 "referencing other RO-Crates" pattern) render in
// their own section; the Referenced data table below excludes them.
const subcrateIris = computed(() => new Set(subcrateLinksOf(currentCrate.value).map((link) => link.iri)))
const projectCrate = computed(() => isProjectCrate(currentCrate.value))

// Ids other sections own: the Subcrates section's linked iris (plus their
// subjectOf CreativeWork stubs) and the run provenance panel's entities.
const contextualExclude = computed(() => {
  const ids = new Set<string>()
  for (const link of subcrateLinksOf(currentCrate.value)) {
    ids.add(link.iri)
    if (link.subjectOf) ids.add(link.subjectOf)
  }
  const run = runProvenance.value
  if (run) for (const id of runClaimedIds(run)) ids.add(id)
  return ids
})

// Hero License tile: the in-crate license entity's display name, then a
// well-known SPDX / CC label, then the readable IRI tail — never a bare URL.
const licenseLabel = computed(() => {
  const iri = current.value?.license
  if (!iri) return ''
  const entity = crateGraph(currentCrate.value).find((e) => e['@id'] === iri)
  return licenseLabelOf(iri, stringProp(entity?.name))
})

// The document's profile rules label and order the presented fields. The
// catalog summary parse is applied immediately; loading the profile's own
// crate refines it in place (fullCrates is reactive, so labels upgrade live).
watch(
  () => currentProfile.value?.documentId,
  (id) => {
    if (id) void loadRoCrate(id).catch(() => undefined)
  },
  { immediate: true },
)

const presentation = computed(() =>
  presentCrate(currentCrate.value, {
    excludeIds: contextualExclude.value,
    profile: currentProfile.value?.entityRules ?? [],
  }),
)

// Cross-section entity jump with a transient highlight ring; sections expand
// their capped lists when the target is hidden behind a cap.
const highlightId = ref('')
let highlightTimer: number | undefined
function jumpEntity(id: string) {
  highlightId.value = id
  void nextTick(() => {
    document.getElementById(`ctx-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.clearTimeout(highlightTimer)
    highlightTimer = window.setTimeout(() => (highlightId.value = ''), 1800)
  })
}
watch(detailId, () => (highlightId.value = ''))

// The depth-first hasPart tree (a sub-dataset's parts render indented under
// it), excluding the root, the metadata descriptor and subcrate links.
const dataEntities = computed<DataEntityNode[]>(() =>
  dataEntityTreeOf(fullCrates.value[detailId.value] ?? current.value?.roCrate).filter(
    (row) => !subcrateIris.value.has(row.id),
  ),
)

// The info dialog shows one entity's full stored metadata.
const infoEntityId = ref('')
const infoOpen = ref(false)
function openInfo(row: DataEntity) {
  infoEntityId.value = row.id
  infoOpen.value = true
}

function rowTypes(row: DataEntity): string {
  return row.types.map(termNameFromUri).join(', ') || '-'
}

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

const CONTENT_W3ID_PREFIX = 'https://w3id.org/aruna/data/'

function contentW3id(row: DataEntity): string | null {
  return row.id.startsWith(CONTENT_W3ID_PREFIX) ? row.id : null
}

const selectedBacklinkId = ref('')
const backlinkResult = ref<BacklinkPreflightResponse | null>(null)
const backlinkError = ref<string | null>(null)
const backlinkLoading = ref(false)
let backlinkController: AbortController | null = null

const backlinkTarget = computed(() => {
  const result = backlinkResult.value
  if (!result) return null
  const selected = dataEntities.value.find((row) => row.id === selectedBacklinkId.value)
  const identity = selected ? contentW3id(selected) : null
  return result.targets.find((target) => target.content_w3id === identity) ?? result.targets[0] ?? null
})
const backlinkComplete = computed(() => Boolean(
  backlinkResult.value?.complete && !backlinkResult.value.truncated,
))

async function loadBacklinks(row: DataEntity) {
  const identity = contentW3id(row)
  if (!identity || !currentUser.value) return
  backlinkController?.abort()
  const controller = new AbortController()
  backlinkController = controller
  selectedBacklinkId.value = row.id
  backlinkResult.value = null
  backlinkError.value = null
  backlinkLoading.value = true
  try {
    backlinkResult.value = await preflightBacklinks(
      { target: { kind: 'content_w3ids', content_w3ids: [identity] } },
      { baseUrl: apiBaseUrl.value, token: authToken.value },
      controller.signal,
    )
  } catch (err) {
    if (controller.signal.aborted) return
    backlinkError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (backlinkController === controller) {
      backlinkController = null
      backlinkLoading.value = false
    }
  }
}

function retryBacklinks() {
  const row = dataEntities.value.find((entry) => entry.id === selectedBacklinkId.value)
  if (row) void loadBacklinks(row)
}

function backlinkFreshnessTime(value: number | null): string {
  return value === null ? 'observation time unavailable' : relativeTime(new Date(value).toISOString())
}

watch(detailId, () => {
  backlinkController?.abort()
  backlinkController = null
  selectedBacklinkId.value = ''
  backlinkResult.value = null
  backlinkError.value = null
  backlinkLoading.value = false
})
onBeforeUnmount(() => backlinkController?.abort())

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
  const target = row.contentUrl ?? (contentW3id(row) ? '' : row.id)
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
// Portal-internal targets are recognised by their graph IRI alone; the label
// falls back to a targeted fetch when the crate carries no stub name.
const relatedPaths = ref<Record<string, string>>({})

// One attempt per document and page visit: a failed lookup must not retrigger
// every time another row's resolution recomputes the related list.
const relatedAttempted = new Set<string>()
async function ensureRelatedPath(documentId: string) {
  if (relatedPaths.value[documentId] || relatedAttempted.has(documentId)) return
  relatedAttempted.add(documentId)
  try {
    const item = await getMetadataItem(documentId)
    const title = toMetadataDoc(item).title || item.document_path
    relatedPaths.value = { ...relatedPaths.value, [documentId]: title }
  } catch {
    // Deleted or unreadable: the row keeps its stub name or IRI as the label.
  }
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
      // Crate-local fragments (a run crate's own #run action) are internal
      // wiring; related documents have in-graph stubs and must still render.
      if (!iri || seen.has(iri) || iri.startsWith('#')) continue
      seen.add(iri)
      const documentId = documentIdFromIri(iri) ?? (isDocumentId(iri) ? iri : null)
      const entity = g.find((e) => e['@id'] === iri)
      rows.push({
        iri,
        documentId: documentId ?? undefined,
        // The in-graph stub name is frozen at link time; the live document's
        // title wins, and the stub only fills in while the fetch is pending
        // or when the document is gone.
        label: (documentId ? relatedPaths.value[documentId] : '') || stringProp(entity?.name) || iri,
      })
    }
  }
  return rows
})

watch(relatedDocs, (rows) => {
  for (const row of rows) {
    if (row.documentId && !relatedPaths.value[row.documentId]) void ensureRelatedPath(row.documentId)
  }
})

</script>

<template>
  <div>
    <PageHeader
      :title="current ? current.title : fetchedSummary ? fetchedSummary.document_path : 'Dataset'"
      :description="current ? (runProvenance ? profileName : `${profileName} · ${current.ulid}`) : fetchedSummary ? fetchedSummary.document_id : 'Live RO-Crate Dataset.'"
    >
      <template #breadcrumbs>
        <template v-if="current?.realmId || fetchedSummary?.group_id">
          <span>·</span>
          <Badge
            variant="outline"
            :title="current?.realmId || fetchedSummary?.group_id"
          >Group: {{ truncateMiddle(current?.realmId || fetchedSummary?.group_id || '') }}</Badge>
        </template>
        <span>·</span>
        <span>What is this?</span>
        <RouterLink
          :to="{ name: 'docs', params: { topic: 'datasets' } }"
          class="font-medium text-primary hover:underline"
        >Learn more</RouterLink>
      </template>
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
        <!-- One entry point for every crate transfer; each entry names what it
             moves, so "the description" and "the whole crate" stay apart. -->
        <DropdownMenu v-if="docState === 'found'">
          <DropdownMenuTrigger as-child>
            <Button variant="outline">
              <ArrowDownUp class="h-4 w-4" /> Import / export
              <ChevronDown class="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-80 p-1.5">
            <DropdownMenuLabel>Export</DropdownMenuLabel>
            <DropdownMenuItem
              class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
              :disabled="!crateHasEntities"
              @click="downloadCrateJson(currentCrate)"
            >
              <FileJson2 class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-foreground">Metadata file only</span>
                <span class="block text-xs leading-relaxed text-muted-foreground">Downloads ro-crate-metadata.json, the description on its own, without any data files.</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="currentUser && jobsEnabled"
              class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
              @click="showCrateExport = true"
            >
              <FileArchive class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-foreground">Whole crate as a zip archive</span>
                <span class="block text-xs leading-relaxed text-muted-foreground">Packages the metadata together with the data files it references. Prepared by a job.</span>
              </span>
            </DropdownMenuItem>
            <template v-if="canWrite">
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Import</DropdownMenuLabel>
              <DropdownMenuItem
                class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
                @click="crateSection?.openImport()"
              >
                <Upload class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span class="min-w-0">
                  <span class="block text-sm font-medium text-foreground">Replace this Dataset from a file</span>
                  <span class="block text-xs leading-relaxed text-muted-foreground">Overwrites this Dataset's crate with an uploaded ro-crate-metadata.json, previewed first.</span>
                </span>
              </DropdownMenuItem>
            </template>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              class="cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2.5"
              @click="crateSection?.openRaw()"
            >
              <Code2 class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-foreground">View raw JSON-LD</span>
                <span class="block text-xs leading-relaxed text-muted-foreground">Jumps to the raw RO-Crate JSON at the bottom of the page and expands it.</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button v-if="current && canWrite" variant="outline" @click="showEdit = true"><Pencil class="h-4 w-4" /> Edit</Button>
        <Button v-if="current && canWrite" variant="outline" class="text-destructive hover:text-destructive" @click="deleteError = null; showDelete = true"><Trash2 class="h-4 w-4" /> Delete</Button>
        <RouterLink :to="{ name: 'search' }">
          <Button variant="outline"><ArrowLeft class="h-4 w-4" /> Datasets</Button>
        </RouterLink>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <template v-if="current">
        <article class="surface p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1">
                <RouterLink v-if="currentProfile" :to="{ name: 'profile-detail', params: { profileId: currentProfile.id } }" class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary hover:opacity-80">
                  <ListChecks class="h-3 w-3" /> Reference: {{ currentProfile.name }}
                </RouterLink>
                <ExternalLink
                  v-else-if="conformsIris.length === 1 && isHttpUrl(conformsIris[0])"
                  :href="conformsIris[0]"
                  :show-icon="false"
                  class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px]"
                  :title="conformsTitle"
                >
                  <ListChecks class="h-3 w-3" /> Reference: {{ profileName }}
                </ExternalLink>
                <span v-else class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary" :title="conformsTitle || undefined">
                  <ListChecks class="h-3 w-3" /> Reference: {{ profileName }}
                </span>
                <ProfileChip :doc="current" status-only />
              </div>
              <h1 class="mt-3 font-display text-2xl font-semibold tracking-tight text-aruna-navy">{{ current.title }}</h1>
              <p class="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/85">{{ current.description || 'No description in RO-Crate summary.' }}</p>
              <div class="mt-4 flex flex-wrap gap-1.5">
                <span v-for="keyword in current.keywords" :key="keyword" class="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80">#{{ keyword }}</span>
              </div>
              <AuthorChips :crate="currentCrate" class="mt-4" />
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1.5">
              <Badge variant="secondary">{{ relativeTime(current.updatedAt) }}</Badge>
              <Badge v-if="projectCrate" variant="outline" class="gap-1 text-[10px] uppercase"><Layers class="h-3 w-3" /> Project crate</Badge>
            </div>
          </div>

          <dl class="mt-6 grid gap-3 sm:grid-cols-4">
            <div class="surface-muted p-3">
              <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">Dataset ID</dt>
              <dd class="mt-1 break-all font-mono text-[11px] text-foreground">{{ current.ulid }}</dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="flex flex-wrap items-center gap-x-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>Profile reference</span>
                <span class="normal-case tracking-normal">What is this?
                  <RouterLink
                    :to="{ name: 'docs', params: { topic: 'profiles-conformance' } }"
                    class="font-medium text-primary hover:underline"
                  >Learn more</RouterLink>
                </span>
              </dt>
              <dd class="mt-1 break-all text-sm font-medium text-foreground" :title="conformsTitle || undefined">{{ profileShortName }}</dd>
              <dd class="mt-2"><ProfileChip :doc="current" status-only /></dd>
            </div>
            <div class="surface-muted p-3">
              <dt class="text-[11px] uppercase tracking-wider text-muted-foreground">License</dt>
              <dd class="mt-1 truncate text-sm">
                <ExternalLink v-if="current.license && isHttpUrl(current.license)" :href="current.license" :label="licenseLabel" class="font-medium" :title="current.license" />
                <span v-else-if="current.license" class="font-medium text-foreground" :title="current.license">{{ licenseLabel }}</span>
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

      <!-- Crate + referenced data for any resolved document (keyed on detailId). -->
      <template v-if="docState === 'found'">
        <PersistentIdSection
          v-if="fetchedSummary"
          :document-id="detailId"
          :is-public="fetchedSummary.public"
        />

        <DetailsSection
          :fields="presentation.fields"
          :loading="loadingCrate"
          :preparing="Boolean(cratePending[detailId])"
          :not-ready="crateNotReady"
          :error="crateError"
          @retry="fetchCrate(detailId)"
          @jump="jumpEntity"
        />

        <PeopleSection
          :people="presentation.people"
          :organizations="presentation.organizations"
          :highlight-id="highlightId"
          @jump="jumpEntity"
        />

        <ContextSection
          :entities="presentation.entities"
          :comments="presentation.comments"
          :highlight-id="highlightId"
          @jump="jumpEntity"
        />

        <SubcratesSection
          v-if="subcrateIris.size || (Boolean(current) && canWrite)"
          :crate="currentCrate"
          :document-id="detailId"
          :can-write="Boolean(current) && canWrite"
          @changed="onSaved"
        />

        <RunProvenancePanel v-if="runProvenance" :run="runProvenance" />

        <section v-else class="surface overflow-hidden">
          <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
            <FileJson2 class="h-4 w-4 text-primary" /> Referenced data
            <span v-if="dataEntities.length" class="text-xs font-normal text-muted-foreground">{{ dataEntities.length }}</span>
            <div class="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              <Badge variant="outline" class="text-[10px]">Node: {{ nodeDisplayName(localNodeId) }}</Badge>
              <Badge v-if="hasS3Access" variant="accent" class="text-[10px]" :title="s3Endpoint ?? undefined">S3 access active</Badge>
            </div>
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
              <template v-else>
                <template v-for="row in dataEntities" :key="row.id">
                  <tr
                    class="border-t border-border"
                    :class="canPreview(row) ? 'cursor-pointer hover:bg-muted/30' : ''"
                    @click="canPreview(row) && openPreview(row)"
                  >
                    <td class="px-5 py-2.5 font-medium text-foreground" :title="row.id">
                      <span class="flex min-w-0 items-center gap-1.5" :style="row.depth ? { paddingLeft: `${row.depth * 1.25}rem` } : undefined">
                        <Folder v-if="row.directory" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span class="truncate">{{ row.name }}</span>
                      </span>
                      <span v-if="contentW3id(row)" class="mt-0.5 block break-all font-mono text-[10px] font-normal text-muted-foreground">
                        Content identity: {{ row.id }}
                      </span>
                      <span v-if="row.contentUrl" class="mt-0.5 block break-all text-[10px] font-normal text-muted-foreground">
                        Location:
                        <a v-if="entityLink(row)" :href="entityLink(row)" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline" @click.stop>{{ row.contentUrl }}</a>
                        <span v-else class="font-mono">{{ row.contentUrl }}</span>
                      </span>
                      <span v-if="referencedBy.get(row.id)?.length" class="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] font-normal text-muted-foreground">
                        <Link2 class="h-3 w-3 shrink-0" /> Loaded-crate cache only:
                        <template v-for="(ref, i) in referencedBy.get(row.id) ?? []" :key="ref.documentId">
                          <RouterLink :to="{ name: 'metadata-detail', params: { id: ref.documentId } }" class="text-primary hover:underline" @click.stop>{{ ref.title }}</RouterLink><span v-if="i < (referencedBy.get(row.id)?.length ?? 0) - 1">,</span>
                        </template>
                      </span>
                    </td>
                    <td class="px-5 py-2.5 text-muted-foreground">{{ rowTypes(row) }}</td>
                    <td class="px-5 py-2.5 text-muted-foreground">{{ row.encodingFormat || '-' }}</td>
                    <td class="px-5 py-2.5 text-right font-mono text-xs text-muted-foreground">{{ formatContentSize(row.contentSize) }}</td>
                    <td class="px-5 py-2.5 text-right">
                      <div class="flex items-center justify-end gap-1">
                        <Button
                          v-if="contentW3id(row) && !row.directory"
                          variant="ghost"
                          size="sm"
                          :disabled="!currentUser || (backlinkLoading && selectedBacklinkId === row.id)"
                          :title="currentUser ? 'Run an authoritative Realm backlink lookup' : 'Sign in to inspect Dataset backlinks'"
                          @click.stop="loadBacklinks(row)"
                        >
                          <Link2 class="size-3.5" /> Referenced by
                        </Button>
                        <Button variant="ghost" size="icon-sm" :aria-label="`Show metadata of ${row.name}`" title="File metadata" @click.stop="openInfo(row)">
                          <Info class="size-3.5" />
                        </Button>
                        <Button v-if="canPreview(row)" variant="ghost" size="icon-sm" aria-label="Preview" @click.stop="openPreview(row)">
                          <Eye class="size-3.5" />
                        </Button>
                        <a v-if="entityLink(row)" :href="entityLink(row)" target="_blank" rel="noopener noreferrer" class="inline-flex text-primary hover:opacity-80" :aria-label="`Open the location of ${row.name} in a new tab`" @click.stop>
                          <ExternalLinkIcon class="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="selectedBacklinkId === row.id" class="border-t border-border bg-muted/15">
                    <td colspan="5" class="px-5 py-4">
                      <div class="rounded-md border border-border bg-background p-4" aria-live="polite">
                        <div class="flex flex-wrap items-center gap-2">
                          <Link2 class="h-4 w-4 text-primary" />
                          <h3 class="font-display text-sm font-semibold text-aruna-navy">Authoritative Realm backlink lookup</h3>
                          <Badge v-if="backlinkResult" :variant="backlinkComplete ? 'success' : 'warn'" class="text-[10px] uppercase">
                            {{ backlinkComplete ? 'Complete' : 'Partial' }}
                          </Badge>
                        </div>
                        <p class="mt-1 break-all font-mono text-[10px] text-muted-foreground">{{ row.id }}</p>

                        <p v-if="backlinkLoading" class="mt-3 text-xs text-muted-foreground">Checking current Realm indexes…</p>
                        <div v-else-if="backlinkError" class="mt-3 flex flex-wrap items-center gap-2 text-xs text-destructive">
                          <span>{{ backlinkError }}</span>
                          <Button variant="outline" size="sm" @click="retryBacklinks">Retry</Button>
                        </div>
                        <template v-else-if="backlinkResult">
                          <dl class="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                            <div class="surface-muted rounded-md px-3 py-2">
                              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Scope</dt>
                              <dd class="mt-1 font-medium">{{ backlinkResult.coverage.queried_scope.replaceAll('_', ' ') }}</dd>
                            </div>
                            <div class="surface-muted rounded-md px-3 py-2">
                              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Overall coverage</dt>
                              <dd class="mt-1 font-medium">{{ backlinkResult.complete ? 'Complete' : 'Incomplete' }}</dd>
                            </div>
                            <div class="surface-muted rounded-md px-3 py-2">
                              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Realm coverage</dt>
                              <dd class="mt-1 font-medium">{{ backlinkResult.coverage.realm_coverage_complete ? 'Complete' : 'Incomplete' }}</dd>
                            </div>
                            <div class="surface-muted rounded-md px-3 py-2">
                              <dt class="text-[10px] uppercase tracking-wider text-muted-foreground">Location-form coverage</dt>
                              <dd class="mt-1 font-medium">{{ backlinkResult.coverage.path_style_endpoint_coverage_complete ? 'Complete' : 'Incomplete' }}</dd>
                            </div>
                          </dl>
                          <div class="mt-3 space-y-1 text-[11px] text-muted-foreground">
                            <p>Target resolution: {{ backlinkResult.coverage.target_resolution_complete ? 'Complete' : 'Incomplete' }}.</p>
                            <p>Nodes queried: {{ backlinkResult.nodes_queried }}. Nodes failed: {{ backlinkResult.nodes_failed }}.</p>
                            <p v-if="backlinkResult.truncated">The authoritative result page is truncated.</p>
                            <p v-if="backlinkResult.failed_partitions.length" class="break-all">Failed partitions: {{ backlinkResult.failed_partitions.join(', ') }}</p>
                            <p v-if="backlinkResult.coverage.queried_forms.length" class="break-all">Queried forms: {{ backlinkResult.coverage.queried_forms.join(', ') }}</p>
                            <p v-for="excluded in backlinkResult.coverage.excluded_forms" :key="excluded.form" class="break-all">Excluded form {{ excluded.form }}: {{ excluded.reason }}</p>
                          </div>
                          <div class="mt-3">
                            <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Index freshness</p>
                            <ul v-if="backlinkResult.coverage.node_freshness.length" class="mt-1 divide-y divide-border/60 rounded-md border border-border/60 text-[11px] text-muted-foreground">
                              <li v-for="freshness in backlinkResult.coverage.node_freshness" :key="freshness.node_id" class="flex flex-wrap gap-x-2 px-3 py-1.5">
                                <span class="font-mono" :title="freshness.node_id">{{ nodeDisplayName(freshness.node_id) }}</span>
                                <span>State: {{ freshness.index_state.replaceAll('_', ' ') }}</span>
                                <span :title="freshness.oldest_status_updated_at_ms !== null ? new Date(freshness.oldest_status_updated_at_ms).toISOString() : undefined">Oldest status: {{ backlinkFreshnessTime(freshness.oldest_status_updated_at_ms) }}</span>
                              </li>
                            </ul>
                            <p v-else class="mt-1 text-[11px] text-muted-foreground">No per-node freshness detail was returned.</p>
                          </div>
                          <div class="mt-3">
                            <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Visible referencing Datasets</p>
                            <ul v-if="backlinkTarget?.visible_references.length" class="mt-1 divide-y divide-border/60 rounded-md border border-border/60">
                              <li v-for="reference in backlinkTarget.visible_references" :key="reference.document_id" class="px-3 py-2 text-xs">
                                <RouterLink :to="{ name: 'metadata-detail', params: { id: reference.document_id } }" class="font-medium text-primary hover:underline">{{ reference.title }}</RouterLink>
                              </li>
                            </ul>
                            <p v-else class="mt-1 text-xs text-muted-foreground">
                              {{ backlinkComplete ? 'No visible referencing Datasets were found.' : 'No visible referencing Datasets were returned. Coverage is incomplete.' }}
                            </p>
                            <p v-if="backlinkTarget?.hidden_references_exist" class="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">Other restricted Datasets reference this content</p>
                          </div>
                        </template>
                      </div>
                    </td>
                  </tr>
                </template>
              </template>
            </tbody>
          </table>

          <div v-if="crateNotReady" class="flex items-center gap-3 px-5 py-4 text-xs text-muted-foreground">
            <span>The crate is still being prepared.</span>
            <Button variant="outline" size="sm" @click="fetchCrate(detailId)">Retry</Button>
          </div>
          <p v-else-if="!loadingCrate && !dataEntities.length" class="px-5 py-6 text-xs text-muted-foreground">
            This Dataset does not reference any data files. Files can be attached by editing the crate.
          </p>
        </section>

        <section v-if="relatedDocs.length" class="surface overflow-hidden">
          <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
            <Link2 class="h-4 w-4 text-primary" /> Related resources
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
              <ExternalLink
                v-else-if="isHttpUrl(row.iri)"
                :href="row.iri"
                :label="row.label"
                class="min-w-0 truncate"
                :title="row.iri"
              />
              <span v-else class="min-w-0 truncate text-muted-foreground" :title="row.iri">{{ row.label }}</span>
              <Badge variant="outline" class="shrink-0 text-[10px] uppercase">{{ row.documentId ? 'in portal' : 'external' }}</Badge>
            </li>
          </ul>
        </section>

        <section class="surface overflow-hidden">
          <div class="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-medium text-foreground">
            <Code2 class="h-4 w-4 text-primary" /> Advanced
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h3 class="text-sm font-medium text-foreground">Query this Dataset</h3>
              <p class="mt-1 text-xs text-muted-foreground">Open the SPARQL workbench with this exact Dataset scope fixed.</p>
            </div>
            <RouterLink :to="{ name: 'search', query: { expert: '1', document: detailId } }">
              <Button variant="outline" size="sm"><Code2 class="h-3.5 w-3.5" /> Query this Dataset</Button>
            </RouterLink>
          </div>
        </section>

        <CrateImportExport
          ref="crateSection"
          :crate="currentCrate"
          :document-id="detailId"
          :can-import="canWrite"
          @imported="onSaved"
        />
      </template>

      <div v-else-if="docState === 'loading'" class="surface p-12 text-center text-sm text-muted-foreground">
        Loading Dataset…
      </div>

      <div v-else-if="docState === 'preparing'" class="surface px-5 py-12 text-center">
        <p class="text-sm font-medium text-foreground">{{ acceptedPreparing ? 'Accepted, preparing Dataset' : 'Dataset is still being prepared' }}</p>
        <p class="mx-auto mt-2 max-w-md break-all font-mono text-xs text-muted-foreground">{{ detailId }}</p>
        <Button variant="outline" size="sm" class="mt-5" :disabled="resolvingDoc" @click="resolveDoc(detailId)">
          {{ resolvingDoc ? 'Checking…' : 'Retry' }}
        </Button>
      </div>

      <div v-else-if="docState === 'not-found'" class="surface px-5 py-12 text-center">
        <p class="text-sm font-medium text-foreground">This Dataset does not exist or has been deleted.</p>
        <p class="mx-auto mt-2 max-w-md break-all font-mono text-xs text-muted-foreground">{{ detailId }}</p>
        <RouterLink :to="{ name: 'search' }" class="mt-5 inline-flex">
          <Button variant="outline"><ArrowLeft class="h-4 w-4" /> Datasets</Button>
        </RouterLink>
      </div>

      <div v-else-if="docState === 'forbidden'" class="surface px-5 py-12 text-center">
        <p class="text-sm font-medium text-foreground">This Dataset is not public.</p>
        <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {{ currentUser ? 'Sign in with an account that can see it.' : 'Sign in with an account that can see it, using the button in the top bar.' }}
        </p>
        <RouterLink :to="{ name: 'search' }" class="mt-5 inline-flex">
          <Button variant="outline"><ArrowLeft class="h-4 w-4" /> Datasets</Button>
        </RouterLink>
      </div>

      <ErrorPanel
        v-else-if="docState === 'error'"
        :message="docError ?? 'Failed to load this Dataset.'"
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

    <DataEntityDialog
      v-model:open="infoOpen"
      :crate="fullCrates[detailId] ?? current?.roCrate"
      :entity-id="infoEntityId"
      :profile="currentProfile"
      @jump="jumpEntity"
    />

    <CrateTransferDialog v-model:open="showCrateExport" mode="export" :document-id="detailId" :document-path="currentPath" />

    <Dialog :open="showDelete" @update:open="(v: boolean) => (showDelete = v)">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Dataset</DialogTitle>
          <DialogDescription>
            <span class="font-medium text-foreground">What is this?</span>
            Deletes <span class="font-medium text-foreground">{{ current?.title }}</span>
            (<span class="font-mono text-xs">{{ currentPath }}</span>) and its RO-Crate graph from Datasets. Referenced S3 objects are not touched.
            <RouterLink
              :to="{ name: 'docs', params: { topic: 'data-and-deletion' } }"
              class="font-medium text-primary hover:underline"
            >Learn more</RouterLink>
          </DialogDescription>
        </DialogHeader>
        <p v-if="deleteError" class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ deleteError }}</p>
        <DialogFooter>
          <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" :disabled="saving" @click="confirmDelete">{{ saving ? 'Deleting…' : 'Delete' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
