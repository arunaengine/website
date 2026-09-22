import { computed, onScopeDispose, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import {
  listRepositoryConnectors,
  searchInvenioRecords,
  type InvenioSearchPage,
  type RepositoryConnector,
} from '@/lib/api'
import { searchHits, searchTotal } from '@/lib/invenio'
import { errorMessage } from '@/lib/utils'

// Repository connectors of one group. `connectors` stays null until the current
// group answered, so an unknown list never reads as an empty one.
export function useRepositoryConnectors(groupId: () => string) {
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const connectors = ref<RepositoryConnector[] | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let generation = 0

  async function load() {
    const current = ++generation
    const group = groupId()
    connectors.value = null
    error.value = null
    loading.value = Boolean(group)
    if (!group) return
    try {
      const list = await listRepositoryConnectors(group, { baseUrl: apiBaseUrl.value, token: authToken.value })
      if (current === generation) connectors.value = list
    } catch (err) {
      if (current === generation) error.value = errorMessage(err)
    } finally {
      if (current === generation) loading.value = false
    }
  }

  watch([groupId, sessionEpoch], () => void load(), { immediate: true })
  return { connectors, loading, error, load }
}

export interface SearchScope {
  groupId: string
  connectorId: string
}

// Remote record search. Typing waits for a pause; every answer is bound to the
// query, page, connector and session it was asked for.
export function useInvenioSearch(scope: () => SearchScope, options: { delayMs?: number; size?: number } = {}) {
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const delayMs = options.delayMs ?? 350
  const size = options.size ?? 10
  const query = ref('')
  const page = ref(1)
  const result = ref<InvenioSearchPage | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function stopTimer() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  async function run() {
    stopTimer()
    const current = ++generation
    const { groupId, connectorId } = scope()
    result.value = null
    error.value = null
    loading.value = Boolean(groupId && connectorId)
    if (!loading.value) return
    try {
      const answer = await searchInvenioRecords(
        { group_id: groupId, connector_id: connectorId, q: query.value.trim(), page: page.value, size },
        { baseUrl: apiBaseUrl.value, token: authToken.value },
      )
      if (current === generation) result.value = answer
    } catch (err) {
      if (current === generation) error.value = errorMessage(err)
    } finally {
      if (current === generation) loading.value = false
    }
  }

  watch(query, () => {
    // An answer for the previous text must not land after the user moved on.
    generation++
    loading.value = true
    stopTimer()
    timer = setTimeout(() => {
      timer = undefined
      if (page.value !== 1) page.value = 1
      else void run()
    }, delayMs)
  })
  watch(
    [page, () => scope().groupId, () => scope().connectorId, sessionEpoch],
    () => void run(),
    { immediate: true },
  )
  onScopeDispose(() => {
    stopTimer()
    generation++
  })

  const hits = computed(() => searchHits(result.value))
  const total = computed(() => searchTotal(result.value))
  const pageCount = computed(() => (total.value === null ? null : Math.max(1, Math.ceil(total.value / size))))
  const hasNext = computed(() => {
    if (pageCount.value !== null) return page.value < pageCount.value
    return Boolean(result.value?.links?.next) || hits.value.length === size
  })

  return { query, page, result, hits, total, pageCount, hasNext, loading, error, run }
}
