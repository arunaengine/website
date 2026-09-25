import { computed, onScopeDispose, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import {
  listRepositoryConnectors,
  listRepositoryKinds,
  searchRepositoryRecords,
  type RepositorySearchPage,
  type RepositoryConnector,
  type RepositoryKind,
} from '@/lib/api'
import { ownRolesWrite } from '@/lib/groupAdmin'
import { repositoryError, searchHits, searchTotal } from '@/lib/repository'
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

// One request per node and session; a failed one is asked again next time.
const kindRequests = new Map<string, Promise<RepositoryKind[]>>()

// The repository kinds the node supports and what each can do. `kinds` stays
// null until the node answered, so unknown never reads as unsupported.
export function useRepositoryKinds() {
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const kinds = ref<RepositoryKind[] | null>(null)
  const error = ref<string | null>(null)
  let generation = 0

  async function load() {
    const current = ++generation
    const key = `${apiBaseUrl.value}|${sessionEpoch.value}`
    kinds.value = null
    error.value = null
    let request = kindRequests.get(key)
    if (!request) {
      request = listRepositoryKinds({ baseUrl: apiBaseUrl.value, token: authToken.value })
      kindRequests.set(key, request)
    }
    try {
      const list = await request
      if (current === generation) kinds.value = list
    } catch (err) {
      if (kindRequests.get(key) === request) kindRequests.delete(key)
      if (current === generation) error.value = errorMessage(err)
    }
  }

  watch([apiBaseUrl, sessionEpoch], () => void load(), { immediate: true })
  const kindOf = (kind: string | undefined) => kinds.value?.find((entry) => entry.kind === kind) ?? null
  return { kinds, error, load, kindOf }
}

// The caller's own rights: metadata WRITE in a group manages its repository
// connectors and kept imports, admin WRITE manages every link of that group.
export function useGroupRights(groupId: () => string) {
  const { userInfo } = useAruna()
  function writes(group: string, scope: string): boolean {
    const roles = userInfo.value?.groups.find((entry) => entry.group_id === group)?.roles ?? []
    return ownRolesWrite(roles, `/${userInfo.value?.realm.realm_id ?? ''}/g/${group}/${scope}`)
  }
  return {
    userId: computed(() => userInfo.value?.user.user_id ?? ''),
    canWriteMeta: computed(() => writes(groupId(), 'meta/**')),
    adminOf: (group: string) => writes(group, 'admin'),
  }
}

export interface SearchScope {
  groupId: string
  connectorId: string
}

// Repositories page only through the first 10,000 hits (Zenodo and InvenioRDM).
const RESULT_WINDOW = 10_000

// Remote record search. Typing waits for a pause; every answer is bound to the
// query, page, connector and session it was asked for. An empty query asks nothing.
export function useRepositorySearch(scope: () => SearchScope, options: { delayMs?: number; size?: number } = {}) {
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const delayMs = options.delayMs ?? 350
  const size = options.size ?? 10
  const query = ref('')
  const page = ref(1)
  const result = ref<RepositorySearchPage | null>(null)
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
    loading.value = Boolean(groupId && connectorId && query.value.trim())
    if (!loading.value) return
    try {
      const answer = await searchRepositoryRecords(
        { group_id: groupId, connector_id: connectorId, q: query.value.trim(), page: page.value, size },
        { baseUrl: apiBaseUrl.value, token: authToken.value },
      )
      if (current === generation) result.value = answer
    } catch (err) {
      if (current === generation) error.value = repositoryError(err, true)
    } finally {
      if (current === generation) loading.value = false
    }
  }

  watch(query, () => {
    // An answer for the previous text must not land after the user moved on.
    generation++
    loading.value = Boolean(query.value.trim())
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
  const lastPage = Math.floor(RESULT_WINDOW / size)
  const pageCount = computed(() =>
    total.value === null ? null : Math.min(lastPage, Math.max(1, Math.ceil(total.value / size))),
  )
  const hasNext = computed(() => {
    if (pageCount.value !== null) return page.value < pageCount.value
    if (page.value >= lastPage) return false
    return Boolean(result.value?.links?.next) || hits.value.length === size
  })
  const idle = computed(() => !query.value.trim())

  return { query, page, result, hits, total, pageCount, hasNext, loading, error, idle, run }
}
