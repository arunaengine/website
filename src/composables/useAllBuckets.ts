// The buckets of every node, from the federated bucket search: one request per
// page, so a realm of many nodes opens no S3 session per node.
import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type BucketSearchHit } from '@/lib/api'
import { isWorkspaceBucket } from '@/lib/workspaces'
import { errorMessage } from '@/lib/utils'

export const BUCKET_PAGE = 25
// The node caps one answer at this many hits.
const MAX_LIMIT = 50
const MIN_CHARS = 2
const TYPING_MS = 250

export function useAllBuckets(query: Ref<string>, groupId: Ref<string>, enabled: Ref<boolean>) {
  const { searchBuckets } = useAruna()
  const hits = ref<BucketSearchHit[]>([])
  const failedNodes = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const more = ref(false)
  // Older nodes refuse a search without a name; the caller shows its own list then.
  const needsName = ref(false)
  let limit = BUCKET_PAGE
  let cursor: string | null = null
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  // With a cursor the next page is appended; without one the same request asks for more hits.
  async function load(next = false) {
    const term = query.value.trim()
    if (!enabled.value || (term && term.length < MIN_CHARS)) return
    const id = ++seq
    const after = next ? cursor : null
    if (!next) limit = BUCKET_PAGE
    else if (!after) limit = Math.min(limit + BUCKET_PAGE, MAX_LIMIT)
    loading.value = true
    error.value = null
    try {
      const response = await searchBuckets(term, { limit, cursor: after ?? undefined })
      if (id !== seq) return
      const page = response.hits.filter(
        (hit) => hit.group_id === groupId.value && !isWorkspaceBucket(hit.bucket),
      )
      hits.value = after ? [...hits.value, ...page] : page
      cursor = response.next_cursor ?? null
      more.value = Boolean(cursor) || (response.hits.length >= limit && limit < MAX_LIMIT)
      failedNodes.value = response.nodes_failed
      needsName.value = false
    } catch (err) {
      if (id !== seq) return
      needsName.value = !term && err instanceof ApiError && err.status === 400
      if (!needsName.value) error.value = errorMessage(err)
      if (!next) hits.value = []
      more.value = false
    } finally {
      if (id === seq) loading.value = false
    }
  }

  watch([groupId, enabled], () => void load(), { immediate: true })
  watch(query, () => {
    clearTimeout(timer)
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
