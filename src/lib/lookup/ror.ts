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
