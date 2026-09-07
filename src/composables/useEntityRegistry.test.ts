import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { referenceNode, registryCrate, registryReferences } from '@/lib/crate/registry'
import { newDraft, toRoCrate } from '@/lib/crate/editor'
import type { DraftEntity } from '@/lib/crate/editor'

const REGISTRY = '01JREG0000000000000000000A'
const OTHER = '01J0THER00000000000000000A'
const OWN = '01J0WN000000000000000000AB'
const BROKEN = '01JBR0KEN0000000000000000A'
const SAVED = '01J00000000000000000000004'

const lookupMetadataPath = vi.fn()
const fetchRoCrateRaw = vi.fn()
const getMetadataDocument = vi.fn()
const createMetadata = vi.fn()
const upsertContextualEntity = vi.fn()
const runSparql = vi.fn()

let registry: typeof import('./useEntityRegistry')

beforeAll(async () => {
  vi.doMock('./aruna/crates', () => ({ fetchRoCrateRaw }))
  vi.doMock('./aruna/documents', () => ({ lookupMetadataPath, getMetadataDocument, createMetadata, upsertContextualEntity }))
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
  const draft = newDraft()
  return toRoCrate({ ...draft, entities: [
    { ...draft.entities[0], properties: { ...draft.entities[0].properties, name: [{ kind: 'text', value: title }] } },
    ...entities,
  ] })
}

const adaReference = { documentId: OTHER, entityId: ada.id }
const graceReference = { documentId: SAVED, entityId: grace.id }
function sourceCrate(id: string): unknown {
  if (id === OTHER) return dataset('Other dataset', [ada, institute])
  if (id === SAVED) return dataset('Saved dataset', [grace])
  throw new Error(`unexpected ${id}`)
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
  fetchRoCrateRaw.mockImplementation(async (id: string) => sourceCrate(id))
  getMetadataDocument.mockResolvedValue({ group_id: 'group-1', document_path: 'datasets/example' })
  runSparql.mockResolvedValue(graphs())
})

describe('findCandidates', () => {
  it('resolves saved references first and retains their source graph', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [] })
    fetchRoCrateRaw.mockImplementation(async (id: string) => id === REGISTRY ? registryCrate(graceReference) : sourceCrate(id))
    runSparql.mockResolvedValue(graphs(OTHER, OWN, REGISTRY))
    const result = await registry.findCandidates('Person', { groupId: 'group-1', excludeDocumentId: OWN })
    expect(runSparql.mock.calls[0]).toEqual([
      'SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s a <http://schema.org/Person> } } LIMIT 20',
      'distributed-best-effort',
    ])
    expect(result.partial).toBe(false)
    expect(result.candidates.map((item) => [item.reference, item.source.title, item.source.registry])).toEqual([
      [graceReference, 'Saved dataset', true], [adaReference, 'Other dataset', false],
    ])
    expect(result.candidates[1].related).toEqual([institute])
  })

  it('combines references from concurrent first-created registry graphs', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [BROKEN] })
    fetchRoCrateRaw.mockImplementation(async (id: string) => {
      if (id === REGISTRY) return registryCrate(adaReference)
      if (id === BROKEN) return registryCrate(graceReference)
      return sourceCrate(id)
    })
    const result = await registry.findCandidates('Person', { groupId: 'group-1' })
    expect(result.candidates.map((item) => item.reference)).toEqual([adaReference, graceReference])
    expect(result.partial).toBe(false)
  })

  it('does not merge equal fragment ids from separate source graphs', async () => {
    runSparql.mockResolvedValue(graphs(OTHER, SAVED))
    fetchRoCrateRaw.mockImplementation(async (id: string) => dataset(id, [{ ...grace, properties: {
      name: [{ kind: 'text', value: id === OTHER ? 'Alice' : 'Bob' }],
    } }]))
    const result = await registry.findCandidates('Person')
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates.map((item) => item.reference.documentId)).toEqual([OTHER, SAVED])
  })

  it('excludes pointer nodes from other groups registry graphs in discovery', async () => {
    runSparql.mockResolvedValue(graphs(OTHER))
    fetchRoCrateRaw.mockResolvedValue(registryCrate(graceReference))
    const result = await registry.findCandidates('CreativeWork')
    expect(result.candidates).toEqual([])
  })

  it('reports saved sources that have become inaccessible', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [] })
    fetchRoCrateRaw.mockImplementation(async (id: string) => {
      if (id === REGISTRY) return registryCrate(adaReference)
      throw new ApiError(403, 'forbidden')
    })
    const result = await registry.findCandidates('Person', { groupId: 'group-1' })
    expect(result).toEqual({ candidates: [], partial: true, unavailable: true })
  })

  it('keeps saved candidates as partial results if discovery fails', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [] })
    fetchRoCrateRaw.mockImplementation(async (id: string) => id === REGISTRY ? registryCrate(adaReference) : sourceCrate(id))
    runSparql.mockRejectedValue(new Error('offline'))
    const result = await registry.findCandidates('Person', { groupId: 'group-1' })
    expect(result.partial).toBe(true)
    expect(result.candidates[0].reference).toEqual(adaReference)
  })

  it('reports a failed discovery with no saved candidates', async () => {
    runSparql.mockRejectedValue(new Error('offline'))
    await expect(registry.findCandidates('Person')).rejects.toThrow('offline')
    expect(lookupMetadataPath).not.toHaveBeenCalled()
  })
})

