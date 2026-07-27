// Debounced, server-backed full-text search against GET /metadata/search
// (portal part of aruna#258).
//
// Per-view FACTORY, not a module singleton like useAruna: debounce timer,
// in-flight AbortController and the paging cursors are bound to the lifetime
// of the view that owns the search box, and two views must never share a
// cursor. Must be called during component setup (uses onBeforeUnmount).
// Only the FIRST page is cached module-side, so a revisit repaints it.
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { ApiError, type MetadataSearchHit, type MetadataSearchResponse } from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { useAruna } from '@/composables/useAruna'
import { createSwrCache, type SwrFailure } from '@/lib/swr'
import type { MetadataDoc } from '@/data/types'

export const SEARCH_DEBOUNCE_MS = 300
// aruna#258 page cap: a single page never exceeds 100 hits.
export const SEARCH_PAGE_CAP = 100
// Page size under cursor paging (backend default page size).
const CURSOR_PAGE_SIZE = 25
// Backend METADATA_SEARCH_MAX_PAGINATION_DEPTH: the server withholds the next
// cursor once the deepest per-node resume position reaches it, so no page past
// this depth can ever be served. Mirrored here as a walk bound.
const SEARCH_MAX_DEPTH = 1000
const SEARCH_REQUEST_TIMEOUT_MS = 30_000

// Everything needed to repaint the first page without a request. Deeper pages
// are deliberately absent: they only exist as an opaque cursor chain walked
// from this page, and a chain the server may expire belongs to one visit.
interface SearchPage {
  hits: MetadataSearchHit[]
  cursor: string | null
  nodesQueried: number
  nodesFailed: number
  truncated: boolean
}

const EMPTY_PAGE: SearchPage = { hits: [], cursor: null, nodesQueried: 0, nodesFailed: 0, truncated: false }

// Documents are created and indexed while people work, so a search answer ages
// far faster than the bucket list: 4s covers opening a result and coming back
// with no request, and is short enough that a new document is not hidden.
const SEARCH_FRESH_MS = 4_000

// Module singleton for the view that owns the search box: its first page
// outlives the view, so returning to it paints the previous results at once and
// revalidates behind them. One live consumer only, see the `cached` option.
const sharedCache = createSwrCache<SearchPage>(EMPTY_PAGE, SEARCH_FRESH_MS)

const { sessionEpoch } = useAruna()

// Another identity must never see these hits, even with no view mounted.
watch(sessionEpoch, () => sharedCache.reset())

export interface SearchResultLine {
  hit: MetadataSearchHit
  /**
   * Catalog join on document_id, over the loaded catalog pages only; null for
   * every hit outside them. Cosmetic: the server always serves a title and
   * usually a snippet, so a null doc never hides a result.
   */
  doc: MetadataDoc | null
  /** Best known display title — catalog title, else server title (aruna#258), else null. Never fabricated. */
  title: string | null
  /** Server snippet when provided (aruna#258), else the catalog description, else null. */
  snippet: string | null
}

// The backend deduplicates hits per (graph_iri, subject_iri) with score-desc
// ordering, so a single document can surface as several hits within one page
// and across pages. The portal renders one card per document, so collapse by
// document_id everywhere; first occurrence wins, which — given the server's
// score-desc order — keeps the highest-scoring hit for each document.
function dedupeByDocument(
  list: MetadataSearchHit[],
  seen = new Set<string>(),
): MetadataSearchHit[] {
  return list.filter((hit) => (seen.has(hit.document_id) ? false : (seen.add(hit.document_id), true)))
}

export interface MetadataSearchFilters {
  /** Server-side group_id push-down; null clears it. */
  groupId?: Ref<string | null>
  /** Server-side conformsTo profile IRI push-down; null clears it. */
  conformsTo?: Ref<string | null>
}

