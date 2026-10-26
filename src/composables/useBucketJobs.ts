// The steps running on the buckets of a group, for the labels in a bucket list: by bucket name on
// this node, by `node/bucket` on the other nodes listed. A node that refuses simply shows none.
import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { nodeClient } from '@/composables/aruna/state'
import { isUnsupportedEndpoint, useAruna } from '@/composables/useAruna'
import { ApiError, listStorageBuckets, type BucketJob } from '@/lib/api'

const POLL_MS = 3000
const PAGE = 200

/** `listed` changes whenever the bucket list is read again; the jobs are read with it. */
export function useBucketJobs(groupId: Ref<string>, listed: Ref<unknown>, others: Ref<string[]> = ref([])) {
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
    for (const node of others.value) await readNode(node, found, id)
    if (id !== generation) return
    jobs.value = found
    follow()
  }

  // Another node's steps; its refusal or silence leaves its rows without a label.
  async function readNode(node: string, found: Map<string, BucketJob>, id: number) {
    try {
      let after: string | null = null
      for (;;) {
        const page = await listStorageBuckets(groupId.value, { limit: PAGE, after }, nodeClient(node))
        if (id !== generation) return
        for (const entry of page.buckets) if (entry.job) found.set(`${node}/${entry.bucket}`, entry.job)
        if (!page.next) break
        after = page.next
      }
    } catch {
      // Nothing is known of this node's steps.
    }
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
  watch([listed, () => others.value.join(',')], () => void load())
  onScopeDispose(() => {
    generation++
    clearTimeout(timer)
  })

  return jobs
}
