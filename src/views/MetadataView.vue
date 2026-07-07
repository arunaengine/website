<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EditMetadataDialog from '@/components/metadata/EditMetadataDialog.vue'
import ConformanceBadge from '@/components/metadata/ConformanceBadge.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { CrateNotReadyError, readableIri, useAruna } from '@/composables/useAruna'
import { useProfileConformance } from '@/composables/useProfileConformance'
import { ApiError, type MetadataDocumentSummary } from '@/lib/api'
import { reportGlobalError } from '@/composables/useGlobalErrors'
import { formatBytes, relativeTime } from '@/lib/utils'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import { ArrowLeft, ListChecks, Code2, FileJson2, ExternalLink, Pencil, SquareTerminal, Trash2, Star } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
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
const { writesDisabled } = useConnectivity()

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

// Profile documents are excluded from the catalog list (useAruna filters
// path_prefix 'profiles/' out of metadataItems), so `current` is never set for
// them and only the bare registry summary renders. Resolve the matching profile
// record so the header can name it and point at its dedicated renderer.
const profileForDoc = computed(() => profiles.value.find((profile) => profile.documentId === detailId.value))
const profileSlugFromPath = computed(() =>
  currentPath.value.startsWith('profiles/') ? currentPath.value.slice('profiles/'.length) : '',
)
const isProfileDoc = computed(() => Boolean(profileForDoc.value || profileSlugFromPath.value))
const profileDetailId = computed(() => profileForDoc.value?.id ?? profileSlugFromPath.value)

// Evaluate the resolved dataset against its declared profile(s). fetch:true warms
// the profile crates (the dataset crate is already fetched by fetchCrate below).
const { conformance } = useProfileConformance(() => current.value, { fetch: true })

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

interface DataEntityRow {
  id: string
  name: string
  types: string[]
  encodingFormat?: string
  contentSize?: string
  contentUrl?: string
}

function crateGraph(crate: unknown): Array<Record<string, unknown>> {
  if (!crate || typeof crate !== 'object') return []
  const g = (crate as Record<string, unknown>)['@graph']
  return Array.isArray(g)
    ? g.filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object' && !Array.isArray(e)))
    : []
}

// Same about-based root heuristic as the edit dialog.
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

