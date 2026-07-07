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

export interface SearchResultLine {
  hit: MetadataSearchHit
  /** Catalog join on document_id; null when the doc is not in the loaded catalog. */
  doc: MetadataDoc | null
  /** Best known display title — catalog title, else server title (aruna#258), else null. Never fabricated. */
  title: string | null
  /** Server snippet when provided (aruna#258), else the catalog description, else null. */
  snippet: string | null
}

export function useMetadataSearch(query: Ref<string>) {
  const { metadata, searchMetadata } = useAruna()
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
  const failedNodes = ref<string[]>([])
  const serverPartial = ref<boolean | null>(null)
  const nextCursor = ref<string | null>(null)

  const active = computed(() => query.value.trim().length > 0)
  // nodes_failed is served by today's backend; `partial` is the aruna#258
  // field and wins when present.
  const partial = computed(() => serverPartial.value ?? nodesFailed.value > 0)
  // Without cursor paging we get exactly one page (cap 100); a full page
  // means more matches may exist that we cannot fetch.
  const capped = computed(() => !cursorEnabled && hits.value.length >= SEARCH_PAGE_CAP)

  const docById = computed(() => {
    const map = new Map<string, MetadataDoc>()
    for (const doc of metadata.value) map.set(doc.ulid, doc)
    return map
  })

  // Kept as a computed so hits enrich retroactively once the catalog loads.
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
  // The query the current cursor was issued for. aruna#258 binds the opaque
  // cursor to the query, so it is only ever valid for exactly this string.
  let cursorQuery = ''

  function reset() {
    hits.value = []
    error.value = null
    moreError.value = null
    searched.value = false
    pending.value = false
    loadingMore.value = false
    nodesQueried.value = 0
    nodesFailed.value = 0
    failedNodes.value = []
    serverPartial.value = null
    nextCursor.value = null
  }

  function applyMeta(response: MetadataSearchResponse) {
    nodesQueried.value = response.nodes_queried ?? 0
    nodesFailed.value = response.nodes_failed ?? 0
    failedNodes.value = response.failed_nodes ?? []
    serverPartial.value = typeof response.partial === 'boolean' ? response.partial : null
    nextCursor.value = cursorEnabled ? (response.next_cursor ?? null) : null
  }

  async function runSearch(term: string) {
    const mySeq = ++seq
    controller?.abort()
    controller = new AbortController()
    pending.value = true
    error.value = null
    moreError.value = null
    nextCursor.value = null
    try {
      const response = await searchMetadata(term, { limit: pageSize, signal: controller.signal })
      if (mySeq !== seq) return // superseded
      hits.value = response.hits
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
    if (!cursor || !term) return
    // Never reuse a cursor across queries; the debounced watcher refetches.
    if (term !== cursorQuery) {
      nextCursor.value = null
      return
    }
    const mySeq = seq
    loadingMore.value = true
    moreError.value = null
    try {
      const response = await searchMetadata(term, { limit: pageSize, cursor })
      if (mySeq !== seq) return
      // Defensive dedup across pages; the server already dedups within one.
      const known = new Set(hits.value.map((hit) => hit.document_id))
      hits.value = [...hits.value, ...response.hits.filter((hit) => !known.has(hit.document_id))]
      applyMeta(response)
    } catch (err) {
      if (mySeq !== seq) return
      if (err instanceof ApiError && [400, 409, 410].includes(err.status)) {
        // Server rejected the cursor (query changed / cursor expired, per the
        // aruna#258 contract): restart transparently from the first page.
        nextCursor.value = null
        void runSearch(term)
      } else {
        // A failed "more" page must not wipe already-rendered results.
        moreError.value = err instanceof Error ? err.message : String(err)
      }
    } finally {
      if (mySeq === seq) loadingMore.value = false
    }
  }

  function retry() {
    const term = query.value.trim()
    if (term) void runSearch(term)
  }

  watch(query, (next) => {
    window.clearTimeout(timer)
    const term = next.trim()
    if (!term) {
      seq++ // invalidate any in-flight response
      controller?.abort()
      reset()
      return
    }
    timer = window.setTimeout(() => void runSearch(term), SEARCH_DEBOUNCE_MS)
  })

  // Deep links (?q= from the router / top bar) search immediately, undebounced.
  if (query.value.trim()) void runSearch(query.value.trim())

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
    failedNodes,
    partial,
    capped,
    nextCursor,
    cursorEnabled,
    sentinel,
    loadMore,
    retry,
  }
}
