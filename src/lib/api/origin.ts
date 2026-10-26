// ── Where a file version came from ──────────────────────────────────────────
// Verified against aruna api/src/routes/storage/origin.rs (feat/distributed-buckets-metadata).
// The server sets the origin when it mints the version and never changes it. A sync adds a hop.
// Readers of the file see the full record; `projection` is what a dataset may say about it.
import { apiRequest, type ApiClientOptions } from './client'

export type OriginBody =
  /** Uploaded directly; the uploader is `created_by`. */
  | { kind: 'upload'; node_id: string; device?: string | null }
  /** From an external source or a database; the details are under `source`. */
  | { kind: 'source'; database_entry?: string | null }
  /** Copied from another exact version (global id URL or versioned node id). */
  | { kind: 'copy'; from: string }
  /** Registered in place from a storage backend folder. */
  | { kind: 'storage'; backend_id: string; key: string }
  | { kind: 'job'; run_id: string }

export interface OriginHop {
  relationship_id: string
  /** The exact source version the sync delivered. */
  from: string
}

export interface OriginSourceDigest {
  algorithm: string
  digest: string
  /** `full_object` or `composite`. */
  scope: string
  /** `listing_etag`, `manifest` or `verified_read`. */
  origin: string
}

export interface OriginSource {
  /** Public URL of the source object, when the source has one. */
  url?: string | null
  path: string
  etag?: string | null
  digests: OriginSourceDigest[]
}

export type OriginProjection =
  | { property: 'isBasedOn'; id: string }
  /** The run crate convention: a `CreateAction` of the run with this file as `result`. */
  | { property: 'CreateAction'; run_id: string }

export interface OriginResponse {
  version_id: string
  /** The global id URL, for a version of a bucket stored on more nodes. */
  global_id?: string | null
  created_by: string
  created_at: string
  /** Absent for versions minted without a recorded origin. */
  origin?: OriginBody | null
  hop?: OriginHop | null
  source?: OriginSource | null
  /** Uploads and imports in place give none. */
  projection: OriginProjection[]
}

export function getFileOrigin(
  bucket: string,
  query: { key: string; version_id?: string },
  client: ApiClientOptions = {},
  signal?: AbortSignal,
): Promise<OriginResponse> {
  return apiRequest(`/data/buckets/${encodeURIComponent(bucket)}/objects/origin`, { query, signal }, client)
}

export type FileSource =
  /** Another bucket's files are copied in by a sync. */
  | { kind: 'sync'; relationship_id: string; source: string; mode: 'once' | 'reference' | 'continuous' }
  /** A storage backend folder of the group is registered without copying. */
  | { kind: 'storage'; import_id: string; backend_id: string; backend_prefix: string; key_prefix: string }

export interface FileSourcesResponse {
  sources: FileSource[]
  /** False when more rows exist than one answer reads. */
  complete: boolean
}

/** The incoming paths of a bucket on this node. Direct uploads are always possible and not listed. */
export function getBucketSources(bucket: string, client: ApiClientOptions = {}, signal?: AbortSignal): Promise<FileSourcesResponse> {
  return apiRequest(`/data/buckets/${encodeURIComponent(bucket)}/sources`, { signal }, client)
}
