// Per-bucket reference visibility shared by the data manager and the object
// picker: ONE cursor-following /staging/references load per opened bucket
// feeds the row indicators, the preview origin line and the header stats.
// Gated on featureEnabled('referenceVisibility'); the first 404/501 marks the
// endpoint unsupported for the whole session so no consumer keeps probing.
import { computed, ref, watch, type Ref } from 'vue'
import { isUnsupportedEndpoint, useAruna } from './useAruna'
import { featureEnabled } from '@/lib/config'
import { aggregateReferences } from '@/lib/references'
import type { StagingReferenceEntry } from '@/lib/api'

// Module-level: shared verdict across every consumer of this session.
const supported = ref(true)

export function useStagingReferences(bucket: Ref<string>, active?: Ref<boolean>) {
  const enabled = featureEnabled('referenceVisibility')
  const { authToken, listStagingReferences } = useAruna()

  const entries = ref<StagingReferenceEntry[]>([])
  const loading = ref(false)
  let requestId = 0

  async function load() {
    const id = ++requestId
    entries.value = []
    if (!enabled || !supported.value || !bucket.value || !authToken.value) return
    if (active && !active.value) return
    loading.value = true
    try {
      const result = await listStagingReferences(bucket.value)
      if (id !== requestId) return
      entries.value = result
    } catch (err) {
      if (id !== requestId) return
      // Indicators are a progressive enhancement: a node without the endpoint
      // disables them quietly, transient failures just leave the bucket bare.
      if (isUnsupportedEndpoint(err)) supported.value = false
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  watch([bucket, () => active?.value, authToken], () => void load(), { immediate: true })

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
    enabled,
    supported,
    loading,
    entries,
    referencedByKey,
    keyIsReferenced,
    prefixHasReferences,
    stats,
    reload: load,
  }
}
