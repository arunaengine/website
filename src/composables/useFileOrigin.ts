// The origin of one file version, asked of the node that serves the bucket. A node without the
// route, or a version it does not know, answers 404, which reads as "not recorded here".
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { ApiError, type OriginResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export type OriginState = 'loading' | 'ready' | 'missing' | 'failed'

export interface OriginTarget {
  bucket: string
  key: string
  /** A version chosen in the version list; the current version when absent. */
  versionId: string | null
}

export function useFileOrigin(target: Ref<OriginTarget | null>) {
  const { getFileOrigin, sessionEpoch } = useAruna()
  const origin = ref<OriginResponse | null>(null)
  const state = ref<OriginState>('loading')
  const error = ref<string | null>(null)
  let runs = 0

  watch(
    () => [target.value?.bucket, target.value?.key, target.value?.versionId],
    async () => {
      const asked = target.value
      const run = ++runs
      const epoch = sessionEpoch.value
      origin.value = null
      error.value = null
      if (!asked) {
        state.value = 'missing'
        return
      }
      state.value = 'loading'
      try {
        const answer = await getFileOrigin(asked.bucket, { key: asked.key, ...(asked.versionId ? { version_id: asked.versionId } : {}) })
        if (run !== runs || epoch !== sessionEpoch.value) return
        origin.value = answer
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

  return { origin, state, error }
}
