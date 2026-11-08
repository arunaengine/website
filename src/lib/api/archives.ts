// ZIP downloads of ticked files and folders. POST /data/archives/links answers a single-use path on
// the bucket's node that a browser opens within 60 seconds; the node builds the ZIP while it sends.
import { apiRequest, type ApiClientOptions } from './client'

/** One file with `key`, or one folder with `prefix` (empty for the whole bucket). */
export interface ArchiveEntry {
  bucket: string
  key?: string
  prefix?: string
}

export interface ArchiveLink {
  /** The download path on the node, `/api/v1/data/archives/download?ticket=...`. */
  path: string
  expires_at: string
}

export function createArchiveLink(entries: ArchiveEntry[], client: ApiClientOptions = {}): Promise<ArchiveLink> {
  return apiRequest<ArchiveLink>('/data/archives/links', { method: 'POST', body: JSON.stringify({ entries }) }, client)
}
