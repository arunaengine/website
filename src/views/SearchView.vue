<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Switch from '@/components/ui/Switch.vue'
import SearchFilterBar, { type Facet, type FilterModel } from '@/components/search/SearchFilterBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import NewDatasetDialog from '@/components/metadata/NewDatasetDialog.vue'
import CatalogCard from '@/components/metadata/CatalogCard.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useMetadataSearch } from '@/composables/useMetadataSearch'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useDebounceFn } from '@vueuse/core'
import { formatNumber, shortUserId, truncateMiddle } from '@/lib/utils'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { conformsToProcessRun } from '@/lib/profiles/builtinProfiles'
import { Search, FileJson2, Boxes, Code2, Play, Plus, Star, AlertTriangle, Users, UserRound } from '@lucide/vue'
import type { MetadataDoc, SparqlResult } from '@/data/types'
import type { BucketSearchHit, MetadataDocumentListItem, UserSearchHit } from '@/lib/api'
import type { RouteLocationRaw } from 'vue-router'

const route = useRoute()
const router = useRouter()
const {
  realm,
  metadata,
  profiles,
  currentUser,
  loading,
  error,
  bootstrapped,
  refresh,
  runSparql,
  toggleFavourite,
  myGroups,
  discoverableGroups,
  searchUsers,
  searchUnified,
  catalogExhausted,
  catalogLoadingMore,
  catalogEstimate,
  loadMoreMetadata,
  listGroupMetadata,
  getMetadataItem,
  toMetadataDoc,
} = useAruna()
const { displayName: nodeDisplayName, isLocalNode } = useRealmNodes()

function queryString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

function queryFilter(value: unknown): string | null {
  return queryString(value) || null
}

const q = ref(queryString(route.query.q))
const profileFilter = ref<string | null>(queryFilter(route.query.profile))
// Search push-down: the group filter maps to the server group_id and the profile
// filter to conforms_to when it resolves to a local profile IRI. Browsing with a
// group filter pages a group-scoped listing instead of the shared catalog.
const groupFilter = ref<string | null>(queryFilter(route.query.group))
// Entity/resource type facet, derived from the RO-Crate @type of the documents
// loaded so far. Applied client-side in both the browse and the search branches.
const typeFilter = ref<string | null>(queryFilter(route.query.type))
const favouritesOnly = ref(false)

// A local profile carries the conformsTo IRI that documents reference; a filter
// that resolves to one is pushed to the server, otherwise it stays client-side.
const conformsToIri = computed<string | null>(() => {
  if (!profileFilter.value) return null
  const profile = profiles.value.find((item) => item.id === profileFilter.value)
  return profile?.profileUri ?? profile?.graphIri ?? null
})
const profilePushedDown = computed(() => conformsToIri.value !== null)

const {
  active: searchActive,
  pending: searchPending,
  loadingMore,
  error: searchError,
  moreError,
  searched,
  results: searchResults,
  nodesQueried,
  nodesFailed,
  truncated,
  partial,
  capped,
  nextCursor,
  cursorEnabled,
  sentinel,
  loadMore,
  retry: retrySearch,
} = useMetadataSearch(q, { groupId: groupFilter, conformsTo: conformsToIri })
const expertMode = ref(queryString(route.query.expert) === '1')
const favBusy = ref<Set<string>>(new Set())
const favError = ref<string | null>(null)
const showNewDataset = ref(false)
const sparql = ref(`SELECT DISTINCT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 25`)
const sparqlDistributed = ref(true)
const sparqlResult = ref<SparqlResult | null>(null)
const sparqlError = ref<string | null>(null)
const running = ref(false)

// One watcher builds the whole query from the refs. Spreading route.query in a
// per-ref watcher re-applies a stale value when two refs change in the same tick
// (e.g. clearFilters): vue-router only updates route.query after the async
// navigation settles, so the second replace would resurrect a param the first
// meant to drop.
watch([q, profileFilter, groupFilter, typeFilter, expertMode], ([nq, np, ng, nt, ne]) => {
  if (
    queryString(route.query.q) === nq &&
    queryFilter(route.query.profile) === np &&
    queryFilter(route.query.group) === ng &&
    queryFilter(route.query.type) === nt &&
    (queryString(route.query.expert) === '1') === ne
  ) {
    return
  }
  void router.replace({
    query: { ...route.query, q: nq || undefined, profile: np || undefined, group: ng || undefined, type: nt || undefined, expert: ne ? '1' : undefined },
  })
})

// Keep the mounted view in sync with top-bar navigation and browser history.
watch(
  () => route.query,
  (query) => {
    q.value = queryString(query.q)
    profileFilter.value = queryFilter(query.profile)
    groupFilter.value = queryFilter(query.group)
    typeFilter.value = queryFilter(query.type)
    expertMode.value = queryString(query.expert) === '1'
  },
)

