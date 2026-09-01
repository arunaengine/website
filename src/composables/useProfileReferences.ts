// Which datasets declare a profile, for the warning the profile editor shows
// before a public profile becomes group-only: datasets of other groups that
// declare it are refused on their next tagged write.
//
// Server-side exact filter, no new route: GET /metadata/search with
// `conforms_to` set to the profile IRI (aruna api/src/routes/metadata.rs), which
// the backend accepts without a query term. Per-view factory: the debounce timer
// and the in-flight request belong to the editor that asked, nothing is cached.
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { MetadataSearchHit } from '@/lib/api'
import { useAruna } from '@/composables/useAruna'

export const PROFILE_REFERENCE_DEBOUNCE_MS = 250
// One page is enough: the notice names a few datasets and counts the rest.
const REFERENCE_PAGE_SIZE = 100
export const REFERENCE_LOOKUP_FAILED = 'Could not check which datasets declare this profile.'

export interface ProfileReference {
  documentId: string
  groupId: string
  title: string
}

export interface ProfileReferenceWarning {
  message: string
  /** The lookup itself failed; the visibility change stays allowed. */
  failed: boolean
  /** A node did not answer or the page stopped early, so datasets may be missing. */
  incomplete: boolean
  datasets: ProfileReference[]
}

export function referenceMessage(count: number): string {
  const subject = count === 1 ? '1 dataset declares' : `${count} datasets declare`
  return `${subject} this profile. Datasets of other groups will no longer be able to save until they remove it or the profile is public again.`
}

// conformsTo sits on the root dataset, so one hit is one dataset; the dedupe is
// insurance against a node answering with more than one subject per document.
function mapHits(hits: MetadataSearchHit[]): ProfileReference[] {
  const seen = new Set<string>()
  const mapped: ProfileReference[] = []
  for (const hit of hits) {
    if (seen.has(hit.document_id)) continue
    seen.add(hit.document_id)
    mapped.push({
      documentId: hit.document_id,
      groupId: hit.group_id,
      title: hit.title || hit.document_path,
    })
  }
  return mapped
}

export function useProfileReferences(iri: Ref<string | null>) {
  const { searchMetadata } = useAruna()
  const datasets = ref<ProfileReference[]>([])
  const failed = ref(false)
  const incomplete = ref(false)
  const pending = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | null = null
  let seq = 0

  async function load(target: string, mine: number) {
    const request = new AbortController()
    controller = request
    try {
      const response = await searchMetadata('', {
        limit: REFERENCE_PAGE_SIZE,
        conforms_to: target,
        signal: request.signal,
      })
      if (mine !== seq) return
      datasets.value = mapHits(response.hits ?? [])
      incomplete.value =
        (response.nodes_failed ?? 0) > 0 || response.truncated === true || Boolean(response.next_cursor)
    } catch (err) {
      if (mine !== seq || (err instanceof DOMException && err.name === 'AbortError')) return
      failed.value = true
    } finally {
      if (mine === seq) pending.value = false
    }
  }

  watch(
    iri,
    (target) => {
      seq += 1
      clearTimeout(timer)
      controller?.abort()
      controller = null
      datasets.value = []
      failed.value = false
      incomplete.value = false
      pending.value = Boolean(target)
      if (!target) return
      const mine = seq
      timer = setTimeout(() => void load(target, mine), PROFILE_REFERENCE_DEBOUNCE_MS)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    seq += 1
    clearTimeout(timer)
    controller?.abort()
  })

  // Silent while the answer is still out, and silent when no dataset declares
  // the profile: there is nothing to warn about either way.
  const warning = computed<ProfileReferenceWarning | null>(() => {
    if (!iri.value) return null
    if (failed.value) {
      return { message: REFERENCE_LOOKUP_FAILED, failed: true, incomplete: false, datasets: [] }
    }
    if (!datasets.value.length) return null
    return {
      message: referenceMessage(datasets.value.length),
      failed: false,
      incomplete: incomplete.value,
      datasets: datasets.value,
    }
  })

  return { warning, pending }
}
