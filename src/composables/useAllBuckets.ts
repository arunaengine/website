// The buckets of every node, from the federated bucket search: one request per
// page, so a realm of many nodes opens no S3 session per node.
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { nodeInfo } from '@/composables/aruna/state'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { ApiError, type BucketSearchHit } from '@/lib/api'
import { mergeSets } from '@/lib/distribution'
import { isHiddenBucket } from '@/lib/workspaces'
import { errorMessage } from '@/lib/utils'

export const BUCKET_PAGE = 25
const MIN_CHARS = 2
const TYPING_MS = 250

// The first page of the last listed group, so a new visit shows it at once while it is read again.
let firstPage: { key: string; hits: BucketSearchHit[]; cursor: string | null; failedNodes: number } | null = null

// A deleted bucket leaves the remembered first page at once, so no later visit shows it.
export function forgetBucket(bucket: string) {
  if (firstPage) firstPage = { ...firstPage, hits: firstPage.hits.filter((hit) => hit.bucket !== bucket) }
}

export function useAllBuckets(query: Ref<string>, groupId: Ref<string>, enabled: Ref<boolean>) {
  const { apiBaseUrl, currentUser, searchBuckets, sessionEpoch } = useAruna()
  const { isTarget } = useRealmNodes()
  const found = ref<BucketSearchHit[]>([])
  // A distributed bucket is one row however many of its nodes answered. A device's buckets are
  // its owner's, not a place in the realm; the check follows the realm's node list as it changes.
  const hits = computed(() => mergeSets(found.value.filter((hit) => isTarget(hit.node_id)), (id) => id === nodeInfo.value?.node.peer_id))
  const failedNodes = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const more = ref(false)
  // Older nodes refuse a search without a name; the caller shows its own list then.
  const needsName = ref(false)
  let cursor: string | null = null
  let seq = 0
  // The kind of request on its way (true: a next page), and one a token change dropped.
  let inFlight: boolean | null = null
  let dropped: boolean | null = null
  // Who asks: a renewed token keeps the account, so the loaded pages stay.
  const account = computed(() => (currentUser.value ? `${apiBaseUrl.value}|${currentUser.value.id}` : ''))
  let lastAccount = account.value
  let timer: ReturnType<typeof setTimeout> | undefined

  // Drops the list and every answer still on its way.
  function reset() {
    ++seq
    found.value = []
    cursor = null
    more.value = false
    failedNodes.value = 0
    loading.value = false
    error.value = null
  }

  // The next page follows the node's cursor; a missing cursor ends the list.
  async function load(next = false) {
    const term = query.value.trim()
    if (next && !cursor) return
    if (!next) reset()
    if (!enabled.value || !groupId.value || !account.value || (term && term.length < MIN_CHARS)) return
    const key = `${account.value}|${sessionEpoch.value}|${groupId.value}`
    if (!next && !term && firstPage?.key === key) {
      found.value = firstPage.hits
      cursor = firstPage.cursor
      more.value = Boolean(cursor)
      failedNodes.value = firstPage.failedNodes
    }
    const id = ++seq
    inFlight = next
    const after = next ? cursor : null
    loading.value = true
    error.value = null
    try {
      const response = await searchBuckets(term, {
        limit: BUCKET_PAGE,
        groupId: groupId.value,
        cursor: after ?? undefined,
      })
      if (id !== seq) return
      // Older nodes ignore the group filter, so it is applied here as well.
      const page = response.hits.filter(
        (hit) => hit.group_id === groupId.value && !isHiddenBucket(hit.bucket),
      )
      found.value = after ? [...found.value, ...page] : page
      cursor = response.next_cursor ?? null
      if (!after && !term) firstPage = { key, hits: page, cursor, failedNodes: response.nodes_failed }
      more.value = Boolean(cursor)
      failedNodes.value = response.nodes_failed
      needsName.value = false
    } catch (err) {
      if (id !== seq) return
      needsName.value = !term && err instanceof ApiError && err.status === 400
      if (!needsName.value) error.value = errorMessage(err)
      more.value = false
    } finally {
      if (id === seq) {
        loading.value = false
        inFlight = null
      }
    }
  }

  // Another group or account starts over, including the fallback for older nodes.
  function restart() {
    needsName.value = false
    void load()
  }
  watch([groupId, enabled], restart, { immediate: true })
  watch(account, (next) => {
    if (!next) return
    if (next !== lastAccount) {
      lastAccount = next
      restart()
    } else if (dropped !== null) void load(dropped)
    dropped = null
  })
  // An answer asked with the old token is dropped; the same account asks again.
  watch(sessionEpoch, () => {
    if (inFlight === null) return
    dropped = inFlight
    inFlight = null
    ++seq
    loading.value = false
    if (account.value === lastAccount && account.value) {
      void load(dropped)
      dropped = null
    }
  })
  // Every keystroke drops the old answer at once; only the new request waits.
  watch(query, () => {
    clearTimeout(timer)
    reset()
    timer = setTimeout(() => void load(), TYPING_MS)
  })
  onScopeDispose(() => clearTimeout(timer))

  return {
    hits,
    failedNodes,
    loading,
    error,
    more,
    needsName,
    reload: () => load(),
    loadMore: () => load(true),
  }
}
