// Federated bucket search over GET /search/buckets for one typed query.
// Debounced with request-id staleness; fewer than two letters ask nothing.
import { useDebounceFn } from '@vueuse/core'
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import type { BucketSearchHit } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export const MIN_CHARS = 2

// listAll: an empty query lists every bucket, a page at a time through loadMore.
export function useBucketSearch(query: Ref<string>, options: { listAll?: boolean } = {}) {
  const { authToken, searchBuckets } = useAruna()
  const minChars = options.listAll ? 0 : MIN_CHARS
  const page = options.listAll ? { limit: 50 } : {}
  const hits = ref<BucketSearchHit[]>([])
  const nodesQueried = ref(0)
  const nodesFailed = ref(0)
  const searching = ref(false)
  const searched = ref(false)
  const error = ref<string | null>(null)
  const more = ref(false)
  // Where the shown list goes on, and the query it belongs to.
  let cursor: string | null = null
  let shownTerm = ''
  let seq = 0

  const runSearch = useDebounceFn(async (term: string) => {
    const mySeq = ++seq
    if (term.length < minChars || !authToken.value) {
      hits.value = []
      searching.value = false
      searched.value = false
      return
    }
    searching.value = true
    error.value = null
    try {
      const response = await searchBuckets(term, page)
      if (mySeq !== seq) return
      hits.value = response.hits
      shownTerm = term
      cursor = response.next_cursor ?? null
      more.value = Boolean(cursor)
      nodesQueried.value = response.nodes_queried
      nodesFailed.value = response.nodes_failed
      searched.value = true
    } catch (err) {
      if (mySeq !== seq) return
      hits.value = []
      error.value = errorMessage(err)
    } finally {
      if (mySeq === seq) searching.value = false
    }
  }, 250)

  // The next page of the shown list; a newer query drops it.
  async function loadMore(): Promise<void> {
    const after = cursor
    if (!after || searching.value) return
    const mySeq = seq
    searching.value = true
    error.value = null
    try {
      const response = await searchBuckets(shownTerm, { ...page, cursor: after })
      if (mySeq !== seq) return
      hits.value = [...hits.value, ...response.hits]
      nodesFailed.value = response.nodes_failed
      cursor = response.next_cursor ?? null
      more.value = Boolean(cursor)
    } catch (err) {
      if (mySeq !== seq) return
      error.value = errorMessage(err)
    } finally {
      if (mySeq === seq) searching.value = false
    }
  }

  // Each keystroke drops the answer on its way at once; only the new request waits.
  watch(
    query,
    (value) => {
      const term = value.trim()
      ++seq
      cursor = null
      more.value = false
      if (term.length < minChars) {
        hits.value = []
        searching.value = false
        searched.value = false
        error.value = null
      }
      void runSearch(term)
    },
    { immediate: true },
  )

  return { hits, nodesQueried, nodesFailed, searching, searched, error, more, loadMore }
}
