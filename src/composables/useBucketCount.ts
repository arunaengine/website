// Bucket counts with a distributed bucket counted once. Each node counts the member bucket it
// holds, so node totals count such a bucket once per node; the set ids of the buckets the caller
// can list correct them. A count stays "up to" unless every counted bucket was listed.
import { computed, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import type { BucketSearchHit, BucketSearchResponse, UsageTotals } from '@/lib/api'
import { distinctCount, mergeSets } from '@/lib/distribution'
import { isHiddenBucket } from '@/lib/workspaces'

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
    // A distributed bucket may show again on the next page; each node's copy counts once.
    const known = new Set(hits.map((hit) => `${hit.set_id}|${hit.node_id}|${hit.bucket}`))
    hits.push(...answer.hits.filter((hit) => (!groupId || hit.group_id === groupId) && !(hit.set_id && known.has(`${hit.set_id}|${hit.node_id}|${hit.bucket}`))))
    complete &&= answer.nodes_failed === 0
    cursor = answer.next_cursor ?? undefined
    if (!cursor) return { hits, complete }
  }
}

/**
 * Each listed bucket by name, on the node that holds it (null: the connected node, preferred when
 * it holds a copy). Devices and system buckets are left out, as in the Data view.
 */
export function nodesByBucket(
  hits: BucketSearchHit[],
  isTarget: (nodeId: string) => boolean,
  isLocalNode: (nodeId: string) => boolean,
): Map<string, string | null> {
  const found = new Map<string, string | null>()
  for (const hit of hits) {
    if (isHiddenBucket(hit.bucket) || !isTarget(hit.node_id)) continue
    const local = isLocalNode(hit.node_id)
    if (local || !found.has(hit.bucket)) found.set(hit.bucket, local ? null : hit.node_id)
  }
  return found
}

/** A corrected count as text: the number, or "up to" the number when it is not exact. */
export function countText(counted: { count: number; exact: boolean }, format: (value: number) => string): string {
  return counted.exact ? format(counted.count) : `up to ${format(counted.count)}`
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
