import { describe, expect, it } from 'vitest'
import { ApiError, type ProfileValidationFinding, type RepositoryLink } from './api'
import type { CrateDraft } from './crate/editor'
import type { ProfileEntityRule, ProfilePropertyRule } from './profiles/types'
import {
  connectorBody,
  creatorsMetadata,
  doiUrl,
  endpointProblem,
  exportRepository,
  failureText,
  fieldLabel,
  linkRights,
  linkStatus,
  managedHere,
  missingFields,
  parseOverride,
  pullsParent,
  recordSource,
  remoteState,
  repositoryLabel,
  requiredMetadata,
  requirementRows,
  reviewText,
  searchHits,
  searchTotal,
  secondaryIdentifiers,
  sourceParent,
  unmetFindings,
} from './repository'
import type { PersistentIdView } from './pid'

describe('repository search hits', () => {
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

describe('repository identifiers', () => {
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

describe('repository link state', () => {
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

  it('words pull failures as updates and points at the group token', () => {
    expect(failureText(null, true)).toBe('The last update failed.')
    expect(failureText('record withdrawn', true)).toBe('The last update failed: record withdrawn.')
    expect(failureText('token_rejected', true)).toContain("group's repository token")
    expect(failureText('update_available', true)).toContain('newer version')
    expect(failureText('source_unavailable', true)).toContain('withdrawn or deleted')
    expect(failureText('owner_not_holder', true)).toContain('cannot import updates')
  })

  it('has a plain text for every reason of the contract', () => {
    const reasons = [
      'owner_not_holder', 'requirements_unmet', 'update_available', 'local_changed',
      'remote_changed', 'token_rejected', 'source_unavailable', 'review_declined',
    ]
    for (const reason of reasons) expect(failureText(reason)).not.toContain(reason.replaceAll('_', ' '))
    expect(failureText('requirements_unmet')).toContain('repository requirements')
    expect(failureText('remote_changed')).toContain('Accept the remote state')
  })

  it('labels the remote record state and falls back to published', () => {
    expect(remoteState({ state: 'review', published: false }).label).toBe('In review')
    expect(remoteState({ state: 'none', published: false }).label).toBe('No record yet')
    expect(remoteState({ published: true })).toEqual({ label: 'Published', variant: 'success' })
    expect(remoteState({ state: 'withdrawn', published: false }).label).toBe('withdrawn')
  })

  it('names the community review state', () => {
    expect(reviewText('pending')).toBe('Waiting for community review')
    expect(reviewText('none')).toBeNull()
    expect(reviewText(undefined)).toBeNull()
  })

  it('gives owners every action and group admins only management', () => {
    expect(linkRights({ created_by: 'u1' }, 'u1', false)).toEqual({ owner: true, manage: true })
    expect(linkRights({ created_by: 'u1' }, 'u2', true)).toEqual({ owner: false, manage: true })
    expect(linkRights({ created_by: 'u1' }, 'u2', false)).toEqual({ owner: false, manage: false })
    expect(linkRights({ created_by: '' }, '', false).owner).toBe(false)
  })

  it('compares the managing node with the node in use', () => {
    const origin = 'https://node.test'
    expect(managedHere('https://node.test/api/v1', '/api/v1', origin)).toBe(true)
    expect(managedHere('https://node.test/api/v1/', 'https://node.test/api/v1', origin)).toBe(true)
    expect(managedHere('https://other.test/api/v1', '/api/v1', origin)).toBe(false)
  })
})

describe('import record input', () => {
  it('reads DOIs, record URLs and record ids', () => {
    expect(recordSource('10.5281/zenodo.123')).toEqual({ doi: '10.5281/zenodo.123' })
    expect(recordSource('doi:10.5281/zenodo.123')).toEqual({ doi: '10.5281/zenodo.123' })
    expect(recordSource(' https://doi.org/10.5281/zenodo.99 ')).toEqual({ doi: '10.5281/zenodo.99' })
    expect(recordSource('https://zenodo.org/records/123')).toEqual({ url: 'https://zenodo.org/records/123' })
    expect(recordSource('123')).toEqual({ record_id: '123' })
    expect(recordSource('abc12-3de45')).toEqual({ record_id: 'abc12-3de45' })
  })

  it('rejects empty input and free text', () => {
    expect(recordSource('  ')).toBeNull()
    expect(recordSource('ocean samples')).toBeNull()
  })
})

describe('repository endpoints', () => {
  it('accepts https and http on localhost only', () => {
    expect(endpointProblem('https://zenodo.org/api/')).toBeNull()
    expect(endpointProblem('http://localhost:5000/api/')).toBeNull()
    expect(endpointProblem('http://zenodo.org/api/')).toContain('https')
    expect(endpointProblem('zenodo.org')).toContain('full URL')
  })

  it('refuses host names the backend would not read as written', () => {
    expect(endpointProblem('https://Zenodo.org/api/')).toContain('lowercase')
    expect(endpointProblem('https://zenodo.org/api/?q=1')).toBeTruthy()
    expect(endpointProblem('https://user@zenodo.org/api/')).toBeTruthy()
  })

  it('names Zenodo by its host', () => {
    expect(repositoryLabel({ name: 'Mine', endpoint: 'https://zenodo.org/api/' })).toBe('Zenodo')
    expect(repositoryLabel({ name: 'Mine', endpoint: 'https://sandbox.zenodo.org/api/' })).toBe('Zenodo sandbox')
    expect(repositoryLabel({ name: 'Mine', endpoint: 'https://repo.test/api/' })).toBe('Mine')
  })
})

describe('missing publish metadata', () => {
  it('reads the missing fields of a 400 answer only', () => {
    const missing = new ApiError(400, 'missing metadata', 'missing_metadata', { error: 'x', missing: ['creators', 1] })
    expect(missingFields(missing)).toEqual(['creators'])
    expect(missingFields(new ApiError(400, 'bad', 'invalid_request', { missing: ['creators'] }))).toBeNull()
    expect(missingFields(new ApiError(400, 'bad', undefined, { error: 'x' }))).toBeNull()
    expect(missingFields(new ApiError(409, 'busy', undefined, { missing: ['creators'] }))).toBeNull()
    expect(missingFields(new Error('x'))).toBeNull()
  })

  it('fills the missing title, date and resource type from the form', () => {
    const draft = { title: ' Soil data ', publicationDate: '2026-09-25', publisher: ' JLU Giessen ' }
    expect(requiredMetadata(['title', 'publication_date', 'resource_type', 'publisher', 'creators'], draft)).toEqual({
      title: 'Soil data', publication_date: '2026-09-25', resource_type: { id: 'dataset' }, publisher: 'JLU Giessen',
    })
    expect(requiredMetadata(['creators'], draft)).toEqual({})
    expect(requiredMetadata(['title', 'publisher'], { title: ' ', publicationDate: '', publisher: ' ' })).toEqual({})
    expect(fieldLabel('publisher')).toBe('a publisher')
    expect(fieldLabel('publication_date')).toBe('a publication date')
    expect(fieldLabel('rights_holder')).toBe('rights holder')
  })

  it('maps creators to personal names with an optional ORCID', () => {
    expect(creatorsMetadata([
      { name: 'Ada Lovelace', orcid: 'https://orcid.org/0000-0002-1825-0097' },
      { name: 'Curie, Marie', orcid: '' },
      { name: '  ', orcid: '0000-0001' },
    ])).toEqual([
      {
        person_or_org: {
          type: 'personal', family_name: 'Lovelace', given_name: 'Ada',
          identifiers: [{ scheme: 'orcid', identifier: '0000-0002-1825-0097' }],
        },
      },
      { person_or_org: { type: 'personal', family_name: 'Curie', given_name: 'Marie' } },
    ])
  })

})

describe('publish requirements', () => {
  const finding = (overrides: Partial<ProfileValidationFinding>): ProfileValidationFinding => ({
    code: 'constraint_violation', severity: 'violation', focus_node: './', path: 'http://schema.org/name',
    rule: 'minCount', message: 'Missing.', completeness: 'complete', ...overrides,
  })

  it('reads the findings of a requirements_unmet answer only', () => {
    const unmet = new ApiError(400, 'unmet', 'requirements_unmet', { error: 'x', findings: [finding({}), { code: 1 }] })
    expect(unmetFindings(unmet)).toEqual([finding({})])
    expect(unmetFindings(new ApiError(400, 'bad', 'invalid_request', { findings: [finding({})] }))).toBeNull()
    expect(unmetFindings(new ApiError(409, 'busy', 'requirements_unmet', { findings: [] }))).toBeNull()
    expect(unmetFindings(new Error('x'))).toBeNull()
  })

  it('builds one row per failing field a profile rule can edit', () => {
    const rule = (valueName: string): ProfilePropertyRule => ({
      id: valueName, label: valueName, description: '', kind: 'text', propertyUri: `http://schema.org/${valueName}`,
      valueName, obligation: 'MUST',
    })
    const entities: ProfileEntityRule[] = [
      { id: 'dataset', label: 'Root dataset', description: '', type: 'http://schema.org/Dataset', className: 'Dataset', propertyRules: [rule('author'), rule('license')] },
      { id: 'person', label: 'Person', description: '', type: 'http://schema.org/Person', className: 'Person', propertyRules: [rule('name')] },
    ]
    const draft: CrateDraft = {
      visibility: 'group',
      entities: [
        { id: './', types: ['Dataset'], properties: {} },
        { id: '#ada', types: ['Person'], properties: {} },
      ],
    }
    const rows = requirementRows(draft, entities, [
      finding({ path: '(<http://schema.org/author> | <http://schema.org/creator>)' }),
      finding({ path: 'http://schema.org/author' }),
      finding({ path: 'http://schema.org/license', severity: 'warning' }),
      finding({ focus_node: 'https://craqle.invalid/validation/document#ada' }),
      finding({ path: 'http://schema.org/publisher' }),
      finding({ path: 'http://schema.org/license', severity: 'info' }),
    ])

    expect(rows.map((row) => [row.entityId, row.property])).toEqual([['./', 'author'], ['./', 'license'], ['#ada', 'name']])
  })

  it('reads the record of a finished export', () => {
    const result = {
      repository: {
        id: 'r1', url: 'https://zenodo.org/api/records/r1', published: false, parent_id: 'p1', revision_id: 2,
        doi: '10.5281/zenodo.2', concept_doi: '10.5281/zenodo.1', html_url: null, in_review: true, warning: null,
      },
    }
    expect(exportRepository(result)).toEqual(result.repository)
    expect(exportRepository({ included: 3 })).toBeNull()
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

describe('publish choices', () => {
  const rows = [{
    secondary_identifiers: [
      { kind: 'invenio_parent', value: 'sandbox-parent', endpoint: 'https://sandbox.zenodo.org/api/' },
      { kind: 'invenio_parent', value: 'zenodo-parent', endpoint: 'https://zenodo.org/api' },
    ],
  }] as PersistentIdView[]

  it('offers only the source lineage of the chosen endpoint', () => {
    expect(sourceParent(rows, 'https://zenodo.org/api/')?.value).toBe('zenodo-parent')
    expect(sourceParent(rows, 'https://other.example/api/')).toBeNull()
  })

  it('finds an enabled pull link on the same lineage', () => {
    const pull = { direction: 'pull', status: 'enabled', endpoint: 'https://zenodo.org/api/', remote: { parent_id: 'p1', published: true } }
    const links = [pull] as RepositoryLink[]
    expect(pullsParent(links, 'p1', 'https://zenodo.org/api')).toBe(true)
    expect(pullsParent(links, 'p2', 'https://zenodo.org/api')).toBe(false)
    expect(pullsParent([{ ...pull, status: 'paused' }] as RepositoryLink[], 'p1', 'https://zenodo.org/api')).toBe(false)
    expect(pullsParent([{ ...pull, direction: 'push' }] as RepositoryLink[], 'p1', 'https://zenodo.org/api')).toBe(false)
  })

  it('accepts only a JSON object as metadata override', () => {
    expect(parseOverride('')).toEqual({})
    expect(parseOverride('{"title":"A"}')).toEqual({ value: { title: 'A' } })
    expect(parseOverride('[1]').error).toBeTruthy()
    expect(parseOverride('{').error).toBeTruthy()
  })
})
