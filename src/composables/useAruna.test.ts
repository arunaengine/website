import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildObjectSearchExportArtifact,
  buildSparqlExportArtifact,
  CrateNotReadyError,
  DEFAULT_SPARQL_MODE,
  IncompleteSparqlResultError,
  isRecencyOrdered,
  profileReferenceIri,
  profileRulesLoadState,
  profileValidationPresentation,
  publicProfileIri,
  serverValidationRequiredConstraints,
  sparqlCoverageStatus,
  useAruna,
  walkRecentPages,
} from './useAruna'
import { ApiError, apiRequest } from '@/lib/api'
import type {
  ListMetadataResponse,
  MetadataDocumentListItem,
  ProfileValidationStatusResponse,
} from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiRequest: vi.fn() }
})

const HOUR = 3_600_000
const START = Date.UTC(2026, 6, 27)

// Descending by index: item 0 is the newest, matching a recency-ordered page.
function stamp(index: number): string {
  return new Date(START - index * HOUR).toISOString()
}

function doc(path: string, updated: string): MetadataDocumentListItem {
  return {
    document_id: path,
    group_id: 'group',
    document_path: path,
    graph_iri: `urn:${path}`,
    public: true,
    replicas: 1,
    created_at: updated,
    updated_at: updated,
  }
}

function page(documents: MetadataDocumentListItem[], offset: number, limit: number): ListMetadataResponse {
  return { documents, limit, offset, total_returned: documents.length }
}

function dataDocs(count: number, from = 0): MetadataDocumentListItem[] {
  return Array.from({ length: count }, (_, index) => doc(`data/${from + index}`, stamp(from + index)))
}

function profileDocs(count: number, from = 0): MetadataDocumentListItem[] {
  return Array.from({ length: count }, (_, index) => doc(`profiles/${from + index}`, stamp(from + index)))
}

function validationStatus(
  overrides: Partial<ProfileValidationStatusResponse> = {},
): ProfileValidationStatusResponse {
  return {
    document_id: 'validation-doc',
    dataset_revision: 'dataset-revision',
    state: 'valid',
    profile_id: 'profile-doc',
    profile_iri: publicProfileIri('profile-doc'),
    profile_revision: 'profile-revision',
    evaluator: 'test-evaluator',
    validated_at_ms: 1,
    findings: [],
    completeness: 'complete',
    ...overrides,
  }
}

describe('recency capability detection', () => {
  it('accepts a descending page', () => {
    expect(isRecencyOrdered(dataDocs(6))).toBe(true)
  })

  it('rejects a created-ascending page', () => {
    // What an older node answers: it ignores the unknown order parameter and
    // returns 200 with its oldest documents first.
    expect(isRecencyOrdered([...dataDocs(6)].reverse())).toBe(false)
  })

  it('accepts pages with no evidence', () => {
    expect(isRecencyOrdered([])).toBe(true)
    expect(isRecencyOrdered(dataDocs(1))).toBe(true)
    expect(isRecencyOrdered([doc('a', stamp(3)), doc('b', stamp(3))])).toBe(true)
  })

  it('ignores unparsable timestamps', () => {
    expect(isRecencyOrdered([doc('a', stamp(0)), doc('b', 'never'), doc('c', stamp(2))])).toBe(true)
  })
})

describe('the recent page walk', () => {
  it('takes one page when it fills', async () => {
    const offsets: number[] = []
    const walk = await walkRecentPages(async (offset, size) => {
      offsets.push(offset)
      return page(dataDocs(size), offset, size)
    }, 5)
    expect(offsets).toEqual([0])
    expect(walk).toEqual({ ordered: true, documents: dataDocs(5) })
  })

  it('deepens past a profile-only window', async () => {
    const offsets: number[] = []
    const walk = await walkRecentPages(async (offset, size) => {
      offsets.push(offset)
      return offset === 0 ? page(profileDocs(size), offset, size) : page(dataDocs(3, 20), offset, size)
    }, 5)
    expect(offsets).toEqual([0, 10])
    expect(walk.documents.map((item) => item.document_path)).toEqual(['data/20', 'data/21', 'data/22'])
  })

  it('stops at the page cap', async () => {
    const offsets: number[] = []
    const walk = await walkRecentPages(async (offset, size) => {
      offsets.push(offset)
      return page(profileDocs(size, offset), offset, size)
    }, 5)
    // Empty and ordered: the caller turns this into its own fallback list.
    expect(offsets).toEqual([0, 10, 20])
    expect(walk).toEqual({ ordered: true, documents: [] })
  })

  it('stops on a short page', async () => {
    const offsets: number[] = []
    const walk = await walkRecentPages(async (offset, size) => {
      offsets.push(offset)
      return page(profileDocs(2), offset, size)
    }, 5)
    expect(offsets).toEqual([0])
    expect(walk).toEqual({ ordered: true, documents: [] })
  })

  it('reports an unordered page once', async () => {
    const offsets: number[] = []
    const walk = await walkRecentPages(async (offset, size) => {
      offsets.push(offset)
      return page([...dataDocs(size)].reverse(), offset, size)
    }, 5)
    expect(offsets).toEqual([0])
    expect(walk).toEqual({ ordered: false, documents: [] })
  })
})

