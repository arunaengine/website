import { computed, watch } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { createSwrCache, type SwrFailure } from '@/lib/swr'
import type { ListMetadataResponse } from '@/lib/api'
import { errorMessage } from '@/lib/utils'

// Module singleton: the browse window outlives the Discover view, so leaving it
// and coming back repaints the page that was on screen instead of a skeleton,
// and revalidates behind it. One slot, so only the most recent window is kept;
// paging still fetches, exactly as it did before.

const { sessionEpoch, listCatalogPage } = useAruna()

// Documents are registered while people work, the same volatility the search
// cache answers with: 4s makes a there-and-back trip free without hiding a
// document someone just created.
const FRESH_MS = 4_000

const EMPTY: ListMetadataResponse = { documents: [], limit: 0, offset: 0, total_returned: 0 }

const cache = createSwrCache<ListMetadataResponse>(EMPTY, FRESH_MS)

// Another identity browses another catalog, even with no view mounted.
watch(sessionEpoch, () => cache.reset())

/** Every request parameter the window depends on; mirrors listCatalogPage. */
export interface CatalogPageParams {
  limit: number
  offset: number
  groupId: string | null
  summary: boolean
}

// JSON encoding keeps free-form values from running into each other.
function keyOf(params: CatalogPageParams): string {
  return JSON.stringify([
    sessionEpoch.value,
    params.limit,
    params.offset,
    params.groupId,
    params.summary,
  ])
}

function onFailure(err: unknown): SwrFailure {
  // Nothing a listing can fail with makes the last answer for this exact window
  // wrong, so it is never discarded; the message rides beside it.
  return { message: errorMessage(err) }
}

export function useCatalogBrowse() {
  return {
    /** The cached window; only meaningful for a key `hasCached` accepts. */
    page: cache.data,
    error: computed(() => cache.error.value?.message ?? null),
    key: keyOf,
    hasCached: (key: string) => cache.scope.value === key && cache.loaded.value,
    /** Serves a fresh window without a request and revalidates a stale one. */
    load: (params: CatalogPageParams, force = false) =>
      cache.revalidate(keyOf(params), () => listCatalogPage(params), onFailure, force),
  }
}