export function useMetadataSearch(
  query: Ref<string>,
  filters: MetadataSearchFilters = {},
  // `cached` claims the module-level slot, so the first page survives unmount.
  // At most one live consumer may claim it; every other search gets its own
  // slot and behaves exactly as it did before, never evicting the shared page.
  { cached = false }: { cached?: boolean } = {},
) {
  const { metadata, searchMetadata, authToken, apiBaseUrl } = useAruna()
  const cache = cached ? sharedCache : createSwrCache<SearchPage>(EMPTY_PAGE, SEARCH_FRESH_MS)
  const cursorEnabled = featureEnabled('searchCursor')
  const pageSize = cursorEnabled ? CURSOR_PAGE_SIZE : SEARCH_PAGE_CAP
  // Highest page the server can serve at this page size; without cursor paging
  // there is exactly one (capped) page.
  const maxPage = cursorEnabled ? Math.max(1, Math.floor(SEARCH_MAX_DEPTH / pageSize)) : 1

  // One entry per page reached so far, so Previous and every visited page
  // number render from cache instead of refetching.
  const pages = ref<MetadataSearchHit[][]>([])
  // cursors[i] is the cursor that fetches page i + 1; index 0 is the cursorless
  // first page. A null entry means the server offered no continuation.
  const cursors = ref<Array<string | null>>([null])
  const page = ref(1)
  const pending = ref(false) // first page in flight
  const paging = ref(false) // walking cursors towards a later page
  const restarting = ref(false) // forced refetch after a rejected cursor
  const error = ref<string | null>(null)
  const pageError = ref<string | null>(null)
  const searched = ref(false) // at least one response for the current query
  const nodesQueried = ref(0)
  const nodesFailed = ref(0)
  const truncated = ref(false)

  // Two-character minimum, aligned with useUnifiedSearch (the backend rejects
  // shorter queries with 400 anyway) — except with a conformsTo filter, which
  // the backend accepts on its own as a profile listing.
  const active = computed(() => query.value.trim().length >= 2 || Boolean(filters.conformsTo?.value))
  // The backend signals partial results through nodes_failed (a per-node id list
  // is not served); a non-zero count means matches on failed nodes are missing.
  const partial = computed(() => nodesFailed.value > 0)

  // The hits of the page on screen; empty while a walk towards it is in flight.
  const pageHits = computed(() => pages.value[page.value - 1] ?? [])
  // Without cursor paging we get exactly one page (cap 100); a full page
  // means more matches may exist that we cannot fetch.
  const capped = computed(() => !cursorEnabled && pageHits.value.length >= SEARCH_PAGE_CAP)
  // Pages proven to exist: the ones cached plus the one being walked to. Search
  // has no match total, so this is a floor, never a page count to advertise.
  const pageCount = computed(() => Math.max(pages.value.length, page.value))
  // Only a served cursor proves another page exists; a short page does not,
  // because a saturated node can return few hits and still continue.
  const hasNextPage = computed(
    () =>
      cursorEnabled &&
      !restarting.value &&
      page.value < maxPage &&
      (page.value < pages.value.length || Boolean(cursors.value[page.value])),
  )
  // The server still offers a continuation we refuse to follow.
  const depthCapped = computed(
    () => cursorEnabled && page.value >= maxPage && Boolean(cursors.value[page.value]),
  )

  // Loaded catalog pages only; enrichment, never a filter.
  const docById = computed(() => {
    const map = new Map<string, MetadataDoc>()
    for (const doc of metadata.value) map.set(doc.ulid, doc)
    return map
  })

  // Kept as a computed so hits enrich retroactively as the catalog loads.
  const results = computed<SearchResultLine[]>(() =>
    pageHits.value.map((hit) => {
      const doc = docById.value.get(hit.document_id) ?? null
      return {
        hit,
        doc,
        title: doc?.title || hit.title || null,
        snippet: hit.snippet || doc?.description || null,
      }
    }),
  )

  let timer: number | undefined
  let seq = 0
  let nav = 0
  let controller: AbortController | null = null
  let pageController: AbortController | null = null
  // The query the current cursors were issued for. aruna#258 binds the opaque
  // cursor to the query, so it is only ever valid for exactly this string.
  let cursorQuery = ''
  // The query we have already transparently restarted once after a cursor
  // rejection. A second rejection for the same query surfaces the error instead
  // of looping (restart → next page → reject → …).
  let restartedFor = ''

  function filterValues(): { group_id?: string; conforms_to?: string } {
    return {
      group_id: filters.groupId?.value ?? undefined,
      conforms_to: filters.conformsTo?.value ?? undefined,
    }
  }

  // Everything the first-page request depends on: the identity it was answered
  // for, the page size and both push-down filters, plus the term. JSON encoding
  // keeps free-form values from running into each other.
  function cacheKey(term: string): string {
    return JSON.stringify([
      sessionEpoch.value,
      pageSize,
      filters.groupId?.value ?? null,
      filters.conformsTo?.value ?? null,
      term,
    ])
  }

  function onFailure(err: unknown): SwrFailure {
    // An abort is this search superseding itself, not a failure: the empty
    // message keeps it off screen, and the request that replaced it reports.
    if (err instanceof DOMException && err.name === 'AbortError') return { message: '' }
    // Nothing a search can fail with makes the last answer for this exact key
    // wrong, so the page is never discarded; the message rides beside it.
    return { message: err instanceof Error ? err.message : String(err) }
  }

  function hasCached(key: string): boolean {
    return cache.scope.value === key && cache.loaded.value
  }

  /** Paints the cached page as page one, exactly as a fresh response would. */
  function paintCached(term: string) {
    const snapshot = cache.data.value
    pages.value = [snapshot.hits]
    cursors.value = [null, snapshot.cursor]
    page.value = 1
    cursorQuery = term
    nodesQueried.value = snapshot.nodesQueried
    nodesFailed.value = snapshot.nodesFailed
    truncated.value = snapshot.truncated
    searched.value = true
  }

  async function loadFirst(term: string, signal: AbortSignal): Promise<SearchPage> {
    const response = await searchMetadata(term, { limit: pageSize, ...filterValues(), signal })
    return {
      hits: dedupeByDocument(response.hits),
      cursor: nextCursorOf(response),
      nodesQueried: response.nodes_queried ?? 0,
      nodesFailed: response.nodes_failed ?? 0,
      truncated: response.truncated === true,
    }
  }

  // A cursor is bound to the query AND the filters, so any change discards
  // every cached page with its cursors and starts over at page one.
  function clearPages() {
    pages.value = []
    cursors.value = [null]
    page.value = 1
  }

  function reset() {
    clearPages()
    error.value = null
    pageError.value = null
    searched.value = false
    pending.value = false
    paging.value = false
    restarting.value = false
    nodesQueried.value = 0
    nodesFailed.value = 0
    truncated.value = false
  }

  function applyMeta(response: MetadataSearchResponse) {
    nodesQueried.value = Math.max(nodesQueried.value, response.nodes_queried ?? 0)
    nodesFailed.value = Math.max(nodesFailed.value, response.nodes_failed ?? 0)
    if (response.truncated) truncated.value = true
  }

  function nextCursorOf(response: MetadataSearchResponse): string | null {
    return cursorEnabled ? (response.next_cursor ?? null) : null
  }

  // `restart` marks the forced refetch that follows a rejected cursor: the
  // cached first page belongs to the chain the server refused, so it is dropped
  // instead of repainted, and the page on screen stays until fresh hits land.
  async function runSearch(term: string, force = false, restart = false) {
    const mySeq = ++seq
    ++nav
    pageController?.abort()
    pageController = null
    paging.value = false
    controller?.abort()
    const request = new AbortController()
    controller = request
    pending.value = true
    restarting.value = restart
    error.value = null
    pageError.value = null
    const key = cacheKey(term)
    if (restart) {
      if (cache.scope.value === key) cache.reset()
    } else if (hasCached(key)) {
      // Cached page stays on screen and revalidates behind the dim treatment.
      paintCached(term)
    } else {
      nodesQueried.value = 0
      nodesFailed.value = 0
      truncated.value = false
      searched.value = false
      clearPages()
    }
    try {
      await cache.revalidate(key, () => loadFirst(term, request.signal), onFailure, force)
      if (mySeq !== seq) return // superseded
      // A page walked while the revalidation ran belongs to the older cursor
      // chain, so a landed first page is only taken while the walk is still
      // on it; the cache keeps it for the next visit either way. A restart
      // always takes it: every page on screen came from the rejected chain.
      if (hasCached(key) && (restart || (page.value === 1 && pages.value.length <= 1))) {
        paintCached(term)
      }
      // A failed revalidation keeps the page it could not replace, so the
      // message is surfaced beside the results instead of clearing them.
      error.value = cache.error.value?.message || null
    } finally {
      if (mySeq === seq) {
        pending.value = false
        restarting.value = false
      }
    }
  }

  // Fetches the page at `index` (0-based) with the cursor stored for it. Returns
  // false when the walk must stop: end of results, rejection or failure.
  async function fetchPage(index: number, term: string, myNav: number): Promise<boolean> {
    const cursor = cursors.value[index]
    if (!cursor || term !== cursorQuery) return false
    const mySeq = seq
    const request = new AbortController()
    pageController = request
    pageError.value = null
    const timeout = window.setTimeout(
      () => request.abort(new DOMException('Request timed out.', 'TimeoutError')),
      SEARCH_REQUEST_TIMEOUT_MS,
    )
    try {
      const response = await searchMetadata(term, {
        limit: pageSize,
        cursor,
        ...filterValues(),
        signal: request.signal,
      })
      if (mySeq !== seq || myNav !== nav) return false
      if (!response.hits.length) {
        // An empty continuation is the end; never cache it as a reachable page.
        cursors.value = [...cursors.value.slice(0, index), null]
        applyMeta(response)
        return false
      }
      // Collapse per document across pages (see dedupeByDocument): the server
      // dedups per (graph_iri, subject_iri), so a later page can repeat a
      // document already shown on an earlier one. Pages are always walked in
      // order, so the set of earlier documents is the same on every visit.
      const known = new Set(pages.value.slice(0, index).flat().map((hit) => hit.document_id))
      pages.value = [...pages.value.slice(0, index), dedupeByDocument(response.hits, known)]
      cursors.value = [...cursors.value.slice(0, index + 1), nextCursorOf(response)]
      applyMeta(response)
      restartedFor = ''
      return true
    } catch (err) {
      if (mySeq !== seq || myNav !== nav) return false
      if (err instanceof ApiError && [400, 409, 410].includes(err.status) && restartedFor !== term) {
        // Server rejected the cursor (query changed / cursor expired, per the
        // aruna#258 contract): restart transparently from the first page, forced
        // past the cache that issued the rejected cursor — but only once per
        // query. A backend that keeps rejecting falls through to pageError.
        restartedFor = term
        void runSearch(term, true, true)
      } else {
        // A failed page must not wipe the page already on screen; surface it
        // via the manual "Try again".
        pageError.value = err instanceof Error ? err.message : String(err)
      }
      return false
    } finally {
      window.clearTimeout(timeout)
      if (pageController === request) pageController = null
    }
  }

  // A cursor cannot be skipped, so reaching a page means fetching every page
  // between the cached frontier and the target, one stored cursor at a time.
  async function walkTo(target: number, myNav: number) {
    const term = query.value.trim()
    const mySeq = seq
    paging.value = true
    try {
      while (pages.value.length < target && pages.value.length < maxPage) {
        if (!(await fetchPage(pages.value.length, term, myNav))) break
        if (mySeq !== seq || myNav !== nav) return
      }
    } finally {
      if (mySeq === seq && myNav === nav) {
        paging.value = false
        // Stopped short (end of results, depth cap or failure): stay on the
        // last page that actually exists rather than on an empty one.
        page.value = Math.min(page.value, Math.max(1, pages.value.length))
      }
    }
  }

  function goToPage(target: number) {
    // Every stored cursor was rejected while a restart is in flight.
    if (!cursorEnabled || !active.value || restarting.value) return
    const wanted = Math.max(1, Math.min(Math.trunc(target), maxPage))
    if (wanted === page.value) return
    const myNav = ++nav
    pageController?.abort()
    pageController = null
    pageError.value = null
    page.value = wanted
    // Cached pages render instantly, including every step back.
    if (pages.value.length >= wanted) {
      paging.value = false
      return
    }
    void walkTo(wanted, myNav)
  }

  function retry() {
    // An explicit retry always reaches the server, freshness window or not.
    if (active.value) void runSearch(query.value.trim(), true)
  }

  // A filter change re-binds the cursor, so the watched deps include the server
  // push-down filters: any change restarts paging from the first page.
  const watchDeps: Array<Ref<unknown>> = [query, authToken, apiBaseUrl]
  if (filters.groupId) watchDeps.push(filters.groupId)
  if (filters.conformsTo) watchDeps.push(filters.conformsTo)
  watch(watchDeps, () => {
    window.clearTimeout(timer)
    ++seq
    ++nav
    controller?.abort()
    controller = null
    pageController?.abort()
    pageController = null
    cursorQuery = ''
    restartedFor = ''
    reset()
    if (!active.value) return
    const term = query.value.trim()
    timer = window.setTimeout(() => void runSearch(term), SEARCH_DEBOUNCE_MS)
  })

  // Deep links (?q= / ?profile= from the router or top bar) search immediately,
  // undebounced.
  if (active.value) void runSearch(query.value.trim())

  onBeforeUnmount(() => {
    window.clearTimeout(timer)
    seq++
    nav++
    controller?.abort()
    pageController?.abort()
  })

  return {
    active,
    pending,
    paging,
    restarting,
    error,
    pageError,
    searched,
    results,
    nodesQueried,
    nodesFailed,
    truncated,
    partial,
    capped,
    page,
    pageCount,
    hasNextPage,
    depthCapped,
    maxPage,
    cursorEnabled,
    goToPage,
    retry,
  }
}