describe('the crate cache fence', () => {
  afterEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('does not re-cache a crate superseded while its load was in flight', async () => {
    const { loadRoCrate, invalidateCrate, fullCrates } = useAruna()
    let release!: (value: unknown) => void
    vi.mocked(apiRequest).mockReturnValueOnce(new Promise((resolve) => (release = resolve)))

    const inFlight = loadRoCrate('doc-race')
    // The write lands while the fetch above is still on the wire.
    invalidateCrate('doc-race')
    release({ rocrate: { '@graph': [{ '@id': 'old' }] } })

    await expect(inFlight).resolves.toEqual({ '@graph': [{ '@id': 'old' }] })
    expect(fullCrates.value['doc-race']).toBeUndefined()

    vi.mocked(apiRequest).mockResolvedValueOnce({ rocrate: { '@graph': [{ '@id': 'new' }] } })
    await loadRoCrate('doc-race')
    expect(fullCrates.value['doc-race']).toEqual({ '@graph': [{ '@id': 'new' }] })
  })

  it('shares one request between concurrent consumers', async () => {
    const { loadRoCrate } = useAruna()
    vi.mocked(apiRequest).mockImplementation(async () => ({ rocrate: { '@graph': [] } }))

    const [first, second] = await Promise.all([loadRoCrate('doc-shared'), loadRoCrate('doc-shared')])
    expect(vi.mocked(apiRequest)).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })

  it('forces a fresh fetch past cache and in-flight load', async () => {
    const { loadRoCrate, fullCrates } = useAruna()
    vi.mocked(apiRequest).mockResolvedValueOnce({ rocrate: { '@graph': [{ '@id': 'first' }] } })
    await loadRoCrate('doc-force')
    expect(fullCrates.value['doc-force']).toEqual({ '@graph': [{ '@id': 'first' }] })

    vi.mocked(apiRequest).mockResolvedValueOnce({ rocrate: { '@graph': [{ '@id': 'second' }] } })
    await loadRoCrate('doc-force', { force: true })
    expect(fullCrates.value['doc-force']).toEqual({ '@graph': [{ '@id': 'second' }] })
  })
})

describe('stored profile rule load states', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(apiRequest).mockReset()
  })

  it('classifies a completed rule-free profile as empty', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      rocrate: {
        '@graph': [
          { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
          { '@id': './', '@type': 'Dataset', name: 'Rule-free profile' },
        ],
      },
    })
    const parsed = await useAruna().loadProfileCrate('profile-no-rules')
    const hasRules = Boolean(parsed.entityRules.length || parsed.schema || parsed.shapesText || parsed.customShapesText)

    expect(profileRulesLoadState({ loading: false, unavailable: false, complete: true, hasRules })).toBe('empty')
  })

  it('keeps exhausted materialization retry unavailable instead of empty', async () => {
    vi.useFakeTimers()
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(503, 'Preparing'))
    const pending = useAruna().loadProfileCrate('profile-materializing')
    const rejected = expect(pending).rejects.toBeInstanceOf(CrateNotReadyError)
    await vi.runAllTimersAsync()

    await rejected
    expect(vi.mocked(apiRequest)).toHaveBeenCalledTimes(8)
    expect(profileRulesLoadState({ loading: false, unavailable: true, complete: false, hasRules: false })).toBe('unavailable')
  })
})

