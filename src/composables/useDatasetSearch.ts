// Every piece of state the Datasets route runs on: the query and filter refs
// mirrored into the URL, the browse window, the cursor-paged search, the object
// inventory coverage and the extra entity kinds an active query discovers.
//
// Per-view FACTORY: it owns debounce timers and per-view search instances, so
// it must be called once, from the route view's setup.
import { computed, onMounted, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import {
  buildObjectSearchExportArtifact,
  profileReferenceIri,
  useAruna,
} from '@/composables/useAruna'
import { useMetadataSearch } from '@/composables/useMetadataSearch'
import { coverageComplete, useUnifiedSearch } from '@/composables/useUnifiedSearch'
import { useSearchSettings } from '@/composables/useSearchSettings'
import { useCatalogBrowse, type CatalogPageParams } from '@/composables/useCatalogBrowse'
import { datasetPurposeMatches, datasetPurposeOf, type DatasetPurpose } from '@/lib/datasetPurpose'
import { errorMessage, formatNumber, truncateMiddle } from '@/lib/utils'
import { isWorkspaceBucket } from '@/lib/workspaces'
import type { MetadataDoc } from '@/data/types'
import type {
  BucketSearchHit,
  ListMetadataResponse,
  MetadataDocumentListItem,
  UserSearchHit,
} from '@/lib/api'
import type { FilterModel } from '@/components/search/SearchFilterBar.vue'

// Beyond metadata, an active query also discovers groups (client-side over the
// loaded group lists, like the top bar), people (server /access/users/search) and
// buckets across the realm's nodes (the `buckets` section of the unified
// GET /search).
export type SearchKind = 'all' | 'datasets' | 'objects' | 'buckets' | 'groups' | 'people'

export const KIND_OPTIONS: Array<{ id: SearchKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'datasets', label: 'Datasets' },
  { id: 'objects', label: 'Data objects' },
  { id: 'buckets', label: 'Buckets' },
  { id: 'groups', label: 'Groups' },
  { id: 'people', label: 'Users' },
]

/**
 * Which result section renders. A picked chip always shows its section, empty
 * state included. Under "All" the object section must earn its space: with
 * nothing to report it disappears, and the dataset section carries the single
 * empty answer for the whole page.
 */
export function kindVisible(
  kind: Exclude<SearchKind, 'all'>,
  filter: SearchKind,
  query: string,
  objectsAnswered: boolean,
): boolean {
  // A profile filter alone lists documents server-side; buckets, groups and
  // people need an actual query term.
  if (!query) return kind === 'datasets'
  if (filter === kind) return true
  if (filter !== 'all') return false
  return kind !== 'objects' || objectsAnswered
}

// Browse renders ONE page at a time: GET /metadata takes limit and offset, so
// any page is reachable directly and the group facet rides the same request.
// Favourites are a small curated id list, fetched whole and sliced client-side.
const BROWSE_PAGE_SIZE = 48
const FAVOURITE_FETCH_CAP = 100
// Each favourite costs two requests, so they are fetched in bounded batches.
const FAVOURITE_FETCH_BATCH = 6

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

