// Live check of a provider bucket while its name is typed: whether it exists
// and whether the storage keys can write there. Saving never waits for it.
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { checkProviderBucket, type ProviderBucketCheck } from '@/lib/api'

export interface BucketCheckTarget {
  groupId: string
  backendId: string
  bucket: string
}

export interface BucketCheckNote {
  text: string
  warning: boolean
}

const TYPING_MS = 400

/** Null while unknown, so the caller keeps its neutral text. */
export function useBucketCheck(target: () => BucketCheckTarget | null) {
  const { apiBaseUrl, authToken } = useAruna()
  const answer = ref<ProviderBucketCheck | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0

  watch(
    () => {
      const next = target()
      return next && next.bucket.trim() ? { ...next, bucket: next.bucket.trim() } : null
    },
    (next, previous) => {
      if (JSON.stringify(next) === JSON.stringify(previous)) return
      clearTimeout(timer)
      const id = ++seq
      answer.value = null
      if (!next) return
      timer = setTimeout(async () => {
        try {
          const client = { baseUrl: apiBaseUrl.value, token: authToken.value }
          const result = await checkProviderBucket(next.groupId, next.backendId, next.bucket, client)
          if (id === seq) answer.value = result
        } catch {
          // Older nodes lack the route; the neutral text stays.
        }
      }, TYPING_MS)
    },
    { immediate: true },
  )
  // A closed dialog drops the pending check and any answer still on its way.
  onScopeDispose(() => {
    clearTimeout(timer)
    ++seq
  })

  return computed<BucketCheckNote | null>(() => {
    const result = answer.value
    if (!result) return null
    if (!result.exists) return { text: 'New bucket. Aruna creates it.', warning: false }
    // Older nodes do not say whether the keys can write.
    if (result.writable === true) return { text: 'Existing bucket. Aruna can write here.', warning: false }
    if (result.writable === false) return { text: 'Existing bucket. These keys cannot write here.', warning: true }
    return { text: 'Existing bucket.', warning: false }
  })
}