describe('revision-bound Profile validation presentation', () => {
  afterEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('maps backend states into the canonical UI vocabulary', () => {
    expect(profileValidationPresentation(validationStatus()).status).toBe('verified')
    expect(profileValidationPresentation(validationStatus({ state: 'invalid' })).status).toBe('invalid')
    expect(profileValidationPresentation(validationStatus({ completeness: 'incomplete' })).status).toBe('partial')
    expect(profileValidationPresentation(validationStatus({ state: 'not_profiled' })).status).toBe('not checked')

    const stale = profileValidationPresentation(validationStatus({ state: 'stale', completeness: 'incomplete' }))
    expect(stale).toMatchObject({ status: 'not checked', stale: true, canRevalidate: true })
  })

  it('loads stale honestly and uses the revalidation route for a fresh result', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(validationStatus({ document_id: 'stale-doc', state: 'stale', completeness: 'incomplete' }))
      .mockResolvedValueOnce(validationStatus({ document_id: 'stale-doc' }))
    const {
      loadProfileValidationStatus,
      revalidateProfileValidationStatus,
      profileValidationStatuses,
    } = useAruna()

    await loadProfileValidationStatus('stale-doc')
    expect(profileValidationStatuses.value['stale-doc']).toMatchObject({ status: 'not checked', stale: true })

    await revalidateProfileValidationStatus('stale-doc')
    expect(profileValidationStatuses.value['stale-doc']).toMatchObject({ status: 'verified', stale: false })
    expect(vi.mocked(apiRequest)).toHaveBeenNthCalledWith(
      2,
      '/metadata/stale-doc/profile-validation/revalidate',
      { method: 'POST' },
      expect.any(Object),
    )
  })

  it('fetches capabilities and identifies server-only constraints in the active shapes', async () => {
    const capabilities = {
      evaluator: 'test-evaluator',
      supported_constraints: ['sh:minCount', 'sh:closed', 'sh:ignoredProperties'],
      unsupported_constraint_policy: 'fail_closed' as const,
      public_profile_iri_template: 'https://w3id.org/aruna/profile/{id}',
      legacy_profile_iri_template: 'https://w3id.org/aruna/{id}',
    }
    vi.mocked(apiRequest).mockResolvedValueOnce(capabilities)
    const { loadProfileValidationCapabilities } = useAruna()

    await expect(loadProfileValidationCapabilities(true)).resolves.toEqual(capabilities)
    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith(
      '/metadata/profile-validation/capabilities',
      {},
      expect.any(Object),
    )
    expect(serverValidationRequiredConstraints([
      '@prefix sh: <http://www.w3.org/ns/shacl#> . [] sh:minCount 1 ; sh:closed true .',
    ], capabilities)).toEqual(['sh:closed'])
  })

  it('invalidates and reloads status after an accepted crate PUT', async () => {
    const summary = doc('write-status-doc', stamp(0))
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (path === '/metadata/write-status-doc/rocrate' && options?.method === 'PUT') return summary
      if (path === '/metadata/write-status-doc') return summary
      if (path === '/metadata/write-status-doc/profile-validation') {
        return validationStatus({ document_id: 'write-status-doc' })
      }
      if (path === '/metadata') {
        const query = options?.query as Record<string, number> | undefined
        return page([], Number(query?.offset ?? 0), Number(query?.limit ?? 100))
      }
      throw new ApiError(404, `Unexpected request ${path}`)
    })
    const { replaceMetadataRoCrate, profileValidationStatuses } = useAruna()

    await replaceMetadataRoCrate('write-status-doc', { rocrate: { '@graph': [] } })

    expect(profileValidationStatuses.value['write-status-doc']?.status).toBe('verified')
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) =>
      path === '/metadata/write-status-doc/profile-validation',
    )).toBe(true)
  })

  it('reloads cached dependent Dataset status after an accepted Profile PUT', async () => {
    const profileSummary = {
      ...doc('profile-write-doc', stamp(0)),
      document_path: 'profiles/registered',
    }
    let datasetStatusReads = 0
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (path === '/metadata/dependent-dataset/profile-validation') {
        datasetStatusReads += 1
        return validationStatus({ document_id: 'dependent-dataset', profile_id: 'profile-write-doc' })
      }
      if (path === '/metadata/profile-write-doc/rocrate' && options?.method === 'PUT') return profileSummary
      if (path === '/metadata/profile-write-doc') return profileSummary
      if (path === '/metadata/profile-write-doc/profile-validation') {
        return validationStatus({
          document_id: 'profile-write-doc',
          state: 'not_profiled',
          profile_id: null,
          profile_iri: null,
          profile_revision: null,
        })
      }
      if (path === '/metadata') {
        const query = options?.query as Record<string, number> | undefined
        return page([], Number(query?.offset ?? 0), Number(query?.limit ?? 100))
      }
      throw new ApiError(404, `Unexpected request ${path}`)
    })
    const { loadProfileValidationStatus, replaceMetadataRoCrate } = useAruna()

    await loadProfileValidationStatus('dependent-dataset')
    await replaceMetadataRoCrate('profile-write-doc', { rocrate: { '@graph': [] } })

    expect(datasetStatusReads).toBe(2)
  })
})