export function useDatasetSearch(searchBox: Ref<{ focus: () => void } | null>) {
  const route = useRoute()
  const router = useRouter()

  // Desktop's "Keep a dataset offline…" opens this page on the search box.
  onMounted(() => {
    if (route.query.focus === 'search') searchBox.value?.focus()
  })

  const {
    metadata,
    profiles,
    currentUser,
    toggleFavourite,
    myGroups,
    discoverableGroups,
    searchUsers,
    searchUnified,
    getMetadataItem,
    toMetadataDoc,
  } = useAruna()

  const q = ref(queryString(route.query.q))
  const documentScope = computed(() => queryString(route.query.document) || null)
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
    return profileReferenceIri(profile) ?? null
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
  const { objectSearchMode } = useSearchSettings()
  const {
    objects: objectResults,
    objectCursor,
    objectCoverage,
    objectError,
    objectSearched,
    requestMs: objectRequestMs,
    pending: objectsSearching,
    loadingSection: objectLoadingSection,
    loadMore: loadMoreUnifiedSection,
    retry: retryObjectSearch,
  } = useUnifiedSearch(q, {
    types: [],
    limit: 25,
    includeObjects: true,
    objectMode: objectSearchMode,
  })
  const expertMode = ref(queryString(route.query.expert) === '1')
  const favBusy = ref<Set<string>>(new Set())
  const favError = ref<string | null>(null)

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
      browseError.value = errorMessage(err)
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
      browseError.value = errorMessage(err)
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
      if (!datasetPurposeMatches(doc, typeFilter.value)) return false
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
      if (!datasetPurposeMatches(line.doc, typeFilter.value)) return false
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

  const kindFilter = ref<SearchKind>('all')
  const textQuery = computed(() => q.value.trim())
  function showKind(kind: Exclude<SearchKind, 'all'>): boolean {
    return kindVisible(kind, kindFilter.value, textQuery.value, objectsAnswered.value)
  }

  // A metadata request is in flight, including the debounce window before it
  // leaves: `searched` flips back to false on every query and filter change.
  const searchBusy = computed(
    () =>
      searchActive.value &&
      !searchError.value &&
      (searchPending.value || searchPaging.value || !searched.value || (Boolean(textQuery.value) && objectsSearching.value)),
  )
  // Results from the previous request are still on screen while a new one runs.
  const searchStale = computed(() => searchBusy.value && visibleResults.value.length > 0)
  // A refresh failed over results it could not replace: they stay on screen and
  // the error rides beside them instead of taking the whole area.
  const keptResults = computed(() => Boolean(searchError.value) && searchResults.value.length > 0)

  const objectInventoryPartial = computed(() =>
    Boolean(objectCoverage.value) && !coverageComplete(objectCoverage.value),
  )
  // Hits, a failed search or incomplete coverage: each is an answer the object
  // section owes the user, so none of them may be hidden under "All".
  const objectsAnswered = computed(() =>
    Boolean(objectResults.value.length || objectError.value || objectInventoryPartial.value),
  )
  const objectCoverageShown = computed(() => Boolean(objectCoverage.value || objectError.value))
  const objectCoverageComplete = computed(() => !objectError.value && coverageComplete(objectCoverage.value))

  function downloadObjectResults() {
    const coverage = objectCoverage.value
    if (!coverage || !objectResults.value.length) return
    const artifact = buildObjectSearchExportArtifact(
      { hits: objectResults.value, coverage },
      { query: textQuery.value, timestamp: new Date().toISOString() },
    )
    const url = URL.createObjectURL(new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = objectInventoryPartial.value
      ? 'object-search-partial-results-with-manifest.json'
      : 'object-search-results.json'
    link.click()
    URL.revokeObjectURL(url)
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
      bucketsError.value = errorMessage(err)
    } finally {
      if (seq === bucketSeq) bucketsSearching.value = false
    }
  }, 300)
  watch(q, (term) => void runBucketSearch(term.trim()), { immediate: true })

  const bucketsPartial = computed(() => bucketNodesFailed.value > 0)

  const peopleResults = ref<UserSearchHit[]>([])
  const peopleSearching = ref(false)
  let peopleSeq = 0
  const runPeopleSearch = useDebounceFn(async (term: string) => {
    const seq = ++peopleSeq
    // /access/users/search needs an authenticated session and at least two characters.
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
      favError.value = errorMessage(err)
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

  return {
    q,
    documentScope,
    groupFilter,
    expertMode,
    filtering,
    filterModel,
    groupNames,
    groupOptions,
    clearFilters,
    favBusy,
    favError,
    isFavourite,
    toggleFav,
    browsePage,
    browseSource,
    browseBusy,
    browseStale,
    browseError,
    keptBrowse,
    browseSummary,
    favouritesOnly,
    hasNextPage,
    pageCount,
    hits,
    catalogSplit,
    goToPage,
    retryBrowse,
    searchActive,
    searchPending,
    searchPaging,
    searchRestarting,
    searchError,
    searchPageError,
    searched,
    searchResults,
    visibleResults,
    hiddenByProfile,
    nodesQueried,
    nodesFailed,
    truncated,
    partial,
    capped,
    searchPage,
    searchPageCount,
    searchHasNext,
    searchDepthCapped,
    cursorEnabled,
    searchSummary,
    showSearchPage,
    retrySearch,
    searchBusy,
    searchStale,
    keptResults,
    kindFilter,
    textQuery,
    showKind,
    objectSearchMode,
    objectResults,
    objectCursor,
    objectCoverage,
    objectError,
    objectSearched,
    objectRequestMs,
    objectsSearching,
    objectLoadingSection,
    objectInventoryPartial,
    objectCoverageShown,
    objectCoverageComplete,
    loadMoreUnifiedSection,
    retryObjectSearch,
    downloadObjectResults,
    groupMatches,
    bucketResults,
    bucketNodesQueried,
    bucketNodesFailed,
    bucketsSearching,
    bucketsError,
    bucketsPartial,
    peopleResults,
    peopleSearching,
  }
}

export type DatasetSearchState = ReturnType<typeof useDatasetSearch>
