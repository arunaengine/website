// The steps running on the buckets of a group, by bucket name, for the labels in a bucket list.
// A node without the field, or a caller who may not read it (403 or 404), simply shows none.
import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { ApiError, listStorageBuckets, type BucketJob } from '@/lib/api'

const POLL_MS = 3000
const PAGE = 200

/** `listed` changes whenever the bucket list is read again; the jobs are read with it. */
export function useBucketJobs(groupId: Ref<string>, listed: Ref<unknown>) {
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const jobs = ref(new Map<string, BucketJob>())
  let generation = 0
  // Where the node refused the listing; it is not asked again there.
  let refused = ''
  let timer: ReturnType<typeof setTimeout> | undefined

  const client = () => ({ baseUrl: apiBaseUrl.value, token: authToken.value })
  const place = () => `${apiBaseUrl.value}\n${sessionEpoch.value}\n${groupId.value}`

  // Only the newest read for the current group and session sets the jobs.
  async function load() {
    clearTimeout(timer)
    const id = ++generation
    const asked = place()
    if (!groupId.value || !authToken.value || refused === asked) return
    const found = new Map<string, BucketJob>()
    try {
      let after: string | null = null
      for (;;) {
        const page = await listStorageBuckets(groupId.value, { limit: PAGE, after }, client())
        if (id !== generation) return
        for (const entry of page.buckets) if (entry.job) found.set(entry.bucket, entry.job)
        if (!page.next) break
        after = page.next
      }
    } catch (err) {
      if (id !== generation) return
      // Any other failure keeps what was known, and a running step is asked about again.
      if (isUnsupportedEndpoint(err) || (err instanceof ApiError && err.status === 403)) {
        refused = asked
        jobs.value = new Map()
      } else follow()
      return
    }
    jobs.value = found
    follow()
  }

  function follow() {
    if (jobs.value.size) timer = setTimeout(() => void load(), POLL_MS)
  }

  watch(
    [groupId, apiBaseUrl, sessionEpoch],
    () => {
      jobs.value = new Map()
      void load()
    },
    { immediate: true },
  )
  watch(listed, () => void load())
  onScopeDispose(() => {
    generation++
    clearTimeout(timer)
  })

  return jobs
}
