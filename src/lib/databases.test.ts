import { describe, expect, it } from 'vitest'
import type { BucketSearchHit } from '@/lib/api'
import { databaseOf, datasetIdOf, pageIdentifier, pageText, placeOf, rowsOf, sameTarget, searchRows, targetOf, withPage } from './databases'

function hit(bucket: string, node: string, extra: Partial<BucketSearchHit> = {}): BucketSearchHit {
  return {
    arn: `arn:aruna:r:${node}:s3/${bucket}`, bucket, node_id: node, group_id: 'g1', created_at: '2026-10-28T00:00:00Z',
    metadata: { database: true, dataset: `d-${bucket}` }, description: { title: `${bucket} database`, identifiers: [] }, public: false, ...extra,
  }
}

const set = { kind: 'distributed' as const, set_id: 's1' }
const ordinary = (node: string, bucket: string) => ({ kind: 'ordinary' as const, node_id: node, bucket })

describe('database rows', () => {
  it('makes one row per bucket and joins the members of a set', () => {
    const rows = rowsOf([hit('spire', 'n1', { set_id: 's1' }), hit('lab', 'n1'), hit('spire', 'n2', { set_id: 's1' }), hit('lab', 'n2')])

    expect(rows.map((row) => row.bucket)).toEqual(['spire', 'lab', 'lab'])
    expect(rows[0].places).toEqual([{ bucket: 'spire', nodeId: 'n1' }, { bucket: 'spire', nodeId: 'n2' }])
    expect(rows[0].target).toEqual(set)
  })

  it('leaves out hits without database metadata and keeps a title it cannot read empty', () => {
    const rows = rowsOf([hit('plain', 'n1', { metadata: null }), hit('off', 'n1', { metadata: { database: false } }), hit('x', 'n1', { metadata: { database: true, dataset: 'd1' }, description: null })])

    expect(rows.map((row) => [row.bucket, row.title, row.description, row.datasetId])).toEqual([['x', null, null, 'd1']])
  })

  it('finds the database of a set by its id and of an ordinary bucket by node and name', () => {
    const rows = rowsOf([hit('spire', 'n1', { set_id: 's1' }), hit('lab', 'n1')])

    expect(databaseOf(rows, set)?.bucket).toBe('spire')
    expect(databaseOf(rows, ordinary('n1', 'lab'))?.bucket).toBe('lab')
    expect(databaseOf(rows, ordinary('n2', 'lab'))).toBeUndefined()
    expect(databaseOf(rows, ordinary('n1', 'spire'))).toBeUndefined()
  })

  it('names the target of a bucket by its set or by node and name', () => {
    expect(targetOf('spire', 'n1', 's1')).toEqual(set)
    expect(targetOf('lab', 'n1', null)).toEqual(ordinary('n1', 'lab'))
    expect(sameTarget(ordinary('n1', 'lab'), ordinary('n2', 'lab'))).toBe(false)
    expect(sameTarget(set, ordinary('n1', 'lab'))).toBe(false)
  })

  it('opens a database on this node when it holds it, else on the first node that answered', () => {
    const [row] = rowsOf([hit('spire', 'n2', { set_id: 's1' }), hit('spire', 'n1', { set_id: 's1' })])

    expect(placeOf(row, 'n1')).toEqual({ bucket: 'spire', nodeId: 'n1' })
    expect(placeOf(row, 'n9')).toEqual({ bucket: 'spire', nodeId: 'n2' })
  })

  it('searches the title and the bucket for every word', () => {
    const rows = rowsOf([hit('spire', 'n1', { description: { title: 'SPIRE microbiome', identifiers: [] } }), hit('refseq', 'n1')])

    expect(searchRows(rows, 'microbiome spire').map((row) => row.bucket)).toEqual(['spire'])
    expect(searchRows(rows, 'a')).toEqual([])
  })
})

describe('DOI or link field', () => {
  it('reads a DOI in any common form and a plain link', () => {
    const doi = { name: 'DOI', value: '10.5281/zenodo.4247252', url: 'https://doi.org/10.5281/zenodo.4247252' }
    expect(pageIdentifier('10.5281/zenodo.4247252')).toEqual(doi)
    expect(pageIdentifier('doi:10.5281/zenodo.4247252')).toEqual(doi)
    expect(pageIdentifier('https://doi.org/10.5281/zenodo.4247252')).toEqual(doi)
    expect(pageIdentifier('https://bakta.example.org')).toEqual({ name: 'Link', value: 'https://bakta.example.org', url: 'https://bakta.example.org' })
    expect(pageIdentifier('not a link')).toBeNull()
  })

  it('replaces only the first DOI or link and keeps other identifiers', () => {
    const other = { name: 'RRID', value: 'SCR_1', url: 'https://scicrunch.org/SCR_1' }
    const old = { name: 'DOI', value: '10.1234/a', url: 'https://doi.org/10.1234/a' }

    expect(withPage([other, old], '10.1234/b')).toEqual([other, { name: 'DOI', value: '10.1234/b', url: 'https://doi.org/10.1234/b' }])
    expect(withPage([other, old], '')).toEqual([other])
    expect(withPage([other], 'https://x.org')[0].name).toBe('Link')
    expect(pageText([other, old])).toBe('10.1234/a')
  })
})

describe('dataset links', () => {
  it('reads a dataset id from the id, its w3id or a portal link', () => {
    const id = '01M63099Q2000108CB51QQDB2P'
    expect(datasetIdOf(` ${id} `)).toBe(id)
    expect(datasetIdOf(`https://w3id.org/aruna/${id.toLowerCase()}`)).toBe(id)
    expect(datasetIdOf(`https://v3-debug.aruna-engine.org/app/datasets/${id}/edit`)).toBe(id)
    expect(datasetIdOf('datasets/run-42')).toBeNull()
  })
})