function typesOf(entity: Record<string, unknown>): string[] {
  const t = entity['@type']
  if (typeof t === 'string') return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return []
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

// The union of entities referenced from the root's hasPart and every File/Dataset
// entity (excluding the root and the metadata descriptor).
const dataEntities = computed<DataEntityRow[]>(() => {
  const crate = fullCrates.value[detailId.value] ?? current.value?.roCrate
  const g = crateGraph(crate)
  if (!g.length) return []
  const rootId = crateRootId(crate)
  const root = rootId ? g.find((e) => e['@id'] === rootId) : undefined
  const hasPartIds = new Set<string>()
  const hasPart = root?.hasPart
  for (const ref of Array.isArray(hasPart) ? hasPart : hasPart ? [hasPart] : []) {
    const id = stringProp(ref)
    if (id) hasPartIds.add(id)
  }
  const rows: DataEntityRow[] = []
  const seen = new Set<string>()
  for (const entity of g) {
    const id = typeof entity['@id'] === 'string' ? entity['@id'] : ''
    if (!id || id === 'ro-crate-metadata.json' || id === rootId || seen.has(id)) continue
    const types = typesOf(entity)
    if (!hasPartIds.has(id) && !types.includes('File') && !types.includes('Dataset')) continue
    seen.add(id)
    rows.push({
      id,
      name: stringProp(entity.name) || id,
      types,
      encodingFormat: stringProp(entity.encodingFormat),
      contentSize: stringProp(entity.contentSize),
      contentUrl: stringProp(entity.contentUrl),
    })
  }
  return rows
})

function entityLink(row: DataEntityRow): string | undefined {
  const target = row.contentUrl ?? row.id
  return target.startsWith('http') ? target : undefined
}

function entitySize(row: DataEntityRow): string {
  if (!row.contentSize) return '—'
  const n = Number(row.contentSize)
  return row.contentSize.trim() !== '' && Number.isFinite(n) ? formatBytes(n) : row.contentSize
}
</script>

<template>
  <div>
    <PageHeader
      :title="current ? current.title : fetchedSummary ? (profileForDoc?.name ?? fetchedSummary.document_path) : 'Metadata'"
      :description="current ? `${profileName} · ${current.ulid}` : fetchedSummary ? fetchedSummary.document_id : 'Live RO-Crate metadata document.'"
    >
      <template #actions>
        <Button
          v-if="current && currentUser"
          variant="outline"
          size="icon"
          :disabled="favBusy || writesDisabled"
          :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
          :aria-label="isFav ? 'Remove from favourites' : 'Add to favourites'"
          @click="toggleFav"
        >
          <Star class="h-4 w-4" :class="isFav ? 'text-amber-500' : ''" :fill="isFav ? 'currentColor' : 'none'" />
        </Button>
        <RouterLink v-if="detailId" :to="{ name: 'query', query: { document: detailId } }">
          <Button variant="outline"><SquareTerminal class="h-4 w-4" /> Query</Button>
        </RouterLink>
        <Button v-if="current && canWrite" variant="outline" :disabled="writesDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined" @click="showEdit = true"><Pencil class="h-4 w-4" /> Edit</Button>
        <Button v-if="current && canWrite" variant="outline" class="text-destructive hover:text-destructive" :disabled="writesDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined" @click="deleteError = null; showDelete = true"><Trash2 class="h-4 w-4" /> Delete</Button>
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
              <ConformanceBadge
                class="ml-1 align-middle"
                :state="conformance.state"
                :error-count="conformance.errorCount"
                :warning-count="conformance.warningCount"
              />
              <h1 class="mt-3 font-display text-2xl font-semibold tracking-tight text-aruna-navy">{{ current.title }}</h1>
              <p class="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/85">{{ current.description || 'No description in RO-Crate summary.' }}</p>
              <div class="mt-4 flex flex-wrap gap-1.5">
                <span v-for="keyword in current.keywords" :key="keyword" class="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/80">#{{ keyword }}</span>
              </div>
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

        <!-- Profile conformance: the stored crate evaluated against its declared
             profile(s). Only shown when there is something to say (violations, or
             a clean pass that still leaves external profiles unchecked). -->
        <section
          v-if="conformance.state === 'errors' || conformance.state === 'warnings' || (conformance.state === 'conformant' && conformance.uncheckedIris.length)"
          class="surface p-4"
        >
          <div class="flex items-center gap-2 text-sm font-medium text-foreground">
            <ListChecks class="h-4 w-4 text-primary" /> Profile conformance
          </div>
          <div v-for="entry in conformance.evaluations" :key="entry.profile.id" class="mt-3">
            <div v-if="conformance.evaluations.length > 1" class="text-xs font-medium text-muted-foreground">{{ entry.profile.name }}</div>
            <p v-if="!entry.evaluation.violations.length" class="mt-1 text-xs text-muted-foreground">Conforms to {{ entry.profile.name }}.</p>
            <ul v-else class="mt-1 space-y-1.5">
              <li v-for="violation in entry.evaluation.violations" :key="violation.ruleId + violation.pointer" class="flex items-start gap-2 text-xs">
                <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" :class="violation.severity === 'error' ? 'bg-destructive' : 'bg-amber-500'" />
                <span class="min-w-0">
                  <span class="text-foreground">{{ violation.message }}</span>
                  <span v-if="violation.hint" class="text-muted-foreground"> {{ violation.hint }}</span>
                  <span class="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground" :title="violation.pointer">{{ violation.ruleId }}</span>
                </span>
              </li>
            </ul>
          </div>
          <p v-if="conformance.uncheckedIris.length" class="mt-3 text-xs text-muted-foreground">
            Declared profile(s) not locally known — not checked: {{ conformance.uncheckedIris.map(readableIri).join(', ') }}
          </p>
        </section>
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
        <div v-if="isProfileDoc" class="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <span class="inline-flex items-center gap-2 text-foreground">
            <ListChecks class="h-4 w-4 text-primary" />
            This document is a metadata profile{{ profileForDoc ? `: ${profileForDoc.name}` : '' }}.
          </span>
          <RouterLink :to="{ name: 'profile-detail', params: { profileId: profileDetailId } }">
            <Button variant="outline" size="sm">Open in Profiles</Button>
          </RouterLink>
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

        <section class="surface overflow-hidden">
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
              <tr v-for="row in dataEntities" v-else :key="row.id" class="border-t border-border">
                <td class="px-5 py-2.5 font-medium text-foreground" :title="row.id">{{ row.name }}</td>
                <td class="px-5 py-2.5 text-muted-foreground">{{ row.types.join(', ') || '—' }}</td>
                <td class="px-5 py-2.5 text-muted-foreground">{{ row.encodingFormat || '—' }}</td>
                <td class="px-5 py-2.5 text-right font-mono text-xs text-muted-foreground">{{ entitySize(row) }}</td>
                <td class="px-5 py-2.5 text-right">
                  <a v-if="entityLink(row)" :href="entityLink(row)" target="_blank" rel="noopener" class="inline-flex text-primary hover:opacity-80" :aria-label="`Open ${row.name} in a new tab`">
                    <ExternalLink class="h-3.5 w-3.5" />
                  </a>
                  <span v-else class="text-muted-foreground">—</span>
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

    <EditMetadataDialog v-if="current" v-model:open="showEdit" :document-id="current.ulid" @saved="onSaved" />

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
          <Button variant="destructive" :disabled="saving || writesDisabled" :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined" @click="confirmDelete">{{ saving ? 'Deleting…' : 'Delete' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