describe('accepted profile reconciliation', () => {
  afterEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('retains the accepted summary when the immediate prefix list is stale', async () => {
    const accepted: MetadataDocumentListItem = {
      ...doc('profiles/new-profile', stamp(0)),
      document_id: 'accepted-profile',
      document_path: 'profiles/new-profile',
      graph_iri: 'urn:profile:accepted',
      rocrate_summary: {
        '@graph': [
          { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
          { '@id': './', '@type': ['Dataset', 'Profile'], name: 'New profile' },
        ],
      },
    }
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (path === '/metadata' && options?.method === 'POST') return accepted
      if (path === '/metadata') {
        const query = options?.query as Record<string, number> | undefined
        return page([], Number(query?.offset ?? 0), Number(query?.limit ?? 100))
      }
      throw new ApiError(404, 'Not found')
    })
    const { createMetadata, profileItems, profiles } = useAruna()

    await createMetadata({ group_id: 'group', path: 'profiles/new-profile', rocrate: {} })

    expect(profileItems.value).toContainEqual(accepted)
    expect(profiles.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'new-profile', documentId: 'accepted-profile', name: 'New profile' }),
    ]))
  })
})

describe('metadata conformance classification', () => {
  it('excludes supported and known-unsupported RO-Crate versions from profile ids', () => {
    const item = {
      ...doc('data/future', stamp(0)),
      rocrate_summary: {
        '@graph': [
          { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
          {
            '@id': './',
            '@type': 'Dataset',
            conformsTo: [
              { '@id': 'https://w3id.org/ro/crate/1.2' },
              { '@id': 'http://w3id.org/ro/crate/1.3' },
              { '@id': 'https://example.test/profiles/future' },
            ],
          },
        ],
      },
    }

    expect(useAruna().toMetadataDoc(item).conformsToIds).toEqual([
      'https://example.test/profiles/future',
    ])
  })

  it('emits the public Profile w3id and resolves both public and legacy references', () => {
    const documentId = '01PROFILEDOCUMENT000000000000'
    const legacyIri = `https://w3id.org/aruna/${documentId}`
    const storedProfile = {
      ...doc('profiles/research', stamp(0)),
      document_id: documentId,
      document_path: 'profiles/research',
      graph_iri: legacyIri,
      rocrate_summary: {
        '@graph': [
          { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
          { '@id': './', '@type': ['Dataset', 'http://www.w3.org/ns/dx/prof/Profile'], name: 'Research profile' },
        ],
      },
    }
    const { profileItems, profiles, toMetadataDoc } = useAruna()
    const previous = [...profileItems.value]
    profileItems.value = [storedProfile]
    try {
      const profile = profiles.value.find((item) => item.id === 'research')
      expect(profileReferenceIri(profile)).toBe(publicProfileIri(documentId))
      expect(profile?.graphIri).toBe(legacyIri)

      const datasetWith = (iri: string) => toMetadataDoc({
        ...doc(`dataset-${iri === legacyIri ? 'legacy' : 'public'}`, stamp(0)),
        rocrate_summary: {
          '@graph': [
            { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
            { '@id': './', '@type': 'Dataset', conformsTo: { '@id': iri } },
          ],
        },
      })
      expect(datasetWith(publicProfileIri(documentId)).profileIds).toEqual(['research'])
      expect(datasetWith(legacyIri).profileIds).toEqual(['research'])
    } finally {
      profileItems.value = previous
    }
  })
})

describe('initial metadata detail reads', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(apiRequest).mockReset()
  })

  function created(id: string): MetadataDocumentListItem {
    return doc(id, stamp(0))
  }

  function mockCreateThenDetail(id: string, detail: Array<MetadataDocumentListItem | ApiError>) {
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (path === '/metadata' && options?.method === 'POST') return created(id)
      if (path === `/metadata/${id}`) {
        const response = detail.shift()
        if (response instanceof ApiError) throw response
        if (response) return response
      }
      throw new ApiError(400, 'Catalog refresh unavailable')
    })
  }

  it('polls 503 responses after a successful create until the detail is ready', async () => {
    vi.useFakeTimers()
    const id = 'created-503'
    mockCreateThenDetail(id, [
      new ApiError(503, 'Preparing'),
      new ApiError(503, 'Preparing'),
      created(id),
    ])
    const { createMetadata, getMetadataDocument } = useAruna()
    const onPreparing = vi.fn()

    await createMetadata({ group_id: 'group', path: id, rocrate: {} })
    const pending = getMetadataDocument(id, { pollPreparing: true, onPreparing })
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toEqual(created(id))
    expect(onPreparing).toHaveBeenNthCalledWith(1, true)
    expect(onPreparing).toHaveBeenNthCalledWith(2, true)
    expect(vi.mocked(apiRequest).mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  })

  it('polls a transient 404 after a successful create', async () => {
    vi.useFakeTimers()
    const id = 'created-404'
    mockCreateThenDetail(id, [new ApiError(404, 'Not found'), created(id)])
    const { createMetadata, getMetadataDocument } = useAruna()
    const onPreparing = vi.fn()

    await createMetadata({ group_id: 'group', path: id, rocrate: {} })
    const pending = getMetadataDocument(id, { pollPreparing: true, onPreparing })
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toEqual(created(id))
    expect(onPreparing).toHaveBeenCalledWith(true)
  })

  it('keeps a confirmed 404 immediate without create context', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(404, 'Not found'))
    const { getMetadataDocument } = useAruna()

    await expect(getMetadataDocument('direct-404', { pollPreparing: true })).rejects.toMatchObject({ status: 404 })
    expect(vi.mocked(apiRequest)).toHaveBeenCalledTimes(1)
  })

  it('bounds a direct 503 and reports non-create preparing context', async () => {
    vi.useFakeTimers()
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(503, 'Preparing'))
    const { getMetadataDocument } = useAruna()
    const onPreparing = vi.fn()

    const pending = getMetadataDocument('direct-503', { pollPreparing: true, onPreparing })
    const rejected = expect(pending).rejects.toBeInstanceOf(CrateNotReadyError)
    await vi.runAllTimersAsync()

    await rejected
    expect(vi.mocked(apiRequest)).toHaveBeenCalledTimes(8)
    expect(onPreparing).toHaveBeenCalledWith(false)
  })

  it('keeps a 403 immediate', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(403, 'Forbidden'))
    const { getMetadataDocument } = useAruna()

    await expect(getMetadataDocument('private', { pollPreparing: true })).rejects.toMatchObject({ status: 403 })
    expect(vi.mocked(apiRequest)).toHaveBeenCalledTimes(1)
  })
})