// The active search query switches the whole branch, so the browse "filtering"
// state only tracks the client-side filters.
const filtering = computed(() => Boolean(profileFilter.value || groupFilter.value || typeFilter.value || favouritesOnly.value))
const favouriteIds = computed(() => currentUser.value?.favouriteMetadataIds ?? [])

// ── Browse paging ───────────────────────────────────────────────────────────
// Three sources, all bounded: the shared catalog pages, a group-scoped listing
// when the group facet is set (pushed down to the server), and the user's own
// favourite ids fetched one by one. None of them ever walks the realm.
const BROWSE_PAGE_SIZE = 48
const FAVOURITE_FETCH_CAP = 100
// Each favourite costs two requests, so they are fetched in bounded batches.
const FAVOURITE_FETCH_BATCH = 6

const groupDocs = ref<MetadataDoc[]>([])
const groupOffset = ref(0)
const groupExhausted = ref(false)
const groupLoading = ref(false)
const groupEstimate = ref<number | null>(null)
const browseError = ref<string | null>(null)
let groupSeq = 0

async function loadGroupPage(append: boolean) {
  const groupId = groupFilter.value
  if (!groupId) return
  const seq = ++groupSeq
  groupLoading.value = true
  browseError.value = null
  try {
    const response = await listGroupMetadata(groupId, {
      limit: BROWSE_PAGE_SIZE,
      offset: append ? groupOffset.value : 0,
      summary: true,
    })
    if (seq !== groupSeq) return
    const docs = response.documents
      .filter((item) => !item.document_path.startsWith('profiles/'))
      .map(toMetadataDoc)
    groupDocs.value = append ? [...groupDocs.value, ...docs] : docs
    groupOffset.value = response.offset + response.total_returned
    groupEstimate.value = response.total_estimate ?? null
    // Only a short page ends the listing; the estimate is display copy.
    groupExhausted.value = response.total_returned < response.limit
  } catch (err) {
    if (seq !== groupSeq) return
    browseError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (seq === groupSeq) groupLoading.value = false
  }
}

const favouriteDocs = ref<MetadataDoc[]>([])
const favouritesLoading = ref(false)
let favouriteSeq = 0

// Favourites are a small, user-curated id list, so they are fetched directly
// instead of being searched for in the catalog.
async function loadFavourites() {
  const ids = favouriteIds.value.slice(0, FAVOURITE_FETCH_CAP)
  const seq = ++favouriteSeq
  if (!ids.length) {
    favouriteDocs.value = []
    return
  }
  favouritesLoading.value = true
  browseError.value = null
  try {
    const items: Array<MetadataDocumentListItem | null> = []
    for (let start = 0; start < ids.length; start += FAVOURITE_FETCH_BATCH) {
      const batch = ids.slice(start, start + FAVOURITE_FETCH_BATCH)
      const loaded = await Promise.all(batch.map((id) => getMetadataItem(id).catch(() => null)))
      if (seq !== favouriteSeq) return
      items.push(...loaded)
    }
    favouriteDocs.value = items
      .filter((item): item is MetadataDocumentListItem => item !== null)
      .map(toMetadataDoc)
  } catch (err) {
    if (seq !== favouriteSeq) return
    browseError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (seq === favouriteSeq) favouritesLoading.value = false
  }
}

watch(
  [groupFilter, () => searchActive.value, favouritesOnly],
  ([groupId, searching, favourites]) => {
    if (searching || favourites || !groupId) {
      ++groupSeq
      groupDocs.value = []
      groupOffset.value = 0
      groupEstimate.value = null
      groupExhausted.value = false
      return
    }
    void loadGroupPage(false)
  },
  { immediate: true },
)

watch([favouritesOnly, favouriteIds], ([only]) => {
  if (!only) {
    ++favouriteSeq
    favouriteDocs.value = []
    return
  }
  void loadFavourites()
})

const browseSource = computed<MetadataDoc[]>(() => {
  if (favouritesOnly.value) return favouriteDocs.value
  return groupFilter.value ? groupDocs.value : metadata.value
})
// Favourites are fetched whole; the other two sources page.
const browseExhausted = computed(() => {
  if (favouritesOnly.value) return true
  return groupFilter.value ? groupExhausted.value : catalogExhausted.value
})
const browseLoading = computed(
  () => favouritesLoading.value || groupLoading.value || catalogLoadingMore.value,
)
// Newer nodes serve an APPROXIMATE match count with every page (estimated per
// group, so it can over- or under-count). Copy only: paging never reads it.
// Favourites are fetched by id, so that count is exact.
const browseEstimate = computed<number | null>(() => {
  if (favouritesOnly.value) return null
  return groupFilter.value ? groupEstimate.value : catalogEstimate.value
})
const browseSummary = computed(() => {
  const shown = formatNumber(hits.value.length)
  if (browseEstimate.value !== null) {
    // "you can see" keeps this apart from the dashboard's realm-wide total.
    return `Showing ${shown} of about ${formatNumber(browseEstimate.value)} documents you can see.`
  }
  return browseExhausted.value ? `Showing all ${shown} documents.` : `Showing ${shown} documents so far.`
})

