// Whether the signed-in user can see a bucket of their own (workspace buckets do not count), for the
// first steps. Null until read; a failed read leaves the step open.
import { ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { isHiddenBucket } from '@/lib/workspaces'

export function useHasBucket() {
  const { searchBuckets, sessionEpoch } = useAruna()
  const hasBucket = ref<boolean | null>(null)

  async function load() {
    const epoch = sessionEpoch.value
    let found = false
    try {
      let cursor: string | undefined
      do {
        const page = await searchBuckets('', { limit: 50, cursor })
        found = page.hits.some((hit) => !isHiddenBucket(hit.bucket))
        cursor = page.next_cursor ?? undefined
      } while (cursor && !found)
    } catch {
      // The step stays open; its button works either way.
    }
    if (epoch === sessionEpoch.value) hasBucket.value = found
  }

  return { hasBucket, load }
}
