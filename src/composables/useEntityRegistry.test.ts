import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { newDraft, toRoCrate } from '@/lib/crate/editor'
import type { DraftEntity } from '@/lib/crate/editor'

const REGISTRY = '01JREG0000000000000000000A'
const OTHER = '01J0THER00000000000000000A'
const OWN = '01J0WN000000000000000000AB'
const SAVED = '01J00000000000000000000004'

const fetchRoCrateRaw = vi.fn()
const getMetadataDocument = vi.fn()
const listCatalogPage = vi.fn()

let registry: typeof import('./useEntityRegistry')

beforeAll(async () => {
  vi.doMock('./aruna/crates', () => ({ fetchRoCrateRaw }))
  vi.doMock('./aruna/catalog', () => ({ listCatalogPage, CATALOG_PAGE_SIZE: 2 }))
  vi.doMock('./aruna/documents', () => ({ getMetadataDocument }))
  registry = await import('./useEntityRegistry')
})

afterAll(() => {
  vi.doUnmock('./aruna/crates')
  vi.doUnmock('./aruna/catalog')
  vi.doUnmock('./aruna/documents')
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

function metadata(document_id: string, group_id = 'group-1', isPublic = false) {
  return { document_id, group_id, public: isPublic, document_path: `datasets/${document_id}` }
}

function documents(own: ReturnType<typeof metadata>[], publicDocuments: ReturnType<typeof metadata>[] = []) {
  listCatalogPage.mockImplementation(async (options) => {
    const source = options.groupId ? own : publicDocuments
    const offset = options.offset ?? 0
    const page = source.slice(offset, offset + 2)
    return { documents: page, limit: 2, offset, total_returned: page.length }
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  fetchRoCrateRaw.mockImplementation(async (id: string) => sourceCrate(id))
  getMetadataDocument.mockResolvedValue({ group_id: 'group-1', document_path: 'datasets/example' })
  documents([])
})

describe('group entity discovery', () => {
  it('prioritizes group datasets over more recent public sources', async () => {
    documents([metadata(SAVED)], [metadata(OTHER, 'group-2', true)])
    const result = await registry.findRecentCandidates({ groupId: 'group-1', excludeDocumentId: OWN })
    expect(result.candidates.map((item) => item.reference)).toEqual([
      graceReference, adaReference, { documentId: OTHER, entityId: institute.id },
    ])
    expect(listCatalogPage.mock.calls[0][0]).toEqual(expect.objectContaining({ groupId: 'group-1', order: 'recent' }))
    expect(result.candidates[1].related).toEqual([institute])
    expect(result.candidates[1].source.public).toBe(true)
    expect(result.partial).toBe(false)
  })

  it('searches the entire group corpus beyond the first eight datasets', async () => {
    const older = Array.from({ length: 12 }, (_, i) => metadata(`document-${i}`))
    documents([...older, metadata(SAVED)])
    fetchRoCrateRaw.mockImplementation(async (id) => id === SAVED ? sourceCrate(id) : dataset('Other work', []))
    const result = await registry.findRecentCandidates({ groupId: 'group-1', query: 'grace' })
    expect(result.candidates.map((item) => item.reference)).toEqual([graceReference])
    expect(listCatalogPage.mock.calls.some(([options]) => options.groupId === 'group-1' && options.offset >= 8)).toBe(true)
    expect(result.loadMore).toBeUndefined()
  })

  it('bounds initial entities and loads further matches without a document cap', async () => {
    documents([metadata(SAVED)])
    fetchRoCrateRaw.mockResolvedValue(dataset('Many people', Array.from({ length: 25 }, (_, i) => ({
      ...grace, id: `#person-${i}`, properties: { name: [{ kind: 'text', value: `Person ${i}` }] },
    }))))
    const first = await registry.findCandidates('Person', { groupId: 'group-1' })
    expect(first.candidates).toHaveLength(20)
    const second = await first.loadMore!()
    expect(second.candidates).toHaveLength(5)
    expect(second.loadMore).toBeUndefined()
    expect(new Set([...first.candidates, ...second.candidates].map((candidate) => candidate.reference.entityId)).size).toBe(25)
    expect(fetchRoCrateRaw).toHaveBeenCalledOnce()
  })

  it('never supplements with private datasets from another group', async () => {
    documents([], [metadata(OTHER, 'group-2', false), metadata(SAVED, 'group-2', true)])
    const result = await registry.findCandidates('Person', { groupId: 'group-1' })
    expect(result.candidates.map((item) => item.reference)).toEqual([graceReference])
    expect(fetchRoCrateRaw.mock.calls.some(([id]) => id === OTHER)).toBe(false)
  })

  it('excludes the current dataset and retains unreadable-source coverage', async () => {
    documents([metadata(OWN), metadata(SAVED)])
    fetchRoCrateRaw.mockRejectedValue(new Error('forbidden'))
    const result = await registry.findRecentCandidates({ groupId: 'group-1', excludeDocumentId: OWN })
    expect(fetchRoCrateRaw).toHaveBeenCalledOnce()
    expect(result).toEqual({ candidates: [], partial: true })
  })

  it('does not offer entities from obsolete registry documents', async () => {
    documents([metadata(REGISTRY)])
    fetchRoCrateRaw.mockResolvedValue(legacyRegistry())
    const result = await registry.findRecentCandidates({ groupId: 'group-1' })
    expect(result.candidates).toEqual([])
  })

  it('does not merge equal fragment ids from different source datasets', async () => {
    documents([metadata(OTHER), metadata(SAVED)])
    fetchRoCrateRaw.mockImplementation(async (id) => dataset(id, [{ ...grace, properties: {
      name: [{ kind: 'text', value: id === OTHER ? 'Alice' : 'Bob' }],
    } }]))
    const result = await registry.findCandidates('Person', { groupId: 'group-1' })
    expect(result.candidates.map((item) => item.reference.documentId)).toEqual([OTHER, SAVED])
  })

  it('stops scanning a cancelled search', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(registry.findRecentCandidates({ groupId: 'group-1', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(listCatalogPage).not.toHaveBeenCalled()
  })

  it('reports a failed discovery', async () => {
    listCatalogPage.mockRejectedValue(new Error('offline'))
    await expect(registry.findCandidates('Person', { groupId: 'group-1' })).rejects.toThrow('offline')
  })
})
