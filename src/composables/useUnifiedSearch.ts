// Debounced, server-backed unified search against GET /search plus the typed
// GET /search/objects inventory when requested. Each section pages on its own.
//
// Per-view FACTORY, not a module singleton: the debounce timer, in-flight
// AbortControllers and section cursors are bound to the owning view. Must be
// called during component setup (uses onBeforeUnmount).
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import {
  type BucketSearchHit,
  type MetadataSearchHit,
  type ObjectSearchCoverage,
  type ObjectSearchHit,
  type ObjectSearchMode,
  type ObjectSearchResponse,
  type SearchGroupHit,
  type SearchSectionType,
  type SearchUserHit,
  type UnifiedSearchResponse,
} from '@/lib/api'
import { useAruna } from '@/composables/useAruna'
import { signedInEpoch } from '@/composables/aruna/state'
import { errorMessage } from '@/lib/utils'
import { isHiddenBucket } from '@/lib/workspaces'

export const UNIFIED_DEBOUNCE_MS = 250
// Backend rejects a query shorter than two characters with 400.
export const UNIFIED_MIN_CHARS = 2
export const DEFAULT_OBJECT_SEARCH_MODE: ObjectSearchMode = 'distributed_best_effort'
export const OBJECT_SEARCH_MODE_LABELS: Record<ObjectSearchMode, string> = {
  local: 'Local',
  distributed_best_effort: 'Distributed best-effort',
  distributed_strict: 'Distributed strict',
}

const ALL_TYPES: SearchSectionType[] = ['documents', 'buckets', 'groups', 'users']
export type UnifiedSearchSection = SearchSectionType | 'objects'

// The single completeness rule for object coverage: every partition answered.
// `truncated` only says another page exists, which Load more reads.
export function coverageComplete(coverage: ObjectSearchCoverage | null | undefined): boolean {
  return Boolean(coverage?.complete)
}

export interface UnifiedSearchConfig {
  types?: SearchSectionType[]
  limit?: number
  groupId?: Ref<string | null>
  conformsTo?: Ref<string | null>
  includeObjects?: boolean
  objectMode?: Ref<ObjectSearchMode>
  /** Changes schedule a search only while this is true; `retry` runs it later. */
  active?: Ref<boolean>
}

