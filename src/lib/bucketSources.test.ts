import { describe, expect, it } from 'vitest'
import type { FileSource } from '@/lib/api'
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

const sync: FileSource = { kind: 'sync', relationship_id: 's1', source: 'arn:aruna:realm:node-2:s3/results/raw', mode: 'continuous' }
const storage: FileSource = { kind: 'storage', import_id: 'i1', backend_id: 'b1', backend_prefix: '/lab/2026/', key_prefix: 'raw/' }

describe('bucket sources', () => {
  it('lists referenced sources and buckets that a sync copies from', () => {
    const rows = sourceRows([group], [sync], (id) => `Node ${id}`, (id) => id)

    expect(rows.map((row) => [row.question, row.value])).toEqual([
      ['elsewhere', `${formatNumber(1_200)} files, read from the source`],
      ['sync', 'Copied by a sync: keep in sync'],
    ])
    expect(rows[1].label).toBe('results/raw on Node node-2')
  })

  it('lists a storage folder registered in place with the name of its backend', () => {
    const rows = sourceRows([], [storage], (id) => id, (id) => `Lab share ${id}`)

    expect(rows[0]).toMatchObject({ question: 'elsewhere', label: 'Storage folder Lab share b1/lab/2026', value: 'Registered in place under raw/, not copied' })
  })

  it('lists nothing for a bucket that has no known source', () => {
    expect(sourceRows([], [], (id) => id, (id) => id)).toEqual([])
  })
})
