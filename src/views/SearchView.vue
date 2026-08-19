<script lang="ts">
import type { MetadataDoc as PurposeMetadataDoc } from '@/data/types'
import { conformsToProcessRun } from '@/lib/profiles/builtinProfiles'
import { DX_PROFILE } from '@/lib/profiles/types'

export type DatasetPurpose = 'dataset' | 'profile' | 'process-run'

const PROFILE_ROOT_TYPES = new Set([
  'Profile',
  'prof:Profile',
  DX_PROFILE,
])

// P0-5 precedence: semantic Profile root type, exact Process Run conformance,
// then the default Dataset purpose. Storage paths never decide the purpose.
export function datasetPurposeOf(
  doc?: Pick<PurposeMetadataDoc, 'type' | 'conformsToIds'> | null,
): DatasetPurpose {
  const rootTypes = (doc?.type ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
  if (rootTypes.some((type) => PROFILE_ROOT_TYPES.has(type))) return 'profile'
  if (conformsToProcessRun(doc?.conformsToIds)) return 'process-run'
  return 'dataset'
}

export function datasetPurposeLabel(purpose: DatasetPurpose): string {
  if (purpose === 'profile') return 'Profile'
  if (purpose === 'process-run') return 'Process Run'
  return 'Dataset'
}
</script>

<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import SearchFilterBar, { type Facet, type FilterModel } from '@/components/search/SearchFilterBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Pagination from '@/components/ui/Pagination.vue'
import ErrorPanel from '@/components/ui/ErrorPanel.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import NewDatasetDialog from '@/components/metadata/NewDatasetDialog.vue'
import CrateTransferDialog from '@/components/metadata/CrateTransferDialog.vue'
import CatalogCard from '@/components/metadata/CatalogCard.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  buildSparqlExportArtifact,
  DEFAULT_SPARQL_MODE,
  IncompleteSparqlResultError,
  sparqlCoverageStatus,
  useAruna,
} from '@/composables/useAruna'
import { useMetadataSearch } from '@/composables/useMetadataSearch'
import { useCatalogBrowse, type CatalogPageParams } from '@/composables/useCatalogBrowse'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { useJobs } from '@/composables/useJobs'
import { useDebounceFn } from '@vueuse/core'
import { formatNumber, shortUserId, truncateMiddle } from '@/lib/utils'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { Search, FileArchive, FileJson2, Boxes, Code2, Play, Plus, Star, AlertTriangle, Users, UserRound, Download, ListChecks } from '@lucide/vue'
import type { MetadataDoc, SparqlExecutionMode, SparqlResult } from '@/data/types'
import type { BucketSearchHit, ListMetadataResponse, MetadataDocumentListItem, UserSearchHit } from '@/lib/api'
import type { RouteLocationRaw } from 'vue-router'

