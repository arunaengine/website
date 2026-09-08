import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { newDraft, toRoCrate } from '@/lib/crate/editor'
import type { DraftEntity } from '@/lib/crate/editor'

const REGISTRY = '01JREG0000000000000000000A'
const OTHER = '01J0THER00000000000000000A'
const OWN = '01J0WN000000000000000000AB'
const SAVED = '01J00000000000000000000004'

const fetchRoCrateRaw = vi.fn()
const getMetadataDocument = vi.fn()
const listRecentMetadata = vi.fn()
const runSparql = vi.fn()

let registry: typeof import('./useEntityRegistry')

beforeAll(async () => {
  vi.doMock('./aruna/crates', () => ({ fetchRoCrateRaw }))
  vi.doMock('./aruna/catalog', () => ({ listRecentMetadata }))
  vi.doMock('./aruna/documents', () => ({ getMetadataDocument }))
  vi.doMock('./aruna/search', () => ({ runSparql }))
  registry = await import('./useEntityRegistry')
})

afterAll(() => {
  vi.doUnmock('./aruna/crates')
  vi.doUnmock('./aruna/catalog')
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

function legacyRegistry(): unknown {
  return {
    '@context': 'https://w3id.org/ro/crate/1.1/context',
    '@graph': [{
      '@id': './',
      '@type': ['Dataset', 'https://w3id.org/aruna/terms/EntityRegistry'],
      name: 'Entity registry',
    }],
  }
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
  listRecentMetadata.mockResolvedValue(null)
  runSparql.mockResolvedValue(graphs())
})

describe('findRecentCandidates', () => {
  it('keeps recent dataset order and source references', async () => {
    listRecentMetadata.mockResolvedValue([
      { ulid: OTHER, title: 'Other dataset', realmId: 'group-2' },
      { ulid: SAVED, title: 'Saved dataset', realmId: 'group-1' },
    ])
    const result = await registry.findRecentCandidates({ excludeDocumentId: OWN })

    expect(listRecentMetadata).toHaveBeenCalledWith(8)
    expect(result.candidates.map((item) => item.reference)).toEqual([
      adaReference, { documentId: OTHER, entityId: institute.id }, graceReference,
    ])
    expect(result.candidates[0].related).toEqual([institute])
    expect(result.partial).toBe(false)
  })

  it('excludes the current dataset and reports unreadable recent datasets', async () => {
    listRecentMetadata.mockResolvedValue([
      { ulid: OWN, title: 'Current dataset', realmId: 'group-1' },
      { ulid: SAVED, title: 'Saved dataset', realmId: 'group-1' },
    ])
    fetchRoCrateRaw.mockRejectedValue(new Error('forbidden'))
    const result = await registry.findRecentCandidates({ excludeDocumentId: OWN })

    expect(fetchRoCrateRaw).toHaveBeenCalledOnce()
    expect(fetchRoCrateRaw).toHaveBeenCalledWith(SAVED)
    expect(result).toEqual({ candidates: [], partial: true })
  })

  it('does not offer entities from an obsolete registry dataset', async () => {
    listRecentMetadata.mockResolvedValue([{ ulid: REGISTRY, title: 'Entity registry', realmId: 'group-1' }])
    fetchRoCrateRaw.mockResolvedValue(legacyRegistry())
    const result = await registry.findRecentCandidates()
    expect(result.candidates).toEqual([])
  })
})

describe('findCandidates', () => {
  it('finds typed entities and retains their source graph', async () => {
    runSparql.mockResolvedValue(graphs(OTHER, OWN))
    const result = await registry.findCandidates('Person', { groupId: 'group-1', excludeDocumentId: OWN })
    expect(runSparql.mock.calls[0]).toEqual([
      'SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s a <http://schema.org/Person> } } LIMIT 20',
      'distributed-best-effort',
    ])
    expect(result.partial).toBe(false)
    expect(result.candidates.map((item) => [item.reference, item.source.title])).toEqual([
      [adaReference, 'Other dataset'],
    ])
    expect(result.candidates[0].related).toEqual([institute])
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
    fetchRoCrateRaw.mockResolvedValue(legacyRegistry())
    const result = await registry.findCandidates('CreativeWork')
    expect(result.candidates).toEqual([])
  })

  it('reports a failed discovery', async () => {
    runSparql.mockRejectedValue(new Error('offline'))
    await expect(registry.findCandidates('Person')).rejects.toThrow('offline')
  })
})
