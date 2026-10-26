// The incoming syncs and storage folders of a bucket, from every node that owns it: its node, or
// each member of a distributed bucket. Read from configuration, not files. A node without the
// route answers 404, which reads as "not listed here", never as "no sources".
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type FileSource } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export type SourcesState = 'loading' | 'ready' | 'missing' | 'failed'

/** `nodes`: who to ask, null for this node; null while the owning nodes are not known. */
export function useBucketSources(bucket: Ref<string>, nodes: Ref<(string | null)[] | null>) {
  const { getBucketSources, sessionEpoch } = useAruna()
  const sources = ref<FileSource[]>([])
  const complete = ref(true)
  const state = ref<SourcesState>('loading')
  const error = ref<string | null>(null)
  let runs = 0

  watch(
    [bucket, () => nodes.value?.join(','), () => sessionEpoch.value],
    async () => {
      const run = ++runs
      const epoch = sessionEpoch.value
      const asked = nodes.value
      sources.value = []
      error.value = null
      state.value = 'loading'
      if (!asked) return
      const answers = await Promise.allSettled(asked.map((node) => getBucketSources(bucket.value, undefined, node)))
      if (run !== runs || epoch !== sessionEpoch.value) return
      const found = answers.flatMap((answer) => (answer.status === 'fulfilled' ? [answer.value] : []))
      const failures = answers.flatMap((answer) => (answer.status === 'rejected' ? [answer.reason] : []))
      const missing = (cause: unknown) => cause instanceof ApiError && cause.status === 404
      // One distributed bucket may name the same path on each member; it is listed once.
      const seen = new Set<string>()
      sources.value = found.flatMap((answer) => answer.sources).filter((source) => {
        const key = JSON.stringify(source)
        return !seen.has(key) && Boolean(seen.add(key))
      })
      complete.value = found.every((answer) => answer.complete) && !failures.length
      const failed = failures.find((cause) => !missing(cause))
      state.value = failed ? 'failed' : found.length ? 'ready' : 'missing'
      error.value = failed ? errorMessage(failed) : null
    },
    { immediate: true },
  )

  return { sources, complete, state, error }
}
