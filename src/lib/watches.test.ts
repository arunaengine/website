import { describe, expect, it } from 'vitest'
import {
  dataWatchPathPrefix,
  eventsFor,
  isSyncEventKind,
  metaWatchPathPrefix,
  parseWatchPath,
} from '@/lib/watches'

describe('watch event availability', () => {
  it('offers only the dataset kind in the meta namespace', () => {
    expect(eventsFor('meta').map((info) => info.kind)).toEqual(['metadata_created'])
  })

  it('offers the three data kinds in the s3 namespace', () => {
    expect(eventsFor('s3').map((info) => info.kind)).toEqual([
      'data_uploaded',
      'sync_completed',
      'sync_failed',
    ])
  })

  it('says that a dataset watch covers new datasets only', () => {
    const [dataset] = eventsFor('meta')

    expect(dataset.description).toContain('new dataset is created under this path')
    expect(dataset.description).toContain('Edits to a dataset that already exists are not covered')
  })

  it('marks the two source-bound sync kinds', () => {
    expect(isSyncEventKind('sync_completed')).toBe(true)
    expect(isSyncEventKind('sync_failed')).toBe(true)
    expect(isSyncEventKind('data_uploaded')).toBe(false)
  })
})

describe('watch prefix builders', () => {
  it('keeps the slash after the bucket for a bucket root', () => {
    expect(dataWatchPathPrefix('g1', 'n1', 'reef', '')).toBe('s3/g1/n1/reef/')
    expect(dataWatchPathPrefix('g1', 'n1', 'reef', 'raw/2024/')).toBe('s3/g1/n1/reef/raw/2024/')
  })

  it('strips surrounding slashes from a document path', () => {
    expect(metaWatchPathPrefix('g1', '/surveys/reef/')).toBe('meta/g1/surveys/reef')
  })

  it('builds the group-wide dataset prefix from an empty path', () => {
    expect(metaWatchPathPrefix('g1', '')).toBe('meta/g1/')
  })
})

describe('watch path parsing', () => {
  it('splits a data prefix into node, bucket and key prefix', () => {
    const info = parseWatchPath('s3/g1/n1/reef/raw/')

    expect(info).toMatchObject({ namespace: 's3', groupId: 'g1', nodeId: 'n1', bucket: 'reef', prefix: 'raw/' })
    expect(info?.label).toBe('reef/raw/')
  })

  it('parses a bucket root without a key prefix', () => {
    expect(parseWatchPath('s3/g1/n1/reef/')).toMatchObject({ bucket: 'reef', prefix: '' })
  })

  it('names the empty meta prefix as the whole group', () => {
    const info = parseWatchPath('meta/g1/')

    expect(info).toMatchObject({ namespace: 'meta', groupId: 'g1', prefix: '' })
    expect(info?.label).toBe('All datasets of the group')
  })

  it('keeps the document path as the label', () => {
    expect(parseWatchPath('meta/g1/surveys/reef')?.label).toBe('surveys/reef')
  })

  it('returns null for a shape it does not know', () => {
    expect(parseWatchPath('surveys/reef')).toBeNull()
    expect(parseWatchPath('s3/g1/n1')).toBeNull()
  })
})
