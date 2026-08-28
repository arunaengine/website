// ── Object storage locations ────────────────────────────────────────────────
// GET /blobs/locations?bucket=&path=&version_id=. Verified against aruna
// api/src/routes/blobs.rs. Reports where the copies of ONE version physically
// live, one entry per destination: `node_id` repeats when a node holds the
// version under several paths, so only `(node_id, bucket, key)` identifies one.
export type BlobCopyState =
  | 'present'
  | 'pending'
  | 'unreachable'
  | 'denied'
  /** The version resolves but carries no bytes: delete marker or reference. */
  | 'not-stored'

export type BlobCopyStorage = 'node-managed' | 'group-backend'

export type LocationScanLimit =
  | 'queued-scan-truncated'
  | 'queued-scan-failed'
  | 'relationship-scan-failed'
  | 'queued-record-unreadable'
  | 'candidate-cap-reached'
  | 'holder-lookup-failed'
  | 'holder-path-unknown'
  | 'holder-unreachable'

export interface BlobCopyResponse {
  node_id: string
  local: boolean
  /** Bucket on that node, which a sync relationship can map away from the requested one. */
  bucket: string
  /** Key on that node, likewise remapped by a sync relationship. */
  key: string
  state: BlobCopyState
  storage?: BlobCopyStorage | null
  /** Node-managed copies only: the operator's storage class label. */
  storage_class?: string | null
  group_backend_id?: string | null
  group_backend_name?: string | null
}

export interface BlobLocationsResponse {
  bucket: string
  key: string
  version_id: string
  copies: BlobCopyResponse[]
  /** False means a copy may be missing from `copies`, not that none exists. */
  complete: boolean
  limits: LocationScanLimit[]
}

// POST /blobs/replicate: asks one node to fetch a copy. Answered 202: the
// copy is queued, not stored yet. Needs WRITE on the object (or the bucket
// when `path` is omitted). `version_id` without `path` is a 400.
export interface ReplicateBlobRequest {
  bucket: string
  path?: string
  version_id?: string
  node_id: string
}

export interface ReplicateBlobResponse {
  bucket: string
  path?: string
  version_id?: string
  target_node_id: string
}
