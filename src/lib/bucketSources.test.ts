import { describe, expect, it } from 'vitest'
import type { SyncRelationship } from '@/lib/api'
import type { ReferenceSourceGroup } from '@/lib/references'
import { formatNumber } from '@/lib/utils'
import { sourceRows } from './bucketSources'

const group: ReferenceSourceGroup = {
  key: 'c1||s3',
  kind: 's3',
  connectorId: 'c1',
  count: 1_200,
  bytes: 5,
  sourcePaths: [],
}

function relationship(id: string, mode: SyncRelationship['mode']): SyncRelationship {
  return {
    id,
    source: 'arn:aruna:realm:node-2:s3/results/raw',
    target: 'arn:aruna:realm:node-1:s3/shared',
    mode,
    reference_handling: 'materialize',
    replicate_deletes: false,
    created_by: 'u1',
    created_at: '2026-10-01T00:00:00Z',
    state: 'enabled',
    status: { counters: { versions_synced: 0, bytes_synced: 0, failures: 0, consecutive_failures: 0 } },
  }
}

describe('bucket sources', () => {
  it('lists referenced sources and buckets that a sync copies from', () => {
    const rows = sourceRows([group], [relationship('s1', 'continuous')], (id) => `Node ${id}`)

    expect(rows.map((row) => [row.question, row.value])).toEqual([
      ['elsewhere', `${formatNumber(1_200)} files, read from the source`],
      ['sync', 'Copied by a sync: keep in sync'],
    ])
    expect(rows[1].label).toBe('results/raw on Node node-2')
  })

  it('lists nothing for a bucket that has no known source', () => {
    expect(sourceRows([], [], (id) => id)).toEqual([])
  })
})
