// Per-bucket reference visibility shared by the data manager and the object
// picker: ONE cursor-following /staging/references load per opened bucket
// feeds the row indicators, the preview origin line and the header stats.
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { useAruna } from './useAruna'
import { aggregateReferences } from '@/lib/references'
import type { StagingReferenceEntry } from '@/lib/api'

export function useStagingReferences(bucket: Ref<string>, active?: Ref<boolean>) {
  const { authToken, listStagingReferences } = useAruna()

  const entries = ref<StagingReferenceEntry[]>([])
  const loading = ref(false)
  let requestId = 0
  let controller: AbortController | undefined

  async function load() {
    const id = ++requestId
    controller?.abort()
    controller = undefined
    entries.value = []
    if (!bucket.value || !authToken.value) return
    if (active && !active.value) return
    controller = new AbortController()
    const signal = controller.signal
    loading.value = true
    try {
      const result = await listStagingReferences(bucket.value, undefined, signal)
      if (id !== requestId) return
      entries.value = result
    } catch {
      // Indicators are a progressive enhancement: a transient failure just
      // leaves the bucket bare instead of blocking the listing.
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
    entries,
    referencedByKey,
    keyIsReferenced,
    prefixHasReferences,
    stats,
    reload: load,
  }
}
