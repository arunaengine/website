import { afterEach, describe, expect, it, vi } from 'vitest'
import orcidFixture from './__fixtures__/orcid.json'
import rorFixture from './__fixtures__/ror.json'
import { normalizeOrcidId, orcidResults } from './orcid'
import { cancelLookup, lookupProviderStatus, searchLookups } from './registry'
import { normalizeRorId, rorResults } from './ror'
import type { LookupUpdate } from './types'

afterEach(() => {
  cancelLookup('person')
  cancelLookup('organization')
  vi.unstubAllGlobals()
})

describe('lookup providers', () => {
  it('normalizes pasted ORCID and ROR identifiers', () => {
    expect(normalizeOrcidId('https://orcid.org/0000-0002-1825-0097'))
      .toBe('https://orcid.org/0000-0002-1825-0097')
    expect(normalizeOrcidId('0000-0002-1825-0097'))
      .toBe('https://orcid.org/0000-0002-1825-0097')
    expect(normalizeRorId('03yrm5c26')).toBe('https://ror.org/03yrm5c26')
    expect(normalizeRorId('https://ror.org/03yrm5c26')).toBe('https://ror.org/03yrm5c26')
  })

  it('maps ORCID fixture results to a Person and affiliation stub', () => {
    const [hit] = orcidResults(orcidFixture)
    expect(hit.entity).toMatchObject({
      id: 'https://orcid.org/0000-0002-1825-0097',
      type: 'Person',
      properties: {
        givenName: 'Ada',
        familyName: 'Example',
        name: 'Ada Example',
        affiliation: { '@id': '#org-example-institute' },
      },
    })
    expect(hit.relatedEntities).toContainEqual({
      id: '#org-example-institute',
      type: 'Organization',
      properties: { name: 'Example Institute' },
      roles: [],
    })
  })

  it('maps ROR fixture results to an Organization', () => {
    const [hit] = rorResults(rorFixture)
    expect(hit.entity).toMatchObject({
      id: 'https://ror.org/03yrm5c26',
      type: 'Organization',
      properties: {
        name: 'Example Institute',
        url: 'https://example.test',
        addressCountry: 'Germany',
      },
    })
  })

  it('returns an empty list for empty provider results', () => {
    expect(orcidResults({ 'expanded-result': [] })).toEqual([])
    expect(rorResults({ items: [] })).toEqual([])
  })

  it('reports an HTTP provider error as provider status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    const updates: LookupUpdate[] = []

    await searchLookups('person', 'http-error-query', (update) => updates.push(update))

    expect(updates.at(-1)).toMatchObject({ providerId: 'orcid', status: 'error', hits: [] })
    expect(lookupProviderStatus('orcid')).toBe('error')
  })

  it('aborts the previous request when a new query starts', async () => {
    let firstAborted = false
    let requestCount = 0
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestCount += 1
      if (requestCount === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            firstAborted = true
            reject(new DOMException('Aborted', 'AbortError'))
          }, { once: true })
        })
      }
      return Promise.resolve(new Response(JSON.stringify({ 'expanded-result': [] }), { status: 200 }))
    }))

    const first = searchLookups('organization', 'first-abort-query', () => {})
    await vi.waitFor(() => expect(requestCount).toBe(1))
    const second = searchLookups('organization', 'second-abort-query', () => {})

    await Promise.all([first, second])
    expect(firstAborted).toBe(true)
  })
})