async function loadMoreBrowse() {
  browseError.value = null
  if (groupFilter.value) {
    await loadGroupPage(true)
    return
  }
  try {
    await loadMoreMetadata()
  } catch (err) {
    browseError.value = err instanceof Error ? err.message : String(err)
  }
}

// The RO-Crate @type is stored comma-joined (e.g. "Dataset, SoftwareSourceCode");
// split it so a doc matches a facet when any of its types equals the selection.
function docTypes(doc?: MetadataDoc | null): string[] {
  if (!doc?.type) return []
  return doc.type.split(',').map((entry) => entry.trim()).filter(Boolean)
}

// The group filter is served by the source itself; profile, type and favourites
// still narrow what the source returned.
const hits = computed(() =>
  browseSource.value.filter((doc) => {
    if (profileFilter.value && !(doc.profileIds ?? []).includes(profileFilter.value)) return false
    if (groupFilter.value && doc.realmId !== groupFilter.value) return false
    if (typeFilter.value && !docTypes(doc).includes(typeFilter.value)) return false
    if (favouritesOnly.value && !favouriteIds.value.includes(doc.ulid)) return false
    return true
  }),
)
// Process runs are their own Discover section and match the complete profile IRI.
function isRunCrateDoc(doc: MetadataDoc): boolean {
  return conformsToProcessRun(doc.conformsToIds)
}
const catalogSplit = computed(() => {
  const runs: MetadataDoc[] = []
  const datasets: MetadataDoc[] = []
  for (const doc of hits.value) (isRunCrateDoc(doc) ? runs : datasets).push(doc)
  return { runs, datasets }
})

