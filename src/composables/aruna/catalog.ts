import { ApiError, apiRequest, type ListMetadataResponse, type MetadataDocumentListItem } from '@/lib/api'
import type { MetadataDoc } from '@/data/types'
import { mapMetadataDoc } from './mapping'
import {
  acceptedProfileItems,
  metadataItems,
  profileItems,
  refreshContext,
  sessionEpoch,
} from './state'

// The catalog is paged, never walked: a realm can hold hundreds of thousands of
// documents, and page sizes stay at or below 100, the server-side cap.
// `metadataItems` keeps only the first page: a best-effort enrichment window.
export const CATALOG_PAGE_SIZE = 48
// Profiles are a small bounded set under profiles/ that several screens need
// synchronously, so that one prefix stays fully loaded.
export const PROFILE_PAGE_SIZE = 100
export const RECENT_METADATA_LIMIT = 5
// The recent tile over-fetches so excluding profiles/ cannot shrink it, and
// walks at most this many pages before giving up on filling it.
export const RECENT_PAGE_FACTOR = 2
export const RECENT_MAX_PAGES = 3
// A node that does not know `order=recent` ignores the parameter rather than
// rejecting it, so the response itself is the probe (see isRecencyOrdered).
let recentOrderUnsupported = false

// Orders the paged profile walks within one session; only the newest may swap.
let profileWalk = 0

export function resetRecentOrderProbe() {
  recentOrderUnsupported = false
}

