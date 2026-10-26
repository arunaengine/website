import { describe, expect, it } from 'vitest'
import type { OriginResponse } from '@/lib/api'
import { hopFrom, originFrom, projectionRows, type OriginLabels } from './fileOrigin'

const labels: OriginLabels = {
  user: (id) => `user ${id}`,
  node: (id) => `node ${id}`,
  database: (id) => (id === 'e1' ? 'SPIRE' : null),
  backend: (id) => `folder ${id}`,
}

function response(extra: Partial<OriginResponse>): OriginResponse {
  return { version_id: 'v1', created_by: 'u1', created_at: '2026-10-20T10:12:00Z', projection: [], ...extra }
}

describe('file origin', () => {
  it('says who uploaded a version, where and from which device', () => {
    const origin = originFrom(response({ origin: { kind: 'upload', node_id: 'n1', device: 'laptop' } }), labels)

    expect(origin).toEqual({ kind: 'upload', user: 'user u1', node: 'node n1', time: '2026-10-20T10:12:00Z', device: 'laptop' })
  })

  it('names the source with its public url, its etag and the first digest, and the database', () => {
    const origin = originFrom(
      response({
        origin: { kind: 'source', database_entry: 'e1' },
        source: {
          url: 'https://s3.example.org/bakrep/a/genome.fna.gz',
          path: 'a/genome.fna.gz',
          etag: '"abc"',
          digests: [{ algorithm: 'sha256', digest: 'ff00', scope: 'full_object', origin: 'manifest' }],
        },
      }),
      labels,
    )

    expect(origin).toEqual({
      kind: 'source',
      source: 'https://s3.example.org',
      path: 'a/genome.fna.gz',
      url: 'https://s3.example.org/bakrep/a/genome.fna.gz',
      etag: '"abc"',
      digest: 'sha256:ff00',
      database: 'SPIRE',
    })
  })

  it('keeps a source without a public url, and a database that is not listed for the user', () => {
    const origin = originFrom(
      response({ origin: { kind: 'source', database_entry: 'e9' }, source: { path: 'drive/a.bin', digests: [] } }),
      labels,
    )

    expect(origin).toEqual({ kind: 'source', source: '', path: 'drive/a.bin', database: 'a database' })
  })

  it('reads copies, storage folders and runs', () => {
    expect(originFrom(response({ origin: { kind: 'copy', from: 'https://w3id.org/aruna/data/r/v0' } }), labels)).toEqual({ kind: 'copy', from: 'https://w3id.org/aruna/data/r/v0' })
    expect(originFrom(response({ origin: { kind: 'storage', backend_id: 'b1', key: 'share/a' } }), labels)).toEqual({ kind: 'storage', folder: 'folder b1', key: 'share/a' })
    expect(originFrom(response({ origin: { kind: 'job', run_id: 'run1' } }), labels)).toEqual({ kind: 'job', run: 'run1' })
  })

  it('gives no origin for a version minted without one, and a hop apart from the origin', () => {
    expect(originFrom(response({}), labels)).toBeNull()
    expect(hopFrom(response({}))).toBeNull()
    expect(hopFrom(response({ hop: { relationship_id: 's1', from: 'https://w3id.org/aruna/data/r/v0' } }))).toEqual({ kind: 'sync', sync: 's1', from: 'https://w3id.org/aruna/data/r/v0' })
  })

  it('lists the statements a dataset may add', () => {
    const rows = projectionRows([{ property: 'isBasedOn', id: 'https://x/y' }, { property: 'CreateAction', run_id: 'run1' }])

    expect(rows.map((row) => [row.property, row.value])).toEqual([['isBasedOn', 'https://x/y'], ['CreateAction', 'run1']])
    expect(projectionRows([])).toEqual([])
  })
})
