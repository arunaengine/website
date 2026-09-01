// ---------------------------------------------------------------------------
// Bucket sync relationships (verified against aruna api/src/routes/sync.rs on
// feat/portal_extensions):
//   POST   /data/sync/relationships          201 SyncRelationship; 409 duplicate;
//                                            502 target unreachable
//   GET    /data/sync/relationships          ?bucket=&prefix=&direction=out|in|both
//   GET    /data/sync/relationships/{id}     SyncRelationshipDetail
//   PATCH  /data/sync/relationships/{id}     reference_handling and/or state
//   POST   /data/sync/relationships/{id}/run 202 (re-run once / backfill continuous)
//   DELETE /data/sync/relationships/{id}     204 (synced data is retained)
// Listing and detail only surface relationships CREATED BY the caller; run and
// delete are creator-only too (403 otherwise).
// ---------------------------------------------------------------------------
export type SyncMode = 'once' | 'reference' | 'continuous'
export type SyncReferenceHandling = 'materialize' | 'preserve' | 'skip'

// Wire state is a plain string ("enabled" | "paused" | "failed"); a failed
// relationship carries failure_reason alongside. Kept open for future states.
export type SyncRelationshipState = 'enabled' | 'paused' | 'failed' | (string & {})

export interface SyncCounters {
  versions_synced: number
  bytes_synced: number
  failures: number
  consecutive_failures: number
}

export interface SyncStatusSnapshot {
  last_synced_at?: string | null
  last_error?: string | null
  counters: SyncCounters
}

export interface SyncRelationship {
  id: string
  /** Source ARN `arn:aruna:<realm>:<node>:s3/<bucket>[/<prefix>]`. */
  source: string
  /** Target ARN, same shape as source. */
  target: string
  mode: SyncMode
  reference_handling: SyncReferenceHandling
  replicate_deletes: boolean
  created_by: string
  created_at: string
  state: SyncRelationshipState
  failure_reason?: string | null
  status: SyncStatusSnapshot
}

export interface SyncRelationshipListResponse {
  outgoing: SyncRelationship[]
  incoming: SyncRelationship[]
}

export interface SyncRelationshipDetail {
  relationship: SyncRelationship
  pending_jobs: number
  oldest_lag_ms?: number | null
  last_synced_at?: string | null
  last_error?: string | null
}

export interface SyncRunResponse {
  relationship_id: string
  queued: number
}

// The source is always the node answering the request (it has no node_id);
// creating a remote-source relationship means POSTing to that node's API.
export interface CreateSyncRelationshipRequest {
  source: { bucket: string; prefix?: string }
  target: { node_id: string; bucket: string; prefix?: string }
  mode: SyncMode
  reference_handling: SyncReferenceHandling
  replicate_deletes?: boolean
}

// Both fields are optional in practice; a node that predates pausing refuses
// a body carrying `state`, so the caller hides the control after that answer.
export interface UpdateSyncRelationshipRequest {
  reference_handling?: SyncReferenceHandling
  state?: 'enabled' | 'paused'
}

export interface SyncRelationshipListQuery {
  bucket?: string
  prefix?: string
  direction?: 'out' | 'in' | 'both'
}
