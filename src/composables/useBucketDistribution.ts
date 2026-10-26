// The set of one bucket on the connected node: its nodes, ranges and state.
// An ordinary bucket answers 404, which is not an error. A bucket on another
// node, an unreadable one and a failed read all stay "unavailable", never empty.
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError } from '@/lib/api'
import { fromStatus, type DistributedBucket } from '@/lib/distribution'
import { errorMessage } from '@/lib/utils'

export type DistributionState = 'loading' | 'ready' | 'ordinary' | 'unavailable'

export function useBucketDistribution(bucket: Ref<string>, nodeId: Ref<string | null>) {
  const { getBucketDistribution, sessionEpoch } = useAruna()
  const view = ref<DistributedBucket | null>(null)
  const state = ref<DistributionState>('loading')
  const error = ref<string | null>(null)
  let runs = 0

  async function load() {
    const run = ++runs
    const name = bucket.value
    const epoch = sessionEpoch.value
    if (!name || nodeId.value) {
      view.value = null
      state.value = 'unavailable'
      error.value = null
      return
    }
    const current = () => run === runs && epoch === sessionEpoch.value && name === bucket.value
    try {
      const status = await getBucketDistribution(name)
      if (!current()) return
      view.value = fromStatus(status)
      state.value = 'ready'
      error.value = null
    } catch (cause) {
      if (!current()) return
      if (cause instanceof ApiError && cause.status === 404) {
        view.value = null
        state.value = 'ordinary'
        error.value = null
        return
      }
      // A failed refresh keeps the last status of this bucket and says it failed.
      if (view.value?.name !== name) view.value = null
      state.value = view.value ? 'ready' : 'unavailable'
      error.value = errorMessage(cause)
    }
  }

  watch(
    [bucket, nodeId, () => sessionEpoch.value],
    () => {
      view.value = null
      state.value = 'loading'
      error.value = null
      void load()
    },
    { immediate: true },
  )

  return { view, state, error, reload: load }
}
