// What the node says about deleting a bucket stored on more nodes: the datasets that link it and
// whether that list covers every node. A failed or stale lookup never reads as "no datasets".
import { ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import type { StorageDeletionPreflight, StorageDeletionReferenceCoverage } from '@/lib/storageDeletion'
import { errorMessage } from '@/lib/utils'

/** The reasons the list of datasets may be incomplete; empty when it is complete. */
export function coverageNotes(coverage: StorageDeletionReferenceCoverage): string[] {
  if (coverage.complete) return []
  const notes: string[] = []
  if (coverage.failed_nodes) notes.push(`${coverage.failed_nodes} node(s) did not answer.`)
  if (coverage.index_freshness !== 'current') notes.push('A node is still indexing.')
  if (coverage.hidden_references_exist) notes.push('Some datasets are not visible to you.')
  return notes.length ? notes : ['The node cannot say that the list is complete.']
}

export function useSetPreflight(bucket: Ref<string | null>) {
  const { getSetDeletion, sessionEpoch } = useAruna()
  const preflight = ref<StorageDeletionPreflight | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let runs = 0

  async function load() {
    const name = bucket.value
    const run = ++runs
    const epoch = sessionEpoch.value
    preflight.value = null
    error.value = null
    loading.value = Boolean(name)
    if (!name) return
    try {
      const answer = await getSetDeletion(name)
      if (run === runs && epoch === sessionEpoch.value) preflight.value = answer
    } catch (cause) {
      if (run === runs && epoch === sessionEpoch.value) error.value = errorMessage(cause)
    } finally {
      if (run === runs) loading.value = false
    }
  }

  watch([bucket, sessionEpoch], load, { immediate: true })

  return { preflight, loading, error, reload: load }
}
