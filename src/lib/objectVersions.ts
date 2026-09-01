// Reading an S3 ListObjectVersions page. The listing is prefix-based, so the
// exact key is always filtered here: `notes` and `notes.txt` share a prefix.

/** The fields of one version or delete-marker row the portal reads. */
export interface VersionRecord {
  Key?: string
  VersionId?: string
  IsLatest?: boolean
  Size?: number
  LastModified?: Date
  ETag?: string
}

export interface VersionPage {
  Versions?: VersionRecord[]
  DeleteMarkers?: VersionRecord[]
}

export interface ObjectVersionEntry {
  key: string
  versionId: string
  /** The head pointer: exactly one entry per key carries it. */
  isLatest: boolean
  deleteMarker: boolean
  size?: number
  lastModified?: Date
  etag?: string
}

/** A key whose head is a delete marker: gone from the listing, restorable. */
export interface DeletedObjectEntry {
  key: string
  name: string
  markerVersionId: string
  lastModified?: Date
}

/** Every version and delete marker of one exact key, in page order. */
export function keyVersions(page: VersionPage, key: string): ObjectVersionEntry[] {
  const entries: ObjectVersionEntry[] = []
  for (const record of page.Versions ?? []) {
    if (record.Key !== key || !record.VersionId) continue
    entries.push({
      key,
      versionId: record.VersionId,
      isLatest: Boolean(record.IsLatest),
      deleteMarker: false,
      size: record.Size,
      lastModified: record.LastModified,
      etag: record.ETag?.replaceAll('"', ''),
    })
  }
  for (const record of page.DeleteMarkers ?? []) {
    if (record.Key !== key || !record.VersionId) continue
    entries.push({
      key,
      versionId: record.VersionId,
      isLatest: Boolean(record.IsLatest),
      deleteMarker: true,
      lastModified: record.LastModified,
    })
  }
  return entries
}

/**
 * Newest first. Version ids are ULIDs, so their descending order is already
 * chronological; the timestamp decides first so a store with other ids still
 * sorts correctly.
 */
export function sortVersions(entries: ObjectVersionEntry[]): ObjectVersionEntry[] {
  return [...entries].sort((left, right) => {
    const leftTime = left.lastModified?.getTime() ?? 0
    const rightTime = right.lastModified?.getTime() ?? 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return right.versionId.localeCompare(left.versionId)
  })
}

/**
 * Keys directly under `prefix` whose head is a delete marker. A delimited
 * listing keeps deeper keys in CommonPrefixes, but the check is repeated here
 * so a store that answers without the delimiter cannot leak nested keys.
 */
export function deletedEntries(page: VersionPage, prefix: string): DeletedObjectEntry[] {
  const entries: DeletedObjectEntry[] = []
  for (const record of page.DeleteMarkers ?? []) {
    if (!record.IsLatest || !record.Key || !record.VersionId) continue
    if (!record.Key.startsWith(prefix)) continue
    const name = record.Key.slice(prefix.length)
    if (!name || name.includes('/')) continue
    entries.push({
      key: record.Key,
      name,
      markerVersionId: record.VersionId,
      lastModified: record.LastModified,
    })
  }
  return entries
}
