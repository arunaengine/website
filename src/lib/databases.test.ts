import { describe, expect, it } from 'vitest'
import type { DatabaseRequestView, DatabaseView } from '@/lib/api'
import { briefOf, databaseCrate, databaseOf, placeOf, requestOf, rowOf, sameTarget, searchRows, targetOf, withBucketPart } from './databases'

function view(bucket: string, target: DatabaseView['target'], extra: Partial<DatabaseView> = {}): DatabaseView {
  return { entry_id: `e-${bucket}`, dataset_id: `d-${bucket}`, owner_group: 'g1', target, bucket, state: 'active', public: false, title: `${bucket} database`, ...extra }
}

const set = { kind: 'distributed' as const, set_id: 's1' }
const ordinary = (node: string, bucket: string) => ({ kind: 'ordinary' as const, node_id: node, bucket })

describe('database rows', () => {
  it('keeps the ids and leaves a missing title empty', () => {
    const row = rowOf(view('spire', set, { title: undefined, state: 'description_unavailable' }))

    expect(row).toMatchObject({ entryId: 'e-spire', datasetId: 'd-spire', bucket: 'spire', title: null, state: 'description_unavailable' })
  })

  it('finds the database of a set by its id and of an ordinary bucket by node and name', () => {
    const rows = [rowOf(view('spire', set)), rowOf(view('lab', ordinary('n1', 'lab')))]

    expect(databaseOf(rows, set)?.entryId).toBe('e-spire')
    expect(databaseOf(rows, ordinary('n1', 'lab'))?.entryId).toBe('e-lab')
    expect(databaseOf(rows, ordinary('n2', 'lab'))).toBeUndefined()
  })

  it('never takes the database of another set or an ordinary bucket that only shares the name', () => {
    const rows = [rowOf(view('spire', set))]

    expect(databaseOf(rows, { kind: 'distributed', set_id: 's2' })).toBeUndefined()
    expect(databaseOf(rows, ordinary('n1', 'spire'))).toBeUndefined()
  })

  it('names the target of a bucket by its set or by node and name', () => {
    expect(targetOf('spire', 'n1', 's1')).toEqual(set)
    expect(targetOf('lab', 'n1', null)).toEqual(ordinary('n1', 'lab'))
    expect(sameTarget(set, { kind: 'distributed', set_id: 's1' })).toBe(true)
    expect(sameTarget(ordinary('n1', 'lab'), ordinary('n2', 'lab'))).toBe(false)
    expect(sameTarget(set, ordinary('n1', 'lab'))).toBe(false)
  })

  it('opens an ordinary bucket on its node and a set here only when this node holds it', () => {
    const root = { id: 'r', bucket: 'spire-here', prefix: '', set_id: 's1', held_here: true }

    expect(placeOf(rowOf(view('lab', ordinary('n1', 'lab'))), null, 'n9')).toEqual({ bucket: 'lab', nodeId: 'n1' })
    expect(placeOf(rowOf(view('spire', set)), root, 'n9')).toEqual({ bucket: 'spire-here', nodeId: 'n9' })
    expect(placeOf(rowOf(view('spire', set)), { ...root, held_here: false }, 'n9')).toBeNull()
    expect(placeOf(rowOf(view('spire', set)), { ...root, bucket: null }, 'n9')).toBeNull()
  })

  it('matches a pending request to its target', () => {
    const request = { request_id: 'r1', entry: { entry_id: 'e', dataset_id: 'd', owner_group: 'g', target: ordinary('n1', 'lab') }, curator: 'u', created_at_ms: 1 } as DatabaseRequestView

    expect(requestOf([request], ordinary('n1', 'lab'))?.request_id).toBe('r1')
    expect(requestOf([request], set)).toBeUndefined()
  })

  it('searches the title and the bucket for every word', () => {
    const rows = [rowOf(view('spire', set, { title: 'SPIRE microbiome' })), rowOf(view('refseq', set, { title: 'NCBI RefSeq' }))]

    expect(searchRows(rows, 'microbiome spire').map((row) => row.bucket)).toEqual(['spire'])
    expect(searchRows(rows, 'refseq')).toHaveLength(1)
    expect(searchRows(rows, 'a')).toEqual([])
  })

  it('reads the name, description and license of the root dataset', () => {
    const crate = {
      '@graph': [
        { '@id': 'ro-crate-metadata.json', about: { '@id': './' } },
        { '@id': './', name: 'SPIRE', description: 'Microbiome reference', license: { '@id': 'https://spdx.org/licenses/CC-BY-4.0' } },
      ],
    }

    expect(briefOf(crate)).toEqual({ name: 'SPIRE', description: 'Microbiome reference', license: 'https://spdx.org/licenses/CC-BY-4.0' })
    expect(briefOf(null)).toEqual({ name: '', description: '', license: '' })
  })
})

describe('database datasets', () => {
  const PART = 'https://w3id.org/aruna/data/r1/s1/'
  const rootOf = (crate: unknown) => (crate as { '@graph': Record<string, unknown>[] })['@graph'].find((entity) => entity['@id'] === './')

  it('makes a new dataset whose root names the bucket root as a Dataset part', () => {
    const crate = databaseCrate({ name: ' SPIRE ', description: '', version: '2026-10', license: 'https://creativecommons.org/licenses/by/4.0/', page: 'https://spire.embl.de' }, PART, 'spire-db')
    expect(rootOf(crate)).toMatchObject({
      name: 'SPIRE',
      version: '2026-10',
      license: { '@id': 'https://creativecommons.org/licenses/by/4.0/' },
      url: 'https://spire.embl.de',
      hasPart: [{ '@id': PART }],
    })
    expect(rootOf(crate)).not.toHaveProperty('description')
    expect((crate as { '@graph': unknown[] })['@graph']).toContainEqual({ '@id': PART, '@type': 'Dataset', name: 'spire-db' })
  })

  it('keeps a DOI as the identifier and plain text as text', () => {
    const crate = databaseCrate({ name: 'Bakta', description: '', version: '', license: 'CC BY 4.0', page: 'https://doi.org/10.5281/zenodo.10522951' }, PART, 'bakta-db')
    expect(rootOf(crate)).toMatchObject({ identifier: 'https://doi.org/10.5281/zenodo.10522951', license: 'CC BY 4.0' })
    expect(rootOf(crate)).not.toHaveProperty('url')
  })

  it('adds the part once, types a named but untyped part, and leaves a linked dataset alone', () => {
    const base = { '@graph': [{ '@id': 'ro-crate-metadata.json', about: { '@id': './' } }, { '@id': './', '@type': 'Dataset', hasPart: { '@id': 'x' } }] }
    const added = withBucketPart(base, PART, 'bakrep')
    expect(rootOf(added)?.hasPart).toEqual([{ '@id': 'x' }, { '@id': PART }])
    expect(withBucketPart(added, PART, 'bakrep')).toBeNull()

    const untyped = { '@graph': [...base['@graph'].slice(0, 1), { '@id': './', hasPart: [{ '@id': PART }] }, { '@id': PART, '@type': 'File' }] }
    const typed = withBucketPart(untyped, PART, 'bakrep') as { '@graph': Record<string, unknown>[] }
    expect(rootOf(typed)?.hasPart).toEqual([{ '@id': PART }])
    expect(typed['@graph'].find((entity) => entity['@id'] === PART)?.['@type']).toEqual(['File', 'Dataset'])
  })
})
