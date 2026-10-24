// The incoming syncs and storage folders of a bucket, from the node that serves it. They are read
// from configuration, so they do not depend on how many files the bucket holds. A node without
// the route answers 404, which reads as "not listed here", never as "no sources".
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type FileSource } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export type SourcesState = 'loading' | 'ready' | 'missing' | 'failed'

export function useBucketSources(bucket: Ref<string>, nodeId: Ref<string | null>) {
  const { getBucketSources, sessionEpoch } = useAruna()
  const sources = ref<FileSource[]>([])
  const complete = ref(true)
  const state = ref<SourcesState>('loading')
  const error = ref<string | null>(null)
  let runs = 0

  watch(
    [bucket, nodeId],
    async () => {
      const run = ++runs
      const epoch = sessionEpoch.value
      sources.value = []
      error.value = null
      if (nodeId.value) {
        state.value = 'missing'
        return
      }
      state.value = 'loading'
      try {
        const answer = await getBucketSources(bucket.value)
        if (run !== runs || epoch !== sessionEpoch.value) return
        sources.value = answer.sources
        complete.value = answer.complete
        state.value = 'ready'
      } catch (cause) {
        if (run !== runs || epoch !== sessionEpoch.value) return
        const missing = cause instanceof ApiError && cause.status === 404
        state.value = missing ? 'missing' : 'failed'
        error.value = missing ? null : errorMessage(cause)
      }
    },
    { immediate: true },
  )

  return { sources, complete, state, error }
}