describe('saveToRegistry', () => {
  it('creates a marked registry with its first reference already included', async () => {
    lookupMetadataPath.mockRejectedValue(new ApiError(404, 'not found'))
    createMetadata.mockResolvedValue({ document_id: REGISTRY })
    expect(await registry.saveToRegistry('group-1', adaReference)).toEqual({ documentId: REGISTRY })
    const input = createMetadata.mock.calls[0][0]
    expect(input).toMatchObject({ group_id: 'group-1', path: 'entity-registry', public: false })
    expect(registryReferences(input.rocrate)).toEqual([adaReference])
    expect(JSON.stringify(input.rocrate)).not.toContain('Ada Lovelace')
    expect(upsertContextualEntity).not.toHaveBeenCalled()
  })

  it('uses independent contextual upserts for concurrent saves', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [] })
    fetchRoCrateRaw.mockImplementation(async (id: string) => id === REGISTRY ? registryCrate(adaReference) : sourceCrate(id))
    await Promise.all([
      registry.saveToRegistry('group-1', adaReference), registry.saveToRegistry('group-1', graceReference),
    ])
    expect(upsertContextualEntity.mock.calls).toEqual([
      [REGISTRY, referenceNode(adaReference)], [REGISTRY, referenceNode(graceReference)],
    ])
    expect(createMetadata).not.toHaveBeenCalled()
  })

  it('refuses to modify an ordinary dataset at the reserved registry path', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [] })
    fetchRoCrateRaw.mockImplementation(async (id: string) => id === REGISTRY ? dataset('Research', [grace]) : sourceCrate(id))
    await expect(registry.saveToRegistry('group-1', adaReference)).rejects.toThrow('already used by another dataset')
    expect(upsertContextualEntity).not.toHaveBeenCalled()
    expect(createMetadata).not.toHaveBeenCalled()
  })

  it('uses a marked conflict without modifying an unmarked winner', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [BROKEN] })
    fetchRoCrateRaw.mockImplementation(async (id: string) => {
      if (id === REGISTRY) return dataset('Research', [grace])
      if (id === BROKEN) return registryCrate(graceReference)
      return sourceCrate(id)
    })
    await registry.saveToRegistry('group-1', adaReference)
    expect(upsertContextualEntity).toHaveBeenCalledWith(BROKEN, referenceNode(adaReference))
    expect(createMetadata).not.toHaveBeenCalled()
  })

  it('does not save descriptions that exist only in an unsaved draft', async () => {
    await expect(registry.saveToRegistry('group-1', { ...adaReference, documentId: '' })).rejects.toThrow('Save the dataset first')
    await expect(registry.saveToRegistry('group-1', { ...adaReference, entityId: '#new' })).rejects.toThrow('Save the dataset changes first')
    expect(upsertContextualEntity).not.toHaveBeenCalled()
    expect(createMetadata).not.toHaveBeenCalled()
  })

  it('does not replay an uncertain upsert failure', async () => {
    lookupMetadataPath.mockResolvedValue({ winner: { document_id: REGISTRY }, conflicts: [] })
    fetchRoCrateRaw.mockImplementation(async (id: string) => id === REGISTRY ? registryCrate(graceReference) : sourceCrate(id))
    upsertContextualEntity.mockRejectedValue(new ApiError(503, 'unavailable'))
    await expect(registry.saveToRegistry('group-1', adaReference)).rejects.toBeInstanceOf(ApiError)
    expect(upsertContextualEntity).toHaveBeenCalledTimes(1)
    expect(createMetadata).not.toHaveBeenCalled()
  })
})