// Group labels: names for groups the caller can see, honest truncated id otherwise.
const groupNames = computed(() => {
  const names = new Map<string, string>()
  for (const group of [...myGroups.value, ...discoverableGroups.value]) names.set(group.id, group.name)
  return names
})
// Stable option set from the loaded documents and known groups, plus the active
// filter, so a server-side group filter never hides the option it selected.
const groupOptions = computed(() => {
  const labels = new Map<string, string>()
  for (const doc of metadata.value) labels.set(doc.realmId, groupNames.value.get(doc.realmId) ?? truncateMiddle(doc.realmId))
  for (const group of [...myGroups.value, ...discoverableGroups.value]) labels.set(group.id, group.name)
  if (groupFilter.value && !labels.has(groupFilter.value)) {
    labels.set(groupFilter.value, groupNames.value.get(groupFilter.value) ?? truncateMiddle(groupFilter.value))
  }
  return [...labels.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

// Distinct entity/resource types present in the documents loaded so far, plus
// the active filter so a value carried in from the URL is never dropped. The
// facet only appears when the data offers a real choice (more than one type).
const typeOptions = computed(() => {
  const types = new Set<string>()
  for (const doc of browseSource.value) for (const type of docTypes(doc)) types.add(type)
  if (typeFilter.value) types.add(typeFilter.value)
  return [...types].sort((a, b) => a.localeCompare(b))
})
const showTypeFilter = computed(() => typeOptions.value.length > 1)

// Per-facet option lists (no "All" entry: SearchFilterBar prepends it). Each keeps
// the active value present so a filter carried in from the URL is never dropped.
const profileFacetOptions = computed(() => {
  const options: Array<{ value: string; label: string }> = []
  const seen = new Set<string>()
  for (const profile of profiles.value) {
    options.push({ value: profile.id, label: profile.name || profile.shortName })
    seen.add(profile.id)
  }
  if (profileFilter.value && !seen.has(profileFilter.value)) {
    options.push({ value: profileFilter.value, label: truncateMiddle(profileFilter.value) })
  }
  return options
})
const typeFacetOptions = computed(() => typeOptions.value.map((type) => ({ value: type, label: type })))
const groupFacetOptions = computed(() => groupOptions.value.map((option) => ({ value: option.id, label: option.label })))

// Extensible filter config: one entry per facet. Adding a facet means pushing
// one more entry here (single select, `multi: true`, or `toggle: true`) with no
// template changes. The favourites toggle only appears for a signed-in user.
const filterFacets = computed<Facet[]>(() => {
  const facets: Facet[] = [{ key: 'profile', label: 'Profile', options: profileFacetOptions.value }]
  if (showTypeFilter.value || typeFilter.value) facets.push({ key: 'type', label: 'Type', options: typeFacetOptions.value })
  facets.push({ key: 'group', label: 'Group', options: groupFacetOptions.value })
  if (currentUser.value) facets.push({ key: 'favourites', label: 'Favourites', toggle: true, icon: Star })
  return facets
})

// Bridge the facet record to the existing filter refs so the URL-sync and
// paging watchers keep firing exactly as before.
const filterModel = computed<FilterModel>({
  get: () => ({
    profile: profileFilter.value,
    type: typeFilter.value,
    group: groupFilter.value,
    favourites: favouritesOnly.value,
  }),
  set: (next) => {
    profileFilter.value = typeof next.profile === 'string' ? next.profile : null
    typeFilter.value = typeof next.type === 'string' ? next.type : null
    groupFilter.value = typeof next.group === 'string' ? next.group : null
    favouritesOnly.value = next.favourites === true
  },
})

// Group and profile filters are pushed to the server; only a favourites filter,
// and a non-IRI profile filter, still narrow the returned hits client-side.
const visibleResults = computed(() =>
  searchResults.value.filter((line) => {
    if (favouritesOnly.value && !favouriteIds.value.includes(line.hit.document_id)) return false
    if (profileFilter.value && !profilePushedDown.value && !(line.doc?.profileIds ?? []).includes(profileFilter.value)) return false
    // Type is a client-side facet: id-only hits carry no catalog doc and so drop
    // out while a type filter is active, mirroring the client-side profile filter.
    if (typeFilter.value && !docTypes(line.doc).includes(typeFilter.value)) return false
    return true
  }),
)
// Only a client-side profile filter hides id-only hits; a pushed-down filter is
// already applied server-side, so every returned hit conforms.
const hiddenByProfile = computed(() =>
  profileFilter.value && !profilePushedDown.value
    ? searchResults.value.filter((line) => !line.doc).length
    : 0,
)

// Beyond metadata, an active query also discovers groups (client-side over the
// loaded group lists, like the top bar), people (server /users/search) and
// buckets across the realm's nodes (the `buckets` section of the unified
// GET /search).
type SearchKind = 'all' | 'datasets' | 'buckets' | 'groups' | 'people'
const kindFilter = ref<SearchKind>('all')
const KIND_OPTIONS: Array<{ id: SearchKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'datasets', label: 'Datasets' },
  { id: 'buckets', label: 'Buckets' },
  { id: 'groups', label: 'Groups' },
  { id: 'people', label: 'People' },
]
const textQuery = computed(() => q.value.trim())
function showKind(kind: Exclude<SearchKind, 'all'>): boolean {
  // A profile filter alone lists documents server-side; buckets, groups and
  // people need an actual query term.
  if (!textQuery.value) return kind === 'datasets'
  return kindFilter.value === 'all' || kindFilter.value === kind
}

const groupMatches = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term) return []
  const seen = new Set<string>()
  const matches = []
  for (const group of [...myGroups.value, ...discoverableGroups.value]) {
    if (seen.has(group.id)) continue
    seen.add(group.id)
    if (`${group.name} ${group.description}`.toLowerCase().includes(term)) matches.push(group)
  }
  return matches
})

// Federated bucket hits via the unified search types param (types=buckets).
// Same debounce/staleness discipline as the people search; ws-* scratch
// buckets never surface.
const bucketResults = ref<BucketSearchHit[]>([])
const bucketNodesQueried = ref(0)
const bucketNodesFailed = ref(0)
const bucketsSearching = ref(false)
const bucketsError = ref<string | null>(null)
let bucketSeq = 0
const runBucketSearch = useDebounceFn(async (term: string) => {
  const seq = ++bucketSeq
  if (term.length < 2 || !currentUser.value) {
    bucketResults.value = []
    bucketsSearching.value = false
    bucketsError.value = null
    return
  }
  bucketsSearching.value = true
  bucketsError.value = null
  try {
    const response = await searchUnified(term, { types: ['buckets'], limit: 10 })
    if (seq !== bucketSeq) return
    bucketResults.value = (response.buckets?.hits ?? []).filter((hit) => !isWorkspaceBucket(hit.bucket))
    bucketNodesQueried.value = response.buckets?.nodes_queried ?? 0
    bucketNodesFailed.value = response.buckets?.nodes_failed ?? 0
  } catch (err) {
    if (seq !== bucketSeq) return
    bucketResults.value = []
    bucketsError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (seq === bucketSeq) bucketsSearching.value = false
  }
}, 300)
watch(q, (term) => void runBucketSearch(term.trim()), { immediate: true })

const bucketsPartial = computed(() => bucketNodesFailed.value > 0)

