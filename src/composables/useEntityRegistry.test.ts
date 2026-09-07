import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { withEntities } from '@/lib/crate/registry'
import type { DraftEntity } from '@/lib/crate/editor'

const REGISTRY = '01JREG0000000000000000000A'
const OTHER = '01J0THER00000000000000000A'
const OWN = '01J0WN000000000000000000AB'
const BROKEN = '01JBR0KEN0000000000000000A'

const lookupMetadataPath = vi.fn()
const loadRoCrate = vi.fn()
const getMetadataDocument = vi.fn()
const createMetadata = vi.fn()
const replaceMetadataRoCrate = vi.fn()
const runSparql = vi.fn()

let registry: typeof import('./useEntityRegistry')

beforeAll(async () => {
  vi.doMock('./aruna/crates', () => ({ loadRoCrate }))
  vi.doMock('./aruna/documents', () => ({ lookupMetadataPath, getMetadataDocument, createMetadata, replaceMetadataRoCrate }))
  vi.doMock('./aruna/search', () => ({ runSparql }))
  registry = await import('./useEntityRegistry')
})

afterAll(() => {
  vi.doUnmock('./aruna/crates')
  vi.doUnmock('./aruna/documents')
  vi.doUnmock('./aruna/search')
})

const institute: DraftEntity = {
  id: 'https://ror.org/03yrm5c26',
  types: ['Organization'],
  properties: { name: [{ kind: 'text', value: 'Example Institute' }] },
}
const ada: DraftEntity = {
  id: 'https://orcid.org/0000-0002-1825-0097',
  types: ['Person'],
  properties: {
    name: [{ kind: 'text', value: 'Ada Lovelace' }],
    affiliation: [{ kind: 'reference', value: institute.id }],
  },
}
const grace: DraftEntity = {
  id: '#grace',
  types: ['Person'],
  properties: { name: [{ kind: 'text', value: 'Grace Hopper' }] },
}

function dataset(title: string, entities: DraftEntity[]): unknown {
  const crate = withEntities(null, entities) as { '@graph': Array<Record<string, unknown>> }
  const root = crate['@graph'].find((node) => node['@id'] === './')!
  root.name = title
  return crate
}

function graphs(...ids: string[]) {
  return {
    columns: ['g'],
    rows: ids.map((id) => ({ g: `<https://w3id.org/aruna/${id}>` })),
    complete: true,
    nodesQueried: 1,
    nodesFailed: 0,
    failedPartitions: [],
    tookMs: 1,
    totalRows: ids.length,
    mode: 'distributed',
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('findCandidates', () => {
  it('lists registry entries first, then other datasets, with what they reference', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [] })
    loadRoCrate.mockImplementation(async (documentId: string) => {
      if (documentId === REGISTRY) return withEntities(null, [grace])
      if (documentId === OTHER) return dataset('Other dataset', [ada, institute])
      throw new Error(`unexpected ${documentId}`)
    })
    getMetadataDocument.mockResolvedValue({ document_id: OTHER, group_id: 'group-2', document_path: 'datasets/other' })
    runSparql.mockResolvedValue(graphs(OTHER, OWN, REGISTRY))

    const result = await registry.findCandidates('Person', { groupId: 'group-1', excludeDocumentId: OWN })

    expect(runSparql.mock.calls[0][0]).toBe(
      'SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s a <http://schema.org/Person> } } LIMIT 20',
    )
    expect(runSparql.mock.calls[0][1]).toBe('distributed-best-effort')
    expect(loadRoCrate.mock.calls.map((call) => call[0])).toEqual([REGISTRY, OTHER])
    expect(result.partial).toBe(false)
    expect(result.candidates.map((candidate) => [candidate.entity.id, candidate.source.title, candidate.source.registry])).toEqual([
      ['#grace', 'Entity registry', true],
      [ada.id, 'Other dataset', false],
    ])
    expect(result.candidates[1].related).toEqual([institute])
    expect(result.candidates[1].source.groupId).toBe('group-2')
  })

  it('degrades to a partial answer when a dataset or the registry cannot be read', async () => {
    lookupMetadataPath.mockRejectedValue(new ApiError(503, 'unavailable'))
    loadRoCrate.mockImplementation(async (documentId: string) => {
      if (documentId === BROKEN) throw new ApiError(403, 'forbidden')
      return dataset('Other dataset', [ada, institute])
    })
    getMetadataDocument.mockResolvedValue({ document_id: OTHER, group_id: 'group-1', document_path: 'datasets/other' })
    runSparql.mockResolvedValue({ ...graphs(OTHER, BROKEN), complete: false })

    const result = await registry.findCandidates('Person', { groupId: 'group-1' })

    expect(result.partial).toBe(true)
    expect(result.candidates.map((candidate) => candidate.entity.id)).toEqual([ada.id])
  })

  it('skips the registry lookup without a group and fails when the search fails', async () => {
    runSparql.mockRejectedValue(new Error('offline'))

    await expect(registry.findCandidates('Person')).rejects.toThrow('offline')
    expect(lookupMetadataPath).not.toHaveBeenCalled()
  })
})

describe('saveToRegistry', () => {
  it('creates the registry document on first use', async () => {
    lookupMetadataPath.mockRejectedValue(new ApiError(404, 'not found'))
    createMetadata.mockResolvedValue({ document_id: REGISTRY })

    const saved = await registry.saveToRegistry('group-1', ada, [institute])

    expect(saved).toEqual({ documentId: REGISTRY })
    const input = createMetadata.mock.calls[0][0]
    expect(input).toMatchObject({ group_id: 'group-1', path: 'entity-registry', public: false })
    const ids = (input.rocrate['@graph'] as Array<Record<string, unknown>>).map((node) => node['@id'])
    expect(ids).toEqual(['ro-crate-metadata.json', './', ada.id, institute.id])
  })

  it('merges into the current registry and retries once after a conflict', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [] })
    loadRoCrate
      .mockResolvedValueOnce(withEntities(null, [grace]))
      .mockResolvedValueOnce(withEntities(null, [grace, institute]))
    replaceMetadataRoCrate
      .mockRejectedValueOnce(new ApiError(409, 'conflict'))
      .mockResolvedValueOnce({ document_id: REGISTRY })

    const saved = await registry.saveToRegistry('group-1', ada, [])

    expect(saved).toEqual({ documentId: REGISTRY })
    expect(loadRoCrate).toHaveBeenNthCalledWith(2, REGISTRY, { force: true })
    const graph = replaceMetadataRoCrate.mock.calls[1][1].rocrate['@graph'] as Array<Record<string, unknown>>
    expect(graph.map((node) => node['@id'])).toEqual(['ro-crate-metadata.json', './', '#grace', institute.id, ada.id])
  })

  it('reports a second conflict instead of looping', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [] })
    loadRoCrate.mockResolvedValue(withEntities(null, []))
    replaceMetadataRoCrate.mockRejectedValue(new ApiError(409, 'conflict'))

    await expect(registry.saveToRegistry('group-1', ada, [])).rejects.toBeInstanceOf(ApiError)
    expect(replaceMetadataRoCrate).toHaveBeenCalledTimes(2)
  })
})