const route = useRoute()
const router = useRouter()
const {
  realm,
  metadata,
  profiles,
  currentUser,
  error,
  bootstrapped,
  refresh,
  runSparql,
  toggleFavourite,
  myGroups,
  discoverableGroups,
  searchUsers,
  searchUnified,
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

function queryPurposeFilter(value: unknown): DatasetPurpose | null {
  const purpose = queryString(value)
  return purpose === 'dataset' || purpose === 'profile' || purpose === 'process-run'
    ? purpose
    : null
}

function queryPage(value: unknown): number {
  const parsed = Number.parseInt(queryString(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

const q = ref(queryString(route.query.q))
const profileFilter = ref<string | null>(queryFilter(route.query.profile))
// Search push-down: the group filter maps to the server group_id and the profile
// filter to conforms_to when it resolves to a local profile IRI. Browsing with a
// group filter pages a group-scoped listing instead of the shared catalog.
const groupFilter = ref<string | null>(queryFilter(route.query.group))
// Dataset purpose is classified client-side from the semantic P0-5 fields.
const typeFilter = ref<DatasetPurpose | null>(queryPurposeFilter(route.query.type))
const favouritesOnly = ref(false)
// 1-based browse page, kept in the URL so a page can be shared and the browser
// back button steps through it.
const browsePage = ref(queryPage(route.query.page))

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
  paging: searchPaging,
  restarting: searchRestarting,
  error: searchError,
  pageError: searchPageError,
  searched,
  results: searchResults,
  nodesQueried,
  nodesFailed,
  truncated,
  partial,
  capped,
  page: searchPage,
  pageCount: searchPageCount,
  hasNextPage: searchHasNext,
  depthCapped: searchDepthCapped,
  cursorEnabled,
  goToPage: goToSearchPage,
  retry: retrySearch,
} = useMetadataSearch(q, { groupId: groupFilter, conformsTo: conformsToIri }, { cached: true })
const expertMode = ref(queryString(route.query.expert) === '1')
const favBusy = ref<Set<string>>(new Set())
const favError = ref<string | null>(null)
const showNewDataset = ref(false)
const showCrateImport = ref(false)
const { jobsEnabled } = useJobs()
const sparql = ref(`SELECT DISTINCT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 25`)
const sparqlMode = ref<SparqlExecutionMode>(DEFAULT_SPARQL_MODE)
const sparqlResult = ref<SparqlResult | null>(null)
const sparqlResultQuery = ref('')
const sparqlError = ref<string | null>(null)
const sparqlFailure = ref(false)
const sparqlFailureResult = ref<SparqlResult | null>(null)
const sparqlFailureMode = ref<SparqlExecutionMode | null>(null)
const running = ref(false)

// One watcher builds the whole query from the refs. Spreading route.query in a
// per-ref watcher re-applies a stale value when two refs change in the same tick
// (e.g. clearFilters): vue-router only updates route.query after the async
// navigation settles, so the second replace would resurrect a param the first
// meant to drop.
watch([q, profileFilter, groupFilter, typeFilter, expertMode, browsePage], ([nq, np, ng, nt, ne, npage]) => {
  if (
    queryString(route.query.q) === nq &&
    queryFilter(route.query.profile) === np &&
    queryFilter(route.query.group) === ng &&
    queryPurposeFilter(route.query.type) === nt &&
    (queryString(route.query.expert) === '1') === ne &&
    queryPage(route.query.page) === npage
  ) {
    return
  }
  void router.replace({
    query: {
      ...route.query,
      q: nq || undefined,
      profile: np || undefined,
      group: ng || undefined,
      type: nt || undefined,
      expert: ne ? '1' : undefined,
      page: npage > 1 ? String(npage) : undefined,
    },
  })
})

// Keep the mounted view in sync with top-bar navigation and browser history.
watch(
  () => route.query,
  (query) => {
    q.value = queryString(query.q)
    profileFilter.value = queryFilter(query.profile)
    groupFilter.value = queryFilter(query.group)
    typeFilter.value = queryPurposeFilter(query.type)
    expertMode.value = queryString(query.expert) === '1'
    browsePage.value = queryPage(query.page)
  },
)

// The active search query switches the whole branch, so the browse "filtering"
// state only tracks the client-side filters.
const filtering = computed(() => Boolean(profileFilter.value || groupFilter.value || typeFilter.value || favouritesOnly.value))
const favouriteIds = computed(() => currentUser.value?.favouriteMetadataIds ?? [])

// ── Browse paging ───────────────────────────────────────────────────────────
// Browse renders ONE page at a time: GET /metadata takes limit and offset, so
// any page is reachable directly and the group facet rides the same request.
// Favourites are a small curated id list, fetched whole and sliced client-side.
const BROWSE_PAGE_SIZE = 48
const FAVOURITE_FETCH_CAP = 100
// Each favourite costs two requests, so they are fetched in bounded batches.
const FAVOURITE_FETCH_BATCH = 6

const browseDocs = ref<MetadataDoc[]>([])
const browseReturned = ref(0)
// The page size the server actually applied; a page shorter than it is the end.
const browseLimit = ref(BROWSE_PAGE_SIZE)
const browseEstimateRaw = ref<number | null>(null)
const browseLoading = ref(false)
const browseError = ref<string | null>(null)
let browseSeq = 0
const browseCache = useCatalogBrowse()

function browseParams(): CatalogPageParams {
  return {
    limit: BROWSE_PAGE_SIZE,
    offset: (browsePage.value - 1) * BROWSE_PAGE_SIZE,
    groupId: groupFilter.value,
    summary: true,
  }
}

/** Paints a cached window exactly as a fresh response would. */
function paintWindow(response: ListMetadataResponse) {
  browseDocs.value = response.documents.map(toMetadataDoc)
  browseReturned.value = response.total_returned
  browseLimit.value = response.limit
  browseEstimateRaw.value = response.total_estimate ?? null
}

async function loadBrowsePage(force = false) {
  const seq = ++browseSeq
  const params = browseParams()
  const key = browseCache.key(params)
  browseLoading.value = true
  browseError.value = null
  // A window cached for this exact page paints at once and revalidates behind
  // the dim treatment; the skeleton stays reserved for a page never loaded.
  if (browseCache.hasCached(key)) paintWindow(browseCache.page.value)
  try {
    await browseCache.load(params, force)
    if (seq !== browseSeq) return
    if (browseCache.hasCached(key)) paintWindow(browseCache.page.value)
    else {
      // A stale page under a new page number would be a lie; drop it.
      browseDocs.value = []
      browseReturned.value = 0
    }
    // A failed revalidation keeps the window it could not replace, so the
    // message is surfaced beside the documents instead of clearing them.
    browseError.value = browseCache.error.value
  } catch (err) {
    if (seq !== browseSeq) return
    browseDocs.value = []
    browseReturned.value = 0
    browseError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (seq === browseSeq) browseLoading.value = false
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

// The visible page depends on the session too: signing in or out changes which
// documents the offset window contains.
watch(
  [browsePage, groupFilter, () => searchActive.value, favouritesOnly, () => currentUser.value?.id ?? ''],
  ([, , searching, favourites]) => {
    if (searching || favourites) {
      ++browseSeq
      browseDocs.value = []
      browseReturned.value = 0
      browseEstimateRaw.value = null
      browseLoading.value = false
      browseError.value = null
      return
    }
    void loadBrowsePage()
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

const favouritePages = computed(() =>
  Math.max(1, Math.ceil(favouriteDocs.value.length / BROWSE_PAGE_SIZE)),
)

const browseSource = computed<MetadataDoc[]>(() => {
  if (!favouritesOnly.value) return browseDocs.value
  const start = (browsePage.value - 1) * BROWSE_PAGE_SIZE
  return favouriteDocs.value.slice(start, start + BROWSE_PAGE_SIZE)
})
const browseBusy = computed(() => browseLoading.value || favouritesLoading.value)
// The outgoing page stays on screen while the next one loads, so it is dimmed
// and marked busy instead of reading as the page that was just requested.
const browseStale = computed(() => browseBusy.value && browseSource.value.length > 0)
// A refresh failed over documents it could not replace: they stay on screen and
// the error rides beside them instead of taking the whole area.
const keptBrowse = computed(() => Boolean(browseError.value) && browseSource.value.length > 0)

// A FULL page is the only proof that another one follows: total_estimate is an
// approximation, and an under-count must never hide a page the server serves.
const hasNextPage = computed(() => {
  if (favouritesOnly.value) return browsePage.value < favouritePages.value
  return browseReturned.value >= browseLimit.value
})

// APPROXIMATE match count from the server (estimated per group, so it can over-
// or under-count) and absent on small limits or older nodes.
const browseEstimate = computed<number | null>(() => {
  if (favouritesOnly.value) return favouriteDocs.value.length
  if (browseEstimateRaw.value === null) return null
  return Math.max(0, browseEstimateRaw.value)
})

// Approximate page count; null without an estimate, which degrades the pager to
// Previous/Next. A proven short page outranks an over-counting estimate, and a
// proven next page outranks an under-counting one.
const pageCount = computed<number | null>(() => {
  if (favouritesOnly.value) return favouritePages.value
  if (browseEstimate.value === null) return null
  const estimated = Math.max(1, Math.ceil(browseEstimate.value / BROWSE_PAGE_SIZE))
  if (hasNextPage.value) return Math.max(estimated, browsePage.value + 1)
  return browseReturned.value > 0 ? browsePage.value : estimated
})

const browseSummary = computed(() => {
  const shown = formatNumber(hits.value.length)
  const page = formatNumber(browsePage.value)
  if (pageCount.value === null) return `Page ${page} · ${shown} Datasets on this page.`
  // Favourites are fetched by id, so only the server estimate reads "about".
  const about = favouritesOnly.value ? '' : 'about '
  return `Page ${page} of ${about}${formatNumber(pageCount.value)} · ${shown} Datasets on this page.`
})

function goToPage(page: number) {
  if (browseBusy.value || page < 1 || page === browsePage.value) return
  browsePage.value = page
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function retryBrowse() {
  // An explicit retry always reaches the server, freshness window or not.
  if (favouritesOnly.value) void loadFavourites()
  else void loadBrowsePage(true)
}

// The group filter is served by the source itself; profile, purpose and favourites
// still narrow what the source returned.
const hits = computed(() =>
  browseSource.value.filter((doc) => {
    if (profileFilter.value && !(doc.profileIds ?? []).includes(profileFilter.value)) return false
    if (groupFilter.value && doc.realmId !== groupFilter.value) return false
    if (typeFilter.value && datasetPurposeOf(doc) !== typeFilter.value) return false
    if (favouritesOnly.value && !favouriteIds.value.includes(doc.ulid)) return false
    return true
  }),
)
const catalogSplit = computed(() => {
  const runs: MetadataDoc[] = []
  const profileDocs: MetadataDoc[] = []
  const datasets: MetadataDoc[] = []
  for (const doc of hits.value) {
    const purpose = datasetPurposeOf(doc)
    if (purpose === 'profile') profileDocs.push(doc)
    else if (purpose === 'process-run') runs.push(doc)
    else datasets.push(doc)
  }
  return { runs, profiles: profileDocs, datasets }
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
const typeFacetOptions = [
  { value: 'dataset', label: 'Dataset' },
  { value: 'profile', label: 'Profile' },
  { value: 'process-run', label: 'Process Run' },
]
const groupFacetOptions = computed(() => groupOptions.value.map((option) => ({ value: option.id, label: option.label })))

// Extensible filter config: one entry per facet. Adding a facet means pushing
// one more entry here (single select, `multi: true`, or `toggle: true`) with no
// template changes. The favourites toggle only appears for a signed-in user.
const filterFacets = computed<Facet[]>(() => {
  const facets: Facet[] = [
    { key: 'type', label: 'Purpose', options: typeFacetOptions },
    { key: 'profile', label: 'Profile', options: profileFacetOptions.value },
  ]
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
    typeFilter.value = next.type === 'dataset' || next.type === 'profile' || next.type === 'process-run'
      ? next.type
      : null
    groupFilter.value = typeof next.group === 'string' ? next.group : null
    favouritesOnly.value = next.favourites === true
    // A different filter means a different listing; page numbers do not carry.
    browsePage.value = 1
  },
})

// Group and profile filters are pushed to the server; only a favourites filter,
// and a non-IRI profile filter, still narrow the returned hits client-side.
const visibleResults = computed(() =>
  searchResults.value.filter((line) => {
    if (favouritesOnly.value && !favouriteIds.value.includes(line.hit.document_id)) return false
    if (profileFilter.value && !profilePushedDown.value && !(line.doc?.profileIds ?? []).includes(profileFilter.value)) return false
    if (typeFilter.value && datasetPurposeOf(line.doc) !== typeFilter.value) return false
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

// ── Search paging ───────────────────────────────────────────────────────────
// Search pages one opaque cursor at a time, so unlike browse there is no match
// total and no addressable offset: the summary states the page number only, the
// pager offers the pages already reached, and the page stays out of the URL
// because a cursor cannot be reconstructed from it.
const searchSummary = computed(() => {
  const count = visibleResults.value.length
  return `Page ${formatNumber(searchPage.value)} · ${formatNumber(count)} result${count === 1 ? '' : 's'} on this page.`
})

function showSearchPage(page: number) {
  goToSearchPage(page)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

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

// A metadata request is in flight, including the debounce window before it
// leaves: `searched` flips back to false on every query and filter change.
const searchBusy = computed(
  () =>
    searchActive.value &&
    !searchError.value &&
    (searchPending.value || searchPaging.value || !searched.value),
)
// Results from the previous request are still on screen while a new one runs.
const searchStale = computed(() => searchBusy.value && visibleResults.value.length > 0)
// A refresh failed over results it could not replace: they stay on screen and
// the error rides beside them instead of taking the whole area.
const keptResults = computed(() => Boolean(searchError.value) && searchResults.value.length > 0)

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
  browsePage.value = 1
}

const sparqlModeLabels: Record<SparqlExecutionMode, string> = {
  local: 'Local',
  'distributed-best-effort': 'Distributed best-effort',
  'distributed-strict': 'Distributed strict',
}
const sparqlModeOptions = Object.entries(sparqlModeLabels).map(([value, label]) => ({ value, label }))

function downloadSparqlResult() {
  const result = sparqlResult.value
  if (!result) return
  const artifact = buildSparqlExportArtifact(result, {
    query: sparqlResultQuery.value,
    scope: realm.value.id,
    timestamp: new Date().toISOString(),
  })
  const url = URL.createObjectURL(new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = result.complete ? 'sparql-results.json' : 'sparql-partial-results-with-manifest.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function runQuery() {
  sparqlError.value = null
  sparqlFailure.value = false
  sparqlFailureResult.value = null
  sparqlFailureMode.value = null
  const query = sparql.value
  const mode = sparqlMode.value
  const selectClause = query.match(/(?:^|[>\r\n])\s*SELECT\b([\s\S]*?)(?:\bWHERE\b|\{)/i)?.[1]
  if (mode !== 'local' && selectClause !== undefined && !/\bDISTINCT\b/i.test(selectClause)) {
    sparqlError.value = 'Distributed SELECT queries must include DISTINCT in the SELECT clause.'
    sparqlResult.value = null
    return
  }
  running.value = true
  try {
    sparqlResult.value = await runSparql(query, mode)
    sparqlResultQuery.value = query
  } catch (err) {
    sparqlError.value = err instanceof Error ? err.message : String(err)
    sparqlFailure.value = true
    sparqlFailureResult.value = err instanceof IncompleteSparqlResultError ? err.result : null
    sparqlFailureMode.value = mode
    sparqlResult.value = null
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Datasets"
      description="Browse every visible RO-Crate by Dataset purpose, search across supported resource kinds, or use the SPARQL workbench."
    >
      <template #breadcrumbs>
        <template v-if="groupFilter">
          <span>·</span>
          <Badge variant="outline" :title="groupFilter">
            Group: {{ groupNames.get(groupFilter) ?? truncateMiddle(groupFilter) }}
          </Badge>
        </template>
        <span>·</span>
        <span>What is this?</span>
        <RouterLink
          :to="{ name: 'docs', params: { topic: 'datasets' } }"
          class="font-medium text-primary hover:underline"
        >Learn more</RouterLink>
      </template>
      <template #actions>
        <Button :disabled="!currentUser" @click="showNewDataset = true"><Plus class="h-4 w-4" /> Create dataset</Button>
        <!-- Importing an archive registers a NEW document, so it lives here next
             to Create dataset rather than on a single Dataset's page. -->
        <Button
          v-if="currentUser && jobsEnabled"
          variant="outline"
          title="Upload an RO-Crate zip or eln archive and register it as a new Dataset"
          @click="showCrateImport = true"
        >
          <FileArchive class="h-4 w-4" /> Import RO-Crate dataset
        </Button>
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
            <input v-model="q" :aria-busy="searchBusy" placeholder="Search Datasets, data, groups, and people…" class="h-10 w-full rounded-md border border-input bg-background pl-9 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring" />
            <Spinner v-if="searchBusy" label="Searching…" class="absolute right-3 top-1/2 -translate-y-1/2 text-primary" />
          </div>
          <SearchFilterBar v-model="filterModel" :facets="filterFacets" aria-label="Dataset filters" class="mt-3" />
          <p class="mt-2 text-[11px] text-muted-foreground">
            Purpose classifies each RO-Crate as Dataset, Profile, or Process Run. Profile and group filters are applied by the server.
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

          <section v-if="showKind('buckets') && (bucketResults.length || bucketsSearching || bucketsError)" :aria-busy="bucketsSearching">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <Boxes class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">Buckets</h2>
              <Spinner v-if="bucketsSearching" show-label label="Searching…" />
              <span v-else class="text-xs text-muted-foreground">{{ bucketResults.length }}</span>
              <span v-if="bucketsPartial && !bucketsSearching" role="status" class="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle class="h-3.5 w-3.5" />
                {{ bucketNodesQueried - bucketNodesFailed }} of {{ bucketNodesQueried }} nodes answered
              </span>
            </div>
            <p v-if="bucketsError" class="mb-3 text-xs text-destructive">{{ bucketsError }}</p>
            <div class="flex flex-wrap gap-2 transition-opacity" :class="bucketsSearching && bucketResults.length ? 'opacity-40' : ''">
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

          <section v-if="showKind('people') && (peopleResults.length || peopleSearching)" :aria-busy="peopleSearching">
            <div class="mb-3 flex items-center gap-2">
              <UserRound class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">People</h2>
              <Spinner v-if="peopleSearching" show-label label="Searching…" />
              <span v-else class="text-xs text-muted-foreground">{{ peopleResults.length }}</span>
            </div>
            <div class="flex flex-wrap gap-2 transition-opacity" :class="peopleSearching && peopleResults.length ? 'opacity-40' : ''">
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
          <div v-if="keptResults" class="flex flex-wrap items-center justify-center gap-2 text-xs text-destructive">
            {{ searchError }}
            <Button variant="outline" size="sm" @click="retrySearch">Try again</Button>
          </div>

          <ErrorPanel v-if="searchError && !keptResults" :message="searchError" @retry="retrySearch" />

          <!-- Skeletons cover the debounce window too (!searched), and the walk
               to a page past the cached ones, so the area never goes blank. -->
          <section v-else-if="(searchPending || searchPaging || !searched) && !searchResults.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton v-for="n in 6" :key="n" class="h-36" />
          </section>

          <section v-else-if="visibleResults.length" :aria-busy="searchBusy">
            <div class="mb-3 flex items-center gap-2">
              <FileJson2 class="h-4 w-4 text-primary" />
              <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ textQuery ? 'Dataset results' : 'Datasets with this profile' }}</h2>
              <span class="text-xs text-muted-foreground">{{ visibleResults.length }}</span>
              <span v-if="searchStale" class="text-xs text-muted-foreground">· previous results</span>
            </div>
            <div class="grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3" :class="searchStale ? 'opacity-40' : ''">
              <template v-for="line in visibleResults" :key="line.hit.document_id">
                <div v-if="line.doc" class="flex min-w-0 flex-col gap-1.5">
                  <Badge variant="secondary" class="w-fit text-[10px] uppercase">
                    {{ datasetPurposeLabel(datasetPurposeOf(line.doc)) }}
                  </Badge>
                  <CatalogCard
                    :doc="line.doc"
                    :score="textQuery ? line.hit.score : undefined"
                    :favourite="isFavourite(line.doc.ulid)"
                    :can-favourite="Boolean(currentUser)"
                    :favourite-busy="favBusy.has(line.doc.ulid)"
                    @toggle-favourite="toggleFav"
                  />
                </div>
                <!-- Server-side hit outside the loaded pages: title and snippet
                     come from the answering node, the rest opens on the detail
                     page (which handles unknown or private ids honestly). -->
                <RouterLink
                  v-else
                  :to="{ name: 'metadata-detail', params: { id: line.hit.document_id } }"
                  class="surface group flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md"
                >
                  <Badge variant="secondary" class="w-fit text-[10px] uppercase">Dataset</Badge>
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
            v-else-if="!cursorEnabled || (searched && !searchPending && !searchPaging)"
            :title="searchResults.length ? 'No matches after filters' : 'No matches'"
            :description="searchResults.length
              ? 'Results were hidden by the active purpose, group, profile, or favourites filters.'
              : textQuery
                ? `No Dataset in ${realm.shortName} matched “${textQuery}”.`
                : `No Dataset in ${realm.shortName} conforms to this profile.`"
          >
            <Button v-if="searchResults.length" variant="outline" @click="clearFilters">Clear filters</Button>
          </EmptyState>

          <!-- Paging stays outside the visible-results branch so filters cannot
               strand matches on later server pages: a fully filtered page still
               offers Next. Numbers cover the pages reached so far only. -->
          <!-- Kept results still carry the cursor of the page they came from,
               so a failed refresh does not take the pager with it. -->
          <template v-if="cursorEnabled && searched && (!searchError || keptResults)">
            <div v-if="searchPageError" class="mt-3 flex items-center justify-center gap-2 text-xs text-destructive">
              {{ searchPageError }}
              <Button variant="outline" size="sm" @click="showSearchPage(searchPage + 1)">Try again</Button>
            </div>
            <div class="mt-4 flex flex-col items-center gap-2">
              <p
                v-if="searchPageCount > 1 || searchHasNext"
                class="text-[11px] text-muted-foreground"
                title="Search pages are walked with an opaque cursor and the server counts no matches, so there is no page total."
              >
                {{ searchSummary }}
              </p>
              <!-- A rejected cursor forces a refetch from page one, so every
                   stored cursor is dead until it lands. -->
              <Pagination
                :page="searchPage"
                :page-count="searchPageCount"
                :has-next="searchHasNext"
                :disabled="searchRestarting"
                @update:page="showSearchPage"
              />
              <p v-if="!searchHasNext && !searchPaging && !searchRestarting && !searchPageError" class="py-2 text-center text-[11px] text-muted-foreground">
                {{ truncated || searchDepthCapped
                  ? 'End of the first results, refine the query to reach matches past the server depth cap.'
                  : 'End of results.' }}
              </p>
            </div>
          </template>
          <p v-else-if="!cursorEnabled && capped" class="py-2 text-center text-[11px] text-muted-foreground">
            Showing the first 100 matches by relevance, refine the query to narrow results.
          </p>
          </template>
        </template>

        <!-- Browse path: one page at a time, navigated by page number. The realm
             is never enumerated; favourites browse the user's own id list. -->
        <template v-else>
          <section v-if="!bootstrapped || (browseBusy && !browseSource.length)" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton v-for="n in 6" :key="n" class="h-36" />
          </section>

          <ErrorPanel v-else-if="browseError && !keptBrowse" :message="browseError" @retry="retryBrowse" />

          <ErrorPanel v-else-if="error && !keptBrowse" :message="error" @retry="refresh" />

          <template v-else>
            <!-- Kept documents: the failed refresh reports next to them. -->
            <div v-if="keptBrowse" class="flex flex-wrap items-center justify-center gap-2 text-xs text-destructive">
              {{ browseError }}
              <Button variant="outline" size="sm" @click="retryBrowse">Try again</Button>
            </div>

            <Spinner v-if="browseStale" show-label :label="`Loading page ${browsePage}…`" class="flex" />

            <!-- Paging keeps the outgoing page on screen; it dims and is marked
                 busy so it never reads as the page that was just requested. -->
            <div
              v-if="hits.length"
              class="space-y-6 transition-opacity"
              :class="browseStale ? 'opacity-40' : ''"
              :aria-busy="browseBusy"
            >
              <section v-if="catalogSplit.datasets.length">
                <div class="mb-3 flex items-center gap-2">
                  <FileJson2 class="h-4 w-4 text-primary" />
                  <h2 class="font-display text-sm font-semibold text-aruna-navy">{{ filtering ? 'Matching Datasets' : 'Datasets' }}</h2>
                  <span class="text-xs text-muted-foreground">{{ catalogSplit.datasets.length }}</span>
                </div>
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div
                    v-for="doc in catalogSplit.datasets"
                    :key="doc.ulid"
                    class="flex min-w-0 flex-col gap-1.5"
                  >
                    <Badge variant="secondary" class="w-fit text-[10px] uppercase">Dataset</Badge>
                    <CatalogCard
                      :doc="doc"
                      :favourite="isFavourite(doc.ulid)"
                      :can-favourite="Boolean(currentUser)"
                      :favourite-busy="favBusy.has(doc.ulid)"
                      @toggle-favourite="toggleFav"
                    />
                  </div>
                </div>
              </section>

              <section v-if="catalogSplit.profiles.length">
                <div class="mb-3 flex items-center gap-2">
                  <ListChecks class="h-4 w-4 text-primary" />
                  <h2 class="font-display text-sm font-semibold text-aruna-navy">Profiles</h2>
                  <span class="text-xs text-muted-foreground">{{ catalogSplit.profiles.length }}</span>
                </div>
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div
                    v-for="doc in catalogSplit.profiles"
                    :key="doc.ulid"
                    class="flex min-w-0 flex-col gap-1.5"
                  >
                    <Badge variant="secondary" class="w-fit text-[10px] uppercase">Profile</Badge>
                    <CatalogCard
                      :doc="doc"
                      :favourite="isFavourite(doc.ulid)"
                      :can-favourite="Boolean(currentUser)"
                      :favourite-busy="favBusy.has(doc.ulid)"
                      @toggle-favourite="toggleFav"
                    />
                  </div>
                </div>
              </section>

              <section v-if="catalogSplit.runs.length">
                <div class="mb-3 flex items-center gap-2">
                  <Play class="h-4 w-4 text-primary" />
                  <h2 class="font-display text-sm font-semibold text-aruna-navy">Process Runs</h2>
                  <span class="text-xs text-muted-foreground">{{ catalogSplit.runs.length }}</span>
                </div>
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div
                    v-for="doc in catalogSplit.runs"
                    :key="doc.ulid"
                    class="flex min-w-0 flex-col gap-1.5"
                  >
                    <Badge variant="secondary" class="w-fit text-[10px] uppercase">Process Run</Badge>
                    <CatalogCard
                      :doc="doc"
                      :favourite="isFavourite(doc.ulid)"
                      :can-favourite="Boolean(currentUser)"
                      :favourite-busy="favBusy.has(doc.ulid)"
                      @toggle-favourite="toggleFav"
                    />
                  </div>
                </div>
              </section>
            </div>

            <!-- Past the end: the estimate can under- or over-count, so a page
                 number can outrun the listing. Never strand the user there. -->
            <EmptyState
              v-else-if="browsePage > 1 && !browseSource.length"
              title="Nothing on this page"
              :description="`Page ${browsePage} is past the end of this listing.`"
            >
              <div class="flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" @click="goToPage(browsePage - 1)">Previous page</Button>
                <Button variant="outline" @click="goToPage(1)">First page</Button>
              </div>
            </EmptyState>

            <EmptyState
              v-else-if="filtering"
              title="No matches on this page"
              :description="hasNextPage
                ? 'No Dataset on this page matches the active filters. Try the next page, or search by name.'
                : `Nothing in ${realm.shortName} matches the active filters.`"
            >
              <Button variant="outline" @click="clearFilters">Clear filters</Button>
            </EmptyState>

            <EmptyState
              v-else
              :title="`No visible Datasets in ${realm.shortName}`"
              description="No RO-Crate Datasets are visible here yet."
            >
              <Button v-if="currentUser" @click="showNewDataset = true"><Plus class="h-4 w-4" /> Create dataset</Button>
            </EmptyState>

            <!-- The page count is derived from an approximate estimate, so it is
                 shown as "about"; only a short page ends the listing. -->
            <div v-if="browseSource.length || browsePage > 1 || hasNextPage" class="flex flex-col items-center gap-2">
              <p
                class="text-[11px] text-muted-foreground"
                :title="pageCount !== null && !favouritesOnly ? 'The server estimates this count per group, so the number of pages is approximate.' : undefined"
              >
                {{ browseSummary }}
              </p>
              <Pagination
                :page="browsePage"
                :page-count="pageCount"
                :has-next="hasNextPage"
                :disabled="browseBusy"
                @update:page="goToPage"
              />
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
              <Select
                v-model="sparqlMode"
                :options="sparqlModeOptions"
                aria-label="SPARQL execution mode"
                class="h-8 w-auto text-[11px]"
              />
              <Button size="sm" :disabled="running" @click="runQuery"><Play class="h-3.5 w-3.5" /> {{ running ? 'Running…' : 'Run query' }}</Button>
            </div>
          </div>
          <textarea v-model="sparql" rows="14" class="mt-3 w-full rounded-md border border-input bg-muted/20 p-3 font-mono text-[12px] leading-relaxed text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <p class="mt-2 text-[11px] text-muted-foreground">Only SELECT and ASK queries are accepted. Distributed queries accept only ASK or SELECT DISTINCT over a single pattern. Joins, aggregates, OFFSET, and other non-union-safe shapes are rejected.</p>
          <div v-if="sparqlError && !sparqlFailure" class="mt-3 text-xs text-destructive">{{ sparqlError }}</div>
        </section>

        <section v-if="sparqlFailure" class="surface overflow-hidden">
          <header class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
            <Badge variant="destructive" class="text-[10px] uppercase">Unavailable</Badge>
            <span v-if="sparqlFailureMode">Mode: {{ sparqlModeLabels[sparqlFailureMode] }}</span>
            <Button variant="outline" size="sm" class="ml-auto" :disabled="running" @click="runQuery">Retry</Button>
          </header>
          <div class="space-y-1.5 px-4 py-3 text-xs text-muted-foreground">
            <p>{{ sparqlError }}</p>
            <p v-if="sparqlFailureResult?.nodesFailed">{{ sparqlFailureResult.nodesFailed }} of {{ sparqlFailureResult.nodesQueried }} node partitions failed.</p>
            <p v-if="sparqlFailureResult?.failedPartitions.length" class="break-all">Failed partitions: {{ sparqlFailureResult.failedPartitions.join(', ') }}</p>
          </div>
        </section>

        <section v-if="sparqlResult" class="surface overflow-hidden">
          <header class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
            <Badge
              :variant="sparqlCoverageStatus(sparqlResult) === 'Complete' ? 'success' : sparqlCoverageStatus(sparqlResult) === 'Partial' ? 'warn' : 'destructive'"
              class="text-[10px] uppercase"
            >
              {{ sparqlCoverageStatus(sparqlResult) }}
            </Badge>
            <span>{{ sparqlResult.totalRows }} rows · {{ sparqlResult.tookMs }} ms</span>
            <span>Mode: {{ sparqlModeLabels[sparqlResult.mode] }}</span>
            <span class="font-mono">scope: {{ realm.shortName }}</span>
            <div class="ml-auto flex items-center gap-2">
              <Button v-if="!sparqlResult.complete" variant="outline" size="sm" :disabled="running" @click="runQuery">Retry</Button>
              <Button variant="outline" size="sm" @click="downloadSparqlResult">
                <Download class="h-3.5 w-3.5" /> {{ sparqlResult.complete ? 'Export JSON' : 'Export with manifest' }}
              </Button>
            </div>
          </header>
          <div v-if="!sparqlResult.complete" class="space-y-1 border-b border-border bg-amber-500/10 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-200">
            <p>{{ sparqlResult.nodesFailed }} of {{ sparqlResult.nodesQueried }} node partitions failed.</p>
            <p v-if="sparqlResult.failedPartitions.length" class="break-all">Failed partitions: {{ sparqlResult.failedPartitions.join(', ') }}</p>
          </div>
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
    <CrateTransferDialog v-model:open="showCrateImport" mode="import" />
  </div>
</template>