function bucketHitRoute(hit: BucketSearchHit): RouteLocationRaw {
  return {
    name: 'bucket',
    params: { bucketId: hit.bucket },
    query: isLocalNode(hit.node_id) ? {} : { node: hit.node_id },
  }
}

const peopleResults = ref<UserSearchHit[]>([])
const peopleSearching = ref(false)
let peopleSeq = 0
const runPeopleSearch = useDebounceFn(async (term: string) => {
  const seq = ++peopleSeq
  // /users/search needs an authenticated session and at least two characters.
  if (term.length < 2 || !currentUser.value) {
    peopleResults.value = []
    peopleSearching.value = false
    return
  }
  peopleSearching.value = true
  try {
    const response = await searchUsers(term)
    if (seq === peopleSeq) peopleResults.value = response.users
  } catch {
    if (seq === peopleSeq) peopleResults.value = []
  } finally {
    if (seq === peopleSeq) peopleSearching.value = false
  }
}, 300)
watch(q, (term) => void runPeopleSearch(term.trim()), { immediate: true })

function isFavourite(id: string) {
  return favouriteIds.value.includes(id)
}

async function toggleFav(id: string) {
  if (favBusy.value.has(id)) return
  favError.value = null
  favBusy.value = new Set(favBusy.value).add(id)
  try {
    await toggleFavourite(id)
  } catch (err) {
    favError.value = err instanceof Error ? err.message : String(err)
  } finally {
    const next = new Set(favBusy.value)
    next.delete(id)
    favBusy.value = next
  }
}

function clearFilters() {
  profileFilter.value = null
  groupFilter.value = null
  typeFilter.value = null
  favouritesOnly.value = false
}

