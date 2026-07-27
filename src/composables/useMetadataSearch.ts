// Debounced, server-backed full-text search against GET /metadata/search
// (portal part of aruna#258).
//
// Per-view FACTORY, not a module singleton like useAruna: debounce timer,
// in-flight AbortController and the paging cursor are bound to the lifetime
// of the view that owns the search box, and two views must never share a
// cursor. Must be called during component setup (uses onBeforeUnmount).
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { ApiError, type MetadataSearchHit, type MetadataSearchResponse } from '@/lib/api'
import { featureEnabled } from '@/lib/config'
import { useAruna } from '@/composables/useAruna'
import type { MetadataDoc } from '@/data/types'

export const SEARCH_DEBOUNCE_MS = 300
// aruna#258 page cap: a single page never exceeds 100 hits.
export const SEARCH_PAGE_CAP = 100
// Page size under cursor paging (backend default page size).
const CURSOR_PAGE_SIZE = 25
const SEARCH_REQUEST_TIMEOUT_MS = 30_000

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

export function useMetadataSearch(query: Ref<string>, filters: MetadataSearchFilters = {}) {
  const { metadata, searchMetadata, authToken, apiBaseUrl } = useAruna()
  const cursorEnabled = featureEnabled('searchCursor')
  const pageSize = cursorEnabled ? CURSOR_PAGE_SIZE : SEARCH_PAGE_CAP

  const hits = ref<MetadataSearchHit[]>([])
  const pending = ref(false) // first page in flight
  const loadingMore = ref(false) // cursor page in flight
  const error = ref<string | null>(null)
  const moreError = ref<string | null>(null)
  const searched = ref(false) // at least one response for the current query
  const nodesQueried = ref(0)
  const nodesFailed = ref(0)
  const truncated = ref(false)
  const nextCursor = ref<string | null>(null)

  // Two-character minimum, aligned with useUnifiedSearch (the backend rejects
  // shorter queries with 400 anyway) — except with a conformsTo filter, which
  // the backend accepts on its own as a profile listing.
  const active = computed(() => query.value.trim().length >= 2 || Boolean(filters.conformsTo?.value))
  // The backend signals partial results through nodes_failed (a per-node id list
  // is not served); a non-zero count means matches on failed nodes are missing.
  const partial = computed(() => nodesFailed.value > 0)
  // Without cursor paging we get exactly one page (cap 100); a full page
  // means more matches may exist that we cannot fetch.
  const capped = computed(() => !cursorEnabled && hits.value.length >= SEARCH_PAGE_CAP)

  // Loaded catalog pages only; enrichment, never a filter.
  const docById = computed(() => {
    const map = new Map<string, MetadataDoc>()
    for (const doc of metadata.value) map.set(doc.ulid, doc)
    return map
  })

  // Kept as a computed so hits enrich retroactively as more pages load.
  const results = computed<SearchResultLine[]>(() =>
    hits.value.map((hit) => {
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
  let controller: AbortController | null = null
  let moreController: AbortController | null = null
  // The query the current cursor was issued for. aruna#258 binds the opaque
  // cursor to the query, so it is only ever valid for exactly this string.
  let cursorQuery = ''
  // The query we have already transparently restarted once after a cursor
  // rejection. A second rejection for the same query surfaces the error instead
  // of looping (restart → sentinel remount → loadMore → reject → …).
  let restartedFor = ''

  function filterValues(): { group_id?: string; conforms_to?: string } {
    return {
      group_id: filters.groupId?.value ?? undefined,
      conforms_to: filters.conformsTo?.value ?? undefined,
    }
  }

  function reset() {
    hits.value = []
    error.value = null
    moreError.value = null
    searched.value = false
    pending.value = false
    loadingMore.value = false
    nodesQueried.value = 0
    nodesFailed.value = 0
    truncated.value = false
    nextCursor.value = null
  }

  function applyMeta(response: MetadataSearchResponse) {
    nodesQueried.value = Math.max(nodesQueried.value, response.nodes_queried ?? 0)
    nodesFailed.value = Math.max(nodesFailed.value, response.nodes_failed ?? 0)
    if (response.truncated) truncated.value = true
    nextCursor.value = cursorEnabled ? (response.next_cursor ?? null) : null
  }

  async function runSearch(term: string) {
    const mySeq = ++seq
    moreController?.abort()
    moreController = null
    loadingMore.value = false
    controller?.abort()
    controller = new AbortController()
    pending.value = true
    error.value = null
    moreError.value = null
    nodesQueried.value = 0
    nodesFailed.value = 0
    truncated.value = false
    nextCursor.value = null
    try {
      const response = await searchMetadata(term, {
        limit: pageSize,
        ...filterValues(),
        signal: controller.signal,
      })
      if (mySeq !== seq) return // superseded
      hits.value = dedupeByDocument(response.hits)
      cursorQuery = term
      applyMeta(response)
      searched.value = true
    } catch (err) {
      if (mySeq !== seq) return // superseded or aborted
      hits.value = []
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      if (mySeq === seq) pending.value = false
    }
  }

  async function loadMore() {
    if (!cursorEnabled || loadingMore.value || pending.value) return
    const cursor = nextCursor.value
    const term = query.value.trim()
    if (!cursor || !active.value) return
    // Never reuse a cursor across queries; the debounced watcher refetches.
    if (term !== cursorQuery) {
      nextCursor.value = null
      return
    }
    const mySeq = seq
    const pageController = new AbortController()
    moreController = pageController
    loadingMore.value = true
    moreError.value = null
    const timeout = window.setTimeout(
      () => pageController.abort(new DOMException('Request timed out.', 'TimeoutError')),
      SEARCH_REQUEST_TIMEOUT_MS,
    )
    try {
      const response = await searchMetadata(term, {
        limit: pageSize,
        cursor,
        ...filterValues(),
        signal: pageController.signal,
      })
      if (mySeq !== seq || moreController !== pageController) return
      // Collapse per document across pages (see dedupeByDocument): the server
      // dedups per (graph_iri, subject_iri), so a later page can repeat a
      // document already shown from an earlier one.
      const known = new Set(hits.value.map((hit) => hit.document_id))
      hits.value = [...hits.value, ...dedupeByDocument(response.hits, known)]
      applyMeta(response)
      restartedFor = ''
    } catch (err) {
      if (mySeq !== seq || moreController !== pageController) return
      if (err instanceof ApiError && [400, 409, 410].includes(err.status) && restartedFor !== term) {
        // Server rejected the cursor (query changed / cursor expired, per the
        // aruna#258 contract): restart transparently from the first page — but
        // only once per query. A backend that keeps rejecting falls through to
        // moreError below instead of looping (restart → sentinel → loadMore → …).
        restartedFor = term
        nextCursor.value = null
        void runSearch(term)
      } else {
        // A failed "more" page (or a repeated cursor rejection) must not wipe
        // already-rendered results; surface it via the manual "Try again".
        moreError.value = err instanceof Error ? err.message : String(err)
      }
    } finally {
      window.clearTimeout(timeout)
      if (moreController === pageController) {
        moreController = null
        loadingMore.value = false
      }
    }
  }

  function retry() {
    if (active.value) void runSearch(query.value.trim())
  }

  // A filter change re-binds the cursor, so the watched deps include the server
  // push-down filters: any change restarts paging from the first page.
  const watchDeps: Array<Ref<unknown>> = [query, authToken, apiBaseUrl]
  if (filters.groupId) watchDeps.push(filters.groupId)
  if (filters.conformsTo) watchDeps.push(filters.conformsTo)
  watch(watchDeps, () => {
    window.clearTimeout(timer)
    ++seq
    controller?.abort()
    controller = null
    moreController?.abort()
    moreController = null
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

  // Infinite-scroll sentinel; only observed when cursor paging is enabled.
  const sentinel = ref<HTMLElement | null>(null)
  let observer: IntersectionObserver | null = null
  if (cursorEnabled && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: '400px 0px' },
    )
    watch(sentinel, (el, previous) => {
      if (previous) observer?.unobserve(previous)
      if (el) observer?.observe(el)
    })
  }

  onBeforeUnmount(() => {
    window.clearTimeout(timer)
    seq++
    controller?.abort()
    moreController?.abort()
    observer?.disconnect()
  })

  return {
    active,
    pending,
    loadingMore,
    error,
    moreError,
    searched,
    results,
    nodesQueried,
    nodesFailed,
    truncated,
    partial,
    capped,
    nextCursor,
    cursorEnabled,
    sentinel,
    loadMore,
    retry,
  }
}
