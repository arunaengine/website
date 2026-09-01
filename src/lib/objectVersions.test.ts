import { describe, expect, it } from 'vitest'
import { deletedEntries, keyVersions, sortVersions, type VersionPage } from './objectVersions'

const page: VersionPage = {
  Versions: [
    {
      Key: 'notes.txt',
      VersionId: '01J2',
      IsLatest: true,
      Size: 20,
      LastModified: new Date('2026-02-02T00:00:00Z'),
      ETag: '"abc"',
    },
    {
      Key: 'notes.txt',
      VersionId: '01J1',
      IsLatest: false,
      Size: 10,
      LastModified: new Date('2026-01-01T00:00:00Z'),
    },
    { Key: 'notes.txt.bak', VersionId: '01J9', IsLatest: true, Size: 99 },
    { Key: 'notes.txt', IsLatest: false, Size: 5 },
  ],
  DeleteMarkers: [
    { Key: 'notes.txt', VersionId: '01J3', IsLatest: false, LastModified: new Date('2026-03-03T00:00:00Z') },
    { Key: 'notes.txt.bak', VersionId: '01JA', IsLatest: false },
  ],
}

describe('object version pages', () => {
  it('keeps only the exact key', () => {
    // A prefix listing also answers with notes.txt.bak.
    const entries = keyVersions(page, 'notes.txt')

    expect(entries.map((entry) => entry.versionId)).toEqual(['01J2', '01J1', '01J3'])
    expect(entries.filter((entry) => entry.deleteMarker)).toHaveLength(1)
    expect(entries[0].etag).toBe('abc')
  })

  it('drops a row without a version id', () => {
    expect(keyVersions(page, 'notes.txt').every((entry) => entry.versionId)).toBe(true)
  })

  it('sorts newest first', () => {
    const sorted = sortVersions(keyVersions(page, 'notes.txt'))

    expect(sorted.map((entry) => entry.versionId)).toEqual(['01J3', '01J2', '01J1'])
    expect(sorted[0].deleteMarker).toBe(true)
  })

  it('falls back to the version id order without timestamps', () => {
    const sorted = sortVersions([
      { key: 'a', versionId: '01A', isLatest: false, deleteMarker: false },
      { key: 'a', versionId: '01C', isLatest: true, deleteMarker: false },
      { key: 'a', versionId: '01B', isLatest: false, deleteMarker: false },
    ])

    expect(sorted.map((entry) => entry.versionId)).toEqual(['01C', '01B', '01A'])
  })

  it('lists marker-headed keys under one prefix only', () => {
    const listing: VersionPage = {
      DeleteMarkers: [
        { Key: 'raw/one.txt', VersionId: 'm1', IsLatest: true, LastModified: new Date('2026-01-01T00:00:00Z') },
        { Key: 'raw/two.txt', VersionId: 'm2', IsLatest: false },
        { Key: 'raw/deep/three.txt', VersionId: 'm3', IsLatest: true },
        { Key: 'other/four.txt', VersionId: 'm4', IsLatest: true },
        { Key: 'raw/', VersionId: 'm5', IsLatest: true },
      ],
    }

    expect(deletedEntries(listing, 'raw/')).toEqual([
      {
        key: 'raw/one.txt',
        name: 'one.txt',
        markerVersionId: 'm1',
        lastModified: new Date('2026-01-01T00:00:00Z'),
      },
    ])
  })
})