async function runQuery() {
  sparqlError.value = null
  const selectClause = sparql.value.match(/(?:^|[>\r\n])\s*SELECT\b([\s\S]*?)(?:\bWHERE\b|\{)/i)?.[1]
  if (sparqlDistributed.value && selectClause !== undefined && !/\bDISTINCT\b/i.test(selectClause)) {
    sparqlError.value = 'Distributed SELECT queries must include DISTINCT in the SELECT clause.'
    sparqlResult.value = null
    return
  }
  running.value = true
  try {
    sparqlResult.value = await runSparql(sparql.value, sparqlDistributed.value ? 'distributed' : 'local')
  } catch (err) {
    sparqlError.value = err instanceof Error ? err.message : String(err)
    sparqlResult.value = null
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Discover"
      description="Browse the live RO-Crate metadata catalog, filter and search it, or run SPARQL against the Aruna metadata index."
    >
      <template #actions>
        <Button :disabled="!currentUser" @click="showNewDataset = true"><Plus class="h-4 w-4" /> New metadata</Button>
        <div class="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
          <Code2 class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="text-xs text-foreground/80">SPARQL</span>
          <Switch :checked="expertMode" @update:checked="(v: boolean) => (expertMode = v)" />
        </div>
      </template>
    </PageHeader>

    <div class="container space-y-6 py-8">
      <template v-if="!expertMode">
        <div class="surface p-4">
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input v-model="q" placeholder="Search datasets, groups and people…" class="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <SearchFilterBar v-model="filterModel" :facets="filterFacets" aria-label="Discover filters" class="mt-3" />
          <p v-if="showTypeFilter || typeFilter" class="mt-2 text-[11px] text-muted-foreground">
            Profile and group filters are applied by the server; Type covers the documents loaded so far.
          </p>
        </div>

        <p v-if="favError" class="text-xs text-destructive">{{ favError }}</p>

        <!-- Server-backed full-text search (aruna#258): active whenever q is non-empty. -->
        <template v-if="searchActive">
          <!-- Partial-result banner: served today via nodes_queried/nodes_failed, so it is
               NOT gated behind the cursor flag. Shows even when zero hits came back. -->
          <div
            v-if="partial"
            role="status"
            class="surface flex flex-wrap items-center gap-2 border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs"
          >
            <AlertTriangle class="h-4 w-4 text-amber-600" />
            <span>Partial results, {{ nodesQueried - nodesFailed }} of {{ nodesQueried }} nodes answered; matches on failed nodes are missing.</span>
            <Button variant="outline" size="sm" class="ml-auto" @click="retrySearch">Retry</Button>
          </div>

          <!-- Entity-kind chips: metadata stays the primary result set; groups and
               people render as extra sections like the top-bar quick search. -->
          <div v-if="textQuery" class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Result types">
            <button
              v-for="kind in KIND_OPTIONS"
              :key="kind.id"
              type="button"
              :class="[
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                kindFilter === kind.id
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              ]"
              @click="kindFilter = kind.id"
            >
              {{ kind.label }}
            </button>
          </div>

          <section v-if="showKind('groups') && groupMatches.length">
            <div class="mb-3 flex items-center gap-2">
              <Users class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Groups</h2>
              <span class="text-xs text-muted-foreground">{{ groupMatches.length }}</span>
            </div>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <RouterLink
                v-for="group in groupMatches"
                :key="group.id"
                :to="{ name: 'groups', params: { id: group.id } }"
                class="surface flex flex-col gap-1 p-4 transition-shadow hover:shadow-md"
              >
                <div class="text-sm font-medium text-foreground">{{ group.name }}</div>
                <p class="line-clamp-2 text-xs text-muted-foreground">{{ group.description || 'No description.' }}</p>
              </RouterLink>
            </div>
          </section>

          <section v-if="showKind('buckets') && (bucketResults.length || bucketsSearching || bucketsError)">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <Boxes class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Buckets</h2>
              <span class="text-xs text-muted-foreground">{{ bucketsSearching ? 'Searching…' : bucketResults.length }}</span>
              <span v-if="bucketsPartial && !bucketsSearching" role="status" class="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle class="h-3.5 w-3.5" />
                {{ bucketNodesQueried - bucketNodesFailed }} of {{ bucketNodesQueried }} nodes answered
              </span>
            </div>
            <p v-if="bucketsError" class="mb-3 text-xs text-destructive">{{ bucketsError }}</p>
            <div class="flex flex-wrap gap-2">
              <RouterLink
                v-for="hit in bucketResults"
                :key="hit.arn"
                :to="bucketHitRoute(hit)"
                class="surface inline-flex items-center gap-2 px-3 py-2 text-sm transition-shadow hover:shadow-md"
              >
                <Boxes class="h-3.5 w-3.5 text-primary/70" />
                <span class="font-mono text-xs font-medium text-foreground">{{ hit.bucket }}</span>
                <Badge :variant="isLocalNode(hit.node_id) ? 'accent' : 'outline'" class="text-[10px]" :title="hit.node_id">
                  {{ isLocalNode(hit.node_id) ? 'this node' : nodeDisplayName(hit.node_id) }}
                </Badge>
                <span class="text-[10px] text-muted-foreground" :title="hit.group_id">
                  Group: {{ hit.group_name || truncateMiddle(hit.group_id) }}
                </span>
              </RouterLink>
            </div>
          </section>

          <section v-if="showKind('people') && (peopleResults.length || peopleSearching)">
            <div class="mb-3 flex items-center gap-2">
              <UserRound class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">People</h2>
              <span class="text-xs text-muted-foreground">{{ peopleSearching ? 'Searching…' : peopleResults.length }}</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <RouterLink
                v-for="hit in peopleResults"
                :key="hit.user_id"
                :to="{ name: 'user-profile', params: { id: hit.user_id } }"
                class="surface inline-flex items-center gap-2 px-3 py-2 text-sm transition-shadow hover:shadow-md"
              >
                <UserRound class="h-3.5 w-3.5 text-primary/70" />
                <span class="font-medium text-foreground">{{ hit.name }}</span>
                <span class="font-mono text-[10px] text-muted-foreground" :title="hit.user_id">{{ shortUserId(hit.user_id) }}</span>
              </RouterLink>
            </div>
          </section>

          <EmptyState
            v-if="textQuery && kindFilter === 'buckets' && !bucketsSearching && !bucketResults.length && !bucketsError"
            title="No matching buckets"
            :description="currentUser ? `No bucket on the realm's nodes matched “${textQuery}”.` : 'Sign in to search for buckets.'"
          />
          <EmptyState
            v-else-if="textQuery && kindFilter === 'groups' && !groupMatches.length"
            title="No matching groups"
            :description="`No loaded group in ${realm.shortName} matched “${textQuery}”.`"
          />
          <EmptyState
            v-else-if="textQuery && kindFilter === 'people' && !peopleSearching && !peopleResults.length"
            title="No matching people"
            :description="currentUser ? `No user in ${realm.shortName} matched “${textQuery}”.` : 'Sign in to search for people.'"
          />

          <template v-if="showKind('datasets')">
          <ErrorPanel v-if="searchError" :message="searchError" @retry="retrySearch" />

          <!-- Skeletons cover the debounce window too (!searched), so the area
               never goes blank between the filter surface and the footer. -->
          <section v-else-if="(searchPending || !searched) && !searchResults.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton v-for="n in 6" :key="n" class="h-36" />
          </section>

          <section v-else-if="visibleResults.length">
            <div class="mb-3 flex items-center gap-2">
              <FileJson2 class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ textQuery ? 'Search results' : 'Documents with this profile' }}</h2>
              <span class="text-xs text-muted-foreground">{{ visibleResults.length }}</span>
              <span v-if="searchPending" class="text-xs text-muted-foreground">· Searching…</span>
            </div>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <template v-for="line in visibleResults" :key="line.hit.document_id">
                <CatalogCard
                  v-if="line.doc"
                  :doc="line.doc"
                  :score="textQuery ? line.hit.score : undefined"
                  :favourite="isFavourite(line.doc.ulid)"
                  :can-favourite="Boolean(currentUser)"
                  :favourite-busy="favBusy.has(line.doc.ulid)"
                  @toggle-favourite="toggleFav"
                />
                <!-- Server-side hit outside the loaded pages: title and snippet
                     come from the answering node, the rest opens on the detail
                     page (which handles unknown or private ids honestly). -->
                <RouterLink
                  v-else
                  :to="{ name: 'metadata-detail', params: { id: line.hit.document_id } }"
                  class="surface group flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md"
                >
                  <div>
                    <h3 v-if="line.title" class="font-display text-sm font-semibold text-aruna-navy">{{ line.title }}</h3>
                    <h3 v-else class="break-all font-mono text-xs font-semibold text-aruna-navy">{{ line.hit.document_path }}</h3>
                    <p v-if="line.snippet" class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ line.snippet }}</p>
                  </div>
                  <div class="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span class="truncate font-mono">{{ truncateMiddle(line.hit.document_id) }}</span>
                    <div class="flex shrink-0 items-center gap-1.5">
                      <Badge v-if="textQuery" variant="outline" class="text-[10px]">score {{ line.hit.score.toFixed(2) }}</Badge>
                      <span class="truncate">{{ groupNames.get(line.hit.group_id) ?? truncateMiddle(line.hit.group_id) }}</span>
                    </div>
                  </div>
                </RouterLink>
              </template>
            </div>
            <p v-if="hiddenByProfile > 0" class="mt-3 text-[11px] text-muted-foreground">
              {{ hiddenByProfile }} result(s) without catalog details are hidden by the profile filter.
            </p>
          </section>

          <EmptyState
            v-else-if="!cursorEnabled || (searched && !searchPending && !nextCursor && !loadingMore)"
            :title="searchResults.length ? 'No matches after filters' : 'No matches'"
            :description="searchResults.length
              ? 'Results were hidden by the active group, profile or favourites filters.'
              : textQuery
                ? `No metadata in ${realm.shortName} matched “${textQuery}”.`
                : `No document in ${realm.shortName} conforms to this profile.`"
          >
            <Button v-if="searchResults.length" variant="outline" @click="clearFilters">Clear filters</Button>
          </EmptyState>

          <!-- Paging stays outside the visible-results branch so filters cannot
               strand matches on later server pages. Re-keying the sentinel
               continues paging while a fully filtered page is on screen. -->
          <template v-if="cursorEnabled && searched && !searchError">
            <div v-if="loadingMore" class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton v-for="n in 3" :key="n" class="h-36" />
            </div>
            <div v-if="moreError" class="mt-3 flex items-center justify-center gap-2 text-xs text-destructive">
              {{ moreError }}
              <Button variant="outline" size="sm" @click="loadMore">Try again</Button>
            </div>
            <div v-if="nextCursor && !moreError && !loadingMore" :key="nextCursor" ref="sentinel" class="h-1" aria-hidden="true" />
            <p v-else-if="!moreError && !searchPending && !loadingMore" class="py-2 text-center text-[11px] text-muted-foreground">
              {{ truncated ? 'End of the first results, refine the query to reach matches past the server depth cap.' : 'End of results.' }}
            </p>
          </template>
          <p v-else-if="!cursorEnabled && capped" class="py-2 text-center text-[11px] text-muted-foreground">
            Showing the first 100 matches by relevance, refine the query to narrow results.
          </p>
          </template>
        </template>

        <!-- Browse path: one page at a time, extended on demand. The realm is
             never enumerated; group and favourites browsing fetch their own. -->
        <template v-else>
          <section v-if="!bootstrapped || (browseLoading && !browseSource.length) || (loading && !metadata.length)" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton v-for="n in 6" :key="n" class="h-36" />
          </section>

          <ErrorPanel v-else-if="error" :message="error" @retry="refresh" />

          <template v-else>
            <template v-if="hits.length">
              <section v-if="catalogSplit.datasets.length">
                <div class="mb-3 flex items-center gap-2">
                  <FileJson2 class="h-4 w-4 text-primary" />
                  <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ filtering ? 'Matching metadata' : 'Catalog' }}</h2>
                  <span class="text-xs text-muted-foreground">{{ catalogSplit.datasets.length }}</span>
                </div>
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <CatalogCard
                    v-for="doc in catalogSplit.datasets"
                    :key="doc.ulid"
                    :doc="doc"
                    :favourite="isFavourite(doc.ulid)"
                    :can-favourite="Boolean(currentUser)"
                    :favourite-busy="favBusy.has(doc.ulid)"
                    @toggle-favourite="toggleFav"
                  />
                </div>
              </section>

              <!-- Process Run crates get their own
                   section so compute runs never mix with ordinary datasets. -->
              <section v-if="catalogSplit.runs.length">
                <div class="mb-3 flex items-center gap-2">
                  <Play class="h-4 w-4 text-primary" />
                  <h2 class="font-display text-sm font-semibold text-aruna-navy">Compute runs</h2>
                  <span class="text-xs text-muted-foreground">{{ catalogSplit.runs.length }}</span>
                </div>
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <CatalogCard
                    v-for="doc in catalogSplit.runs"
                    :key="doc.ulid"
                    :doc="doc"
                    :favourite="isFavourite(doc.ulid)"
                    :can-favourite="Boolean(currentUser)"
                    :favourite-busy="favBusy.has(doc.ulid)"
                    @toggle-favourite="toggleFav"
                  />
                </div>
              </section>
            </template>

            <EmptyState
              v-else-if="filtering"
              title="No matches here yet"
              :description="browseExhausted
                ? `Nothing in ${realm.shortName} matches the active filters.`
                : 'Nothing on the documents loaded so far matches the active filters. Load more, or search by name.'"
            >
              <Button variant="outline" @click="clearFilters">Clear filters</Button>
            </EmptyState>

            <EmptyState
              v-else
              :title="`No visible metadata in ${realm.shortName}`"
              description="No RO-Crate metadata documents are visible here yet."
            >
              <Button v-if="currentUser" @click="showNewDataset = true"><Plus class="h-4 w-4" /> New metadata</Button>
            </EmptyState>

            <p v-if="browseError" class="text-center text-xs text-destructive">{{ browseError }}</p>
            <!-- Paging is load-more, driven only by the page size; a node that
                 serves an estimate adds an "about N" to the copy. -->
            <div v-if="hits.length || !browseExhausted" class="flex flex-col items-center gap-2">
              <p
                class="text-[11px] text-muted-foreground"
                :title="browseEstimate !== null ? 'The server estimates this count per group, so it is approximate.' : undefined"
              >
                {{ browseSummary }}
              </p>
              <Button v-if="!browseExhausted" variant="outline" :disabled="browseLoading" @click="loadMoreBrowse">
                {{ browseLoading ? 'Loading…' : 'Load more' }}
              </Button>
            </div>
          </template>
        </template>
      </template>

      <template v-else>
        <section class="surface p-4">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <Code2 class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">SPARQL workbench</h2>
              <Badge variant="secondary" class="text-[10px] uppercase">real API</Badge>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>Local</span>
                <Switch :checked="sparqlDistributed" aria-label="Use distributed SPARQL execution" @update:checked="sparqlDistributed = $event" />
                <span>Distributed</span>
              </div>
              <Button size="sm" :disabled="running" @click="runQuery"><Play class="h-3.5 w-3.5" /> {{ running ? 'Running…' : 'Run query' }}</Button>
            </div>
          </div>
          <textarea v-model="sparql" rows="14" class="mt-3 w-full rounded-md border border-input bg-muted/20 p-3 font-mono text-[12px] leading-relaxed text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <p class="mt-2 text-[11px] text-muted-foreground">Only SELECT and ASK queries are accepted. Distributed SELECT queries must include DISTINCT.</p>
          <div v-if="sparqlError" class="mt-3 text-xs text-destructive">{{ sparqlError }}</div>
        </section>

        <section v-if="sparqlResult" class="surface overflow-hidden">
          <header class="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
            <span>{{ sparqlResult.totalRows }} rows · {{ sparqlResult.tookMs }} ms</span>
            <span class="font-mono">scope: {{ realm.shortName }}</span>
          </header>
          <div class="max-h-[480px] overflow-auto scrollbar-thin">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-background text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th v-for="column in sparqlResult.columns" :key="column" class="px-3 py-2 text-left font-semibold">{{ column }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in sparqlResult.rows" :key="index" class="border-t border-border">
                  <td v-for="column in sparqlResult.columns" :key="column" class="px-3 py-2 font-mono text-[11.5px] text-foreground/80">{{ row[column] }}</td>
                </tr>
                <tr v-if="!sparqlResult.rows.length"><td :colspan="Math.max(1, sparqlResult.columns.length)" class="px-3 py-6 text-center text-xs text-muted-foreground">No rows returned.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>

    <NewDatasetDialog v-model:open="showNewDataset" @created="(doc) => router.push({ name: 'metadata-detail', params: { id: doc.ulid } })" />
  </div>
</template>