// Right after a create, the RO-Crate graph projection can lag behind the
// document registry, so listing with include=summary briefly 500s. Retry a
// few times, then fall back to a summary-less list so the catalog still loads.
export async function listMetadataPage(
  query: Record<string, string | number>,
  context = refreshContext(),
): Promise<ListMetadataResponse> {
  const attempts = 3
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await apiRequest<ListMetadataResponse>('/metadata', { query }, context.client)
    } catch (err) {
      const transient = err instanceof ApiError && err.status >= 500
      if (transient && attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
        continue
      }
      if (transient) {
        const { include: _summary, ...withoutSummary } = query
        return apiRequest<ListMetadataResponse>('/metadata', { query: withoutSummary }, context.client)
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Reloads the shared catalog window and the profile set. */
export async function loadMetadata(context = refreshContext()) {
  const [page] = await Promise.all([
    listMetadataPage({ include: 'summary', limit: CATALOG_PAGE_SIZE, offset: 0 }, context),
    loadProfiles(context),
  ])
  if (context.epoch !== sessionEpoch.value) return
  // Documents under profiles/ have their own fully loaded list; the catalog
  // window keeps excluding them so both stay disjoint.
  metadataItems.value = page.documents.filter((doc) => !doc.document_path.startsWith('profiles/'))
}

// Profiles stay exhaustive but scoped to the profiles/ prefix: the set is small
// and screens (profile pickers, validation) need it synchronously.
export async function loadProfiles(context = refreshContext()) {
  // A multi-page walk started earlier must never overwrite a newer one, or a
  // create or delete refresh loses to the mount revalidation it raced.
  const walk = ++profileWalk
  const documents: MetadataDocumentListItem[] = []
  let offset = 0
  let last: ListMetadataResponse
  do {
    last = await listMetadataPage(
      { include: 'summary', limit: PROFILE_PAGE_SIZE, path_prefix: 'profiles/', offset },
      context,
    )
    documents.push(...last.documents)
    offset = last.offset + last.total_returned
  } while (last.total_returned > 0 && last.total_returned >= last.limit)
  if (context.epoch !== sessionEpoch.value || walk !== profileWalk) return
  // A successful create is authoritative even while the eventually consistent
  // profiles/ prefix walk is stale. Keep its accepted summary in the list until
  // the server walk sees that document, so routing to its detail cannot land on
  // an empty selection immediately after creation.
  for (const [documentId, accepted] of acceptedProfileItems) {
    const index = documents.findIndex((document) => document.document_id === documentId)
    if (index < 0) {
      documents.push(accepted)
      continue
    }
    documents[index] = {
      ...accepted,
      ...documents[index],
      rocrate_summary: documents[index].rocrate_summary ?? accepted.rocrate_summary,
    }
    acceptedProfileItems.delete(documentId)
  }
  profileItems.value = documents
}

// Revalidates the profile list in the background; the rendered set stays on
// screen until the fresh walk lands (loadProfiles swaps atomically).
export async function refreshProfiles() {
  await loadProfiles().catch(() => undefined)
}

// One page of the visible catalog, optionally scoped to a group. Summaries are
// opt-in: callers that only need paths must not pay for a per-document graph
// export. `total_estimate` is approximate and absent for small limits, so only
// a short page (total_returned < limit) proves there is nothing after it.
export async function listCatalogPage(
  options: {
    limit?: number
    offset?: number
    groupId?: string | null
    summary?: boolean
    order?: 'created' | 'recent'
  } = {},
): Promise<ListMetadataResponse> {
  return listMetadataPage({
    limit: options.limit ?? CATALOG_PAGE_SIZE,
    offset: options.offset ?? 0,
    ...(options.groupId ? { group_id: options.groupId } : {}),
    ...(options.summary ? { include: 'summary' } : {}),
    ...(options.order ? { order: options.order } : {}),
  })
}

// Whether a page can be a recency-ordered one. A node that does not know
// `order=recent` ignores the unknown parameter and answers 200 with the
// creation-ASCENDING first page, so the oldest documents would render as the
// newest; a page whose updated_at timestamps climb is that page. Fewer than two
// documents carry no ordering evidence and count as ordered, which is harmless:
// both orders return the same list.
export function isRecencyOrdered(documents: Pick<MetadataDocumentListItem, 'updated_at'>[]): boolean {
  let previous = Number.POSITIVE_INFINITY
  for (const doc of documents) {
    const stamp = Date.parse(doc.updated_at)
    if (Number.isNaN(stamp)) continue
    if (stamp > previous) return false
    previous = stamp
  }
  return true
}

/** Outcome of the recent-tile page walk; `ordered` false latches the fallback. */
export interface RecentWalk {
  ordered: boolean
  documents: MetadataDocumentListItem[]
}

// Walks recency-ordered pages until `limit` non-profile documents are found.
// Filtering profiles/ out of a page can leave the tile short (a window holding
// only profiles empties it), so a full raw page that came up short is followed
// by the next one, bounded by RECENT_MAX_PAGES.
export async function walkRecentPages(
  fetchPage: (offset: number, size: number) => Promise<ListMetadataResponse>,
  limit: number,
): Promise<RecentWalk> {
  const size = limit * RECENT_PAGE_FACTOR
  const documents: MetadataDocumentListItem[] = []
  for (let page = 0; page < RECENT_MAX_PAGES; page++) {
    const response = await fetchPage(page * size, size)
    if (!isRecencyOrdered(response.documents)) return { ordered: false, documents: [] }
    for (const doc of response.documents) {
      if (!doc.document_path.startsWith('profiles/')) documents.push(doc)
    }
    // Only a full raw page can hide more documents behind it.
    if (documents.length >= limit || response.total_returned < size) break
  }
  return { ordered: true, documents: documents.slice(0, limit) }
}

// Newest documents first, straight from the registry, so the dashboard never
// derives recency from the creation-ordered catalog window. Null means the node
// cannot order by recency, or the walk found nothing to show, and the caller
// should fall back to that window.
export async function listRecentMetadata(limit = RECENT_METADATA_LIMIT): Promise<MetadataDoc[] | null> {
  if (recentOrderUnsupported) return null
  const walk = await walkRecentPages(
    (offset, size) => listCatalogPage({ limit: size, offset, summary: true, order: 'recent' }),
    limit,
  )
  if (!walk.ordered) {
    recentOrderUnsupported = true
    return null
  }
  if (!walk.documents.length) return null
  return walk.documents.map(mapMetadataDoc)
}

export async function listGroupMetadata(
  groupId: string,
  options: { limit?: number; offset?: number; summary?: boolean } = {},
): Promise<ListMetadataResponse> {
  return listCatalogPage({ ...options, groupId })
}

/** First document stored under a path prefix, or null. */
export async function metadataAtPath(pathPrefix: string): Promise<MetadataDocumentListItem | null> {
  const page = await listMetadataPage({ path_prefix: pathPrefix, limit: 1 })
  return page.documents[0] ?? null
}