export function useUnifiedSearch(query: Ref<string>, config: UnifiedSearchConfig = {}) {
  const { searchUnified, searchObjects, authToken, apiBaseUrl } = useAruna()
  const types = config.types ?? ALL_TYPES
  const limit = config.limit ?? 10
  const includeObjects = config.includeObjects ?? false
  const objectMode = config.objectMode ?? ref<ObjectSearchMode>(DEFAULT_OBJECT_SEARCH_MODE)

  const documents = ref<MetadataSearchHit[]>([])
  const buckets = ref<BucketSearchHit[]>([])
  const groups = ref<SearchGroupHit[]>([])
  const users = ref<SearchUserHit[]>([])
  const objects = ref<ObjectSearchHit[]>([])
  const documentCursor = ref<string | null>(null)
  const groupCursor = ref<string | null>(null)
  const userCursor = ref<string | null>(null)
  const objectCursor = ref<string | null>(null)
  // The name search's coverage; the metadata search adds its own failures and pages below.
  const nameCoverage = ref<ObjectSearchCoverage | null>(null)
  const metadataPartial = ref(false)
  const metadataMore = ref(false)
  const objectCoverage = computed<ObjectSearchCoverage | null>(() => {
    const coverage = nameCoverage.value
    if (!coverage || (!metadataPartial.value && !metadataMore.value)) return coverage
    return { ...coverage, complete: coverage.complete && !metadataPartial.value, truncated: coverage.truncated || metadataMore.value }
  })
  const objectError = ref<string | null>(null)
  const objectSearched = ref(false)
  const nodesQueried = ref(0)
  const nodesFailed = ref(0)
  const truncated = ref(false)
  const bucketNodesFailed = ref(0)
  // No section of the search response carries a server timing, so the round
  // trip is measured here around the request itself.
  const requestMs = ref<number | null>(null)

  const pending = ref(false)
  const loadingSection = ref<UnifiedSearchSection | null>(null)
  const error = ref<string | null>(null)
  const searched = ref(false)

  const active = computed(() => query.value.trim().length >= UNIFIED_MIN_CHARS)
  const partial = computed(() =>
    nodesFailed.value > 0 ||
    bucketNodesFailed.value > 0 ||
    truncated.value ||
    Boolean(objectCoverage.value && !coverageComplete(objectCoverage.value)),
  )
  const complete = computed(() => !error.value && !objectError.value && !partial.value)
  const empty = computed(() =>
    !documents.value.length && !buckets.value.length && !groups.value.length && !users.value.length && !objects.value.length,
  )

  let timer: number | undefined
  let seq = 0
  let controller: AbortController | null = null
  let sectionController: AbortController | null = null
  // The query the section cursors were issued for; a cursor is only valid for it.
  let cursorQuery = ''
  // Names and searchable metadata are two object searches; `objectCursor` is set while either goes on.
  let nameCursor: string | null = null
  let metadataCursor: string | null = null
  const syncObjectCursor = () => (objectCursor.value = nameCursor ?? metadataCursor)

  function filters(): { group_id?: string; conforms_to?: string } {
    return {
      group_id: config.groupId?.value ?? undefined,
      conforms_to: config.conformsTo?.value ?? undefined,
    }
  }

  function reset() {
    documents.value = []
    buckets.value = []
    groups.value = []
    users.value = []
    objects.value = []
    documentCursor.value = null
    groupCursor.value = null
    userCursor.value = null
    objectCursor.value = null
    nameCursor = null
    metadataCursor = null
    nameCoverage.value = null
    metadataPartial.value = false
    metadataMore.value = false
    objectError.value = null
    objectSearched.value = false
    nodesQueried.value = 0
    nodesFailed.value = 0
    truncated.value = false
    bucketNodesFailed.value = 0
    requestMs.value = null
    error.value = null
    searched.value = false
    pending.value = false
    loadingSection.value = null
  }

  function apply(response: UnifiedSearchResponse) {
    if (response.documents) {
      documents.value = response.documents.hits
      documentCursor.value = response.documents.next_cursor ?? null
      nodesQueried.value = response.documents.nodes_queried
      nodesFailed.value = response.documents.nodes_failed
      truncated.value = response.documents.truncated
    }
    if (response.buckets) {
      buckets.value = response.buckets.hits.filter((hit) => !isHiddenBucket(hit.bucket))
      bucketNodesFailed.value = response.buckets.nodes_failed
    }
    if (response.groups) {
      groups.value = response.groups.hits
      groupCursor.value = response.groups.next_cursor ?? null
    }
    if (response.users) {
      users.value = response.users.hits
      userCursor.value = response.users.next_cursor ?? null
    }
  }

  function applyObjects(response: { hits: ObjectSearchHit[]; next_cursor?: string | null; coverage: ObjectSearchCoverage }) {
    objects.value = response.hits
    nameCursor = response.next_cursor ?? null
    nameCoverage.value = response.coverage
    syncObjectCursor()
  }

  // An older node may refuse the metadata match; the name hits stand alone then, as a partial answer.
  function metadataPage(term: string, signal: AbortSignal, cursor?: string): Promise<ObjectSearchResponse | 'failed'> {
    return searchObjects(term, { mode: objectMode.value, match: 'metadata', limit, ...(cursor ? { cursor } : {}), signal }).catch(() => 'failed' as const)
  }

  function addMetadata(page: ObjectSearchResponse | 'failed' | null) {
    if (page === 'failed') metadataPartial.value = true
    if (!page || page === 'failed') return
    const id = (hit: ObjectSearchHit) => `${hit.issuer_node_id}/${hit.bucket}/${hit.key}`
    const seen = new Set(objects.value.map(id))
    objects.value = [...objects.value, ...page.hits.filter((hit) => !seen.has(id(hit)))]
    metadataCursor = page.next_cursor ?? null
    metadataMore.value = Boolean(metadataCursor)
    if (!coverageComplete(page.coverage)) metadataPartial.value = true
    syncObjectCursor()
  }

  // A distributed object search examines a bounded number of files per page, so a page may come
  // back empty with a cursor; the next pages are read until a hit arrives or the cursor ends, as
  // long as the search is still the current one.
  async function followObjects(term: string, current: () => boolean, signal: AbortSignal) {
    while (current() && nameCursor) {
      const response = await searchObjects(term, { mode: objectMode.value, limit, cursor: nameCursor, signal })
      if (!current()) return
      objects.value = [...objects.value, ...response.hits]
      nameCursor = response.next_cursor ?? null
      nameCoverage.value = response.coverage
      syncObjectCursor()
      if (response.hits.length) return
    }
  }

  async function settled<T>(promise: Promise<T>): Promise<{ value: T | null; failure: unknown | null }> {
    try {
      return { value: await promise, failure: null }
    } catch (failure) {
      return { value: null, failure }
    }
  }

  async function runSearch(term: string) {
    const mySeq = ++seq
    sectionController?.abort()
    sectionController = null
    loadingSection.value = null
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    pending.value = true
    error.value = null
    const startedAt = performance.now()
    try {
      const searchObjectsNow = includeObjects && Boolean(authToken.value)
      const [unifiedOutcome, objectOutcome, metadataOutcome] = await Promise.all([
        types.length
          ? settled(searchUnified(term, {
              types,
              limit,
              ...filters(),
              signal: controller.signal,
            }))
          : Promise.resolve({ value: null, failure: null }),
        searchObjectsNow
          ? settled(searchObjects(term, {
              mode: objectMode.value,
              limit,
              signal: controller.signal,
            }))
          : Promise.resolve({ value: null, failure: null }),
        searchObjectsNow ? metadataPage(term, signal) : null,
      ])
      if (mySeq !== seq) return // superseded
      reset()
      requestMs.value = Math.round(performance.now() - startedAt)
      if (unifiedOutcome.value) apply(unifiedOutcome.value)
      else if (unifiedOutcome.failure) {
        error.value = errorMessage(unifiedOutcome.failure)
      }
      if (objectOutcome.value) applyObjects(objectOutcome.value)
      else if (objectOutcome.failure) {
        objectError.value = errorMessage(objectOutcome.failure)
      }
      addMetadata(metadataOutcome)
      objectSearched.value = searchObjectsNow
      cursorQuery = term
      searched.value = true
      if (objectOutcome.value && !objects.value.length && nameCursor) {
        pending.value = true
        await followObjects(term, () => mySeq === seq, signal).catch((failure: unknown) => {
          if (mySeq === seq) objectError.value = errorMessage(failure)
        })
      }
    } catch (err) {
      if (mySeq !== seq) return // superseded or aborted
      error.value = errorMessage(err)
    } finally {
      if (mySeq === seq) pending.value = false
    }
  }

  function cursorFor(section: SearchSectionType): Ref<string | null> {
    if (section === 'documents') return documentCursor
    if (section === 'groups') return groupCursor
    return userCursor
  }

  async function loadMore(section: UnifiedSearchSection) {
    if (loadingSection.value || pending.value) return
    const cursorRef = section === 'objects' ? objectCursor : cursorFor(section)
    const cursor = cursorRef.value
    const term = query.value.trim()
    if (!cursor || term !== cursorQuery) return
    const mySeq = seq
    const pageController = new AbortController()
    sectionController = pageController
    loadingSection.value = section
    try {
      if (section === 'objects') {
        const [response, metadata] = await Promise.all([
          nameCursor
            ? searchObjects(term, {
                mode: objectMode.value,
                limit,
                cursor: nameCursor,
                signal: pageController.signal,
              })
            : null,
          metadataCursor ? metadataPage(term, pageController.signal, metadataCursor) : null,
        ])
        if (mySeq !== seq || sectionController !== pageController) return
        if (response) {
          objects.value = [...objects.value, ...response.hits]
          nameCursor = response.next_cursor ?? null
          nameCoverage.value = response.coverage
        }
        addMetadata(metadata)
        syncObjectCursor()
        objectError.value = null
        if (response && !response.hits.length && !(metadata && metadata !== 'failed' && metadata.hits.length)) await followObjects(term, () => mySeq === seq && sectionController === pageController, pageController.signal)
        return
      }
      const response = await searchUnified(term, {
        types: [section],
        limit,
        cursor,
        ...(section === 'documents' ? filters() : {}),
        signal: pageController.signal,
      })
      if (mySeq !== seq || sectionController !== pageController) return
      if (section === 'documents' && response.documents) {
        documents.value = [...documents.value, ...response.documents.hits]
        documentCursor.value = response.documents.next_cursor ?? null
        nodesQueried.value = Math.max(nodesQueried.value, response.documents.nodes_queried)
        nodesFailed.value = Math.max(nodesFailed.value, response.documents.nodes_failed)
        if (response.documents.truncated) truncated.value = true
      } else if (section === 'groups' && response.groups) {
        groups.value = [...groups.value, ...response.groups.hits]
        groupCursor.value = response.groups.next_cursor ?? null
      } else if (section === 'users' && response.users) {
        users.value = [...users.value, ...response.users.hits]
        userCursor.value = response.users.next_cursor ?? null
      }
    } catch (err) {
      if (mySeq !== seq || sectionController !== pageController) return
      const message = errorMessage(err)
      if (section === 'objects') objectError.value = message
      else error.value = message
    } finally {
      if (sectionController === pageController) {
        sectionController = null
        loadingSection.value = null
      }
    }
  }

  /** Ends the search and paging under way; a search cut short is cleared, and `retry` runs it again. */
  function cancel() {
    const cut = pending.value || timer !== undefined
    clearTimeout(timer)
    timer = undefined
    ++seq
    controller?.abort()
    controller = null
    sectionController?.abort()
    sectionController = null
    loadingSection.value = null
    if (cut) {
      cursorQuery = ''
      reset()
    }
  }

  function retry() {
    clearTimeout(timer)
    timer = undefined
    const term = query.value.trim()
    if (term.length >= UNIFIED_MIN_CHARS) void runSearch(term)
  }

  const deps: Array<Ref<unknown>> = [query, signedInEpoch, apiBaseUrl]
  if (config.groupId) deps.push(config.groupId)
  if (config.conformsTo) deps.push(config.conformsTo)
  if (includeObjects) deps.push(objectMode)
  watch(deps, () => {
    window.clearTimeout(timer)
    ++seq
    controller?.abort()
    controller = null
    sectionController?.abort()
    sectionController = null
    cursorQuery = ''
    reset()
    const term = query.value.trim()
    if (term.length < UNIFIED_MIN_CHARS || config.active?.value === false) return
    timer = window.setTimeout(() => {
      timer = undefined
      void runSearch(term)
    }, UNIFIED_DEBOUNCE_MS)
  })

  if (query.value.trim().length >= UNIFIED_MIN_CHARS && config.active?.value !== false) void runSearch(query.value.trim())

  onBeforeUnmount(() => {
    window.clearTimeout(timer)
    seq++
    controller?.abort()
    sectionController?.abort()
  })

  return {
    documents,
    buckets,
    groups,
    users,
    objects,
    documentCursor,
    groupCursor,
    userCursor,
    objectCursor,
    objectCoverage,
    objectError,
    objectSearched,
    objectMode,
    nodesQueried,
    nodesFailed,
    truncated,
    requestMs,
    pending,
    loadingSection,
    error,
    searched,
    active,
    partial,
    complete,
    empty,
    loadMore,
    cancel,
    retry,
  }
}
