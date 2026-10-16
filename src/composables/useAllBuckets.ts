// The buckets of every node, from the federated bucket search: one request per
// page, so a realm of many nodes opens no S3 session per node.
import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type BucketSearchHit } from '@/lib/api'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { errorMessage } from '@/lib/utils'

export const BUCKET_PAGE = 25
const MIN_CHARS = 2
const TYPING_MS = 250

export function useAllBuckets(query: Ref<string>, groupId: Ref<string>, enabled: Ref<boolean>) {
  const { authToken, searchBuckets, sessionEpoch } = useAruna()
  const hits = ref<BucketSearchHit[]>([])
  const failedNodes = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const more = ref(false)
  // Older nodes refuse a search without a name; the caller shows its own list then.
  const needsName = ref(false)
  let cursor: string | null = null
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  // Drops the list and every answer still on its way.
  function reset() {
    ++seq
    hits.value = []
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
    if (!enabled.value || !groupId.value || !authToken.value || (term && term.length < MIN_CHARS)) return
    const id = ++seq
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
        (hit) => hit.group_id === groupId.value && !isWorkspaceBucket(hit.bucket),
      )
      hits.value = after ? [...hits.value, ...page] : page
      cursor = response.next_cursor ?? null
      more.value = Boolean(cursor)
      failedNodes.value = response.nodes_failed
      needsName.value = false
    } catch (err) {
      if (id !== seq) return
      needsName.value = !term && err instanceof ApiError && err.status === 400
      if (!needsName.value) error.value = errorMessage(err)
      more.value = false
    } finally {
      if (id === seq) loading.value = false
    }
  }

  // Another group, account or sign-in starts over, including the fallback for older nodes.
  watch(
    [groupId, enabled, sessionEpoch, () => Boolean(authToken.value)],
    () => {
      needsName.value = false
      void load()
    },
    { immediate: true },
  )
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
