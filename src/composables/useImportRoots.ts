// The folders the node operator approved for a group. Unknown stays unknown: a failed read
// is never an empty list, and an answer for another group or session is dropped.
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { getImportRoots, type ImportRoot } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export type RootsState = 'idle' | 'loading' | 'ready' | 'failed'

export function useImportRoots(groupId: Ref<string>, active: Ref<boolean>) {
  const { apiBaseUrl, authToken, sessionEpoch } = useAruna()
  const roots = ref<ImportRoot[]>([])
  const state = ref<RootsState>('idle')
  const error = ref<string | null>(null)
  let runs = 0

  async function load() {
    const run = ++runs
    const epoch = sessionEpoch.value
    roots.value = []
    error.value = null
    state.value = 'loading'
    try {
      const answer = await getImportRoots(groupId.value, { baseUrl: apiBaseUrl.value, token: authToken.value })
      if (run !== runs || epoch !== sessionEpoch.value) return
      roots.value = answer.roots
      state.value = 'ready'
    } catch (cause) {
      if (run !== runs || epoch !== sessionEpoch.value) return
      error.value = errorMessage(cause)
      state.value = 'failed'
    }
  }

  watch(
    [groupId, active, () => sessionEpoch.value],
    () => {
      if (active.value) void load()
      else {
        runs++
        roots.value = []
        state.value = 'idle'
      }
    },
    { immediate: true },
  )

  return { roots, state, error, load }
}
