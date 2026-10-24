// ── Datasets that link data ─────────────────────────────────────────────────
// Verified against aruna api/src/routes/metadata/links.rs (feat/distributed-buckets-metadata).
// A linked part is a Dataset-typed hasPart that names a bucket or a folder; every file under it is
// part of the dataset. A node without the routes answers 404, which means "not available here".
import { apiRequest, type ApiClientOptions } from './client'

export interface DataLinkHit {
  /** The identifier as the dataset names it. */
  id: string
  /** A linked part: the dataset's files include everything under it. */
  part: boolean
  subject_iris: string[]
}

export interface DataLinkDocument {
  document_id: string
  group_id: string
  document_path: string
  graph_iri: string
  title?: string | null
  links: DataLinkHit[]
}

export interface DataLinksResponse {
  documents: DataLinkDocument[]
  /** Pass as `after` for the next page; absent on the last page. */
  next_after?: string | null
  /** Every metadata node answered within its budget with no materialization unsettled. */
  complete: boolean
  /** A matching document exists that the caller may not read. */
  hidden_references_exist: boolean
  nodes_failed: number
  pending_materializations: number
  failed_materializations: number
}

export interface BucketLinksQuery {
  /** A file: the datasets whose linked parts contain its key (with `parts_only`). */
  key?: string
  version_id?: string
  /** A folder (`raw/2026/`) or the bucket root (empty): datasets that link exactly it. */
  prefix?: string
  parts_only?: boolean
  after?: string
  limit?: number
}

export function getBucketLinks(
  bucket: string,
  query: BucketLinksQuery,
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<DataLinksResponse> {
  const { prefix, ...rest } = query
  // The request client leaves out empty values, but an empty prefix names the bucket root.
  const root = prefix === '' ? '?prefix=' : ''
  const path = `/data/buckets/${encodeURIComponent(bucket)}/links${root}`
  return apiRequest(path, { query: { ...rest, prefix: prefix || undefined }, signal }, client)
}

/** Datasets that name one Aruna data identifier. */
export function getDataLinks(
  id: string,
  query: { parts_only?: boolean; after?: string; limit?: number } = {},
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<DataLinksResponse> {
  return apiRequest('/metadata/links', { query: { id, ...query }, signal }, client)
}
