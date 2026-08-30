import { rorOf } from '@/lib/identifiers'
import type { LookupHit, LookupProvider, RegistryRecord } from './types'
import { LookupResponseError } from './types'

const ROR_SEARCH_URL = 'https://api.ror.org/v2/organizations'

interface RorName {
  value?: string
  types?: string[]
}

interface RorLink {
  type?: string
  value?: string
}

interface RorItem {
  id?: string
  names?: RorName[]
  links?: RorLink[]
  locations?: Array<{ geonames_details?: { country_name?: string } }>
}

interface RorSearchResponse {
  items?: RorItem[]
}

/** One entry of the affiliation endpoint: a candidate ROR scored against a name. */
interface RorAffiliationItem {
  chosen?: boolean
  organization?: RorItem
}

interface RorAffiliationResponse {
  items?: RorAffiliationItem[]
}

function normalName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeRorId(value: string): string | undefined {
  const id = rorOf(value.trim())
  return id ? `https://ror.org/${id}` : undefined
}

export function rorResults(payload: unknown, limit = 10): LookupHit[] {
  const items = payload && typeof payload === 'object' ? (payload as RorSearchResponse).items : undefined
  if (!Array.isArray(items)) return []

  const hits: LookupHit[] = []
  for (const item of items.slice(0, limit)) {
    const id = normalizeRorId(item.id ?? '')
    if (!id) continue
    const name = item.names?.find((entry) => entry.types?.includes('ror_display'))?.value?.trim() || id
    const url = item.links?.find((entry) => entry.type === 'website')?.value?.trim()
    const addressCountry = item.locations?.[0]?.geonames_details?.country_name?.trim()
    hits.push({
      id,
      label: name,
      description: addressCountry,
      providerId: 'ror',
      entity: {
        id,
        type: 'Organization',
        properties: {
          name,
          ...(url ? { url } : {}),
          ...(addressCountry ? { addressCountry } : {}),
        },
        roles: ['publisher'],
      },
      relatedEntities: [],
    })
  }
  return hits
}

export function rorRecord(id: string, payload: unknown): RegistryRecord {
  const item = (payload ?? {}) as RorItem
  const name = item.names?.find((entry) => entry.types?.includes('ror_display'))?.value?.trim() || id
  const url = item.links?.find((entry) => entry.type === 'website')?.value?.trim()
  return { id, name, ...(url ? { url } : {}) }
}

/** The organization behind a ROR id or ror.org URL, straight from the registry. */
export async function fetchRorRecord(value: string, signal?: AbortSignal): Promise<RegistryRecord> {
  const id = normalizeRorId(value)
  if (!id) throw new LookupResponseError(0, 'Enter a ROR id like 03yrm5c26.')
  const response = await fetch(`${ROR_SEARCH_URL}/${rorOf(id)}`, { signal })
  if (!response.ok) throw new LookupResponseError(response.status, `ROR answered ${response.status}.`)
  return rorRecord(id, await response.json())
}

/**
 * The single organization an affiliation string stands for: the item ROR marked
 * `chosen`, or, when the response marks none, a top hit whose display name is
 * the query itself. Anything less confident is no match at all.
 */
export function rorAffiliationHit(query: string, payload: unknown): LookupHit | null {
  const items = payload && typeof payload === 'object'
    ? (payload as RorAffiliationResponse).items
    : undefined
  if (!Array.isArray(items) || !items.length) return null
  const marked = items.some((item) => typeof item.chosen === 'boolean')
  const item = marked ? items.find((entry) => entry.chosen === true) : items[0]
  const [hit] = item?.organization ? rorResults({ items: [item.organization] }, 1) : []
  if (!hit) return null
  return marked || normalName(hit.label) === normalName(query) ? hit : null
}

/** The confident ROR behind an organization name, or null when there is none. */
export async function matchRorByName(name: string, signal?: AbortSignal): Promise<LookupHit | null> {
  const query = name.trim()
  if (!query) return null
  const url = new URL(ROR_SEARCH_URL)
  url.searchParams.set('affiliation', query)
  const response = await fetch(url, { signal })
  if (!response.ok) throw new LookupResponseError(response.status, `ROR answered ${response.status}.`)
  return rorAffiliationHit(query, await response.json())
}

export const rorProvider: LookupProvider = {
  id: 'ror',
  label: 'ROR',
  kind: 'organization',
  async search(query, options) {
    const url = new URL(ROR_SEARCH_URL)
    url.searchParams.set('query', normalizeRorId(query) ?? query.trim())
    const response = await fetch(url, { signal: options.signal })
    if (!response.ok) throw new LookupResponseError(response.status, `ROR lookup failed with ${response.status}`)
    return rorResults(await response.json(), options.limit)
  },
}