describe('SPARQL completeness', () => {
  afterEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('retains every completeness field in the result adapter', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      kind: 'Solutions',
      value: [{ dataset: 'urn:dataset' }],
      complete: false,
      nodes_queried: 3,
      nodes_failed: 1,
      failed_partitions: ['node-b'],
    })
    const { runSparql } = useAruna()

    const result = await runSparql('SELECT DISTINCT ?dataset WHERE { ?dataset a <urn:Dataset> }', 'distributed-best-effort')

    expect(result).toMatchObject({
      complete: false,
      nodesQueried: 3,
      nodesFailed: 1,
      failedPartitions: ['node-b'],
      mode: 'distributed-best-effort',
      totalRows: 1,
    })
  })

  it('renders an incomplete ASK answer as unknown', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      kind: 'Boolean',
      value: false,
      complete: false,
      nodes_queried: 3,
      nodes_failed: 1,
      failed_partitions: ['node-c'],
    })
    const { runSparql } = useAruna()

    const result = await runSparql('ASK { ?s ?p ?o }', 'distributed-best-effort')

    expect(result.rows).toEqual([{ value: 'unknown' }])
    expect(result.complete).toBe(false)
    expect(sparqlCoverageStatus(result)).toBe('Partial')
  })

  it('defaults to strict and never retries an incomplete strict response as best-effort', async () => {
    expect(DEFAULT_SPARQL_MODE).toBe('distributed-strict')
    vi.mocked(apiRequest).mockResolvedValueOnce({
      kind: 'Solutions',
      value: [],
      complete: false,
      nodes_queried: 2,
      nodes_failed: 1,
      failed_partitions: ['node-d'],
    })
    const { runSparql } = useAruna()

    await expect(runSparql('SELECT DISTINCT ?s WHERE { ?s a <urn:Dataset> }', DEFAULT_SPARQL_MODE))
      .rejects.toBeInstanceOf(IncompleteSparqlResultError)
    expect(vi.mocked(apiRequest)).toHaveBeenCalledTimes(1)
    const request = vi.mocked(apiRequest).mock.calls[0]?.[1]
    expect(JSON.parse(String(request?.body))).toMatchObject({
      mode: 'distributed',
      allow_partial: false,
    })
  })

  it('wraps every partial export in its completeness manifest', () => {
    const artifact = buildSparqlExportArtifact({
      columns: ['dataset'],
      rows: [{ dataset: 'urn:dataset' }],
      tookMs: 12,
      totalRows: 1,
      complete: false,
      nodesQueried: 3,
      nodesFailed: 1,
      failedPartitions: ['node-b'],
      mode: 'distributed-best-effort',
    }, {
      query: 'SELECT DISTINCT ?dataset WHERE { ?dataset a <urn:Dataset> }',
      scope: 'realm-1',
      timestamp: '2026-08-19T09:00:00.000Z',
    })

    expect(artifact).toHaveProperty('completeness_manifest', expect.objectContaining({
      query: 'SELECT DISTINCT ?dataset WHERE { ?dataset a <urn:Dataset> }',
      scope: 'realm-1',
      mode: 'distributed-best-effort',
      timestamp: '2026-08-19T09:00:00.000Z',
      result_count: 1,
      truncation: null,
      freshness: null,
      complete: false,
      failed_coverage: {
        nodes_queried: 3,
        nodes_failed: 1,
        failed_partitions: ['node-b'],
      },
    }))
    expect(artifact).toHaveProperty('results.rows', [{ dataset: 'urn:dataset' }])
    expect(artifact).not.toHaveProperty('rows')
  })

  it('keeps a document-scoped query on the document endpoint with strict coverage', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      kind: 'Solutions',
      value: [],
      complete: true,
      nodes_queried: 1,
      nodes_failed: 0,
      failed_partitions: [],
    })
    const { runSparql } = useAruna()

    await runSparql('SELECT ?s WHERE { ?s ?p ?o }', DEFAULT_SPARQL_MODE, 'doc/one')

    expect(vi.mocked(apiRequest)).toHaveBeenCalledOnce()
    expect(vi.mocked(apiRequest).mock.calls[0]?.[0]).toBe('/metadata/doc%2Fone/sparql/query')
    expect(JSON.parse(String(vi.mocked(apiRequest).mock.calls[0]?.[1]?.body))).toMatchObject({
      mode: 'distributed',
      allow_partial: false,
    })
  })

  it('wraps a partial object inventory export with its manifest and freshness', () => {
    const artifact = buildObjectSearchExportArtifact({
      hits: [{
        kind: 'object',
        mode: 'distributed_best_effort',
        issuer_node_id: 'node-a',
        group_id: 'group-a',
        bucket: 'raw-data',
        key: 'reads/sample.fastq',
      }],
      coverage: {
        scope: 'realm',
        mode: 'distributed_best_effort',
        index_freshness: { source: 'live_heads', as_of: '2026-08-19T09:00:00.000Z' },
        nodes_queried: 3,
        nodes_failed: 1,
        failed_partitions: ['node-c'],
        omitted_partitions: 0,
        complete: false,
        truncated: true,
        partitions: [],
      },
    }, {
      query: 'sample',
      timestamp: '2026-08-19T09:01:00.000Z',
    })

    expect(artifact).toHaveProperty('completeness_manifest', expect.objectContaining({
      schema: 'aruna.object-search-completeness.v1',
      query: 'sample',
      scope: 'realm',
      mode: 'distributed_best_effort',
      timestamp: '2026-08-19T09:01:00.000Z',
      result_count: 1,
      truncation: true,
      freshness: { source: 'live_heads', as_of: '2026-08-19T09:00:00.000Z' },
      complete: false,
      failed_coverage: {
        nodes_queried: 3,
        nodes_failed: 1,
        failed_partitions: ['node-c'],
        omitted_partitions: 0,
      },
    }))
    expect(artifact).toHaveProperty('results.0.key', 'reads/sample.fastq')
  })
})
