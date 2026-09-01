// Per-bucket reference visibility shared by the data manager and the object
// picker: ONE cursor-following /data/staging/references load per opened bucket
// feeds the row indicators, the preview origin line and the header stats.
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { useAruna } from './useAruna'
import { aggregateReferences } from '@/lib/references'
import type { StagingReferenceEntry } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

export type StagingReferencesStatus = 'unknown' | 'loading' | 'loaded' | 'error'

export function useStagingReferences(bucket: Ref<string>, active?: Ref<boolean>) {
  const { authToken, listStagingReferences } = useAruna()

  const entries = ref<StagingReferenceEntry[]>([])
  const loading = ref(false)
  const status = ref<StagingReferencesStatus>('unknown')
  const error = ref<string | null>(null)
  let requestId = 0
  let controller: AbortController | undefined

  async function load() {
    const id = ++requestId
    controller?.abort()
    controller = undefined
    entries.value = []
    loading.value = false
    status.value = 'unknown'
    error.value = null
    if (!bucket.value || !authToken.value) return
    if (active && !active.value) return
    controller = new AbortController()
    const signal = controller.signal
    loading.value = true
    status.value = 'loading'
    try {
      const result = await listStagingReferences(bucket.value, undefined, signal)
      if (id !== requestId) return
      entries.value = result
      status.value = 'loaded'
    } catch (caught) {
      if (id !== requestId || signal.aborted) return
      error.value = errorMessage(caught)
      status.value = 'error'
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  watch([bucket, () => active?.value, authToken], () => void load(), { immediate: true })
  onScopeDispose(() => controller?.abort())

  const referencedByKey = computed(() => {
    const map = new Map<string, StagingReferenceEntry>()
    for (const entry of entries.value) {
      if (entry.referenced) map.set(entry.key, entry)
    }
    return map
  })

  function keyIsReferenced(key: string): boolean {
    return referencedByKey.value.has(key)
  }

  // Folder rows: some referenced key lives under the folder prefix.
  function prefixHasReferences(prefix: string): boolean {
    for (const key of referencedByKey.value.keys()) {
      if (key.startsWith(prefix)) return true
    }
    return false
  }

  const stats = computed(() => aggregateReferences(entries.value))

  return {
    loading,
    status,
    error,
    entries,
    referencedByKey,
    keyIsReferenced,
    prefixHasReferences,
    stats,
    reload: load,
  }
}
