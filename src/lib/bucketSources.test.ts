import { describe, expect, it } from 'vitest'
import type { FileSource } from '@/lib/api'
import { sourceRows } from './bucketSources'

const sync: FileSource = { kind: 'sync', relationship_id: 's1', source: 'arn:aruna:realm:node-2:s3/results/raw', mode: 'continuous' }
const storage: FileSource = { kind: 'storage', import_id: 'i1', backend_id: 'b1', backend_prefix: '/lab/2026/', key_prefix: 'raw/' }

describe('bucket sources', () => {
  it('lists the buckets that a sync copies from', () => {
    const rows = sourceRows([sync], (id) => `Node ${id}`, (id) => id)

    expect(rows.map((row) => [row.question, row.value])).toEqual([['sync', 'Copied by a sync: keep in sync']])
    expect(rows[0].label).toBe('results/raw on Node node-2')
  })

  it('lists a storage folder registered in place with the name of its backend', () => {
    const rows = sourceRows([storage], (id) => id, (id) => `Lab share ${id}`)

    expect(rows[0]).toMatchObject({ question: 'elsewhere', label: 'Storage folder Lab share b1/lab/2026', value: 'Registered in place under raw/, not copied' })
  })

  it('lists nothing for a bucket that has no known source', () => {
    expect(sourceRows([], (id) => id, (id) => id)).toEqual([])
  })
})
