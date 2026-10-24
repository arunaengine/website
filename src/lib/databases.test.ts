import { describe, expect, it } from 'vitest'
import type { DatabaseRequestView, DatabaseView } from '@/lib/api'
import { briefOf, databaseOf, openNode, requestOf, rowOf, sameTarget, searchRows, targetOf } from './databases'

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

  it('finds the database of a bucket by name, and for an ordinary bucket by node', () => {
    const rows = [rowOf(view('spire', set)), rowOf(view('lab', ordinary('n1', 'lab')))]

    expect(databaseOf(rows, 'spire', 'n9')?.entryId).toBe('e-spire')
    expect(databaseOf(rows, 'lab', 'n1')?.entryId).toBe('e-lab')
    expect(databaseOf(rows, 'lab', 'n2')).toBeUndefined()
  })

  it('names the target of a bucket by its set or by node and name', () => {
    expect(targetOf('spire', 'n1', 's1')).toEqual(set)
    expect(targetOf('lab', 'n1', null)).toEqual(ordinary('n1', 'lab'))
    expect(sameTarget(set, { kind: 'distributed', set_id: 's1' })).toBe(true)
    expect(sameTarget(ordinary('n1', 'lab'), ordinary('n2', 'lab'))).toBe(false)
    expect(sameTarget(set, ordinary('n1', 'lab'))).toBe(false)
  })

  it('opens a set on the asked node and an ordinary bucket on its own', () => {
    expect(openNode(rowOf(view('spire', set)), 'n9')).toBe('n9')
    expect(openNode(rowOf(view('lab', ordinary('n1', 'lab'))), 'n9')).toBe('n1')
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
