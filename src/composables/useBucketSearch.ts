// Federated bucket search over GET /search/buckets for one typed query.
// Debounced with request-id staleness; fewer than two letters ask nothing.
import { useDebounceFn } from '@vueuse/core'
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import type { BucketSearchHit } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export const MIN_CHARS = 2

export function useBucketSearch(query: Ref<string>) {
  const { authToken, searchBuckets } = useAruna()
  const hits = ref<BucketSearchHit[]>([])
  const nodesQueried = ref(0)
  const nodesFailed = ref(0)
  const searching = ref(false)
  const searched = ref(false)
  const error = ref<string | null>(null)
  let seq = 0

  const runSearch = useDebounceFn(async (term: string) => {
    const mySeq = ++seq
    if (term.length < MIN_CHARS || !authToken.value) {
      hits.value = []
      searching.value = false
      searched.value = false
      return
    }
    searching.value = true
    error.value = null
    try {
      const response = await searchBuckets(term)
      if (mySeq !== seq) return
      hits.value = response.hits
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

  watch(query, (value) => void runSearch(value.trim()), { immediate: true })

  return { hits, nodesQueried, nodesFailed, searching, searched, error }
}
