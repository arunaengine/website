import { computed } from 'vue'
import { useAruna } from './useAruna'
import { useS3 } from './useS3'
import { buildCrateReferenceIndex, toBucketKey, type CrateObjectReference } from '@/lib/crateReferences'

export const LOADED_METADATA_REFERENCE_LABEL = 'Referenced by loaded metadata'

// Reactive reverse index of "bucket/key" -> referencing documents, fed only from
// crates already in the client caches (never issues a request). Exposed so any
// view (data manager, metadata detail) can show what references an object.
//
// Best-effort by construction: coverage is the crates cached this session plus
// the catalog pages loaded so far, never the whole realm. A missing entry means
// "not seen here", not "not referenced".
export function useCrateReferences() {
  const { fullCrates, metadataItems } = useAruna()
  const s3 = useS3()
  const index = computed(() => buildCrateReferenceIndex(fullCrates.value, metadataItems.value, s3.endpoint.value))
  function referencesFor(objectUrl: string): CrateObjectReference[] {
    const key = toBucketKey(objectUrl, s3.endpoint.value)
    if (!key) return []
    return index.value.get(key) ?? []
  }
  return { index, referencesFor, label: LOADED_METADATA_REFERENCE_LABEL }
}
