import { orcidOf } from '@/lib/identifiers'
import { slugify } from '@/lib/profiles/emit'
import type { ContextEntity, LookupHit, LookupProvider, RegistryRecord } from './types'
import { LookupResponseError } from './types'

const ORCID_SEARCH_URL = 'https://pub.orcid.org/v3.0/expanded-search/'
const ORCID_RECORD_URL = 'https://pub.orcid.org/v3.0/'

interface OrcidExpandedResult {
  'orcid-id'?: string
  'given-names'?: string
  'family-names'?: string
  'institution-name'?: string[]
}

interface OrcidSearchResponse {
  'expanded-result'?: OrcidExpandedResult[]
}

export function normalizeOrcidId(value: string): string | undefined {
  const id = orcidOf(value.trim())
  return id ? `https://orcid.org/${id}` : undefined
}

export function orcidResults(payload: unknown, limit = 10): LookupHit[] {
  const results = payload && typeof payload === 'object'
    ? (payload as OrcidSearchResponse)['expanded-result']
    : undefined
  if (!Array.isArray(results)) return []

  const hits: LookupHit[] = []
  for (const result of results.slice(0, limit)) {
    const id = normalizeOrcidId(result['orcid-id'] ?? '')
    if (!id) continue
    const givenName = result['given-names']?.trim() ?? ''
    const familyName = result['family-names']?.trim() ?? ''
    const name = [givenName, familyName].filter(Boolean).join(' ') || id
    const institution = result['institution-name']?.find((value) => value.trim())?.trim()
    const relatedEntities: ContextEntity[] = []
    const properties: Record<string, unknown> = {
      ...(givenName ? { givenName } : {}),
      ...(familyName ? { familyName } : {}),
      name,
    }
    if (institution) {
      const affiliationId = `#org-${slugify(institution) || 'affiliation'}`
      properties.affiliation = { '@id': affiliationId }
      relatedEntities.push({
        id: affiliationId,
        type: 'Organization',
        properties: { name: institution },
        roles: [],
      })
    }
    hits.push({
      id,
      label: name,
      description: institution,
      providerId: 'orcid',
      entity: { id, type: 'Person', properties, roles: ['author'] },
      relatedEntities,
    })
  }
  return hits
}

interface OrcidRecord {
  person?: {
    name?: {
      'given-names'?: { value?: string }
      'family-name'?: { value?: string }
      'credit-name'?: { value?: string }
    }
  }
}

export function orcidRecord(id: string, payload: unknown): RegistryRecord {
  const name = (payload as OrcidRecord)?.person?.name
  const givenName = name?.['given-names']?.value?.trim() ?? ''
  const familyName = name?.['family-name']?.value?.trim() ?? ''
  const credit = name?.['credit-name']?.value?.trim() ?? ''
  return {
    id,
    name: credit || [givenName, familyName].filter(Boolean).join(' ') || id,
    ...(givenName ? { givenName } : {}),
    ...(familyName ? { familyName } : {}),
  }
}

/** The person behind an ORCID id or orcid.org URL, straight from the registry. */
export async function fetchOrcidRecord(value: string, signal?: AbortSignal): Promise<RegistryRecord> {
  const id = normalizeOrcidId(value)
  if (!id) throw new LookupResponseError(0, 'Enter an ORCID like 0000-0002-1825-0097.')
  const response = await fetch(`${ORCID_RECORD_URL}${orcidOf(id)}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new LookupResponseError(response.status, `ORCID answered ${response.status}.`)
  return orcidRecord(id, await response.json())
}

export const orcidProvider: LookupProvider = {
  id: 'orcid',
  label: 'ORCID',
  kind: 'person',
  async search(query, options) {
    const normalized = normalizeOrcidId(query)
    const searchQuery = normalized ? orcidOf(normalized) ?? query.trim() : query.trim()
    const url = new URL(ORCID_SEARCH_URL)
    url.searchParams.set('q', searchQuery)
    url.searchParams.set('rows', String(Math.min(options.limit, 10)))
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: options.signal,
    })
    if (!response.ok) throw new LookupResponseError(response.status, `ORCID lookup failed with ${response.status}`)
    return orcidResults(await response.json(), options.limit)
  },
}
