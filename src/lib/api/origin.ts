// ── Where a file version came from ──────────────────────────────────────────
// Verified against aruna api/src/routes/storage/origin.rs (feat/realm-data-features).
// The server sets the origin when it mints the version and never changes it. A sync adds a hop.
// Readers of the file see the full record; `projection` is what a dataset may say about it.
import { apiRequest, type ApiClientOptions } from './client'
import type { BucketIdentifier, BucketMetadata, DatasetDescription } from './databases'

/** `portal`: a temporary session only the portal requests; `s3`: an access key; `device`: a desktop device. */
export type UploadClient = 'portal' | 's3' | 'device'

/** `job_id` is the system job that wrote the version; null when no job did. */
export type OriginBody =
  /** Uploaded directly; the uploader is `created_by`. `client` is null when not recorded. */
  | { kind: 'upload'; node_id: string; device?: string | null; client?: UploadClient | null }
  /** From an external source; the details are under `source`. */
  | { kind: 'source'; job_id?: string | null }
  /** Copied from another exact version (global id URL or versioned node id). */
  | { kind: 'copy'; from: string; job_id?: string | null }
  /** Registered in place from a storage backend folder. */
  | { kind: 'storage'; backend_id: string; key: string; job_id?: string | null }
  /** Written by a run; `started_by` is the person who submitted it, null when the system did. */
  | { kind: 'job'; run_id: string; started_by?: string | null }

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
  /** Every source of the version, all equal; the first is the one `url` and `path` name. */
  sources?: Array<{ url?: string | null; path: string; connector_id?: string | null; connector_name?: string | null }>
}

export type OriginProjection =
  | { property: 'isBasedOn'; id: string }
  /** The run crate convention: a `CreateAction` of the run with this file as `result`. */
  | { property: 'CreateAction'; run_id: string }
  /** A link the database's identifier rules found. */
  | { property: 'identifier'; name: string; value: string; url: string }

/** A link to a public record, found by the current identifier rules of the file's bucket. */
export interface OriginIdentifier {
  name: string
  value: string
  url: string
  target: 'key' | 'source_url'
}

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
  /** The bucket's metadata now; it may differ from when the file was made. */
  bucket_metadata?: BucketMetadata | null
  /** What the bucket's linked dataset says now; null while it cannot be read. */
  description?: DatasetDescription | null
  identifiers?: OriginIdentifier[]
  /** The content id of the stored bytes; absent for references. */
  content_id?: string | null
  /** Releases of the bucket that pin exactly this version and the user may read. */
  releases?: OriginRelease[]
  /** False when release membership could not be checked everywhere, so one may be missing. */
  releases_complete?: boolean
}

/** A release that pins a version: its release crate's exact version, label and upstream ids. */
export interface OriginRelease {
  crate_version: string
  label: string
  upstream: BucketIdentifier[]
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
