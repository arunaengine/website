// Debounced, server-backed unified search against GET /search plus the typed
// GET /search/objects inventory when requested. Each section pages on its own.
//
// Per-view FACTORY, not a module singleton: the debounce timer, in-flight
// AbortControllers and section cursors are bound to the owning view. Must be
// called during component setup (uses onBeforeUnmount).
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import {
  type MetadataSearchHit,
  type ObjectSearchCoverage,
  type ObjectSearchHit,
  type ObjectSearchMode,
  type SearchGroupHit,
  type SearchSectionType,
  type SearchUserHit,
  type UnifiedSearchResponse,
} from '@/lib/api'
import { useAruna } from '@/composables/useAruna'
import { errorMessage } from '@/lib/utils'

export const UNIFIED_DEBOUNCE_MS = 250
// Backend rejects a query shorter than two characters with 400.
export const UNIFIED_MIN_CHARS = 2
export const DEFAULT_OBJECT_SEARCH_MODE: ObjectSearchMode = 'distributed_best_effort'
export const OBJECT_SEARCH_MODE_LABELS: Record<ObjectSearchMode, string> = {
  local: 'Local',
  distributed_best_effort: 'Distributed best-effort',
  distributed_strict: 'Distributed strict',
}

const ALL_TYPES: SearchSectionType[] = ['documents', 'groups', 'users']
export type UnifiedSearchSection = SearchSectionType | 'objects'

// The single completeness rule for object coverage: every partition answered
// and nothing cut off.
export function coverageComplete(coverage: ObjectSearchCoverage | null | undefined): boolean {
  return Boolean(coverage?.complete && !coverage.truncated)
}

export interface UnifiedSearchConfig {
  types?: SearchSectionType[]
  limit?: number
  groupId?: Ref<string | null>
  conformsTo?: Ref<string | null>
  includeObjects?: boolean
  objectMode?: Ref<ObjectSearchMode>
}

export function useUnifiedSearch(query: Ref<string>, config: UnifiedSearchConfig = {}) {
  const { searchUnified, searchObjects, authToken, apiBaseUrl } = useAruna()
  const types = config.types ?? ALL_TYPES
  const limit = config.limit ?? 10
  const includeObjects = config.includeObjects ?? false
  const objectMode = config.objectMode ?? ref<ObjectSearchMode>(DEFAULT_OBJECT_SEARCH_MODE)

  const documents = ref<MetadataSearchHit[]>([])
  const groups = ref<SearchGroupHit[]>([])
  const users = ref<SearchUserHit[]>([])
  const objects = ref<ObjectSearchHit[]>([])
  const documentCursor = ref<string | null>(null)
  const groupCursor = ref<string | null>(null)
  const userCursor = ref<string | null>(null)
  const objectCursor = ref<string | null>(null)
  const objectCoverage = ref<ObjectSearchCoverage | null>(null)
  const objectError = ref<string | null>(null)
  const objectSearched = ref(false)
  const nodesQueried = ref(0)
  const nodesFailed = ref(0)
  const truncated = ref(false)
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
    truncated.value ||
    Boolean(objectCoverage.value && !coverageComplete(objectCoverage.value)),
  )
  const complete = computed(() => !error.value && !objectError.value && !partial.value)
  const empty = computed(() =>
    !documents.value.length && !groups.value.length && !users.value.length && !objects.value.length,
  )

  let timer: number | undefined
  let seq = 0
  let controller: AbortController | null = null
  let sectionController: AbortController | null = null
  // The query the section cursors were issued for; a cursor is only valid for it.
  let cursorQuery = ''

  function filters(): { group_id?: string; conforms_to?: string } {
    return {
      group_id: config.groupId?.value ?? undefined,
      conforms_to: config.conformsTo?.value ?? undefined,
    }
  }

  function reset() {
    documents.value = []
    groups.value = []
    users.value = []
    objects.value = []
    documentCursor.value = null
    groupCursor.value = null
    userCursor.value = null
    objectCursor.value = null
    objectCoverage.value = null
    objectError.value = null
    objectSearched.value = false
    nodesQueried.value = 0
    nodesFailed.value = 0
    truncated.value = false
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
    objectCursor.value = response.next_cursor ?? null
    objectCoverage.value = response.coverage
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
    pending.value = true
    error.value = null
    const startedAt = performance.now()
    try {
      const searchObjectsNow = includeObjects && Boolean(authToken.value)
      const [unifiedOutcome, objectOutcome] = await Promise.all([
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
      objectSearched.value = searchObjectsNow
      cursorQuery = term
      searched.value = true
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
        const response = await searchObjects(term, {
          mode: objectMode.value,
          limit,
          cursor,
          signal: pageController.signal,
        })
        if (mySeq !== seq || sectionController !== pageController) return
        objects.value = [...objects.value, ...response.hits]
        objectCursor.value = response.next_cursor ?? null
        objectCoverage.value = response.coverage
        objectError.value = null
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

  function retry() {
    const term = query.value.trim()
    if (term.length >= UNIFIED_MIN_CHARS) void runSearch(term)
  }

  const deps: Array<Ref<unknown>> = [query, authToken, apiBaseUrl]
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
    if (term.length < UNIFIED_MIN_CHARS) return
    timer = window.setTimeout(() => void runSearch(term), UNIFIED_DEBOUNCE_MS)
  })

  if (query.value.trim().length >= UNIFIED_MIN_CHARS) void runSearch(query.value.trim())

  onBeforeUnmount(() => {
    window.clearTimeout(timer)
    seq++
    controller?.abort()
    sectionController?.abort()
  })

  return {
    documents,
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
    retry,
  }
}
