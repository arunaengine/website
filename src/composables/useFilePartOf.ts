// The datasets whose live linked parts contain one file: its derived isPartOf, at most ten.
// A node without the route answers 404, which reads as "not available", never as "none".
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type PartOfResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export type PartOfState = 'loading' | 'ready' | 'missing' | 'failed'

export interface PartOfTarget {
  bucket: string
  key: string
  /** The node that holds the bucket; this node when absent. */
  node?: string | null
}

export function useFilePartOf(target: Ref<PartOfTarget | null>) {
  const { getFilePartOf, sessionEpoch } = useAruna()
  const found = ref<PartOfResponse | null>(null)
  const state = ref<PartOfState>('loading')
  const error = ref<string | null>(null)
  let runs = 0

  async function load() {
    const asked = target.value
    const run = ++runs
    const epoch = sessionEpoch.value
    found.value = null
    error.value = null
    if (!asked) {
      state.value = 'missing'
      return
    }
    state.value = 'loading'
    try {
      const answer = await getFilePartOf(asked.bucket, asked.key, undefined, asked.node ?? null)
      if (run !== runs || epoch !== sessionEpoch.value) return
      found.value = answer
      state.value = 'ready'
    } catch (cause) {
      if (run !== runs || epoch !== sessionEpoch.value) return
      const missing = cause instanceof ApiError && cause.status === 404
      state.value = missing ? 'missing' : 'failed'
      error.value = missing ? null : errorMessage(cause)
    }
  }

  // Separate sources compare by value, so a new target object for the same file asks nothing.
  const sources = [() => target.value?.bucket, () => target.value?.key, () => target.value?.node, () => sessionEpoch.value]
  watch(sources, () => void load(), { immediate: true })

  return { found, state, error, reload: load }
}
