// Bucket counts with a distributed bucket counted once. Each node counts the member bucket it
// holds, so node totals count such a bucket once per node; the set ids of the buckets the caller
// can list correct them. A count stays "at most" unless every counted bucket was listed.
import { computed, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import type { BucketSearchHit, BucketSearchResponse, UsageTotals } from '@/lib/api'
import { distinctCount, mergeSets } from '@/lib/distribution'

const PAGE = 50
// At most 1000 buckets are listed; a longer list is not whole.
const MAX_PAGES = 20

type Search = (q: string, options: { limit?: number; groupId?: string; cursor?: string }) => Promise<BucketSearchResponse>

export interface Listing {
  /** One hit per node that holds a bucket. */
  hits: BucketSearchHit[]
  /** Every node answered and the list was not cut. */
  complete: boolean
}

/** Every bucket the caller may read, of one group or of the whole realm. */
export async function listBuckets(search: Search, groupId: string | undefined, current: () => boolean): Promise<Listing> {
  const hits: BucketSearchHit[] = []
  let cursor: string | undefined
  let complete = true
  for (let page = 0; ; page++) {
    if (page === MAX_PAGES) return { hits, complete: false }
    const answer = await search('', { limit: PAGE, groupId, cursor })
    if (!current()) return { hits, complete: false }
    hits.push(...answer.hits.filter((hit) => !groupId || hit.group_id === groupId))
    complete &&= answer.nodes_failed === 0
    cursor = answer.next_cursor ?? undefined
    if (!cursor) return { hits, complete }
  }
}

/** A corrected count as text: the number, or "at most" the number when it is not exact. */
export function countText(counted: { count: number; exact: boolean }, format: (value: number) => string): string {
  return counted.exact ? format(counted.count) : `at most ${format(counted.count)}`
}

const realmListing = ref<{ epoch: number; listing: Listing } | null>(null)
let realmRun = 0

/**
 * The realm's bucket count: exact when the node counts each distributed bucket once, otherwise
 * the node total corrected by the buckets the caller can list.
 */
export function useRealmBucketCount(totals: Ref<UsageTotals | null | undefined>) {
  const { searchBuckets, sessionEpoch } = useAruna()
  const total = computed(() => totals.value?.buckets)
  const distinct = computed(() => totals.value?.distinct_buckets)
  watch(
    () => [sessionEpoch.value, distinct.value == null] as const,
    async ([epoch, needed]) => {
      if (!needed || realmListing.value?.epoch === epoch) return
      const run = ++realmRun
      const current = () => run === realmRun && epoch === sessionEpoch.value
      const listing = await listBuckets(searchBuckets, undefined, current).catch(() => null)
      if (listing && current()) realmListing.value = { epoch, listing }
    },
    { immediate: true },
  )
  return computed(() => {
    if (distinct.value != null) return { count: distinct.value, exact: true }
    const listed = realmListing.value
    if (total.value == null) return null
    if (!listed || listed.epoch !== sessionEpoch.value) return { count: total.value, exact: false }
    const { hits, complete } = listed.listing
    return distinctCount(total.value, hits.length, mergeSets(hits, () => false).length, complete)
  })
}
