import { describe, expect, it } from 'vitest'
import { connectorBody, doiUrl, failureText, linkStatus, searchHits, searchTotal, secondaryIdentifiers } from './invenio'
import type { PersistentIdView } from './pid'

describe('invenio search hits', () => {
  it('maps InvenioRDM and legacy Zenodo hits', () => {
    const page = {
      hits: {
        total: { value: 2 },
        hits: [
          {
            id: 'abc12-3de45',
            metadata: {
              title: 'Ocean samples',
              publication_date: '2026-09-01',
              creators: [{ person_or_org: { family_name: 'Researcher', given_name: 'Ada' } }],
            },
            pids: { doi: { identifier: '10.1234/abc' } },
            links: { self_html: 'https://repo.test/records/abc12-3de45' },
          },
          { id: 1234567, metadata: { title: 'Legacy', creators: [{ name: 'Lab, A.' }] }, doi: '10.5281/zenodo.1234567' },
          { metadata: { title: 'No id' } },
        ],
      },
    }

    expect(searchTotal(page)).toBe(2)
    expect(searchHits(page)).toEqual([
      {
        id: 'abc12-3de45', title: 'Ocean samples', date: '2026-09-01', creators: ['Researcher, Ada'],
        doi: '10.1234/abc', url: 'https://repo.test/records/abc12-3de45',
      },
      { id: '1234567', title: 'Legacy', date: '', creators: ['Lab, A.'], doi: '10.5281/zenodo.1234567', url: '' },
    ])
  })

  it('keeps an unknown total unknown', () => {
    expect(searchTotal({ hits: { hits: [] } })).toBeNull()
    expect(searchTotal(null)).toBeNull()
    expect(searchHits(null)).toEqual([])
  })
})

describe('invenio identifiers', () => {
  it('collects one kind across rows without duplicates', () => {
    const row = {
      secondary_identifiers: [
        { kind: 'doi', value: '10.1/a' },
        { kind: 'invenio_parent', value: 'p1', endpoint: 'https://zenodo.org/api/' },
        { kind: 'doi', value: '10.1/a' },
      ],
    } as PersistentIdView

    expect(secondaryIdentifiers([row, { ...row }], 'doi')).toEqual([{ kind: 'doi', value: '10.1/a' }])
    expect(secondaryIdentifiers([{} as PersistentIdView], 'doi')).toEqual([])
  })

  it('builds a resolver link once', () => {
    expect(doiUrl('10.1/a')).toBe('https://doi.org/10.1/a')
    expect(doiUrl('https://doi.org/10.1/a')).toBe('https://doi.org/10.1/a')
  })
})

describe('invenio link state', () => {
  it('labels every status with a matching tone', () => {
    expect(linkStatus({ status: 'enabled' })).toEqual({ label: 'Enabled', variant: 'success' })
    expect(linkStatus({ status: 'paused' })).toEqual({ label: 'Paused', variant: 'secondary' })
    expect(linkStatus({ status: 'failed' })).toEqual({ label: 'Failed', variant: 'destructive' })
  })

  it('explains known and unknown failure reasons', () => {
    expect(failureText('token_rejected')).toContain('Change the token')
    expect(failureText('quota_exceeded')).toBe('The last push failed: quota exceeded.')
    expect(failureText(null)).toBe('The last push failed.')
  })
})

describe('repository connector body', () => {
  const form = {
    name: ' Zenodo ', kind: 'invenio' as const, endpoint: ' https://zenodo.org/api/ ', community: '',
    token: '', removeToken: false,
  }

  it('keeps a stored token on an edit without a new one', () => {
    expect(connectorBody(form, true)).toEqual({ name: 'Zenodo', kind: 'invenio', endpoint: 'https://zenodo.org/api/' })
  })

  it('replaces or removes the token when asked', () => {
    expect(connectorBody({ ...form, token: 'read' }, true).secret_config).toEqual({ token: 'read' })
    expect(connectorBody({ ...form, removeToken: true }, true).secret_config).toEqual({})
    expect(connectorBody(form, false).secret_config).toEqual({})
  })

  it('never sends a token or community for OAI-PMH', () => {
    const body = connectorBody({ ...form, kind: 'oai_pmh', token: 'read', community: 'c' }, true)
    expect(body.secret_config).toEqual({})
    expect(body).not.toHaveProperty('community')
  })
})
